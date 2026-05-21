import { useEffect, useRef, useState } from "react";
import { HanuriBookSearchProgress } from "../HanuriBookSearchProgress";
import {
  bookRowToMockBook,
  fetchBookByTitleExact,
  refreshMockBookAiFromDb,
  searchBooksByQuery,
} from "../../lib/fetchBookByTitle";
import { searchMockBooksByTitle } from "../../lib/mockBooks";
import type { MockBook } from "../../lib/mockBooks";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { isYes24SearchAvailable, localYes24SearchBook } from "../../lib/localStoreApi";
import { bookUpsertInputFromYes24, persistBookUpsertRow } from "../../lib/persistBookUpsert";
import type { Book } from "../../lib/types/database";

export type BookSearchHit = {
  key: string;
  dbBookId?: string | null;
  title: string;
  author: string;
  publisher: string;
  cover_url?: string | null;
  ai_category?: string | null;
  ai_keywords?: string[];
};

export function bookToSearchHit(b: Book): BookSearchHit {
  const row = bookRowToMockBook(b);
  return mockBookToSearchHit(row);
}

export function searchHitToMockBook(hit: BookSearchHit): MockBook {
  return {
    id: hit.key,
    db_book_id: hit.dbBookId ?? null,
    title: hit.title,
    author: hit.author,
    publisher: hit.publisher,
    cover_url: hit.cover_url,
    ai_category: hit.ai_category,
    ai_keywords: hit.ai_keywords,
  };
}

export function mockBookToSearchHit(b: MockBook): BookSearchHit {
  const db = b.db_book_id != null ? String(b.db_book_id).trim() : "";
  const sid = typeof b.id === "string" ? b.id.trim() : "";
  const key = db ? `db:${db}` : sid ? `id:${sid}` : `tp:${b.title}|${b.publisher}|${b.author}`;
  const kw = Array.isArray(b.ai_keywords)
    ? b.ai_keywords.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
    : [];
  return {
    key,
    dbBookId: b.db_book_id ?? null,
    title: b.title,
    author: b.author,
    publisher: b.publisher,
    cover_url: b.cover_url,
    ai_category: b.ai_category,
    ai_keywords: kw,
  };
}

function keywordsForDisplay(hit: BookSearchHit): string[] {
  const raw = hit.ai_keywords;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
}

type HanuriBookSearchPanelProps = {
  onResultClick: (hit: BookSearchHit) => void;
  isResultSelected?: (hit: BookSearchHit) => boolean;
  isResultClickDisabled?: (hit: BookSearchHit) => boolean;
  resultClickDisabledTitle?: string;
  /** 등록 폼 불러오기 안내 (도서관) */
  showPickHint?: boolean;
  /** YES24 수집 직후 (도서관: 폼 자동 채움) */
  onYes24Success?: (hit: BookSearchHit) => void;
  className?: string;
};

