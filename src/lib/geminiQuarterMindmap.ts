import type { Json } from "./types/database";
import {
  applyReportPrivacy,
  REPORT_NO_PII_PROMPT_RULES,
  type ReportPrivacyContext,
} from "./reportStudentPrivacy";

/** 분기 마인드맵 코멘트 — AI가 스스로 맞출 목표 분량(서버에서 자르지 않음) */
export const QUARTER_MINDMAP_COMMENT_TARGET_CHARS = 560;

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

async function geminiGeneratePlainText(
  prompt: string,
  temperature = 0.52,
  maxOutputTokens: number = 4096,
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
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: "text/plain",
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
  if (!trimmed) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  return trimmed;
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
  return `당신은 독서·교과 연계 수업을 설계하는 국어·교양 교육 전문가입니다.

${REPORT_NO_PII_PROMPT_RULES}

## 맥락
- 학년·급: **${studentGradeLabel}** (본문은「초1~초6」「중1~중3」「고1~고3」한글 표기만)
- 분기: **${quarterLabel}**
- 아래는 이 분기 월간 레포트에 연결된 도서 메타입니다.

${blocks}

## 작성 지시 (반드시 준수)
**순수 한국어 본문만** 출력하세요. JSON·마크다운·코드·필드명·따옴표 장식 제목 금지.

### 분량 (가장 중요)
- 목표: **한글 ${target}자 전후**(공백 포함, **${target - 40}~${target + 40}자**).
- **이 분량 안에서 처음부터 끝까지 완결**된 글을 쓰세요. 길어질 것 같으면 **문장을 줄여** 범위에 맞추세요.
- 시스템이 글을 잘라 주지 않으므로, **범위를 넘긴 채로 쓰면 중간에 끊긴 것처럼 보일 수 있습니다** — 반드시 스스로 분량을 조절하세요.
- 너무 짧은 한두 문장만 쓰지 마세요.

### 내용
- **3문단**, 문단당 **2~3문장**, 문단 사이 빈 줄 1줄.
- 1문단: 해당 학년 발달·학습 맥락.
- 2문단: 이번 분기 도서 주제·역량·정서가 그 맥락과 맞는 이유(제목 나열 최소화).
- 3문단: 이 구성으로 수업한 선택의 타당성 + 가정에서 이어갈 짧은 제안 1문장.

인용 부호가 필요하면 『』를 쓰고, ASCII 큰따옴표(")는 본문에 쓰지 마세요.`;
}

function cleanupPlainCommentText(t: string): string {
  return t
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .trim();
}

/**
 * 모델이 JSON으로 감쌌을 때만 복원. 본문 안의 " 때문에 잘리는 정규식 파싱은 사용하지 않습니다.
 */
export function normalizeQuarterMindmapModelText(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }

  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      for (const k of ["ai_knowledge_network_comment", "comment", "text", "message", "content"] as const) {
        const v = j[k];
        if (typeof v === "string" && v.trim()) return cleanupPlainCommentText(v);
      }
    } catch {
      const unwrapped = t
        .replace(/^\{\s*"(?:ai_knowledge_network_comment|comment|text|message)"\s*:\s*"/, "")
        .replace(/"\s*,\s*"[^"]+"\s*:[\s\S]*$/, "")
        .replace(/"\s*\}\s*$/, "");
      if (unwrapped.length > 40 && unwrapped !== t) {
        return cleanupPlainCommentText(unwrapped.replace(/\\"/g, '"'));
      }
    }
  }

  return cleanupPlainCommentText(t);
}

/**
 * 분기 「지식 마인드맵」 — 수업 선택 타당성 코멘트(평문). 본문은 서버에서 자르지 않습니다.
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
  const prompt = buildPrompt(input.studentGradeLabel, input.quarterLabel, input.books);
  const raw = await geminiGeneratePlainText(prompt, 0.45, 4096);
  const normalized = normalizeQuarterMindmapModelText(raw);
  if (normalized.length < 80) {
    throw new Error(
      "AI 코멘트가 너무 짧게 생성되었습니다. 잠시 후 다시 「지식 마인드맵 생성」을 눌러 주세요.",
    );
  }
  return applyReportPrivacy(normalized, input.privacy);
}
