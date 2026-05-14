import { localUpsertBook, type Yes24SearchResultPayload } from "./localStoreApi";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import type { Json } from "./types/database";

/** `books.ai_keywords` JSONB — DB에는 최대 이 개수만 저장 */
const MAX_BOOK_AI_KEYWORDS = 2;

function normalizeAiKeywordsForBooksTable(kw: Json): Json {
  if (!Array.isArray(kw)) return kw;
  const trimmed = kw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_BOOK_AI_KEYWORDS);
  return trimmed as unknown as Json;
}

export type BookUpsertInput = {
  title: string;
  author: string;
  publisher: string;
  url: string | null;
  cover_url: string | null;
  category: string | null;
  introduce: string | null;
  author_cmt: string | null;
  pub_cmt: string | null;
  ai_category: string | null;
  ai_keywords: Json;
};

export function bookUpsertInputFromYes24(r: Yes24SearchResultPayload): BookUpsertInput {
  const kwJson = r.ai_keywords as unknown as Json;
  return {
    title: r.title.trim(),
    author: r.author.trim(),
    publisher: r.publisher.trim(),
    url: r.url.trim() || null,
    cover_url: (r.cover_url ?? "").trim() || null,
    category: (r.category ?? "").trim() || null,
    introduce: (r.introduce ?? "").trim() || null,
    author_cmt: (r.author_cmt ?? "").trim() || null,
    pub_cmt: (r.pub_cmt ?? "").trim() || null,
    ai_category: (r.ai_category ?? "").trim() || null,
    ai_keywords: kwJson,
  };
}

export type PersistBookUpsertResult =
  | { ok: true; via: "supabase" | "local"; book_id: string }
  | { ok: false; error: string };

/** Supabase `books`가 있으면 upsert, 없으면 개발 모드에서만 로컬 파일 DB upsert */
export async function persistBookUpsertRow(row: BookUpsertInput): Promise<PersistBookUpsertResult> {
  const ai_keywords = normalizeAiKeywordsForBooksTable(row.ai_keywords);
  const payload = {
    title: row.title.trim(),
    author: row.author.trim(),
    publisher: row.publisher.trim(),
    url: row.url?.trim() || null,
    cover_url: row.cover_url?.trim() || null,
    category: row.category?.trim() || null,
    introduce: row.introduce?.trim() || null,
    author_cmt: row.author_cmt?.trim() || null,
    pub_cmt: row.pub_cmt?.trim() || null,
    ai_category: row.ai_category?.trim() || null,
    ai_keywords,
  };

  if (isSupabaseConfigured()) {
    if (!supabase) return { ok: false, error: "Supabase 클라이언트가 없습니다." };
    const { data, error } = await supabase
      .from("books")
      .upsert(payload, { onConflict: "title,author,publisher" })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    if (!data?.id) return { ok: false, error: "books 행 id를 가져오지 못했습니다." };
    return { ok: true, via: "supabase", book_id: data.id };
  }
  if (import.meta.env.DEV) {
    const book_id = await localUpsertBook(payload);
    return { ok: true, via: "local", book_id };
  }
  return {
    ok: false,
    error:
      "데이터 저장 연결이 없어 도서함에 자동 저장되지 않습니다.",
  };
}
