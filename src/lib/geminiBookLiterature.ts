/**
 * books.introduce · category · author_cmt · pub_cmt 로 문학(1)/비문학(0) 분류.
 * 모델: gemini-2.5-flash (고정)
 */

import { buildBookTextCorpus } from "./bookAiMetadataParse";

const BOOK_LITERATURE_MODEL = "gemini-2.5-flash";

export type BookLiteratureValue = 0 | 1;

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function hasLiteratureCorpus(input: {
  category?: string | null;
  introduce?: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
}): boolean {
  return Boolean(
    input.category?.trim() ||
      buildBookTextCorpus({
        introduce: input.introduce,
        author_cmt: input.author_cmt,
        pub_cmt: input.pub_cmt,
      }).trim(),
  );
}

function buildLiteraturePrompt(input: {
  category?: string | null;
  introduce?: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
}): string {
  const corpus = buildBookTextCorpus(input);
  const categoryBlock = input.category?.trim()
    ? `[YES24 분야·카테고리]\n${input.category.trim().slice(0, 2000)}`
    : null;
  const blocks = [corpus, categoryBlock].filter(Boolean).join("\n\n");

  return `당신은 아동·청소년 도서를 문학/비문학으로 분류하는 도우미입니다.

반드시 JSON 한 객체만 출력하세요. 마크다운·코드펜스·설명 문장 금지.
키 이름은 정확히 "literature" 하나만 사용하세요.

규칙:
- literature 값은 정수 1 또는 0 만 허용합니다.
- 1 = 문학 (동화, 소설, 시, 창작 그림책, 문학 에세이 등 상상·서사·문학적 표현이 중심)
- 0 = 비문학 (정보, 과학, 역사, 교양, 학습, 자기계발, 실용, 백과, 수학·사회 교과 연계 정보서 등)

판단 시 [책 소개], [만든이 코멘트], [출판사 리뷰], [YES24 분야]를 모두 참고하세요.
애매하면 YES24 분야와 소개의 핵심 성격을 우선합니다.

예시: {"literature":1}
예시: {"literature":0}

--- 내용 ---
${blocks || "(본문 없음)"}
--- 끝 ---`;
}

function parseLiteratureFromModelText(text: string): BookLiteratureValue | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const attempts: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) attempts.push(fence[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) attempts.push(trimmed.slice(start, end + 1));

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const raw = parsed.literature ?? parsed.is_literature ?? parsed.lit;
      if (raw === 1 || raw === "1" || raw === true) return 1;
      if (raw === 0 || raw === "0" || raw === false) return 0;
    } catch {
      /* next */
    }
  }
  return null;
}

/** YES24 분야 문자열만으로 대략 추론 (API 실패·본문 없음 시) */
export function inferLiteratureFromCategory(category: string | null | undefined): BookLiteratureValue {
  const c = (category ?? "").trim();
  if (!c) return 0;
  if (c.includes("비문학") || c.includes("정보") || c.includes("과학") || c.includes("사회") || c.includes("학습"))
    return 0;
  if (
    c.includes("문학") ||
    c.includes("동화") ||
    c.includes("소설") ||
    c.includes("시") ||
    c.includes("창작") ||
    c.includes("그림책")
  ) {
    return 1;
  }
  return 0;
}

export async function classifyBookLiterature(input: {
  category?: string | null;
  introduce?: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
}): Promise<BookLiteratureValue> {
  if (!hasLiteratureCorpus(input)) {
    return inferLiteratureFromCategory(input.category);
  }

  const key = getApiKey();
  if (!key) {
    return inferLiteratureFromCategory(input.category);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(BOOK_LITERATURE_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildLiteraturePrompt(input) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 64,
        responseMimeType: "application/json",
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

  const data = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed = parseLiteratureFromModelText(text);
  if (parsed !== null) return parsed;

  return inferLiteratureFromCategory(input.category);
}
