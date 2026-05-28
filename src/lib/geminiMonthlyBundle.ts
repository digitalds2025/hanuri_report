import type { GrowthMetaState } from "./monthlyGrowthMeta";
import type { PillarKey } from "./reportAggregates";
import { pillarLabelsKo } from "./reportAggregates";
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

export type MonthlyReportBookContext = {
  title: string;
  author: string;
  publisher: string;
  introduce?: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
};

export type MonthlyReportAIContext = {
  growthMeta: GrowthMetaState;
  /** 글쓰기 이미지 유무·URL 요약 (텍스트 컨텍스트용) */
  writingImageNote: string;
  book: MonthlyReportBookContext;
  scores: Record<PillarKey, number>;
  pillarComments: Record<PillarKey, string>;
  warmMessageDraft: string;
};

function clipBookText(value: string | null | undefined, maxLen: number): string {
  const t = (value ?? "").trim();
  if (!t) return "(없음)";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function bookContextSection(book: MonthlyReportBookContext): string {
  return `[선택 도서]
제목: ${book.title}
저자: ${book.author}
출판사: ${book.publisher}

[책 소개]
${clipBookText(book.introduce, 12000)}

[만든이·저자 코멘트]
${clipBookText(book.author_cmt, 8000)}

[출판사 리뷰]
${clipBookText(book.pub_cmt, 8000)}`;
}

export type MonthlyReportAITokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type MonthlyReportAIResult = {
  growthMoment: string;
  competencyAnalysis: string;
  warmMessage: string;
  tokenUsage: MonthlyReportAITokenUsage;
};

type GeminiGenerateResult = {
  text: string;
  promptTokenCount: number;
  candidatesTokenCount: number;
};

function readUsageMetadata(data: unknown): { prompt: number; candidates: number } {
  const meta = (data as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata;
  if (!meta || typeof meta !== "object") return { prompt: 0, candidates: 0 };
  const prompt = meta.promptTokenCount;
  const candidates = meta.candidatesTokenCount;
  return {
    prompt: typeof prompt === "number" && Number.isFinite(prompt) ? prompt : 0,
    candidates: typeof candidates === "number" && Number.isFinite(candidates) ? candidates : 0,
  };
}

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.0-flash";
}

async function geminiGenerateText(prompt: string, temperature = 0.55): Promise<GeminiGenerateResult> {
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
        maxOutputTokens: 4096,
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

  const usage = readUsageMetadata(data);
  const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Gemini가 빈 텍스트를 반환했습니다.");
  }
  return {
    text: stripAiPlainText(trimmed),
    promptTokenCount: usage.prompt,
    candidatesTokenCount: usage.candidates,
  };
}

function contextBlock(ctx: MonthlyReportAIContext, privacy?: ReportPrivacyContext): string {
  const s1 = ctx.growthMeta.step1.join(", ");
  const s2 = ctx.growthMeta.step2.join(", ");
  const s3 = ctx.growthMeta.step3.trim() || "(없음)";
  const scoreLines = (["reading", "thinking", "discussion", "writing", "growth"] as const)
    .map((k) => `- ${pillarLabelsKo[k]}: ${ctx.scores[k]}점 — 교사 코멘트: ${ctx.pillarComments[k]?.trim() || "(없음)"}`)
    .join("\n");
  const raw = `[1단 활동 — 무엇을 했는가]\n${s1}\n\n[2단 태도·행동]\n${s2}\n\n[3단 교사 메모]\n${s3}\n\n[이달의 글쓰기]\n${ctx.writingImageNote}\n\n${bookContextSection(ctx.book)}\n\n[5대 역량 점수·코멘트]\n${scoreLines}\n\n[선생님이 적은 따뜻한 한마디 초안]\n${ctx.warmMessageDraft.trim() || "(없음)"}`;
  return privacy ? sanitizeReportStudentPii(raw, privacy) : raw;
}

function promptGrowthMoment(ctx: MonthlyReportAIContext, privacy?: ReportPrivacyContext): string {
  return `당신은 한국의 독서·논술 학원에서 학부모에게 보내는 월간 성장 리포트를 작성하는 교사입니다.

${REPORT_NO_PII_PROMPT_RULES}

아래 [제공 데이터]만 근거로 작성하세요. 없는 사실은 지어내지 마세요.

# [제공 데이터]
${contextBlock(ctx, privacy)}

${growthMomentEditorRulesBlock()}

# [작업]
위 [제공 데이터]만 근거로 **이달의 성장 모멘트** 한 섹션을 작성하세요. 화면용 3문단이지만 **한 편의 글처럼** 이어지게, 본문만 출력하세요.`;
}

