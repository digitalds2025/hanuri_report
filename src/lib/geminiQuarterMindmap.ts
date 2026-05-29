import type { Json } from "./types/database";
import {
  applyReportPrivacy,
  REPORT_NO_PII_PROMPT_RULES,
  type ReportPrivacyContext,
} from "./reportStudentPrivacy";

/** 분기 마인드맵 설명(지식·수업 타당성) — bestWritingComment와 동일 상한(프롬프트 목표) */
export const QUARTER_MINDMAP_COMMENT_TARGET_CHARS = 120;

/** 분기 마인드맵 생성용 — `books`에서 가져온 행 */
export type QuarterMindmapBookRow = {
  id: string;
  title: string;
  author: string;
  publisher: string;
  url: string | null;
  introduce: string | null;
  category: string | null;
  author_cmt: string | null;
  pub_cmt: string | null;
  ai_category: string | null;
  ai_keywords: Json;
  cover_url?: string | null;
};

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.0-flash";
}

type GeminiMindmapResult = { text: string; finishReason?: string };

async function geminiGeneratePlainText(
  prompt: string,
  temperature = 0.52,
  maxOutputTokens: number = 4096,
  responseMimeType: string = "application/json",
): Promise<GeminiMindmapResult> {
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
        maxOutputTokens,
        responseMimeType,
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
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };

  if (d.promptFeedback?.blockReason) {
    throw new Error(`프롬프트 차단: ${d.promptFeedback.blockReason}`);
  }

  const candidate = d.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const trimmed = text.trim();
  if (!trimmed) {
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new Error("AI 응답이 토큰 한도에서 잘렸습니다. 잠시 후 다시 시도해 주세요.");
    }
    throw new Error("Gemini가 빈 응답을 반환했습니다.");
  }
  return { text: trimmed, finishReason: candidate?.finishReason };
}

function formatKeywords(kw: Json): string {
  if (Array.isArray(kw)) {
    return kw
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");
  }
  try {
    return JSON.stringify(kw);
  } catch {
    return String(kw);
  }
}

/** 입력 프롬프트용 — 도서 소개만 요약 (본문 코멘트와 별도) */
function formatBookBlock(b: QuarterMindmapBookRow, index: number): string {
  const intro = (b.introduce ?? "").trim();
  const introClip = intro.length > 2000 ? `${intro.slice(0, 2000)}…` : intro;
  const authorClip = (b.author_cmt ?? "").trim();
  const pubClip = (b.pub_cmt ?? "").trim();
  return [
    `### 도서 ${index + 1}: ${b.title}`,
    `- ai_category: ${b.ai_category?.trim() || "(없음)"}`,
    `- ai_keywords: ${formatKeywords(b.ai_keywords) || "(없음)"}`,
    `- introduce 요약 근거:\n${introClip || "(없음)"}`,
    authorClip ? `- author_cmt 발췌:\n${authorClip.length > 800 ? `${authorClip.slice(0, 800)}…` : authorClip}` : null,
    pubClip ? `- pub_cmt 발췌:\n${pubClip.length > 800 ? `${pubClip.slice(0, 800)}…` : pubClip}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(studentGradeLabel: string, quarterLabel: string, books: QuarterMindmapBookRow[]): string {
  const target = QUARTER_MINDMAP_COMMENT_TARGET_CHARS;
  const blocks = books.map((b, i) => formatBookBlock(b, i)).join("\n\n");
  return `당신은 초·중·고 독서·국어 교육 현장의 전문 교사입니다. 학부모에게 전달하는 한국어 문장만 씁니다.

${REPORT_NO_PII_PROMPT_RULES}

## 맥락
- 학년·급(식별용): **${studentGradeLabel}** — 본문에도 **학년·급만** 쓰고 이름·닉네임은 쓰지 마세요.
- 분기(또는 기간 표기): **${quarterLabel}**
- 아래는 이 분기 월간 레포트에 연결된 도서 메타입니다.

${blocks}

## 출력 형식 (반드시 준수)
- **유효한 JSON 객체 한 개만** 출력하세요. 앞뒤 설명·마크다운·코드펜스 금지.
- 키 이름은 **반드시 영문 그대로** 두 개만: \`line1\`, \`line2\`. (다른 키·한글 키 금지)
- 각 값은 **한 문장**(마침표·물음표·느낌표로 **끝까지 완결**). 문장 중간에서 끊기면 안 됩니다.

## line1 (첫 문장)
- 이번 분기 도서·주제가 **해당 학년 수준·발달**과 맞는 이유를 **한 줄**로(책 제목 나열 금지).

## line2 (둘째 문장)
- 이 구성으로 **수업·독서 활동을 이어간 선택의 타당성**을 **따뜻하게** 한 줄로 마무리.

## 분량
- line1·line2를 합쳐 **대략 ${target}자 이내**가 목표입니다. **문장을 끝까지 쓰는 것이 더 중요**하며, 완결을 위해 **조금 넘어도 됩니다**.
- 과장·공문체·형식적 나열 금지. 빈 문자열 금지.

인용 부호가 필요하면 『』를 쓰고, JSON 문자열 값 안에는 ASCII 큰따옴표(")를 이스케이프하세요.`;
}

function cleanupPlainCommentText(t: string): string {
  return t
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .trim();
}

function stripCodeFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

/** AI 응답(JSON line1/line2 또는 평문) → textarea·레포트용 2줄 평문 */
export function parseMindmapAiResponse(raw: string): string {
  const t = stripCodeFence(raw);
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const l1 = typeof j.line1 === "string" ? j.line1.trim() : "";
      const l2 = typeof j.line2 === "string" ? j.line2.trim() : "";
      if (l1 && l2) return cleanupPlainCommentText(`${l1}\n${l2}`);
      for (const k of ["ai_knowledge_network_comment", "comment", "text", "message", "content"] as const) {
        const v = j[k];
        if (typeof v === "string" && v.trim()) return cleanupPlainCommentText(v);
      }
    } catch {
      /* 평문으로 처리 */
    }
  }
  return cleanupPlainCommentText(t);
}

