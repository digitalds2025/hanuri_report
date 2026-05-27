import { YES24_CLOUD_RUN_API_KEY, YES24_CLOUD_RUN_BASE_URL } from "../config/yes24CloudRun";
import type { BriefingMaterialKit } from "./briefingMaterialTypes";
import type { Book, Json, MonthlyReport, Student } from "./types/database";

function yes24RemoteBaseUrl(): string {
  const fromConfig = YES24_CLOUD_RUN_BASE_URL.trim();
  const fromEnv = (import.meta.env.VITE_YES24_API_URL as string | undefined)?.trim() ?? "";
  return (fromConfig || fromEnv).replace(/\/$/, "");
}

function yes24RemoteApiKey(): string {
  return YES24_CLOUD_RUN_API_KEY.trim() || (import.meta.env.VITE_YES24_API_KEY as string | undefined)?.trim() || "";
}

function yes24SearchUrl(): string {
  const path = "/api/local/books/yes24-search";
  /** 로컬 `npm run dev` — Vite 플러그인(동일 출처). Cloud Run 직통은 CORS로 Failed to fetch 가 납니다. */
  if (import.meta.env.DEV) return path;
  const base = yes24RemoteBaseUrl();
  if (base) return `${base}${path}`;
  return path;
}

function wrapFetchError(err: unknown, context: "yes24" | "local-api"): never {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === "Failed to fetch" || raw.includes("NetworkError") || raw.includes("Load failed")) {
    if (context === "yes24") {
      if (import.meta.env.DEV) {
        throw new Error(
          "YES24 도서 찾기 서버에 연결하지 못했습니다. `npm run dev` 로 실행 중인지 확인하고, 터미널에 Playwright 관련 오류가 없는지 봐 주세요.",
        );
      }
      throw new Error(
        "YES24 API(Cloud Run)에 연결하지 못했습니다. 네트워크·방화벽·VITE_YES24_API_URL / yes24CloudRun.ts 설정을 확인해 주세요.",
      );
    }
    throw new Error(
      "로컬 API에 연결하지 못했습니다. `npm run dev` 로 실행 중인지 확인해 주세요.",
    );
  }
  throw err instanceof Error ? err : new Error(raw);
}

function yes24SearchHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
  };
  const key = yes24RemoteApiKey();
  if (key) h["X-Api-Key"] = key;
  return h;
}

/** 로컬 dev 플러그인 또는 Cloud Run(설정·Secret) 연동 시 true */
export function isYes24SearchAvailable(): boolean {
  if (import.meta.env.DEV) return true;
  return Boolean(yes24RemoteBaseUrl() && yes24RemoteApiKey());
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || res.statusText);
  }
  return JSON.parse(text) as T;
}

async function localFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    wrapFetchError(e, "local-api");
  }
}

export async function localListStudents(): Promise<Student[]> {
  const res = await localFetch("/api/local/students");
  return parseJson<Student[]>(res);
}