function promptCompetency(ctx: MonthlyReportAIContext, privacy?: ReportPrivacyContext): string {
  return `당신은 초등·중학 연령 독서 논술 학원의 교육 전문가입니다.

${REPORT_NO_PII_PROMPT_RULES}

아래는 한 학생의 이번 달 **전체 입력**입니다. 이것만 근거로 분석하세요.

${contextBlock(ctx, privacy)}

작업: **관찰 기반 역량 종합 분석** 텍스트만 작성합니다.

형식(반드시 준수):
- 마크다운(예: #, ##, **, 불릿)을 쓰지 마세요. 아래 **[강점]** / **[보완점]** 라벨만 예외로 그대로 씁니다.
- 백슬래시나 '\\n' 같은 이스케이프 문자열을 출력하지 마세요.
- **강점과 보완을 한 문단에 섞지 마세요.** 「한편,」「반면,」으로 한 덩어리에 이어 쓰지 말고, 반드시 아래 두 블록으로 나눕니다.

[강점]
(이 블록에는 강점·칭찬·기대만. 점수·코멘트 근거로 가장 두드러진 역량 하나에 집중. 보완·아쉬운 점·집에서 할 일은 쓰지 마세요.)

[보완점]
(이 블록에는 보완이 필요한 역량 하나와 학부모가 집에서 도울 수 있는 짧은 실천만. 강점 내용을 반복하지 마세요. 과장·낙인 금지.)

- [강점]과 [보완점] 사이에는 빈 줄을 하나 넣어도 되고, 넣지 않아도 됩니다.
- 레이더 차트는 별도로 그려지므로 차트 언급 없이 텍스트만 작성합니다.`;
}

function promptWarm(ctx: MonthlyReportAIContext, privacy?: ReportPrivacyContext): string {
  return `당신은 학부모에게 마음이 전해지도록 글을 다듬어 주는 교사입니다.

${REPORT_NO_PII_PROMPT_RULES}

아래는 한 학생에 대한 이번 달 전체 맥락과, 선생님이 적어 둔 **따뜻한 한마디 초안**입니다.

${contextBlock(ctx, privacy)}

작업: 초안의 뜻과 온기를 살리되, 전체 맥락(활동·태도·도서·역량)을 은은히 녹인 **완성 한마디**를 2~4문장으로 작성합니다.
- 아이를 지칭할 때는 **「아이」「우리 아이」** 등 비식별 호칭만 사용하세요.
- 마크다운(**, # 등)과 백슬래시 이스케이프를 쓰지 마세요. 일반 문장만.
- 제목·인용부호 장식 없이 본문만.`;
}

/** 성장 모멘트·역량 분석·따뜻한 한마디를 병렬 생성 */
export async function generateMonthlyReportBundle(
  ctx: MonthlyReportAIContext,
  privacy?: ReportPrivacyContext,
): Promise<MonthlyReportAIResult> {
  const [growthRes, competencyRes, warmRes] = await Promise.all([
    geminiGenerateText(promptGrowthMoment(ctx, privacy), 0.55),
    geminiGenerateText(promptCompetency(ctx, privacy), 0.5),
    geminiGenerateText(promptWarm(ctx, privacy), 0.68),
  ]);
  const growthLimited = await enforceGrowthMomentParagraphLimits(growthRes.text, async (prompt) => {
    const r = await geminiGenerateText(prompt, 0.4);
    return r.text;
  });
  const parts = [growthRes, competencyRes, warmRes];
  return {
    growthMoment: applyReportPrivacy(growthLimited, privacy),
    competencyAnalysis: applyReportPrivacy(competencyRes.text, privacy),
    warmMessage: applyReportPrivacy(warmRes.text, privacy),
    tokenUsage: {
      inputTokens: parts.reduce((sum, p) => sum + p.promptTokenCount, 0),
      outputTokens: parts.reduce((sum, p) => sum + p.candidatesTokenCount, 0),
    },
  };
}
