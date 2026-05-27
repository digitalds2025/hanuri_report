import {
  BOOK_AI_KEYWORD_COUNT,
  bookAiKeywordsFromJson,
  ensureQualityBookAiMetadata,
  parseYes24CategoryForAiCategory,
} from "./bookAiMetadataParse";
import { fetchBookByTitleExact } from "./fetchBookByTitle";
import { localUpsertBook, type Yes24SearchResultPayload } from "./localStoreApi";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import type { Json } from "./types/database";

/** `books.ai_keywords` — 소개·코멘트 종합 대표어 (정확히 2개) */
const MAX_BOOK_AI_KEYWORDS = BOOK_AI_KEYWORD_COUNT;

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
  const meta = ensureQualityBookAiMetadata(
    {
      ai_category: (r.ai_category ?? "").trim() || null,
      ai_keywords: Array.isArray(r.ai_keywords) ? r.ai_keywords : [],
    },
    { yes24Category: r.category },
  );
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
    ai_category: meta.ai_category,
    ai_keywords: meta.ai_keywords as unknown as Json,
  };
}

export type PersistBookUpsertResult =
  | { ok: true; via: "supabase" | "local"; book_id: string }
  | { ok: false; error: string };

/** Supabase `books`가 있으면 upsert, 없으면 개발 모드에서만 로컬 파일 DB upsert */
export async function persistBookUpsertRow(row: BookUpsertInput): Promise<PersistBookUpsertResult> {
  const existing = await fetchBookByTitleExact(row.title.trim());
  const incomingKw = bookAiKeywordsFromJson(normalizeAiKeywordsForBooksTable(row.ai_keywords));
  const keptKw = incomingKw.length > 0 ? incomingKw : bookAiKeywordsFromJson(existing?.ai_keywords);
  const ai_keywords = normalizeAiKeywordsForBooksTable(keptKw as unknown as Json);

  const ai_category =
    row.ai_category?.trim() ||
    existing?.ai_category?.trim() ||
    parseYes24CategoryForAiCategory(row.category) ||
    parseYes24CategoryForAiCategory(existing?.category) ||
    null;

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
    ai_category,
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