export function HanuriBookSearchPanel({
  onResultClick,
  isResultSelected,
  isResultClickDisabled,
  resultClickDisabledTitle,
  showPickHint = false,
  onYes24Success,
  className = "",
}: HanuriBookSearchPanelProps) {
  const [bookSearchTitle, setBookSearchTitle] = useState("");
  const [yes24ManualOpen, setYes24ManualOpen] = useState(false);
  const [yes24CollectTitle, setYes24CollectTitle] = useState("");
  const [yes24CollectAuthor, setYes24CollectAuthor] = useState("");
  const [yes24CollectPublisher, setYes24CollectPublisher] = useState("");
  const [bookSearchResults, setBookSearchResults] = useState<BookSearchHit[] | null>(null);
  const [bookSearchError, setBookSearchError] = useState<string | null>(null);
  const [bookSearchBusy, setBookSearchBusy] = useState(false);
  const [yes24Busy, setYes24Busy] = useState(false);
  const [yes24Logs, setYes24Logs] = useState<string[]>([]);
  const yes24LogEndRef = useRef<HTMLDivElement>(null);

  const titleSearchReady = Boolean(bookSearchTitle.trim());
  const yes24CollectFormReady = Boolean(
    yes24CollectTitle.trim() && yes24CollectPublisher.trim() && yes24CollectAuthor.trim(),
  );

  function openYes24ManualForm() {
    setYes24ManualOpen(true);
    setYes24CollectTitle(bookSearchTitle.trim());
    setBookSearchError(null);
  }

  useEffect(() => {
    setBookSearchResults(null);
    setBookSearchError(null);
    setYes24Logs([]);
    setYes24ManualOpen(false);
  }, [bookSearchTitle]);

  useEffect(() => {
    yes24LogEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [yes24Logs]);

  async function runDbTitleSearch() {
    const title = bookSearchTitle.trim();
    if (!title) {
      setBookSearchError("검색어를 입력해 주세요.");
      return;
    }
    setBookSearchError(null);
    setBookSearchBusy(true);
    setYes24Logs([]);
    try {
      let rows: BookSearchHit[];
      if (isSupabaseConfigured() && supabase) {
        const books = await searchBooksByQuery(title);
        rows = books.map(bookToSearchHit);
      } else if (import.meta.env.DEV) {
        const books = await searchBooksByQuery(title);
        rows = books.map(bookToSearchHit);
      } else {
        rows = searchMockBooksByTitle(title).map(mockBookToSearchHit);
      }
      setBookSearchResults(rows);
    } catch (e) {
      setBookSearchError(e instanceof Error ? e.message : String(e));
      setBookSearchResults([]);
    } finally {
      setBookSearchBusy(false);
    }
  }

  async function runYes24RegisterBook() {
    if (!isYes24SearchAvailable()) {
      setBookSearchError("이 사이트에서는 YES24 자동 등록을 사용할 수 없습니다.");
      return;
    }
    const title = yes24CollectTitle.trim();
    const publisher = yes24CollectPublisher.trim();
    const person = yes24CollectAuthor.trim();
    if (!title || !publisher || !person) {
      setBookSearchError("도서명·출판사·저자/역자를 모두 입력한 뒤 도서 찾기를 눌러 주세요.");
      return;
    }
    setBookSearchError(null);
    setYes24Busy(true);
    setYes24Logs([]);
    try {
      const existing = await fetchBookByTitleExact(title);
      if (existing) {
        const cached = bookToSearchHit(existing);
        setYes24Logs(["이 도서명은 이미 도서함에 있어요. 아래 목록에서 선택해 주세요."]);
        setBookSearchResults([cached]);
        onYes24Success?.(cached);
        return;
      }
      const r = await localYes24SearchBook(
        { title, author: person, publisher },
        {
          onLog: (message) => {
            setYes24Logs((prev) => [...prev, message]);
          },
        },
      );
      const persisted = await persistBookUpsertRow(bookUpsertInputFromYes24(r));
      const dbBookId = persisted.ok ? persisted.book_id : null;
      if (!persisted.ok) {
        setYes24Logs((prev) => [...prev, `도서함에 넣는 중에 잠깐 문제가 생겼어요. (${persisted.error})`]);
      } else {
        setYes24Logs((prev) => [...prev, "도서함에 잘 넣어두었어요!"]);
      }
      let row: BookSearchHit = {
        key: `yes24-${Date.now()}`,
        dbBookId,
        title: r.title,
        author: r.author,
        publisher: r.publisher,
        cover_url: r.cover_url ?? null,
        ai_category: r.ai_category,
        ai_keywords: r.ai_keywords,
      };
      if (dbBookId) {
        try {
          const mb: MockBook = {
            id: row.key,
            db_book_id: dbBookId,
            title: r.title,
            author: r.author,
            publisher: r.publisher,
            url: r.url,
            cover_url: r.cover_url ?? null,
            category: r.category,
            introduce: r.introduce,
            author_cmt: r.author_cmt,
            pub_cmt: r.pub_cmt,
            ai_category: r.ai_category,
            ai_keywords: r.ai_keywords,
          };
          row = mockBookToSearchHit(await refreshMockBookAiFromDb(mb));
        } catch (e) {
          setYes24Logs((prev) => [
            ...prev,
            `도서함에 저장된 분류·키워드를 불러오지 못했어요. (${e instanceof Error ? e.message : String(e)})`,
          ]);
        }
      }
      setBookSearchResults((prev) => {
        const list = prev ?? [];
        const withoutDup = list.filter((b) => b.key !== row.key);
        return [row, ...withoutDup];
      });
      onYes24Success?.(row);
    } catch (e) {
      setBookSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setYes24Busy(false);
    }
  }

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      <label className="block text-sm">
        <span className="text-slate-700">검색어</span>
        <span className="text-red-500"> *</span>
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={bookSearchTitle}
          onChange={(e) => setBookSearchTitle(e.target.value)}
          placeholder="도서명·저자·출판사 일부 (예: 백범, 김구)"
          autoComplete="off"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          disabled={!titleSearchReady || bookSearchBusy || yes24Busy}
          onClick={() => void runDbTitleSearch()}
        >
          {bookSearchBusy ? "검색 중…" : "검색"}
        </button>
      </div>

      {bookSearchError ? <p className="text-sm text-red-600 whitespace-pre-wrap">{bookSearchError}</p> : null}

      {yes24Logs.length > 0 || yes24Busy ? (
        <div className="space-y-2">
          <HanuriBookSearchProgress messages={yes24Logs} active={yes24Busy || bookSearchBusy} />
          <div ref={yes24LogEndRef} />
        </div>
      ) : null}

      {bookSearchResults === null ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-center text-sm text-slate-500">
          검색어를 입력한 뒤 「검색」을 누르면 결과가 여기에 표시됩니다.
        </p>
      ) : bookSearchResults.length === 0 ? (
        <p className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3 text-center text-sm text-slate-600">
          도서함에 일치하는 도서가 없습니다.
        </p>
      ) : (
        <ul className="max-h-[28rem] space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 p-2">
          {bookSearchResults.map((b, ri) => {
            const on = isResultSelected?.(b) ?? false;
            const disabledPick = isResultClickDisabled?.(b) ?? false;
            const kw = keywordsForDisplay(b);
            const cat = (b.ai_category ?? "").trim();
            return (
              <li key={`${b.key}-${ri}`}>
                <button
                  type="button"
                  disabled={disabledPick}
                  onClick={() => onResultClick(b)}
                  title={disabledPick ? resultClickDisabledTitle : undefined}
                  className={
                    on
                      ? "flex w-full gap-3 rounded-lg border border-indigo-500 bg-indigo-50 p-2 text-left text-sm shadow-sm disabled:opacity-100"
                      : "flex w-full gap-3 rounded-lg border border-transparent bg-white/90 p-2 text-left text-sm hover:border-slate-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  <div className="shrink-0">
                    {b.cover_url ? (
                      <img
                        src={b.cover_url}
                        alt=""
                        className="h-[5.5rem] w-[3.75rem] rounded border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-[5.5rem] w-[3.75rem] items-center justify-center rounded border border-dashed border-slate-300 bg-slate-100 text-center text-[10px] leading-tight text-slate-500">
                        표지 없음
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium leading-snug text-slate-900">{b.title}</p>
                    <p className="text-xs text-slate-600">
                      <span className="text-slate-500">저자</span> {b.author}
                    </p>
                    <p className="text-xs text-slate-600">
                      <span className="text-slate-500">출판사</span> {b.publisher}
                    </p>
                    <p className="text-xs text-slate-600">
                      <span className="text-slate-500">AI 분류</span>{" "}
                      {cat ? <span className="text-slate-800">{cat}</span> : <span className="text-slate-400">—</span>}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      <span className="sr-only">AI 키워드</span>
                      {kw.length ? (
                        kw.map((k, j) => (
                          <span
                            key={`${b.key}-kw-${j}`}
                            className="inline-block max-w-full truncate rounded-full bg-slate-200/90 px-2 py-0.5 text-[11px] text-slate-800"
                            title={k}
                          >
                            {k}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-400">AI 키워드 없음</span>
                      )}
                    </div>
                    {showPickHint ? (
                      <p className="text-[11px] text-indigo-600">클릭하면 아래 등록 폼에 불러옵니다</p>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {bookSearchResults !== null ? (
        <button
          type="button"
          className="text-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900 disabled:opacity-50"
          disabled={bookSearchBusy || yes24Busy}
          onClick={() => openYes24ManualForm()}
        >
          원하는 도서가 없으신가요?
        </button>
      ) : null}

      {yes24ManualOpen ? (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
          <p className="text-slate-800">
            YES24에서 가져올 도서 정보를 입력한 뒤 <strong>도서 찾기</strong>를 눌러 주세요.
          </p>
          <label className="block text-sm">
            <span className="text-slate-800">수집하고자 하는 도서명</span>
            <span className="text-red-500"> *</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={yes24CollectTitle}
              onChange={(e) => setYes24CollectTitle(e.target.value)}
              placeholder="YES24 검색에 맞는 정확한 제목"
              autoComplete="off"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-800">저자 / 역자</span>
              <span className="text-red-500"> *</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={yes24CollectAuthor}
                onChange={(e) => setYes24CollectAuthor(e.target.value)}
                placeholder="검색할 한 명만 입력"
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-800">출판사</span>
              <span className="text-red-500"> *</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={yes24CollectPublisher}
                onChange={(e) => setYes24CollectPublisher(e.target.value)}
                placeholder="예: 문학동네"
                autoComplete="off"
              />
            </label>
          </div>
          {isYes24SearchAvailable() ? (
            <button
              type="button"
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              disabled={!yes24CollectFormReady || bookSearchBusy || yes24Busy}
              onClick={() => void runYes24RegisterBook()}
            >
              {yes24Busy ? "YES24 처리 중…" : "도서 찾기"}
            </button>
          ) : (
            <p className="text-xs text-amber-900/80">YES24 연동이 꺼져 있어 자동 수집을 사용할 수 없습니다.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
