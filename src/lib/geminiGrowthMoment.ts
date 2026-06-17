import {
  applyReportPrivacy,
  REPORT_NO_PII_PROMPT_RULES,
  sanitizeReportStudentPii,
  type ReportPrivacyContext,
} from "./reportStudentPrivacy";
import { stripAiPlainText } from "./reportPlainText";
import {
  enforceGrowthMomentParagraphLimits,
  growthMomentEditorRulesBlock,
} from "./growthMomentTextRules";

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
  return m || "gemini-2.5-flash";
}

async function callGeminiText(prompt: string, temperature: number): Promise<string> {
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
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
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
  return stripAiPlainText(trimmed);
}

function buildPrompt(input: GrowthMomentInput, privacy?: ReportPrivacyContext): string {
  const s1 = input.step1Activities.join(", ");
  const s2 = input.step2Attitudes.join(", ");
  const s3Raw = input.step3TeacherNotes.trim();
  const s3 = privacy ? sanitizeReportStudentPii(s3Raw, privacy) : s3Raw;
  return `${growthMomentEditorRulesBlock()}

${REPORT_NO_PII_PROMPT_RULES}

# [제공 데이터 — 이번 달 기록]
[1단 활동 영역 — 무엇을 했는가]
${s1}

[2단 태도·행동 — 어떤 모습이었는가]
${s2}

[3단 교사의 학습 기록 메모 — 참고용(없으면 최소 반영)]
${s3 || "(없음)"}

# [작업]
위 데이터만 근거로 **이달의 성장 모멘트** 한 섹션을 작성하세요. 화면용으로 3문단으로 나누되, **한 편의 글처럼** 이어지게 쓰세요. 과장·단정 금지.`;
}

/** Gemini REST generateContent — 3문단 성장 모멘트 텍스트 */
export async function generateGrowthMomentWithGemini(
  input: GrowthMomentInput,
  privacy?: ReportPrivacyContext,
): Promise<string> {
  const draft = await callGeminiText(buildPrompt(input, privacy), 0.55);
  const limited = await enforceGrowthMomentParagraphLimits(draft, (prompt) =>
    callGeminiText(prompt, 0.4),
  );
  return applyReportPrivacy(limited, privacy);
}
