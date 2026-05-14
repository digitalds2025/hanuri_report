import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { loadEnv } from "vite";
import {
  isSchoolGradeCode,
  mapLegacyNumericGradeToCode,
  type SchoolGradeCode,
} from "./src/lib/schoolGrade";
import { parsePillarScores } from "./src/lib/reportAggregates";
import { endYmForQuarterYearKey } from "./src/lib/reportRounds";
import type { Json } from "./src/lib/types/database";

/** 로컬 전용 더미 user_id (Supabase FK 없음) */
const LOCAL_DEV_USER_ID = "00000000-0000-4000-8000-000000000001";

type Student = {
  student_id: string;
  user_id: string;
  student_nick: string;
  student_grade: SchoolGradeCode;
  total_reports_written: number;
  created_at: string;
  updated_at: string;
};

type Book = {
  id: string;
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
  created_at: string;
};

type LocalMReport = {
  m_report_id: string;
  report_id: string;
  student_id: string;
  target_month: string;
  score_reading: number;
  score_thinking: number;
  score_discussion: number;
  score_writing: number;
  score_growth: number;
  growth_moment: string | null;
  growth_meta: Json;
  writing_img_url1: string | null;
  writing_img_url2: string | null;
  book_id1: string | null;
  book_id2: string | null;
  strength_point: string | null;
  weakness_point: string | null;
  strength_cmt: string | null;
  weakness_cmt: string | null;
  book_keywords: Json;
  teacher_comment: string | null;
  created_at: string;
};

type LocalQReport = {
  q_report_id: string;
  report_id: string;
  student_id: string;
  quarter_end_ym: string;
  best_writing_url: string | null;
  mindmap_book: Json | null;
  mindmap_cmt: string | null;
  mindmap_data: Json;
  growth_keywords: Json;
  growth_cmt: string | null;
  insight_tags: Json;
  insight_desc: string | null;
  /** 선생님 한마디 초안 */
  teacher_comment: string | null;
  best_writing_cmt: string | null;
  teacher_ai_comment: string | null;
  created_at: string;
};

type LocalHReport = {
  h_report_id: string;
  report_id: string;
  student_id: string;
  half_year_code: string;
  score_reading: number;
  score_thinking: number;
  score_discussion: number;
  score_writing: number;
  score_growth: number;
  reading_type_name: string | null;
  type_logic_code: string | null;
  type_description: string | null;
  percentile_rank: number | null;
  teacher_comment: string | null;
  created_at: string;
};

type LocalYReport = {
  y_report_id: string;
  report_id: string;
  student_id: string;
  target_year: number;
  score_reading: number;
  score_thinking: number;
  score_discussion: number;
  score_writing: number;
  score_growth: number;
  annual_timeline: Json;
  total_books: number;
  lit_ratio: number;
  non_lit_ratio: number;
  is_certified: boolean;
  cert_number: string | null;
  created_at: string;
};

type LegacyMonthly = {
  id: string;
  student_id: string;
  year_month: string;
  growth_moments?: string | null;
  competency_ratings: Json;
  book_id?: string | null;
  teacher_note?: string | null;
  writing_image_url?: string | null;
  created_at: string;
};

type LocalDatabase = {
  students: Student[];
  books: Book[];
  m_reports: LocalMReport[];
  q_reports: LocalQReport[];
  h_reports: LocalHReport[];
  y_reports: LocalYReport[];
};

function defaultDb(): LocalDatabase {
  return { students: [], books: [], m_reports: [], q_reports: [], h_reports: [], y_reports: [] };
}

function paths(root: string) {
  const dir = path.join(root, ".local-db");
  return {
    dir,
    jsonPath: path.join(dir, "local-database.json"),
    snapshotPath: path.join(dir, "local-database.snapshot.ts"),
  };
}

function scoresFromCompetency(j: Json): Pick<
  LocalMReport,
  "score_reading" | "score_thinking" | "score_discussion" | "score_writing" | "score_growth"
> {
  const p = parsePillarScores(j);
  return {
    score_reading: p.reading ?? 5,
    score_thinking: p.thinking ?? 5,
    score_discussion: p.discussion ?? 5,
    score_writing: p.writing ?? 5,
    score_growth: p.growth ?? 5,
  };
}

