import { bookAiKeywordsFromJson, bookRowNeedsAiMetadataFill } from "./bookAiMetadataParse";
import { generateBookAiMetadataFromCorpus } from "./geminiBookAiMetadata";
import type { MockBook } from "./mockBooks";
import { localListBooks, localUpsertBook, type Yes24SearchResultPayload } from "./localStoreApi";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import type { Book } from "./types/database";

/** `books.id`로 1건. 없으면 null */
export async function fetchBookById(id: string): Promise<Book | null> {
  const t = id.trim();
  if (!t) return null;

  if (isSupabaseConfigured()) {
    if (!supabase) return null;
    const { data, error } = await supabase.from("books").select("*").eq("id", t).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  }

  if (import.meta.env.DEV) {
    const list = await localListBooks();
    return list.find((b) => b.id === t) ?? null;
  }

  return null;
}

/**
 * YES24 수집 직후 등 `MockBook`에 스트림 AI 키워드가 남아 있어도,
 * `db_book_id`가 있으면 `books` 테이블의 `ai_category`·`ai_keywords`로 통일한다.
 */
export async function refreshMockBookAiFromDb(b: MockBook): Promise<MockBook> {
  const bid = b.db_book_id?.trim();
  if (!bid) return b;
  const row = await ensureBookAiMetadataInDb(bid);
  if (!row) return b;
  const canon = bookRowToMockBook(row);
  return {
    ...b,
    ai_category: canon.ai_category ?? null,
    ai_keywords: canon.ai_keywords ?? [],
    cover_url: canon.cover_url ?? b.cover_url,
    introduce: canon.introduce ?? b.introduce,
    author_cmt: canon.author_cmt ?? b.author_cmt,
    pub_cmt: canon.pub_cmt ?? b.pub_cmt,
  };
}

/** books 행에 ai 분류·키워드가 없으면 소개 텍스트로 Gemini 생성 후 DB 반영 */
export async function ensureBookAiMetadataInDb(bookId: string): Promise<Book | null> {
  let row = await fetchBookById(bookId);
  if (!row) return null;
  if (!bookRowNeedsAiMetadataFill(row)) return row;

  const generated = await generateBookAiMetadataFromCorpus({
    title: row.title,
    category: row.category,
    introduce: row.introduce,
    author_cmt: row.author_cmt,
    pub_cmt: row.pub_cmt,
  });

  const existingKw = bookAiKeywordsFromJson(row.ai_keywords);
  const ai_category = generated.ai_category?.trim() || row.ai_category?.trim() || null;
  const mergedKeywords =
    generated.ai_keywords.length > 0 ? generated.ai_keywords : existingKw;
  if (!ai_category && mergedKeywords.length === 0) return row;

  const payload = {
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    url: row.url,
    cover_url: row.cover_url,
    category: row.category,
    introduce: row.introduce,
    author_cmt: row.author_cmt,
    pub_cmt: row.pub_cmt,
    ai_category,
    ai_keywords: mergedKeywords as unknown as import("./types/database").Json,
  };

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from("books")
      .update({
        ai_category: payload.ai_category,
        ai_keywords: payload.ai_keywords,
      })
      .eq("id", bookId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data ?? row;
  }

  if (import.meta.env.DEV) {
    await localUpsertBook(payload);
    row = await fetchBookById(bookId);
    return row;
  }

  return row;
}

/** 선택 도서 목록 — books 테이블 기준으로 ai_category·ai_keywords 동기화 */
export async function refreshMockBooksAiFromDb(books: MockBook[]): Promise<MockBook[]> {
  const out: MockBook[] = [];
  for (const b of books) {
    out.push(b.db_book_id?.trim() ? await refreshMockBookAiFromDb(b) : b);
  }
  return out;
}

/** `books.title`이 정확히 일치하는 행 1건(최신 `created_at`). 없으면 null */
export async function fetchBookByTitleExact(title: string): Promise<Book | null> {
  const t = title.trim();
  if (!t) return null;

  if (isSupabaseConfigured()) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("title", t)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ?? null;
  }

  if (import.meta.env.DEV) {
    const list = await localListBooks();
    return list.find((b) => b.title.trim() === t) ?? null;
  }

  return null;
}

function bookMatchesQuery(b: Book, low: string): boolean {
  return (
    b.title.toLowerCase().includes(low) ||
    b.author.toLowerCase().includes(low) ||
    b.publisher.toLowerCase().includes(low)
  );
}

/** 제목·저자·출판사 부분 일치(대소문자 무시)로 최대 `limit`건 */
export async function searchBooksByQuery(q: string, limit = 30): Promise<Book[]> {
  const t = q.trim();
  if (!t) return [];

  if (isSupabaseConfigured()) {
    if (!supabase) return [];
    const escaped = t.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const pattern = `%${escaped}%`;
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .or(`title.ilike.${pattern},author.ilike.${pattern},publisher.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  if (import.meta.env.DEV) {
    const list = await localListBooks();
    const low = t.toLowerCase();
    return list.filter((b) => bookMatchesQuery(b, low)).slice(0, limit);
  }

  return [];
}

/** @deprecated `searchBooksByQuery` 사용 */
export const searchBooksByTitleSubstring = searchBooksByQuery;

export function bookAiKeywordsFromRow(b: Book): string[] {
  const raw = b.ai_keywords;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
}

export function bookRowToYes24SearchPayload(b: Book): Yes24SearchResultPayload {
  const kw = bookAiKeywordsFromRow(b);
  return {
    title: b.title,
    author: b.author,
    publisher: b.publisher,
    url: b.url ?? "",
    cover_url: b.cover_url ?? null,
    category: b.category,
    introduce: b.introduce,
    author_cmt: b.author_cmt,
    pub_cmt: b.pub_cmt,
    ai_category: b.ai_category,
    ai_keywords: kw,
  };
}

export function bookRowToMockBook(b: Book): MockBook {
  const r = bookRowToYes24SearchPayload(b);
  const idPart =
    typeof b.id === "string" && b.id.trim().length > 0 ? b.id.trim() : `row-${b.title}-${b.created_at}`;
  return {
    id: `books-${idPart}`,
    db_book_id: b.id,
    title: r.title,
    author: r.author,
    publisher: r.publisher,
    url: r.url,
    cover_url: r.cover_url,
    category: r.category,
    introduce: r.introduce,
    author_cmt: r.author_cmt,
    pub_cmt: r.pub_cmt,
    ai_category: r.ai_category,
    ai_keywords: r.ai_keywords,
  };
}