export async function localInsertStudent(input: { nickname: string; student_grade: string }): Promise<void> {
  const res = await localFetch("/api/local/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseJson<unknown>(res);
}

export async function localDeleteStudent(studentId: string): Promise<void> {
  const res = await localFetch(`/api/local/students/${encodeURIComponent(studentId)}`, { method: "DELETE" });
  await parseJson<unknown>(res);
}

export async function localListMonthlyReports(studentId?: string): Promise<MonthlyReport[]> {
  const q = studentId ? `?student_id=${encodeURIComponent(studentId)}` : "";
  const res = await localFetch(`/api/local/monthly-reports${q}`);
  return parseJson<MonthlyReport[]>(res);
}

export async function localSaveMonthlyReport(input: {
  student_id: string;
  year_month: string;
  growth_moment: string | null;
  growth_meta: Json;
  score_reading: number;
  score_thinking: number;
  score_discussion: number;
  score_writing: number;
  score_growth: number;
  teacher_comment: string | null;
  writing_img_url1?: string | null;
  writing_img_url2?: string | null;
  book_id1?: string | null;
  book_id2?: string | null;
  strength_point?: string | null;
  weakness_point?: string | null;
  strength_cmt?: string | null;
  weakness_cmt?: string | null;
  book_keywords: Json;
}): Promise<void> {
  const res = await localFetch("/api/local/monthly-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await parseJson<unknown>(res);
}

export async function localListBooks(): Promise<Book[]> {
  const res = await localFetch("/api/local/books");
  return parseJson<Book[]>(res);
}

export type Yes24SearchResultPayload = {
  title: string;
  author: string;
  publisher: string;
  url: string;
  cover_url: string | null;
  category: string | null;
  introduce: string | null;
  author_cmt: string | null;
  pub_cmt: string | null;
  ai_category: string | null;
  ai_keywords: string[];
};

type Yes24NdjsonLine =
  | { kind: "log"; message: string }
  | { kind: "done"; result: Yes24SearchResultPayload }
  | { kind: "error"; message: string };

function parseYes24NdjsonLine(line: string, onLog?: (message: string) => void): {
  outcome?: Yes24SearchResultPayload;
  errorMessage?: string;
} {
  const t = line.trim();
  if (!t) return {};
  let pkt: Yes24NdjsonLine;
  try {
    pkt = JSON.parse(t) as Yes24NdjsonLine;
  } catch {
    return {};
  }
  if (pkt.kind === "log" && typeof pkt.message === "string") onLog?.(pkt.message);
  if (pkt.kind === "done" && pkt.result) return { outcome: pkt.result };
  if (pkt.kind === "error" && typeof pkt.message === "string") return { errorMessage: pkt.message };
  return {};
}

async function readYes24NdjsonStream(
  body: ReadableStream<Uint8Array>,
  onLog?: (message: string) => void,
): Promise<Yes24SearchResultPayload> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let outcome: Yes24SearchResultPayload | undefined;
  let errorMessage: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const r = parseYes24NdjsonLine(line, onLog);
      if (r.outcome) outcome = r.outcome;
      if (r.errorMessage) errorMessage = r.errorMessage;
    }
  }
  const tail = parseYes24NdjsonLine(buffer, onLog);
  if (tail.outcome) outcome = tail.outcome;
  if (tail.errorMessage) errorMessage = tail.errorMessage;
  if (errorMessage) throw new Error(errorMessage);
  if (!outcome) throw new Error("YES24 스트림 응답을 해석하지 못했습니다. 개발 서버를 재시작해 보세요.");
  return outcome;
}

/** YES24 Playwright 검색 + Gemini (npm run dev). `onLog`로 단계별 진행이 실시간 표시됩니다. */
export async function localYes24SearchBook(
  input: { title: string; author: string; publisher: string },
  options?: { onLog?: (message: string) => void },
): Promise<Yes24SearchResultPayload> {
  let res: Response;
  try {
    res = await fetch(yes24SearchUrl(), {
      method: "POST",
      headers: yes24SearchHeaders(),
      body: JSON.stringify({ ...input, streamLogs: true }),
    });
  } catch (e) {
    wrapFetchError(e, "yes24");
  }
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || res.statusText);
  }
  if (!res.body) throw new Error("스트림 응답이 없습니다.");
  return readYes24NdjsonStream(res.body, options?.onLog);
}

export async function localUpsertBook(row: {
  title: string;
  author: string;
  publisher: string;
  url?: string | null;
  cover_url?: string | null;
  category?: string | null;
  introduce: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
  ai_category?: string | null;
  ai_keywords: Json;
}): Promise<string> {
  const res = await localFetch("/api/local/books/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: row.title,
      author: row.author,
      publisher: row.publisher,
      url: row.url ?? null,
      cover_url: row.cover_url ?? null,
      category: row.category ?? null,
      introduce: row.introduce,
      author_cmt: row.author_cmt ?? null,
      pub_cmt: row.pub_cmt ?? null,
      ai_category: row.ai_category ?? null,
      ai_keywords: row.ai_keywords,
    }),
  });
  const j = await parseJson<{ id?: string }>(res);
  if (!j.id || typeof j.id !== "string") throw new Error("로컬 books upsert 응답에 id가 없습니다.");
  return j.id;
}

export async function localListBriefingKits(): Promise<BriefingMaterialKit[]> {
  const res = await localFetch("/api/local/briefing-kits");
  return parseJson<BriefingMaterialKit[]>(res);
}

export async function localSaveBriefingKit(kit: BriefingMaterialKit): Promise<void> {
  const res = await localFetch("/api/local/briefing-kits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kit),
  });
  await parseJson<unknown>(res);
}
