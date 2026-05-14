import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { HanuriBookSearchProgress } from "../components/HanuriBookSearchProgress";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { bookAiKeywordsFromRow, bookRowToYes24SearchPayload, fetchBookByTitleExact } from "../lib/fetchBookByTitle";
import { isYes24SearchAvailable, localListBooks, localYes24SearchBook } from "../lib/localStoreApi";
import { bookUpsertInputFromYes24, persistBookUpsertRow } from "../lib/persistBookUpsert";
import { studentsSectionTitle } from "../lib/studentsSectionTitle";
import type { Book, Json } from "../lib/types/database";

export function BooksPage() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [publisher, setPublisher] = useState("");
  const [url, setUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [category, setCategory] = useState("");
  const [introduce, setIntroduce] = useState("");
  const [authorCmt, setAuthorCmt] = useState("");
  const [pubCmt, setPubCmt] = useState("");
  const [busy, setBusy] = useState<"search" | "save" | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [aiCategory, setAiCategory] = useState("");
  const [yes24Logs, setYes24Logs] = useState<string[]>([]);
  const yes24LogEndRef = useRef<HTMLDivElement>(null);
  const [detailBook, setDetailBook] = useState<Book | null>(null);

  const canYes24Search = isYes24SearchAvailable();

  useEffect(() => {
    if (!detailBook) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailBook(null);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [detailBook]);

  async function load() {
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        if (!supabase) {
          setBooks([]);
          setErr("저장소 연결이 설정되지 않았습니다.");
          return;
        }
        const { data, error } = await supabase.from("books").select("*").order("created_at", { ascending: false });
        if (error) setErr(error.message);
        else {
          setErr(null);
          setBooks(data ?? []);
        }
        return;
      }
      if (!import.meta.env.DEV) {
        setBooks([]);
        setErr("이 환경에서는 로컬 도서함을 사용할 수 없습니다.");
        return;
      }
      const list = await localListBooks();
      setErr(null);
      setBooks(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    yes24LogEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [yes24Logs]);

  async function onYes24Search() {
    if (!canYes24Search) {
      setErr("이 사이트에서는 YES24 검색을 사용할 수 없습니다.");
      return;
    }
    setBusy("search");
    setErr(null);
    setYes24Logs([]);
    try {

      const existing = await fetchBookByTitleExact(title.trim());
      if (existing) {
        const r = bookRowToYes24SearchPayload(existing);
        setYes24Logs(["이 책은 이미 도서함에 있어서, 바로 불러왔어요!"]);
        setTitle(r.title);
        setAuthor(r.author);
        setPublisher(r.publisher);
        setUrl(r.url);
        setCoverUrl(r.cover_url ?? "");
        setCategory(r.category ?? "");
        setIntroduce(r.introduce ?? "");
        setAuthorCmt(r.author_cmt ?? "");
        setPubCmt(r.pub_cmt ?? "");
        setAiCategory(r.ai_category ?? "");
        setKeywords(r.ai_keywords);
        return;
      }

      const r = await localYes24SearchBook(
        {
          title: title.trim(),
          author: author.trim(),
          publisher: publisher.trim(),
        },
        {
          onLog: (message) => {
            setYes24Logs((prev) => [...prev, message]);
          },
        },
      );
      setTitle(r.title);
      setAuthor(r.author);
      setPublisher(r.publisher);
      setUrl(r.url);
      setCoverUrl(r.cover_url ?? "");
      setCategory(r.category ?? "");
      setIntroduce(r.introduce ?? "");
      setAuthorCmt(r.author_cmt ?? "");
      setPubCmt(r.pub_cmt ?? "");
      setAiCategory(r.ai_category ?? "");
      setKeywords(r.ai_keywords);

      const persisted = await persistBookUpsertRow(bookUpsertInputFromYes24(r));
      if (!persisted.ok) {
        setYes24Logs((prev) => [...prev, `도서함에 넣는 중에 잠깐 문제가 생겼어요. (${persisted.error})`]);
        setErr(persisted.error);
      } else {
        setYes24Logs((prev) => [...prev, "도서함에 잘 넣어두었어요!"]);
        await load();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    setErr(null);
    try {
      const kwJson = keywords as unknown as Json;
      const persisted = await persistBookUpsertRow({
        title: title.trim(),
        author: author.trim(),
        publisher: publisher.trim(),
        url: url.trim() || null,
        cover_url: coverUrl.trim() || null,
        category: category.trim() || null,
        introduce: introduce.trim() || null,
        author_cmt: authorCmt.trim() || null,
        pub_cmt: pubCmt.trim() || null,
        ai_category: aiCategory.trim() || null,
        ai_keywords: kwJson,
      });
      if (!persisted.ok) {
        setErr(persisted.error);
        return;
      }
      setTitle("");
      setAuthor("");
      setPublisher("");
      setUrl("");
      setCoverUrl("");
      setCategory("");
      setIntroduce("");
      setAuthorCmt("");
      setPubCmt("");
      setKeywords([]);
      setAiCategory("");
      await load();
    } catch (err) {
      setErr(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/students" className="text-sm text-indigo-600 hover:text-indigo-800">
          ← {studentsSectionTitle(user?.login_id)}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">한우리 도서관</h1>
        
      </div>

      {err ? <p className="text-sm text-red-600 whitespace-pre-wrap">{err}</p> : null}

      <form
        onSubmit={onSave}
        className="max-w-2xl space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-800">도서 등록 / 갱신</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="도서명"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <input
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="출판사"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            required
          />
          <input
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="저자 또는 역자 (YES24 표기와 맞추면 검색됩니다)"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            onClick={() => void onYes24Search()}
            disabled={busy !== null || !canYes24Search}
            title={!canYes24Search ? "YES24 연동이 꺼져 있거나, 로컬 개발 서버가 아닙니다." : undefined}
          >
            {busy === "search" ? "YES24 검색 중…" : "도서 검색 (YES24)"}
          </button>
        </div>
        {yes24Logs.length > 0 ? (
          <div className="space-y-2">
            <HanuriBookSearchProgress messages={yes24Logs} active={busy === "search"} />
            <div ref={yes24LogEndRef} />
          </div>
        ) : null}
        {url ? (
          <p className="text-xs text-slate-600">
            상세 URL:{" "}
            <a href={url} className="text-indigo-600 underline" target="_blank" rel="noreferrer">
              {url}
            </a>
          </p>
        ) : null}
        {coverUrl ? (
          <p className="text-xs text-slate-600">
            표지:{" "}
            <a href={coverUrl} className="text-indigo-600 underline" target="_blank" rel="noreferrer">
              이미지 URL
            </a>
            <img src={coverUrl} alt="" className="mt-2 max-h-40 rounded border border-slate-200 object-contain" />
          </p>
        ) : null}
        {category ? <p className="text-xs text-slate-500">카테고리(원문): {category}</p> : null}
        <textarea
          className="min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="책 소개 (YES24 검색으로 채움)"
          value={introduce}
          onChange={(e) => setIntroduce(e.target.value)}
        />
        <textarea
          className="min-h-[72px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="만든이 코멘트"
          value={authorCmt}
          onChange={(e) => setAuthorCmt(e.target.value)}
        />
        <textarea
          className="min-h-[72px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="출판사 리뷰"
          value={pubCmt}
          onChange={(e) => setPubCmt(e.target.value)}
        />
        {aiCategory ? <p className="text-xs text-slate-600">AI 분류: {aiCategory}</p> : null}
        {keywords.length ? <p className="text-xs text-slate-600">AI 키워드: {keywords.join(" · ")}</p> : null}
        <button
          type="submit"
          disabled={busy !== null}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy === "save" ? "저장 중…" : isSupabaseConfigured() ? "도서관에 저장" : "로컬 DB에 저장"}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">등록된 도서</h2>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-slate-500">불러오는 중…</p>
        ) : books.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">데이터가 없습니다.</p>
        ) : (
          <ul className="grid max-h-[40rem] grid-cols-1 gap-3 overflow-y-auto p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-5">
            {books.map((b) => {
              const kw = bookAiKeywordsFromRow(b);
              const cat = (b.ai_category ?? "").trim();
              return (
                <li key={b.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setDetailBook(b)}
                    className="flex h-full min-h-[14rem] w-full flex-col rounded-xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/80 p-3 text-left text-sm shadow-sm transition hover:border-indigo-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    <div className="mx-auto shrink-0">
                      {b.cover_url ? (
                        <img
                          src={b.cover_url}
                          alt=""
                          className="h-36 w-[6.25rem] rounded-lg border border-slate-200 object-cover shadow-sm"
                        />
                      ) : (
                        <div className="flex h-36 w-[6.25rem] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100 text-center text-[10px] leading-tight text-slate-500">
                          표지 없음
                        </div>
                      )}
                    </div>
                    <div className="mt-2 min-w-0 flex-1 space-y-1">
                      <p className="line-clamp-2 font-medium leading-snug text-slate-900">{b.title}</p>
                      <p className="line-clamp-1 text-xs text-slate-600">
                        <span className="text-slate-500">저자</span> {b.author}
                      </p>
                      <p className="line-clamp-1 text-xs text-slate-600">
                        <span className="text-slate-500">출판사</span> {b.publisher}
                      </p>
                      <p className="line-clamp-1 text-xs text-slate-600">
                        <span className="text-slate-500">AI 분류</span>{" "}
                        {cat ? (
                          <span className="text-slate-800">{cat}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </p>
                      <div className="flex max-h-[2.75rem] flex-wrap gap-1 overflow-hidden pt-0.5">
                        <span className="sr-only">AI 키워드</span>
                        {kw.length ? (
                          kw.slice(0, 6).map((k, j) => (
                            <span
                              key={`${b.id}-kw-${j}`}
                              className="inline-block max-w-full truncate rounded-full bg-indigo-100/80 px-2 py-0.5 text-[10px] font-medium text-indigo-950 sm:text-[11px]"
                              title={k}
                            >
                              {k}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400 sm:text-[11px]">AI 키워드 없음</span>
                        )}
                        {kw.length > 6 ? (
                          <span className="text-[10px] text-slate-400">+{kw.length - 6}</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {detailBook ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => setDetailBook(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-detail-title"
            className="relative flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-indigo-100 via-violet-50 to-amber-50/60" aria-hidden />
            <button
              type="button"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg text-slate-600 shadow ring-1 ring-slate-200/80 transition hover:bg-white hover:text-slate-900"
              onClick={() => setDetailBook(null)}
              aria-label="닫기"
            >
              ×
            </button>

            <div className="relative z-[1] flex-shrink-0 overflow-y-auto px-5 pb-4 pt-6 sm:px-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="mx-auto shrink-0 sm:mx-0">
                  {detailBook.cover_url ? (
                    <img
                      src={detailBook.cover_url}
                      alt=""
                      className="h-48 w-32 rounded-xl border border-white object-cover shadow-lg ring-2 ring-white/80 sm:h-52 sm:w-36"
                    />
                  ) : (
                    <div className="flex h-48 w-32 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100 text-center text-xs text-slate-500 sm:h-52 sm:w-36">
                      표지 없음
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-center sm:pt-1 sm:text-left">
                  <h2 id="book-detail-title" className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                    {detailBook.title}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="font-medium text-slate-500">저자</span> {detailBook.author}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    <span className="font-medium text-slate-500">출판사</span> {detailBook.publisher}
                  </p>
                  {(detailBook.ai_category ?? "").trim() ? (
                    <p className="mt-3">
                      <span className="inline-flex rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                        {(detailBook.ai_category ?? "").trim()}
                      </span>
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                    {bookAiKeywordsFromRow(detailBook).map((k, j) => (
                      <span
                        key={`modal-kw-${j}`}
                        className="inline-block max-w-full truncate rounded-full bg-slate-200/90 px-2.5 py-1 text-[11px] font-medium text-slate-800"
                        title={k}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                  {detailBook.url ? (
                    <p className="mt-4">
                      <a
                        href={detailBook.url}
                        className="text-xs font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800"
                        target="_blank"
                        rel="noreferrer"
                      >
                        YES24 상세 페이지 열기
                      </a>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="relative z-[1] flex-1 overflow-y-auto border-t border-slate-100 bg-slate-50/90 px-5 py-4 sm:px-6">
              <div className="space-y-4 text-sm leading-relaxed text-slate-700">
                {detailBook.introduce?.trim() ? (
                  <section>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">책 소개</h3>
                    <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-slate-800 shadow-sm ring-1 ring-slate-100">
                      {detailBook.introduce.trim()}
                    </p>
                  </section>
                ) : null}
                {detailBook.author_cmt?.trim() ? (
                  <section>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">저자의 말</h3>
                    <p className="whitespace-pre-wrap rounded-lg border border-amber-100 bg-amber-50/80 p-3 text-amber-950">
                      {detailBook.author_cmt.trim()}
                    </p>
                  </section>
                ) : null}
                {detailBook.pub_cmt?.trim() ? (
                  <section>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">출판사 리뷰</h3>
                    <p className="whitespace-pre-wrap rounded-lg border border-sky-100 bg-sky-50/80 p-3 text-sky-950">
                      {detailBook.pub_cmt.trim()}
                    </p>
                  </section>
                ) : null}
                {detailBook.category?.trim() ? (
                  <section>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">분류 (원문)</h3>
                    <p className="rounded-lg bg-white px-3 py-2 text-slate-800 ring-1 ring-slate-100">{detailBook.category.trim()}</p>
                  </section>
                ) : null}
                {!detailBook.introduce?.trim() &&
                !detailBook.author_cmt?.trim() &&
                !detailBook.pub_cmt?.trim() &&
                !detailBook.category?.trim() ? (
                  <p className="text-center text-sm text-slate-500">등록된 소개·코멘트가 없습니다.</p>
                ) : null}
              </div>
            </div>

            <div className="relative z-[1] flex flex-shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="truncate text-[11px] text-slate-400" title={detailBook.id}>
                ID <span className="font-mono text-slate-500">{detailBook.id}</span>
              </p>
              <button
                type="button"
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200 sm:shrink-0"
                onClick={() => setDetailBook(null)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
