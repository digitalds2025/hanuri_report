import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { HanuriBookSearchProgress } from "../components/HanuriBookSearchProgress";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { bookRowToYes24SearchPayload, fetchBookByTitleExact } from "../lib/fetchBookByTitle";
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

  const canYes24Search = isYes24SearchAvailable();

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
          <ul className="divide-y divide-slate-100">
            {books.map((b) => (
              <li key={b.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">
                  {b.title} · {b.author}
                </p>
                <p className="text-xs text-slate-500">{b.publisher}</p>
                <p className="mt-1 line-clamp-2 text-slate-600">{b.introduce ?? ""}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