function legacyMonthlyToMReport(x: LegacyMonthly): LocalMReport {
  const report_id = crypto.randomUUID();
  return {
    m_report_id: x.id,
    report_id,
    student_id: x.student_id,
    target_month: `${x.year_month}-01`,
    ...scoresFromCompetency(x.competency_ratings),
    growth_moment: x.growth_moments ?? null,
    growth_meta: {},
    writing_img_url1: x.writing_image_url ?? null,
    writing_img_url2: null,
    book_id1: null,
    book_id2: null,
    strength_point: null,
    weakness_point: null,
    strength_cmt: null,
    weakness_cmt: null,
    book_keywords: [],
    teacher_comment: x.teacher_note ?? null,
    created_at: x.created_at,
  };
}

function normalizeStudent(raw: unknown): Student {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "student_id" in raw &&
    typeof (raw as { student_id?: string }).student_id === "string"
  ) {
    const x = raw as Partial<Student> & { grade?: number; student_grade?: string | number };
    let sg: SchoolGradeCode = "E1";
    if (typeof x.student_grade === "string" && isSchoolGradeCode(x.student_grade)) {
      sg = x.student_grade;
    } else if (typeof x.student_grade === "number") {
      sg = mapLegacyNumericGradeToCode(x.student_grade);
    } else if (typeof x.grade === "number") {
      sg = mapLegacyNumericGradeToCode(x.grade);
    }
    const nick =
      typeof x.student_nick === "string"
        ? x.student_nick
        : typeof (x as { nickname?: string }).nickname === "string"
          ? (x as { nickname: string }).nickname
          : "";
    return {
      student_id: x.student_id!,
      user_id: typeof x.user_id === "string" ? x.user_id : LOCAL_DEV_USER_ID,
      student_nick: nick,
      student_grade: sg,
      total_reports_written: typeof x.total_reports_written === "number" ? x.total_reports_written : 0,
      created_at: typeof x.created_at === "string" ? x.created_at : new Date().toISOString(),
      updated_at: typeof x.updated_at === "string" ? x.updated_at : new Date().toISOString(),
    };
  }
  const r = raw as {
    id: string;
    nickname: string;
    grade: number;
    total_reports_written: number;
    created_at: string;
    updated_at: string;
  };
  return {
    student_id: r.id,
    user_id: LOCAL_DEV_USER_ID,
    student_nick: r.nickname,
    student_grade: mapLegacyNumericGradeToCode(r.grade),
    total_reports_written: r.total_reports_written,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function needsStudentRowMigration(s: unknown): boolean {
  if (typeof s !== "object" || s === null) return true;
  if (!("student_id" in s)) return true;
  const g = (s as { student_grade?: unknown }).student_grade;
  if (g === undefined || g === null) return true;
  if (typeof g === "number") return true;
  if (typeof g === "string" && !isSchoolGradeCode(g)) return true;
  return false;
}

function mReportToApiRow(m: LocalMReport): {
  id: string;
  year_month: string;
  growth_moments: string | null;
  growth_meta: Json;
  competency_ratings: Json;
  created_at: string;
  book_id: string | null;
  teacher_note: string | null;
  writing_image_url: string | null;
  book_keywords: Json;
} {
  const ym = m.target_month.slice(0, 7);
  const competency_ratings = {
    reading: m.score_reading,
    thinking: m.score_thinking,
    discussion: m.score_discussion,
    writing: m.score_writing,
    growth: m.score_growth,
  } as Json;
  return {
    id: m.m_report_id,
    year_month: ym,
    growth_moments: m.growth_moment,
    growth_meta: m.growth_meta,
    competency_ratings,
    created_at: m.created_at,
    book_id: null,
    teacher_note: m.teacher_comment,
    writing_image_url: m.writing_img_url1 ?? m.writing_img_url2,
    book_keywords: m.book_keywords,
  };
}

function migrateLocalDatabase(raw: unknown): { db: LocalDatabase; didMigrate: boolean } {
  const o = raw as Record<string, unknown>;
  const prevStudents = Array.isArray(o.students) ? o.students : [];
  let didMigrate = prevStudents.some((s) => needsStudentRowMigration(s));

  const students = prevStudents.map((s) => normalizeStudent(s));

  const booksRaw = Array.isArray(o.books) ? o.books : [];
  let booksDidMigrate = false;
  const books: Book[] = booksRaw.map((raw) => {
    const { book, legacy } = normalizeBookEntry(raw);
    if (legacy) booksDidMigrate = true;
    return book;
  });
  didMigrate = didMigrate || booksDidMigrate;

  let m_reports: LocalMReport[] = Array.isArray(o.m_reports) ? (o.m_reports as LocalMReport[]) : [];
  m_reports = m_reports.map((row) => {
    const r = row as LocalMReport;
    return {
      ...r,
      growth_meta:
        typeof r.growth_meta === "object" && r.growth_meta !== null && !Array.isArray(r.growth_meta)
          ? r.growth_meta
          : {},
      writing_img_url1: r.writing_img_url1 ?? (r as { writing_img_url?: string | null }).writing_img_url ?? null,
      writing_img_url2: r.writing_img_url2 ?? null,
      book_id1: r.book_id1 ?? null,
      book_id2: r.book_id2 ?? null,
      strength_point: r.strength_point ?? null,
      weakness_point: r.weakness_point ?? null,
      strength_cmt: r.strength_cmt ?? null,
      weakness_cmt: r.weakness_cmt ?? null,
    };
  });
  if (Array.isArray(o.monthly_reports)) {
    const legacy = o.monthly_reports as LegacyMonthly[];
    m_reports = [...m_reports, ...legacy.map(legacyMonthlyToMReport)];
    didMigrate = true;
  }

  let q_reports: LocalQReport[] = Array.isArray(o.q_reports) ? (o.q_reports as LocalQReport[]) : [];
  let qReportsDidMigrate = false;
  q_reports = q_reports.map((row) => {
    const r = row as Record<string, unknown>;
    const rawEnd = typeof r.quarter_end_ym === "string" ? r.quarter_end_ym.trim() : "";
    const validEnd = /^\d{4}-\d{2}$/.test(rawEnd);
    const legacyQy = typeof r.quarter_year === "string" ? r.quarter_year.trim() : "";
    let quarter_end_ym = validEnd ? rawEnd : endYmForQuarterYearKey(legacyQy) ?? "";
    if (!quarter_end_ym) quarter_end_ym = "2000-03";
    const hadLegacyShape =
      !validEnd ||
      "quarter_year" in r ||
      "score_reading" in r ||
      "score_thinking" in r ||
      "score_discussion" in r ||
      "score_writing" in r ||
      "score_growth" in r;
    if (hadLegacyShape) qReportsDidMigrate = true;
    return {
      q_report_id: String(r.q_report_id ?? crypto.randomUUID()),
      report_id: String(r.report_id ?? crypto.randomUUID()),
      student_id: String(r.student_id ?? ""),
      quarter_end_ym,
      best_writing_url: (r.best_writing_url as string | null | undefined) ?? null,
      mindmap_data: (r.mindmap_data as Json | undefined) ?? ({} as Json),
      insight_tags: (r.insight_tags as Json | undefined) ?? ([] as Json),
      mindmap_book: (r.mindmap_book as Json | null | undefined) ?? null,
      mindmap_cmt: (r.mindmap_cmt as string | null | undefined) ?? null,
      growth_keywords: (r.growth_keywords as Json | undefined) ?? ([] as Json),
      growth_cmt: (r.growth_cmt as string | null | undefined) ?? null,
      insight_desc: (r.insight_desc as string | null | undefined) ?? null,
      teacher_comment: (r.teacher_comment as string | null | undefined) ?? null,
      best_writing_cmt: (r.best_writing_cmt as string | null | undefined) ?? null,
      teacher_ai_comment: (r.teacher_ai_comment as string | null | undefined) ?? null,
      created_at: String(r.created_at ?? new Date().toISOString()),
    };
  });
  didMigrate = didMigrate || qReportsDidMigrate;
  const h_reports = Array.isArray(o.h_reports) ? (o.h_reports as LocalHReport[]) : [];
  const y_reports = Array.isArray(o.y_reports) ? (o.y_reports as LocalYReport[]) : [];

  const db: LocalDatabase = { students, books, m_reports, q_reports, h_reports, y_reports };
  return { db, didMigrate };
}

function loadDb(root: string): LocalDatabase {
  const { dir, jsonPath } = paths(root);
  if (!fs.existsSync(jsonPath)) {
    fs.mkdirSync(dir, { recursive: true });
    const empty = defaultDb();
    saveDb(root, empty);
    return empty;
  }
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  const { db, didMigrate } = migrateLocalDatabase(parsed);
  if (didMigrate) {
    saveDb(root, db);
  }
  return db;
}

function saveDb(root: string, data: LocalDatabase): void {
  const { dir, jsonPath, snapshotPath } = paths(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
  const ts =
    "/**\n" +
    " * 자동 생성 — `npm run dev` 실행 중 저장될 때마다 갱신됩니다.\n" +
    " * 원본은 같은 폴더의 `local-database.json`입니다.\n" +
    " */\n" +
    `export const localDatabaseSnapshot = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(snapshotPath, ts, "utf-8");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      chunks.push(c);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function bookKey(title: string, author: string, publisher: string): string {
  return `${title.trim()}\0${author.trim()}\0${publisher.trim()}`;
}

function normalizeBookEntry(raw: unknown): { book: Book; legacy: boolean } {
  const o = raw as Record<string, unknown>;
  const hadLegacyShape = "yes24_url" in o || "description" in o || "difficulty_grade" in o;

  const id = typeof o.id === "string" ? o.id : crypto.randomUUID();
  const title = String(o.title ?? "");
  const author = String(o.author ?? "");
  const publisher = String(o.publisher ?? "");
  const url =
    typeof o.url === "string"
      ? (o.url as string).trim() || null
      : typeof o.yes24_url === "string"
        ? (o.yes24_url as string).trim() || null
        : null;
  const category = typeof o.category === "string" ? (o.category as string).trim() || null : null;
  const introduce =
    typeof o.introduce === "string"
      ? (o.introduce as string).trim() || null
      : typeof o.description === "string"
        ? (o.description as string).trim() || null
        : null;
  const author_cmt = typeof o.author_cmt === "string" ? (o.author_cmt as string).trim() || null : null;
  const pub_cmt = typeof o.pub_cmt === "string" ? (o.pub_cmt as string).trim() || null : null;
  const ai_category =
    typeof o.ai_category === "string"
      ? (o.ai_category as string).trim() || null
      : typeof o.difficulty_grade === "string"
        ? (o.difficulty_grade as string).trim() || null
        : null;
  const ai_keywords = (o.ai_keywords ?? []) as Json;
  const created_at = typeof o.created_at === "string" ? (o.created_at as string) : new Date().toISOString();
  const cover_url =
    typeof o.cover_url === "string" ? ((o.cover_url as string).trim() || null) : null;

  return {
    book: {
      id,
      title,
      author,
      publisher,
      url,
      cover_url,
      category,
      introduce,
      author_cmt,
      pub_cmt,
      ai_category,
      ai_keywords,
      created_at,
    },
    legacy: hadLegacyShape,
  };
}

function upsertBook(db: LocalDatabase, row: Omit<Book, "id" | "created_at"> & { id?: string }): string {
  const t = row.title.trim();
  const a = row.author.trim();
  const p = row.publisher.trim();
  const idx = db.books.findIndex((b) => bookKey(b.title, b.author, b.publisher) === bookKey(t, a, p));
  if (idx >= 0) {
    const prev = db.books[idx]!;
    db.books[idx] = {
      ...prev,
      title: t,
      author: a,
      publisher: p,
      url: row.url ?? prev.url,
      cover_url: row.cover_url ?? prev.cover_url,
      category: row.category ?? prev.category,
      introduce: row.introduce ?? prev.introduce,
      author_cmt: row.author_cmt ?? prev.author_cmt,
      pub_cmt: row.pub_cmt ?? prev.pub_cmt,
      ai_category: row.ai_category ?? prev.ai_category,
      ai_keywords: row.ai_keywords ?? prev.ai_keywords,
    };
    return prev.id;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.books.push({
    id,
    title: t,
    author: a,
    publisher: p,
    url: row.url ?? null,
    cover_url: row.cover_url ?? null,
    category: row.category ?? null,
    introduce: row.introduce ?? null,
    author_cmt: row.author_cmt ?? null,
    pub_cmt: row.pub_cmt ?? null,
    ai_category: row.ai_category ?? null,
    ai_keywords: row.ai_keywords ?? [],
    created_at: now,
  });
  return id;
}

export function localDbDevPlugin(): Plugin {
  return {
    name: "local-db-dev-api",
    configureServer(server) {
      const root = server.config.root;
      const env = loadEnv(server.config.mode, root, "");
      const geminiApiKey = (env.VITE_GEMINI_API_KEY ?? "").trim();
      const geminiModel = (env.VITE_GEMINI_MODEL ?? "gemini-2.0-flash").trim();
      /** `npm run dev`일 때 YES24 Playwright는 기본으로 창을 띄움(막히는 지점 확인용) */
      const yes24PlaywrightHeaded = server.config.mode === "development";

      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? "";
        const url = rawUrl.split("?")[0] ?? "";

        if (!url.startsWith("/api/local/")) {
          next();
          return;
        }

        void (async () => {
          try {
            if (req.method === "GET" && url === "/api/local/students") {
              const db = loadDb(root);
              const list = [...db.students].sort(
                (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime(),
              );
              sendJson(res, 200, list);
              return;
            }

            if (req.method === "POST" && url === "/api/local/students") {
              const raw = await readBody(req);
              const body = JSON.parse(raw || "{}") as {
                nickname: string;
                student_grade?: string;
                grade?: number;
              };
              const nick = String(body.nickname ?? "").trim();
              if (!nick) {
                sendJson(res, 400, { error: "별명이 필요합니다." });
                return;
              }
              let sg: SchoolGradeCode = "E1";
              if (typeof body.student_grade === "string" && isSchoolGradeCode(body.student_grade.trim())) {
                sg = body.student_grade.trim();
              } else if (typeof body.grade === "number") {
                sg = mapLegacyNumericGradeToCode(body.grade);
              }
              const db = loadDb(root);
              const now = new Date().toISOString();
              const row: Student = {
                student_id: crypto.randomUUID(),
                user_id: LOCAL_DEV_USER_ID,
                student_nick: nick,
                student_grade: sg,
                total_reports_written: 0,
                created_at: now,
                updated_at: now,
              };
              db.students.push(row);
              saveDb(root, db);
              sendJson(res, 201, row);
              return;
            }

            const delStudentMatch = url.match(/^\/api\/local\/students\/([^/]+)$/);
            if (req.method === "DELETE" && delStudentMatch) {
              const studentId = delStudentMatch[1]!;
              const db = loadDb(root);
              const before = db.students.length;
              db.students = db.students.filter((s) => s.student_id !== studentId);
              if (db.students.length === before) {
                sendJson(res, 404, { error: "학생을 찾을 수 없습니다." });
                return;
              }
              db.m_reports = db.m_reports.filter((m) => m.student_id !== studentId);
              db.q_reports = db.q_reports.filter((m) => m.student_id !== studentId);
              db.h_reports = db.h_reports.filter((m) => m.student_id !== studentId);
              db.y_reports = db.y_reports.filter((m) => m.student_id !== studentId);
              saveDb(root, db);
              sendJson(res, 200, { ok: true });
              return;
            }

            if (req.method === "GET" && url === "/api/local/monthly-reports") {
              const q = new URL(rawUrl, "http://localhost");
              const sid = q.searchParams.get("student_id");
              const db = loadDb(root);
              let list = [...db.m_reports];
              if (sid) list = list.filter((r) => r.student_id === sid);
              list.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime());
              sendJson(res, 200, list.map(mReportToApiRow));
              return;
            }

            if (req.method === "POST" && url === "/api/local/monthly-reports") {
              const raw = await readBody(req);
              const body = JSON.parse(raw || "{}") as {
                student_id: string;
                year_month: string;
                growth_moment?: string | null;
                growth_meta?: Json;
                score_reading: number;
                score_thinking: number;
                score_discussion: number;
                score_writing: number;
                score_growth: number;
                teacher_comment?: string | null;
                writing_img_url1?: string | null;
                writing_img_url2?: string | null;
                book_id1?: string | null;
                book_id2?: string | null;
                strength_point?: string | null;
                weakness_point?: string | null;
                strength_cmt?: string | null;
                weakness_cmt?: string | null;
                book_keywords?: Json;
              };
              const db = loadDb(root);
              const st = db.students.find((s) => s.student_id === body.student_id);
              if (!st) {
                sendJson(res, 400, { error: "학생을 찾을 수 없습니다." });
                return;
              }
              const now = new Date().toISOString();
              const targetMonth = `${body.year_month}-01`;
              const growthMeta =
                typeof body.growth_meta === "object" && body.growth_meta !== null && !Array.isArray(body.growth_meta)
                  ? body.growth_meta
                  : {};
              const w1 = body.writing_img_url1 ?? body.writing_img_url ?? null;
              const w2 = body.writing_img_url2 ?? null;
              const ix = db.m_reports.findIndex((m) => m.student_id === body.student_id && m.target_month === targetMonth);
              if (ix >= 0) {
                const prev = db.m_reports[ix];
                db.m_reports[ix] = {
                  ...prev,
                  score_reading: body.score_reading,
                  score_thinking: body.score_thinking,
                  score_discussion: body.score_discussion,
                  score_writing: body.score_writing,
                  score_growth: body.score_growth,
                  growth_moment: body.growth_moment ?? null,
                  growth_meta: growthMeta,
                  writing_img_url1: w1,
                  writing_img_url2: w2,
                  book_id1: body.book_id1 ?? null,
                  book_id2: body.book_id2 ?? null,
                  strength_point: body.strength_point ?? null,
                  weakness_point: body.weakness_point ?? null,
                  strength_cmt: body.strength_cmt ?? null,
                  weakness_cmt: body.weakness_cmt ?? null,
                  book_keywords: body.book_keywords ?? [],
                  teacher_comment: body.teacher_comment ?? null,
                };
                st.updated_at = now;
                saveDb(root, db);
                sendJson(res, 200, mReportToApiRow(db.m_reports[ix]));
                return;
              }
              const report_id = crypto.randomUUID();
              const m_report_id = crypto.randomUUID();
              const row: LocalMReport = {
                m_report_id,
                report_id,
                student_id: body.student_id,
                target_month: targetMonth,
                score_reading: body.score_reading,
                score_thinking: body.score_thinking,
                score_discussion: body.score_discussion,
                score_writing: body.score_writing,
                score_growth: body.score_growth,
                growth_moment: body.growth_moment ?? null,
                growth_meta: growthMeta,
                writing_img_url1: w1,
                writing_img_url2: w2,
                book_id1: body.book_id1 ?? null,
                book_id2: body.book_id2 ?? null,
                strength_point: body.strength_point ?? null,
                weakness_point: body.weakness_point ?? null,
                strength_cmt: body.strength_cmt ?? null,
                weakness_cmt: body.weakness_cmt ?? null,
                book_keywords: body.book_keywords ?? [],
                teacher_comment: body.teacher_comment ?? null,
                created_at: now,
              };
              db.m_reports.push(row);
              st.total_reports_written += 1;
              st.updated_at = now;
              saveDb(root, db);
              sendJson(res, 201, mReportToApiRow(row));
              return;
            }

            if (req.method === "POST" && url === "/api/local/books/yes24-search") {
              const raw = await readBody(req);
              const body = JSON.parse(raw || "{}") as {
                title?: string;
                author?: string;
                publisher?: string;
                streamLogs?: boolean;
              };
              const title = String(body.title ?? "").trim();
              const author = String(body.author ?? "").trim();
              const publisher = String(body.publisher ?? "").trim();
              if (!title || !author || !publisher) {
                sendJson(res, 400, { error: "도서명, 저자/역자, 출판사를 모두 입력해 주세요." });
                return;
              }
              if (!geminiApiKey) {
                sendJson(res, 500, {
                  error: ".env 의 VITE_GEMINI_API_KEY 가 필요합니다. (YES24 메타 분석용)",
                });
                return;
              }
              const streamLogs = Boolean(body.streamLogs);
              try {
                const { searchYes24AndAnalyze } = await import("./yes24BookScrape");
                if (streamLogs) {
                  res.writeHead(200, {
                    "Content-Type": "application/x-ndjson; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    "X-Accel-Buffering": "no",
                  });
                  const emit = (obj: unknown) => {
                    res.write(`${JSON.stringify(obj)}\n`);
                  };
                  try {
                    const result = await searchYes24AndAnalyze(
                      { title, author, publisher },
                      { apiKey: geminiApiKey, model: geminiModel },
                      {
                        onLog: (message) => emit({ kind: "log", message }),
                        headed: yes24PlaywrightHeaded,
                      },
                    );
                    emit({ kind: "done", result });
                  } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    emit({ kind: "error", message });
                  }
                  res.end();
                  return;
                }
                const result = await searchYes24AndAnalyze(
                  { title, author, publisher },
                  { apiKey: geminiApiKey, model: geminiModel },
                  { headed: yes24PlaywrightHeaded },
                );
                sendJson(res, 200, result);
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                sendJson(res, 500, { error: msg });
              }
              return;
            }

            if (req.method === "GET" && url === "/api/local/books") {
              const db = loadDb(root);
              const list = [...db.books].sort(
                (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime(),
              );
              sendJson(res, 200, list);
              return;
            }

            if (req.method === "POST" && url === "/api/local/books/upsert") {
              const raw = await readBody(req);
              const row = JSON.parse(raw || "{}") as Omit<Book, "id" | "created_at">;
              const db = loadDb(root);
              const id = upsertBook(db, row);
              const saved = db.books.find((b) => b.id === id);
              saveDb(root, db);
              sendJson(res, 200, { id, row: saved });
              return;
            }

            sendJson(res, 404, { error: "알 수 없는 로컬 API 경로입니다." });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            sendJson(res, 500, { error: msg });
          }
        })();
      });
    },
  };
}
