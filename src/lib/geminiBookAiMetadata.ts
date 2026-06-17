/**
 * books.introduce · author_cmt · pub_cmt 로 ai_category / ai_keywords 생성 (브라우저).
 */

import {
  buildBookAiMetadataPrompt,
  ensureQualityBookAiMetadata,
  hasBookTextCorpus,
  parseBookAiMetadataFromModelText,
  parseYes24CategoryForAiCategory,
  type BookAiMetadata,
} from "./bookAiMetadataParse";

export type { BookAiMetadata };
export {
  bookRowHasAiMetadata,
  bookRowNeedsAiMetadataFill,
  bookRowMissingAiCategory,
  bookRowMissingAiKeywords,
  BOOK_AI_KEYWORD_COUNT,
} from "./bookAiMetadataParse";

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.5-flash";
}

export async function generateBookAiMetadataFromCorpus(input: {
  title?: string | null;
  category?: string | null;
  introduce?: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
}): Promise<BookAiMetadata> {
  const key = getApiKey();
  if (!key) {
    throw new Error("VITE_GEMINI_API_KEY 가 .env 에 없어 AI 분류·키워드를 만들 수 없습니다.");
  }

  if (!hasBookTextCorpus(input)) {
    return {
      ai_category: parseYes24CategoryForAiCategory(input.category),
      ai_keywords: [],
    };
  }

  const prompt = buildBookAiMetadataPrompt(input);
  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1024,
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
  const parsed = parseBookAiMetadataFromModelText(text);
  return ensureQualityBookAiMetadata(parsed, { yes24Category: input.category });
}