/** 문장이 마침표 없이 끊긴 경우(모델 조기 종료) */
export function isMindmapCommentIncomplete(text: string): boolean {
  const t = text.trim();
  if (t.length < 36) return true;
  if (!/[.!?。](?:['"»」]|\s*)$/.test(t)) return true;

  const lines = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return lines.some((line) => !/[.!?。]$/.test(line));
  }

  const sentences = t.split(/(?<=[.!?。])\s*/).filter((s) => s.trim());
  if (sentences.length < 2) return true;
  return sentences.some((s) => !/[.!?。]$/.test(s.trim()));
}

/**
 * @deprecated parseMindmapAiResponse / displayMindmapKnowledgeComment 사용
 */
export function normalizeQuarterMindmapModelText(raw: string): string {
  return parseMindmapAiResponse(raw);
}

/** summaryText·DB에 저장된 코멘트 — 재파싱으로 잘리지 않게 평문만 정리 */
export function displayMindmapKnowledgeComment(stored: string): string {
  const t = stored.trim();
  if (!t) return "";
  if (t.startsWith("{")) return parseMindmapAiResponse(t);
  return cleanupPlainCommentText(t);
}

/**
 * 분기 「지식 마인드맵」 — 수업 선택 타당성 짧은 설명(평문 2줄).
 * 분량은 프롬프트 목표(~120자)만 두고, 서버에서 잘라내지 않습니다.
 */
export async function generateQuarterKnowledgeMindmapComment(input: {
  studentGradeLabel: string;
  quarterLabel: string;
  books: QuarterMindmapBookRow[];
  privacy?: ReportPrivacyContext;
}): Promise<string> {
  if (!input.books.length) {
    throw new Error("생성할 도서 정보가 없습니다.");
  }
  const basePrompt = buildPrompt(input.studentGradeLabel, input.quarterLabel, input.books);
  const retryNote =
    "\n\n[중요] 직전 응답이 문장 중간에서 끊겼습니다. line1·line2 **각각** 마침표(.)로 **끝나는 완결 문장**만 다시 출력하세요.";

  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = attempt === 0 ? basePrompt : basePrompt + retryNote;
    const { text: raw, finishReason } = await geminiGeneratePlainText(prompt, 0.45, 8192);
    last = parseMindmapAiResponse(raw);
    const truncated = finishReason === "MAX_TOKENS" || isMindmapCommentIncomplete(last);
    if (last.length >= 24 && !truncated) {
      return applyReportPrivacy(last, input.privacy);
    }
  }

  if (last.length < 24) {
    throw new Error(
      "AI 코멘트가 너무 짧게 생성되었습니다. 잠시 후 다시 「지식 마인드맵 생성」을 눌러 주세요.",
    );
  }
  return applyReportPrivacy(last, input.privacy);
}
