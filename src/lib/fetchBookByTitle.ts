import type { MockBook } from "./mockBooks";
import { localListBooks, type Yes24SearchResultPayload } from "./localStoreApi";
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
  const row = await fetchBookById(bid);
  if (!row) return b;
  const canon = bookRowToMockBook(row);
  return {
    ...b,
    ai_category: canon.ai_category ?? null,
    ai_keywords: canon.ai_keywords ?? [],
  };
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

/** 도서명 부분 일치(대소문자 무시)로 최대 `limit`건 */
export async function searchBooksByTitleSubstring(q: string, limit = 30): Promise<Book[]> {
  const t = q.trim();
  if (!t) return [];

  if (isSupabaseConfigured()) {
    if (!supabase) return [];
    const escaped = t.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .ilike("title", `%${escaped}%`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  if (import.meta.env.DEV) {
    const list = await localListBooks();
    const low = t.toLowerCase();
    return list.filter((b) => b.title.toLowerCase().includes(low)).slice(0, limit);
  }

  return [];
}

export function bookRowToYes24SearchPayload(b: Book): Yes24SearchResultPayload {
  const kw: string[] = Array.isArray(b.ai_keywords)
    ? (b.ai_keywords as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
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
