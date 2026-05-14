import type { Json } from "./types/database";

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

async function geminiGenerateText(
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

function formatBookBlock(b: QuarterMindmapBookRow, index: number): string {
  const intro = (b.introduce ?? "").trim();
  const introClip = intro.length > 3500 ? `${intro.slice(0, 3500)}…` : intro;
  return [
    `### 도서 ${index + 1}: ${b.title}`,
    `- 표지(cover_url): ${b.cover_url?.trim() || "(없음)"}`,
    `- 저자: ${b.author} · 출판사: ${b.publisher}`,
    `- URL: ${b.url?.trim() || "(없음)"}`,
    `- category: ${b.category?.trim() || "(없음)"}`,
    `- ai_category: ${b.ai_category?.trim() || "(없음)"}`,
    `- ai_keywords: ${formatKeywords(b.ai_keywords) || "(없음)"}`,
    `- introduce:\n${introClip || "(없음)"}`,
    `- author_cmt:\n${(b.author_cmt ?? "").trim() || "(없음)"}`,
    `- pub_cmt:\n${(b.pub_cmt ?? "").trim() || "(없음)"}`,
  ].join("\n");
}

function buildPrompt(studentGradeLabel: string, quarterLabel: string, books: QuarterMindmapBookRow[]): string {
  const blocks = books.map((b, i) => formatBookBlock(b, i)).join("\n\n");
  return `당신은 독서·교과 연계 수업을 설계하는 국어·교양 교육 전문가입니다.

## 맥락
- 학생(또는 학급) 학년·급 정보: **${studentGradeLabel}** (이미「초1~초6·중1~중3·고1~고3」표기로 전달된 경우가 많습니다. 본문에서는 이 한글 표기만 사용하세요.)
- 분기 구간 표시(마지막 달 YYYY-MM 등): **${quarterLabel}**
- 아래 도서 목록은 **해당 분기에 포함된 연속 3개월 월간 레포트(m_reports)**에 연결된 \`book_id1\`, \`book_id2\`로부터 가져온 \`books\` 행입니다. 각 행의 **ai_keywords, introduce, category, author_cmt, pub_cmt, ai_category**를 참고해 요지만 잡으세요.

${blocks}

## 작성 지시 (반드시 준수)
**한국어**로, 학부모·동료가 한 번 읽고 이해할 수 있는 **아주 짧은 요약**만 작성하세요. 분량은 **문단 2개**, **문단당 문장 1~2개**로 제한합니다. 전체 **350자 이내**를 넘기지 마세요.
- 학년을 말할 때는 **반드시「초1~초6」「중1~중3」「고1~고3」**처럼 한글만 사용하세요. **e/m/h, E/M/H, 숫자 코드**(예: h3, H3, e1)는 본문에 쓰지 마세요.
- 1문단: 제시된 **학년/급**의 발달·학습 맥락을 한두 문장으로만 짚습니다.
- 2문단: 위 도서 구성(주제·역량·정서 등 **메타데이터에 기대**)이 왜 타당한지 한두 문장으로만 요약합니다. 책 제목은 나열하지 말고 필요할 때만 1권 정도만 언급하세요.
- **JSON·목록·코드·마크다운·따옴표로 감싼 필드명**은 절대 쓰지 마세요. 순수 본문 텍스트만 출력하세요.
- 줄바꿈은 문단 사이 **한 번**(실제 줄바꿈)만 두고, 그 외 장황한 나열은 하지 마세요.`;
}

/** 모델이 JSON이나 이스케이프된 \\n만 넘긴 경우 본문으로 정리 */
export function normalizeQuarterMindmapModelText(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      for (const k of ["ai_knowledge_network_comment", "comment", "text", "message"] as const) {
        const v = j[k];
        if (typeof v === "string" && v.trim()) {
          t = v.trim();
          break;
        }
      }
    } catch {
      /* 그대로 t 사용 */
    }
  }
  t = t.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, " ");
  return t.trim();
}

/**
 * 분기 「지식 마인드맵」 단계용 — 월간에 연결된 도서 메타를 바탕으로 Gemini가 수업 선택 타당성 코멘트를 생성합니다.
 * `.env`의 `VITE_GEMINI_API_KEY`, `VITE_GEMINI_MODEL`을 사용합니다.
 */
export async function generateQuarterKnowledgeMindmapComment(input: {
  studentGradeLabel: string;
  quarterLabel: string;
  books: QuarterMindmapBookRow[];
}): Promise<string> {
  if (!input.books.length) {
    throw new Error("생성할 도서 정보가 없습니다.");
  }
  const prompt = buildPrompt(input.studentGradeLabel, input.quarterLabel, input.books);
  const raw = await geminiGenerateText(prompt, 0.45, 420);
  return normalizeQuarterMindmapModelText(raw);
}
