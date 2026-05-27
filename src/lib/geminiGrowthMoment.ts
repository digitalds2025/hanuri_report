import {
  applyReportPrivacy,
  REPORT_NO_PII_PROMPT_RULES,
  sanitizeReportStudentPii,
  type ReportPrivacyContext,
} from "./reportStudentPrivacy";
import { stripAiPlainText } from "./reportPlainText";

export type GrowthMomentInput = {
  /** 1단: 활동 키워드 */
  step1Activities: string[];
  /** 2단: 태도·행동 키워드 */
  step2Attitudes: string[];
  /** 3단: 교사 학습 기록(선택) */
  step3TeacherNotes: string;
};

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.0-flash";
}

function buildPrompt(input: GrowthMomentInput, privacy?: ReportPrivacyContext): string {
  const s1 = input.step1Activities.join(", ");
  const s2 = input.step2Attitudes.join(", ");
  const s3Raw = input.step3TeacherNotes.trim();
  const s3 = privacy ? sanitizeReportStudentPii(s3Raw, privacy) : s3Raw;
  return `당신은 한국의 독서·토론·논술 학원에서 학부모에게 보내는 월간 성장 리포트를 작성하는 교사입니다.

${REPORT_NO_PII_PROMPT_RULES}

아래는 한 학생의 이번 달 기록입니다.

[1단 활동 영역 — 무엇을 했는가]
${s1}

[2단 태도·행동 — 어떤 모습이었는가]
${s2}

[3단 교사의 학습 기록 메모 — 참고용(없으면 무시)]
${s3 || "(없음)"}

작성 규칙:
- 반드시 정확히 3개의 문단으로 작성합니다. 문단 사이에는 빈 줄 한 줄만 넣고, 실제 줄바꿈으로만 구분합니다.
- 백슬래시(\\)나 작은따옴표로 감싼 '\\n' 같은 이스케이프 문자열을 본문에 쓰지 마세요.
- 마크다운(예: # 제목, **굵게**, 불릿 기호)을 쓰지 마세요. 일반 문장만 사용합니다.
- 1문단: 이번 달 핵심 활동(1단 키워드를 자연스럽게 녹여 구체적으로).
- 2문단: 아이의 태도·행동(2단 키워드를 바탕으로 관찰 내용을 생생하게).
- 3문단: 종합 및 격려(학부모에게 따뜻하고 신뢰 가는 톤, '~해요'체 위주).
- 과장·단정 금지. 키워드에 없는 사실은 만들지 마세요. 3단 메모가 비어 있으면 3단은 언급을 최소화하세요.
- 제목·번호·불릿 없이 본문만 출력합니다.`;
}

/** Gemini REST generateContent — 3문단 성장 모멘트 텍스트 */
export async function generateGrowthMomentWithGemini(
  input: GrowthMomentInput,
  privacy?: ReportPrivacyContext,
): Promise<string> {
  const key = getApiKey();
  if (!key) {
    throw new Error("VITE_GEMINI_API_KEY 가 .env 에 설정되어 있지 않습니다.");
  }
  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(input, privacy) }] }],
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: 2048,
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw;
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } };
      if (j.error?.message) detail = j.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(`Gemini API 오류 (${res.status}): ${detail}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Gemini 응답 JSON 파싱 실패");
  }

  const d = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (d.promptFeedback?.blockReason) {
    throw new Error(`프롬프트 차단: ${d.promptFeedback.blockReason}`);
  }

  const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Gemini가 빈 텍스트를 반환했습니다.");
  }
  return applyReportPrivacy(stripAiPlainText(trimmed), privacy);
}
