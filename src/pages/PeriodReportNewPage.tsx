import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import {
  dateRangeForPeriodEndingInMonth,
  endYmForHalfYearCode,
  halfYearCodeForEndYm,
  enrollmentYearMonth,
  findQuarterReportForYearMonth,
  quarterYearKeyForEndYm,
  reportsByYearMonth,
  roundForYearMonth,
  yearMonthForRound,
} from "../lib/reportRounds";
import { formatSchoolGradeLabel } from "../lib/schoolGrade";
import {
  generateQuarterKnowledgeMindmapComment,
  normalizeQuarterMindmapModelText,
  type QuarterMindmapBookRow,
} from "../lib/geminiQuarterMindmap";
import { generateQuarterGrowthInsight } from "../lib/geminiQuarterGrowthInsight";
import { generateQuarterReportFinalize } from "../lib/geminiQuarterReportFinalize";
import {
  applyReportPrivacy,
  buildReportPrivacyContext,
  sanitizeReportStudentPii,
} from "../lib/reportStudentPrivacy";
import { upsertQuarterReportDraft } from "../lib/quarterReportDraftSync";
import type { Json, MonthlyReport } from "../lib/types/database";
import { useMonthlyReports } from "../hooks/useMonthlyReports";
import { useStudentPeriodReports } from "../hooks/useStudentPeriodReports";
import { useStudents } from "../hooks/useStudents";
import type { HalfReportRow, YearReportRow } from "../lib/studentPeriodReportsTypes";
import { HalfYearReportComposer } from "../components/half/HalfYearReportComposer";
import { HalfYearReportSections, type HalfYearReportViewModel } from "../components/half/HalfYearReportSections";
import { ReportSection } from "../components/monthly/MonthlyReportResultView";
import { pillarLabelsKo, PILLAR_KEYS, type PillarKey } from "../lib/reportAggregates";
import { HALF_YEAR_READING_TYPES } from "../lib/halfYearReadingTypes";

/** 분기(3m) 작성 마법사 — 월간 작성 페이지와 동일한 단계 UX */
const QUARTER_WIZARD_STEPS = [
  { id: 1, title: "best 글쓰기 선정" },
  { id: 2, title: "지식 마인드맵 생성" },
  { id: 3, title: "성장 인사이트" },
  { id: 4, title: "선생님의 따뜻한 한마디" },
  { id: 5, title: "레포트 확인 · 저장" },
] as const;

type QuarterReportEditSection = "bestWriting" | "mindmap" | "growth" | "teacher";

/** 분기 확인(5단계) 편집 UI — MonthlyReportResultView와 동일 패턴 */
const QUARTER_RESULT_EDIT_TEXTAREA_CLASS =
  "w-full min-h-[160px] resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-[15px] leading-relaxed text-gray-800 shadow-inner outline-none focus:border-[#9bbdff] focus:ring-1 focus:ring-[#9bbdff]";
const quarterResultBtnBase = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
const QUARTER_RESULT_BTN_EDIT = `${quarterResultBtnBase} border border-[#1a3b6b]/30 bg-white text-[#1a3b6b] hover:bg-[#eaf1f9]`;
const QUARTER_RESULT_BTN_PRIMARY = `${quarterResultBtnBase} bg-[#1a3b6b] text-white hover:bg-[#2a5b9c]`;
const QUARTER_RESULT_BTN_GHOST = `${quarterResultBtnBase} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;

function splitQuarterBodyParagraphs(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const byBlank = t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return t
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
}

type QuarterWritingPick = { round: number; ym: string; slot: 1 | 2; url: string; mReportId: string };

/** 2단계 미리보기용 — books 일부 컬럼 */
type QuarterMindmapBookPreview = {
  id: string;
  title: string;
  cover_url: string | null;
  ai_category: string | null;
  ai_keywords: Json;
};

function bookAiKeywordsForPreview(kw: Json): string[] {
  if (!Array.isArray(kw)) return [];
  return kw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** m_reports 기반 성장 인사이트 표 — 행 키 */
type GrowthInsightMReportField = "growth_moment" | "strength_cmt" | "weakness_cmt" | "teacher_comment";

const GROWTH_INSIGHT_TABLE_ROWS: { field: GrowthInsightMReportField; label: string }[] = [
  { field: "growth_moment", label: "성장의 순간" },
  { field: "strength_cmt", label: "강점 코멘트" },
  { field: "weakness_cmt", label: "약점·보완 코멘트" },
  { field: "teacher_comment", label: "선생님 코멘트" },
];

function readGrowthInsightCell(rep: MonthlyReport | null, field: GrowthInsightMReportField): string {
  if (!rep) return "";
  switch (field) {
    case "growth_moment":
      return (rep.growth_moments ?? "").trim();
    case "strength_cmt":
      return (rep.strength_cmt ?? "").trim();
    case "weakness_cmt":
      return (rep.weakness_cmt ?? "").trim();
    case "teacher_comment":
      return (rep.teacher_note ?? "").trim();
    default:
      return "";
  }
}

function growthInsightCellKey(ym: string, field: GrowthInsightMReportField): string {
  return `${ym}__${field}`;
}

function parseInsightTagsTriple(text: string): [string, string, string] {
  try {
    const a = JSON.parse(text.trim() || "[]");
    if (!Array.isArray(a)) return ["", "", ""];
    const s = a.filter((x): x is string => typeof x === "string");
    return [s[0] ?? "", s[1] ?? "", s[2] ?? ""];
  } catch {
    return ["", "", ""];
  }
}

function parseJsonField(text: string): Json | null {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as Json;
  } catch {
    return { raw: t };
  }
}

function formatPublishedYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatQuarterLabelKo(quarterYear: string): string {
  const m = /^(\d{4})-(\d)Q$/.exec(quarterYear);
  if (!m) return quarterYear;
  return `${m[1]}년 제${m[2]}분기`;
}

function formatScoresLine(sc: {
  score_reading: number;
  score_thinking: number;
  score_discussion: number;
  score_writing: number;
  score_growth: number;
}): string {
  return `독서 ${sc.score_reading} · 사고 ${sc.score_thinking} · 토론 ${sc.score_discussion} · 글쓰기 ${sc.score_writing} · 성장 ${sc.score_growth}`;
}

/** 분기 mindmap_data(summaryText) — 객체가 아니면 null */
function parseMindmapRecord(text: string): Record<string, unknown> | null {
  try {
    const p = JSON.parse(text.trim() || "{}");
    if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

/** 좌·우 가지별 색 (표지 카드 테두리·연결선·분류 뱃지 톤) */
const QUARTER_READING_MINDMAP_BRANCHES = [
  { stroke: "#eab308", border: "border-amber-400", cat: "bg-amber-100 text-amber-900" },
  { stroke: "#22c55e", border: "border-green-500", cat: "bg-green-100 text-green-900" },
  { stroke: "#38bdf8", border: "border-sky-400", cat: "bg-sky-100 text-sky-900" },
  { stroke: "#ec4899", border: "border-pink-500", cat: "bg-pink-100 text-pink-900" },
  { stroke: "#a855f7", border: "border-purple-500", cat: "bg-purple-100 text-purple-900" },
  { stroke: "#f97316", border: "border-orange-500", cat: "bg-orange-100 text-orange-900" },
] as const;

type QuarterMindmapBranch = (typeof QUARTER_READING_MINDMAP_BRANCHES)[number];

const MINDMAP_SVG_PATHS_LEFT = [
  "M 50 52 Q 34 40 24 24",
  "M 50 52 Q 32 52 24 52",
  "M 50 52 Q 34 64 24 80",
] as const;
const MINDMAP_SVG_PATHS_RIGHT = [
  "M 50 52 Q 66 40 76 24",
  "M 50 52 Q 68 52 76 52",
  "M 50 52 Q 66 64 76 80",
] as const;

function QuarterReadingMindmapBookCard(props: { book: QuarterMindmapBookPreview; branch: QuarterMindmapBranch }) {
  const { book: b, branch } = props;
  const kws = bookAiKeywordsForPreview(b.ai_keywords).slice(0, 8);
  return (
    <div className={`flex min-h-[5.25rem] gap-2 overflow-hidden rounded-xl border-2 bg-white p-2 shadow-md ${branch.border}`}>
      <div className="h-[4.75rem] w-[3.35rem] shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200/80">
        {b.cover_url?.trim() ? (
          <img src={b.cover_url.trim()} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-0.5 text-center text-[9px] text-slate-500">표지 없음</div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-0.5">
        <p className="line-clamp-2 text-left text-[11px] font-semibold leading-snug text-slate-900 sm:text-xs" title={b.title}>
          {b.title}
        </p>
        {b.ai_category?.trim() ? (
          <span className={`w-fit max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${branch.cat}`}>
            {b.ai_category.trim()}
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">분류 없음</span>
        )}
        {kws.length > 0 ? (
          <p className="line-clamp-2 text-left text-[9px] leading-snug text-slate-600 sm:text-[10px]" title={kws.join(" · ")}>
            {kws.join(" · ")}
          </p>
        ) : (
          <span className="text-[9px] text-slate-400">키워드 없음</span>
        )}
      </div>
    </div>
  );
}

/** 최대 6권 — 좌 3 / 중앙 허브 / 우 3, SVG 곡선 연결 */
function QuarterReadingMindmapPreview(props: { books: QuarterMindmapBookPreview[] }) {
  const slice = props.books.slice(0, 6);
  const left = slice.slice(0, 3);
  const right = slice.slice(3, 6);
  return (
    <div className="relative mt-3 w-full overflow-x-auto pb-1 pt-0.5">
      <div className="relative mx-auto min-h-[280px] w-[min(100%,640px)] min-w-[280px] sm:min-h-[300px]">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {left.map((b, i) =>
            b ? (
              <path
                key={`path-L-${b.id}`}
                d={MINDMAP_SVG_PATHS_LEFT[i]!}
                fill="none"
                stroke={QUARTER_READING_MINDMAP_BRANCHES[i]!.stroke}
                strokeWidth={0.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
          {right.map((b, j) =>
            b ? (
              <path
                key={`path-R-${b.id}`}
                d={MINDMAP_SVG_PATHS_RIGHT[j]!}
                fill="none"
                stroke={QUARTER_READING_MINDMAP_BRANCHES[j + 3]!.stroke}
                strokeWidth={0.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}
        </svg>
        <div className="relative z-[1] flex flex-row items-center justify-between gap-1.5 py-3 pl-0.5 pr-0.5 sm:gap-3 sm:py-4 sm:pl-1 sm:pr-1">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 sm:gap-4">
            {[0, 1, 2].map((slot) => {
              const b = left[slot];
              if (!b) return null;
              const branch = QUARTER_READING_MINDMAP_BRANCHES[slot]!;
              return <QuarterReadingMindmapBookCard key={b.id} book={b} branch={branch} />;
            })}
          </div>
          <div className="flex w-[4.75rem] shrink-0 flex-col items-center justify-center sm:w-28">
            <div className="flex h-[5.25rem] w-[5.25rem] flex-col items-center justify-center gap-0.5 rounded-full border-2 border-dashed border-slate-300 bg-white/95 px-1.5 text-center shadow-sm ring-1 ring-slate-100 sm:h-28 sm:w-28 sm:gap-1 sm:px-2">
              <span className="text-[9px] font-semibold leading-tight text-slate-700 sm:text-[11px]">
                독서 지식
                <br />
                마인드맵
              </span>
              <span className="text-base sm:text-lg" aria-hidden>
                📖
              </span>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 sm:gap-4">
            {[0, 1, 2].map((slot) => {
              const b = right[slot];
              if (!b) return null;
              const branch = QUARTER_READING_MINDMAP_BRANCHES[slot + 3]!;
              return (
                <QuarterReadingMindmapBookCard key={b.id} book={b} branch={branch} />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PeriodSavedViewShell(props: {
  studentId: string;
  title: string;
  subtitle: string;
  newDraftHref: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to={`/students/${props.studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 상세
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{props.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{props.subtitle}</p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-950">
        저장된 레포트입니다. 아래는 읽기 전용 요약입니다.
      </div>
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{props.children}</div>
      <Link
        to={props.newDraftHref}
        className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-slate-50"
      >
        같은 기간 새로 작성하기
      </Link>
    </div>
  );
}

function halfReportToViewModel(row: HalfReportRow): HalfYearReportViewModel {
  const type =
    HALF_YEAR_READING_TYPES.find((t) => t.code === row.type_logic_code) ??
    (row.reading_type_name
      ? HALF_YEAR_READING_TYPES.find((t) => t.typeName === row.reading_type_name)
      : undefined) ??
    null;
  const readingType =
    type ??
    (row.reading_type_name && row.type_description
      ? {
          code: (row.type_logic_code ?? "RT") as "RT",
          pillars: ["reading", "thinking"] as const,
          comboLabel: row.reading_type_name,
          typeName: row.reading_type_name,
          description: row.type_description,
        }
      : null);

  const radarAverages = Object.fromEntries(
    PILLAR_KEYS.map((k) => [k, row[`score_${k}` as keyof HalfReportRow] as number]),
  ) as Record<PillarKey, number>;

  const pillarDescs = Object.fromEntries(
    PILLAR_KEYS.map((k) => [
      k,
      (row[`score_${k}_desc` as keyof HalfReportRow] as string | null) ?? "",
    ]),
  ) as Record<PillarKey, string>;

  const m = /^(\d{4})-H([12])$/.exec(row.half_year_code);
  const halfLabel = m ? `${m[1]}년 ${m[2] === "1" ? "상반기" : "하반기"}` : row.half_year_code;

  const highKey = (row.gauge_high_pillar ?? "reading") as PillarKey;
  const lowKey = (row.gauge_low_pillar ?? "growth") as PillarKey;

  return {
    halfLabel,
    scoreOverview: row.score_overview ?? "",
    pillarDescs,
    gaugeHighLabel: pillarLabelsKo[highKey] ?? highKey,
    gaugeLowLabel: pillarLabelsKo[lowKey] ?? lowKey,
    gaugeHighDesc: row.gauge_high_desc ?? "",
    gaugeLowDesc: row.gauge_low_desc ?? "",
    readingType,
    teacherComment: row.teacher_comment ?? "",
    radarAverages,
  };
}

function HalfSavedBody({ row }: { row: HalfReportRow }) {
  const vm = halfReportToViewModel(row);
  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">반기</p>
        <p className="mt-1 text-base font-semibold text-slate-900">{row.half_year_code}</p>
        <p className="mt-1 text-sm text-slate-600">발행 {formatPublishedYmd(row.created_at)}</p>
      </div>
      <HalfYearReportSections model={vm} />
    </>
  );
}

function YearSavedBody({ row }: { row: YearReportRow }) {
  return (
    <>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">연간</p>
        <p className="mt-1 text-base font-semibold text-slate-900">{row.target_year}년</p>
        <p className="mt-1 text-sm text-slate-600">발행 {formatPublishedYmd(row.created_at)}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">5대 역량</p>
        <p className="mt-1 text-sm text-slate-800">{formatScoresLine(row)}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">연간 타임라인 (JSON)</p>
        <pre className="mt-1 max-h-80 overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-800">
          {JSON.stringify(row.annual_timeline ?? {}, null, 2)}
        </pre>
      </div>
    </>
  );
}

export function PeriodReportNewPage() {
  const { id: studentId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const qId = (searchParams.get("q_id") ?? "").trim();
  const hId = (searchParams.get("h_id") ?? "").trim();
  const yId = (searchParams.get("y_id") ?? "").trim();
  const viewIdCount = (qId ? 1 : 0) + (hId ? 1 : 0) + (yId ? 1 : 0);

  const { students, loading: studentsLoading } = useStudents();
  const { reports } = useMonthlyReports(studentId);
  const { quarters, halves, years, loading: prLoading, error: prError } = useStudentPeriodReports(studentId);

  const savedQuarter = useMemo(
    () => (qId ? (quarters.find((q) => q.q_report_id === qId) ?? null) : null),
    [qId, quarters],
  );
  const savedHalf = useMemo(
    () => (hId ? (halves.find((h) => h.h_report_id === hId) ?? null) : null),
    [hId, halves],
  );
  const savedYear = useMemo(
    () => (yId ? (years.find((y) => y.y_report_id === yId) ?? null) : null),
    [yId, years],
  );

  const draftEndYm = useMemo(() => {
    const raw = searchParams.get("end_ym");
    if (raw && /^\d{4}-\d{2}$/.test(raw.trim())) return raw.trim();
    const qe = savedQuarter?.quarter_end_ym?.trim() ?? "";
    if (qId && qe && /^\d{4}-\d{2}$/.test(qe)) return qe;
    return null;
  }, [searchParams, qId, savedQuarter]);

  const draftUrlType = useMemo(() => (searchParams.get("type") ?? "3m").trim(), [searchParams]);

  const quarterRange = useMemo(() => {
    if (!draftEndYm) return null;
    return dateRangeForPeriodEndingInMonth(draftEndYm, "3m");
  }, [draftEndYm]);

  const [insightsText, setInsightsText] = useState("[]");
  const [summaryText, setSummaryText] = useState("{}");
  const [roadmapText, setRoadmapText] = useState("");
  const [teacherCommentSeed, setTeacherCommentSeed] = useState("");
  const [teacherComment, setTeacherComment] = useState("");
  const [bestWritingComment, setBestWritingComment] = useState("");
  const [quarterFinalizeBusy, setQuarterFinalizeBusy] = useState(false);
  const [quarterFinalizeErr, setQuarterFinalizeErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [quarterWizardStep, setQuarterWizardStep] = useState(() => (qId ? 5 : 1));
  const [bestWritingUrl, setBestWritingUrl] = useState("");
  const [mindmapGenBusy, setMindmapGenBusy] = useState(false);
  const [mindmapGenErr, setMindmapGenErr] = useState<string | null>(null);
  const [quarterMindmapBooksPreview, setQuarterMindmapBooksPreview] = useState<QuarterMindmapBookPreview[]>([]);
  const [quarterMindmapBooksLoading, setQuarterMindmapBooksLoading] = useState(false);
  const [quarterMindmapBooksErr, setQuarterMindmapBooksErr] = useState<string | null>(null);
  const [growthInsightSelection, setGrowthInsightSelection] = useState<string[]>([]);
  const [growthInsightGenBusy, setGrowthInsightGenBusy] = useState(false);
  const [growthInsightGenErr, setGrowthInsightGenErr] = useState<string | null>(null);

  const [quarterEditSection, setQuarterEditSection] = useState<QuarterReportEditSection | null>(null);
  const [draftQuarterBestWriting, setDraftQuarterBestWriting] = useState("");
  const [draftQuarterMindmap, setDraftQuarterMindmap] = useState("");
  const [draftQuarterGrowthCmt, setDraftQuarterGrowthCmt] = useState("");
  const [draftQuarterTeacher, setDraftQuarterTeacher] = useState("");

  /** `q_id`로 저장본 열 때 마법사 상태에 한 번 주입 */
  const hydratedQuarterViewKeyRef = useRef<string | null>(null);

  const anchorYm = useMemo(() => {
    const st = students.find((s) => s.student_id === studentId);
    return st ? enrollmentYearMonth(st.created_at) : "";
  }, [students, studentId]);

  const currentStudent = useMemo(
    () => (studentId ? students.find((s) => s.student_id === studentId) : undefined),
    [students, studentId],
  );

  const reportPrivacy = useMemo(
    () =>
      buildReportPrivacyContext({
        studentNick: currentStudent?.student_nick,
        studentId,
      }),
    [currentStudent?.student_nick, studentId],
  );

  const periodGradeLabel = useMemo(() => {
    const raw = (currentStudent?.student_grade ?? "").trim();
    return raw ? formatSchoolGradeLabel(raw) : "학년·급 정보 없음";
  }, [currentStudent?.student_grade]);

  const focusRoundForQuarter = useMemo(() => {
    if (!anchorYm || !draftEndYm) return 0;
    return roundForYearMonth(anchorYm, draftEndYm);
  }, [anchorYm, draftEndYm]);

  const quarterWritingPicks = useMemo((): QuarterWritingPick[] => {
    if (!anchorYm || focusRoundForQuarter < 1) return [];
    const byYm = reportsByYearMonth(reports);
    const out: QuarterWritingPick[] = [];
    const r0 = Math.max(1, focusRoundForQuarter - 2);
    for (let r = r0; r <= focusRoundForQuarter; r++) {
      const ym = yearMonthForRound(anchorYm, r);
      const rep = byYm.get(ym);
      if (!rep) continue;
      const u1 = rep.writing_img_url1?.trim();
      const u2 = rep.writing_img_url2?.trim();
      if (u1) out.push({ round: r, ym, slot: 1, url: u1, mReportId: rep.id });
      if (u2) out.push({ round: r, ym, slot: 2, url: u2, mReportId: rep.id });
    }
    return out;
  }, [anchorYm, focusRoundForQuarter, reports]);

  const quarterYearLabel = useMemo(() => {
    if (!draftEndYm) return "";
    return quarterYearKeyForEndYm(draftEndYm);
  }, [draftEndYm]);
  const savedQuarterForDraft = useMemo(() => {
    if (qId && savedQuarter) return savedQuarter;
    if (!draftEndYm) return null;
    return findQuarterReportForYearMonth(quarters, draftEndYm) ?? quarters.find((q) => q.quarter_end_ym === draftEndYm) ?? null;
  }, [qId, savedQuarter, quarters, draftEndYm]);
  const canJumpQuarterSteps = Boolean(savedQuarterForDraft);

  useEffect(() => {
    if (!qId) {
      hydratedQuarterViewKeyRef.current = null;
      return;
    }
    if (!studentId || !savedQuarter) return;

    const mark = `${studentId}:${qId}`;
    if (hydratedQuarterViewKeyRef.current === mark) return;
    hydratedQuarterViewKeyRef.current = mark;

    const row = savedQuarter;
    const md = row.mindmap_data;
    const summaryObj: Record<string, unknown> =
      md && typeof md === "object" && !Array.isArray(md) ? { ...(md as Record<string, unknown>) } : {};
    const mc = (row.mindmap_cmt ?? "").trim();
    const existing = summaryObj.ai_knowledge_network_comment;
    const hasKnowledge = typeof existing === "string" && existing.trim().length > 0;
    if (mc && !hasKnowledge) {
      summaryObj.ai_knowledge_network_comment = applyReportPrivacy(mc, reportPrivacy);
    }
    if (typeof summaryObj.ai_knowledge_network_comment === "string") {
      summaryObj.ai_knowledge_network_comment = applyReportPrivacy(
        summaryObj.ai_knowledge_network_comment,
        reportPrivacy,
      );
    }
    setSummaryText(JSON.stringify(summaryObj, null, 2));

    const gk = row.growth_keywords ?? row.insight_tags;
    if (Array.isArray(gk)) {
      const safeKw = gk.map((t) =>
        typeof t === "string" ? sanitizeReportStudentPii(t, reportPrivacy) : t,
      );
      setInsightsText(JSON.stringify(safeKw));
    } else {
      setInsightsText("[]");
    }

    setRoadmapText(applyReportPrivacy((row.growth_cmt ?? row.insight_desc ?? "").trim(), reportPrivacy));
    setTeacherCommentSeed(applyReportPrivacy((row.teacher_comment ?? "").trim(), reportPrivacy));
    setTeacherComment(applyReportPrivacy((row.teacher_ai_comment ?? "").trim(), reportPrivacy));
    setBestWritingComment(applyReportPrivacy((row.best_writing_cmt ?? "").trim(), reportPrivacy));
    setBestWritingUrl((row.best_writing_url ?? "").trim());
    setQuarterWizardStep(5);
    setQuarterEditSection(null);
    setMsg(null);
  }, [qId, savedQuarter, studentId, reportPrivacy]);

  const mindmapJsonOk = useMemo(() => {
    try {
      JSON.parse(summaryText.trim() || "{}");
      return true;
    } catch {
      return false;
    }
  }, [summaryText]);

  const mindmapRecord = useMemo(() => parseMindmapRecord(summaryText), [summaryText]);

  const knowledgeCommentForUi = useMemo(() => {
    if (!mindmapRecord) return "";
    const v = mindmapRecord.ai_knowledge_network_comment;
    if (typeof v !== "string") return "";
    return normalizeQuarterMindmapModelText(v);
  }, [mindmapRecord]);

  const mergeMindmapKnowledgeComment = useCallback((next: string) => {
    setSummaryText((prev) => {
      try {
        const p = JSON.parse(prev.trim() || "{}");
        if (!p || typeof p !== "object" || Array.isArray(p)) {
          return JSON.stringify({ ai_knowledge_network_comment: next }, null, 2);
        }
        return JSON.stringify({ ...(p as Record<string, unknown>), ai_knowledge_network_comment: next }, null, 2);
      } catch {
        return prev;
      }
    });
  }, []);

  const startQuarterResultEdit = useCallback(
    (section: QuarterReportEditSection) => {
      if (quarterEditSection && quarterEditSection !== section) {
        setQuarterEditSection(null);
      }
      if (section === "bestWriting") setDraftQuarterBestWriting(bestWritingComment);
      else if (section === "mindmap") setDraftQuarterMindmap(knowledgeCommentForUi);
      else if (section === "growth") setDraftQuarterGrowthCmt(roadmapText);
      else if (section === "teacher") setDraftQuarterTeacher(teacherComment);
      setQuarterEditSection(section);
    },
    [quarterEditSection, bestWritingComment, knowledgeCommentForUi, roadmapText, teacherComment],
  );

  const cancelQuarterResultEdit = useCallback(() => {
    setQuarterEditSection(null);
  }, []);

  const saveQuarterResultBestWriting = useCallback(() => {
    setBestWritingComment(applyReportPrivacy(draftQuarterBestWriting, reportPrivacy));
    setQuarterEditSection(null);
  }, [draftQuarterBestWriting, reportPrivacy]);

  const saveQuarterResultMindmap = useCallback(() => {
    mergeMindmapKnowledgeComment(applyReportPrivacy(draftQuarterMindmap, reportPrivacy));
    setQuarterEditSection(null);
  }, [draftQuarterMindmap, mergeMindmapKnowledgeComment, reportPrivacy]);

  const saveQuarterResultGrowth = useCallback(() => {
    setRoadmapText(applyReportPrivacy(draftQuarterGrowthCmt, reportPrivacy));
    setQuarterEditSection(null);
  }, [draftQuarterGrowthCmt, reportPrivacy]);

  const saveQuarterResultTeacher = useCallback(() => {
    setTeacherComment(applyReportPrivacy(draftQuarterTeacher, reportPrivacy));
    setQuarterEditSection(null);
  }, [draftQuarterTeacher, reportPrivacy]);

  const insightsJsonOk = useMemo(() => {
    try {
      JSON.parse(insightsText.trim() || "[]");
      return true;
    } catch {
      return false;
    }
  }, [insightsText]);

  const growthInsightStepOk = useMemo(() => {
    if (!insightsJsonOk) return false;
    const [a, b, c] = parseInsightTagsTriple(insightsText);
    if (!a.trim() || !b.trim() || !c.trim()) return false;
    return roadmapText.trim().length > 0;
  }, [insightsJsonOk, insightsText, roadmapText]);

  const canQuarterNext1 = useMemo(() => {
    if (quarterWritingPicks.length === 0) return false;
    const t = bestWritingUrl.trim();
    return quarterWritingPicks.some((p) => p.url === t);
  }, [quarterWritingPicks, bestWritingUrl]);
  const canQuarterNext2 = mindmapJsonOk;
  const canQuarterNext3 = growthInsightStepOk;

  const quarterMindmapBookIds = useMemo(() => {
    if (!anchorYm || focusRoundForQuarter < 1) return [];
    const byYm = reportsByYearMonth(reports);
    const ids = new Set<string>();
    const r0 = Math.max(1, focusRoundForQuarter - 2);
    for (let r = r0; r <= focusRoundForQuarter; r++) {
      const ym = yearMonthForRound(anchorYm, r);
      const rep = byYm.get(ym);
      if (!rep) continue;
      const b1 = rep.book_id?.trim();
      const b2 = rep.book_id2?.trim();
      if (b1) ids.add(b1);
      if (b2) ids.add(b2);
    }
    return [...ids];
  }, [anchorYm, focusRoundForQuarter, reports]);

  const quarterGrowthColumns = useMemo(() => {
    if (!anchorYm || focusRoundForQuarter < 1) return [];
    const byYm = reportsByYearMonth(reports);
    const r0 = Math.max(1, focusRoundForQuarter - 2);
    const out: { ym: string; round: number; report: MonthlyReport | null }[] = [];
    for (let r = r0; r <= focusRoundForQuarter; r++) {
      const ym = yearMonthForRound(anchorYm, r);
      out.push({ ym, round: r, report: byYm.get(ym) ?? null });
    }
    return out;
  }, [anchorYm, focusRoundForQuarter, reports]);

  const growthInsightAllCellKeys = useMemo(() => {
    const keys: string[] = [];
    for (const col of quarterGrowthColumns) {
      for (const row of GROWTH_INSIGHT_TABLE_ROWS) {
        const t = readGrowthInsightCell(col.report, row.field);
        if (t) keys.push(growthInsightCellKey(col.ym, row.field));
      }
    }
    return keys;
  }, [quarterGrowthColumns]);

  useEffect(() => {
    setGrowthInsightSelection([]);
  }, [draftEndYm]);

  useEffect(() => {
    if (quarterWizardStep !== 5) setQuarterEditSection(null);
  }, [quarterWizardStep]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase || quarterMindmapBookIds.length === 0) {
      setQuarterMindmapBooksPreview([]);
      setQuarterMindmapBooksErr(null);
      setQuarterMindmapBooksLoading(false);
      return;
    }
    let cancelled = false;
    setQuarterMindmapBooksLoading(true);
    setQuarterMindmapBooksErr(null);
    void (async () => {
      const { data, error } = await supabase
        .from("books")
        .select("id, title, cover_url, ai_category, ai_keywords")
        .in("id", quarterMindmapBookIds);
      if (cancelled) return;
      if (error) {
        setQuarterMindmapBooksErr(error.message);
        setQuarterMindmapBooksPreview([]);
      } else {
        setQuarterMindmapBooksPreview((data ?? []) as QuarterMindmapBookPreview[]);
      }
      setQuarterMindmapBooksLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [quarterMindmapBookIds]);

  const orderedQuarterMindmapBooks = useMemo(() => {
    if (quarterMindmapBooksPreview.length === 0) return [];
    const byId = new Map(quarterMindmapBooksPreview.map((b) => [b.id, b]));
    const ordered: QuarterMindmapBookPreview[] = [];
    const seen = new Set<string>();
    for (const id of quarterMindmapBookIds) {
      const b = byId.get(id);
      if (b && !seen.has(b.id)) {
        ordered.push(b);
        seen.add(b.id);
      }
    }
    for (const b of quarterMindmapBooksPreview) {
      if (!seen.has(b.id)) {
        ordered.push(b);
        seen.add(b.id);
      }
    }
    return ordered;
  }, [quarterMindmapBooksPreview, quarterMindmapBookIds]);

  const mindmapBookSnapshot = useMemo((): Json | null => {
    if (orderedQuarterMindmapBooks.length === 0) return null;
    return orderedQuarterMindmapBooks.map((b) => ({
      id: b.id,
      title: b.title,
      cover_url: b.cover_url,
      ai_category: b.ai_category,
      ai_keywords: b.ai_keywords,
    })) as unknown as Json;
  }, [orderedQuarterMindmapBooks]);

  useEffect(() => {
    if (hId || yId) return;
    if (draftUrlType !== "3m") return;
    if (!studentId || !draftEndYm) return;
    if (!isSupabaseConfigured() || !supabase) return;
    const client = supabase;
    const timer = window.setTimeout(() => {
      let tags: Json = [];
      const ins = parseJsonField(insightsText);
      if (Array.isArray(ins)) tags = ins as Json;
      const mind = parseJsonField(summaryText) ?? ({} as Json);
      void upsertQuarterReportDraft(client, {
        student_id: studentId,
        quarter_end_ym: draftEndYm,
        best_writing_url: bestWritingUrl.trim() || null,
        mindmap_book: mindmapBookSnapshot,
        mindmap_cmt: knowledgeCommentForUi.trim() || null,
        mindmap_data: mind,
        growth_keywords: tags,
        growth_cmt: roadmapText.trim() || null,
        insight_tags: tags,
        insight_desc: roadmapText.trim() || null,
        teacher_comment: teacherCommentSeed.trim() || null,
        best_writing_cmt: bestWritingComment.trim() || null,
        teacher_ai_comment: teacherComment.trim() || null,
      }).catch((err) => console.warn("[분기 초안 동기화]", err));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [
    qId,
    hId,
    yId,
    draftUrlType,
    studentId,
    draftEndYm,
    supabase,
    bestWritingUrl,
    summaryText,
    insightsText,
    roadmapText,
    teacherCommentSeed,
    teacherComment,
    bestWritingComment,
    mindmapBookSnapshot,
    knowledgeCommentForUi,
  ]);

  const runGrowthInsightGeneration = useCallback(async () => {
    setGrowthInsightGenErr(null);
    if (growthInsightSelection.length === 0) {
      setGrowthInsightGenErr("표에서 참조할 칸을 한 개 이상 선택해 주세요.");
      return;
    }
    const gradeLabel = periodGradeLabel;
    const quarterLabel = draftEndYm ?? (quarterYearLabel || "분기");
    const colByYm = new Map(quarterGrowthColumns.map((c) => [c.ym, c]));

    const sources: { heading: string; body: string }[] = [];
    for (const key of growthInsightSelection) {
      const parts = key.split("__");
      if (parts.length !== 2) continue;
      const ym = parts[0]!;
      const field = parts[1]! as GrowthInsightMReportField;
      if (!GROWTH_INSIGHT_TABLE_ROWS.some((r) => r.field === field)) continue;
      const col = colByYm.get(ym);
      const body = readGrowthInsightCell(col?.report ?? null, field);
      if (!body) continue;
      const rowLabel = GROWTH_INSIGHT_TABLE_ROWS.find((r) => r.field === field)?.label ?? field;
      sources.push({ heading: `${ym} · ${rowLabel}`, body });
    }
    if (sources.length === 0) {
      setGrowthInsightGenErr("선택한 칸에 저장된 텍스트가 없습니다.");
      return;
    }
    setGrowthInsightGenBusy(true);
    try {
      const { keywords, comment } = await generateQuarterGrowthInsight({
        studentGradeLabel: gradeLabel,
        quarterLabel,
        sources,
        privacy: reportPrivacy,
      });
      setInsightsText(JSON.stringify(keywords));
      setRoadmapText(comment);
    } catch (e) {
      setGrowthInsightGenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGrowthInsightGenBusy(false);
    }
  }, [growthInsightSelection, quarterGrowthColumns, periodGradeLabel, draftEndYm, quarterYearLabel, reportPrivacy]);

  const buildMindmapForSave = useCallback((): Json => {
    let base: Record<string, unknown> = {};
    try {
      const p = JSON.parse(summaryText.trim() || "{}");
      if (p && typeof p === "object" && !Array.isArray(p)) base = { ...(p as Record<string, unknown>) };
    } catch {
      /* ignore */
    }
    const bw = bestWritingComment.trim();
    if (bw) base.ai_best_writing_comment = bw;
    else delete base.ai_best_writing_comment;
    return base as Json;
  }, [summaryText, bestWritingComment]);

  const quarterReportHeaderTitle = useMemo(() => {
    const nick = (currentStudent?.student_nick ?? "").trim();
    const qLabel = quarterYearLabel ? formatQuarterLabelKo(quarterYearLabel) : "분기";
    if (nick) return `${nick} 학생 · ${qLabel} 리포트`;
    return `${qLabel} 리포트`;
  }, [currentStudent, quarterYearLabel]);

  const runQuarterReportFinalize = useCallback(async () => {
    setQuarterFinalizeErr(null);
    const seed = teacherCommentSeed.trim();
    if (!seed) {
      setQuarterFinalizeErr("따뜻한 한마디(초안)를 입력해 주세요.");
      return;
    }
    if (!knowledgeCommentForUi.trim()) {
      setQuarterFinalizeErr("2단계 지식·수업 타당성 코멘트를 먼저 작성(또는 생성)해 주세요.");
      return;
    }
    if (!growthInsightStepOk) {
      setQuarterFinalizeErr("3단계에서 성장 인사이트(키워드 3개·코멘트)를 완료해 주세요.");
      return;
    }
    const gradeLabel = periodGradeLabel;
    const qL = draftEndYm ?? quarterYearLabel ?? "분기";
    const [k1, k2, k3] = parseInsightTagsTriple(insightsText);
    setQuarterFinalizeBusy(true);
    try {
      const res = await generateQuarterReportFinalize({
        gradeLabel,
        quarterLabel: qL,
        knowledgeMindmapComment: knowledgeCommentForUi,
        insightKeywords: [k1, k2, k3],
        insightPositiveComment: roadmapText,
        teacherSeedMessage: seed,
        privacy: reportPrivacy,
      });
      setBestWritingComment(res.bestWritingComment);
      setTeacherComment(res.teacherExpanded);
      setQuarterWizardStep(5);
      if (isSupabaseConfigured() && supabase && studentId && draftEndYm) {
        const client = supabase;
        void upsertQuarterReportDraft(client, {
          student_id: studentId,
          quarter_end_ym: draftEndYm,
          teacher_comment: sanitizeReportStudentPii(seed, reportPrivacy) || null,
          best_writing_cmt: res.bestWritingComment.trim(),
          teacher_ai_comment: res.teacherExpanded.trim(),
          mindmap_cmt: sanitizeReportStudentPii(knowledgeCommentForUi.trim(), reportPrivacy) || null,
        }).catch((err) => console.warn("[분기 AI 결과 저장]", err));
      }
    } catch (e) {
      setQuarterFinalizeErr(e instanceof Error ? e.message : String(e));
    } finally {
      setQuarterFinalizeBusy(false);
    }
  }, [
    teacherCommentSeed,
    knowledgeCommentForUi,
    growthInsightStepOk,
    insightsText,
    roadmapText,
    periodGradeLabel,
    draftEndYm,
    quarterYearLabel,
    studentId,
    supabase,
    reportPrivacy,
  ]);

  const runMindmapGeneration = useCallback(async () => {
    setMindmapGenErr(null);
    if (!isSupabaseConfigured() || !supabase) {
      setMindmapGenErr("도서를 조회·저장하려면 연결 설정이 필요합니다.");
      return;
    }
    if (quarterMindmapBookIds.length === 0) {
      setMindmapGenErr("이 분기 월간에 연결된 도서가 없습니다. 월간 리포트에서 도서를 먼저 저장해 주세요.");
      return;
    }
    const grade = periodGradeLabel;
    const quarterLabel = draftEndYm ?? (quarterYearLabel || "분기");
    setMindmapGenBusy(true);
    try {
      const { data, error } = await supabase
        .from("books")
        .select(
          "id, title, author, publisher, url, introduce, category, author_cmt, pub_cmt, ai_category, ai_keywords, cover_url",
        )
        .in("id", quarterMindmapBookIds);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) {
        throw new Error("요청한 도서 정보를 찾을 수 없습니다.");
      }
      const text = await generateQuarterKnowledgeMindmapComment({
        studentGradeLabel: grade,
        quarterLabel,
        books: rows as QuarterMindmapBookRow[],
        privacy: reportPrivacy,
      });
      setSummaryText((prev) => {
        let base: Record<string, unknown> = {};
        try {
          const p = JSON.parse(prev.trim() || "{}");
          if (p && typeof p === "object" && !Array.isArray(p)) base = { ...(p as Record<string, unknown>) };
        } catch {
          /* 빈 객체부터 */
        }
        return JSON.stringify(
          {
            ...base,
            ai_knowledge_network_comment: text,
            ai_knowledge_network_comment_at: new Date().toISOString(),
            ai_knowledge_source_book_ids: quarterMindmapBookIds,
          },
          null,
          2,
        );
      });
    } catch (e) {
      setMindmapGenErr(e instanceof Error ? e.message : String(e));
    } finally {
      setMindmapGenBusy(false);
    }
  }, [quarterMindmapBookIds, periodGradeLabel, draftEndYm, quarterYearLabel, reportPrivacy]);

  function goQuarterNext() {
    setMsg(null);
    setQuarterWizardStep((s) => Math.min(5, s + 1));
  }

  function goQuarterPrev() {
    setMsg(null);
    setQuarterWizardStep((s) => Math.max(1, s - 1));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!studentId) {
      setMsg("학생 ID가 없습니다.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      if (quarterWizardStep !== 5) {
        setMsg("분기 리포트는 마지막 단계(레포트 확인)에서만 저장할 수 있습니다.");
        return;
      }

      if (!teacherComment.trim() || !bestWritingComment.trim()) {
        setMsg("레포트 생성 후 Best 글 코멘트와 선생님 한마디(확장본)가 비어 있지 않은지 확인해 주세요.");
        return;
      }

      if (!quarterRange) {
        setMsg("분기 기간을 계산할 수 없습니다. 링크를 다시 확인해 주세요.");
        return;
      }

      if (isSupabaseConfigured()) {
        if (!supabase) {
          setMsg("데이터 저장 연결이 설정되지 않았습니다.");
          return;
        }
        const client = supabase;

        const qEnd = draftEndYm;
        if (!qEnd) {
          setMsg("분기 마지막 달 정보가 없습니다.");
          return;
        }
        const mind = buildMindmapForSave();
        let tags: Json = [];
        const ins = parseJsonField(insightsText);
        if (Array.isArray(ins)) tags = ins as Json;
        else if (ins && typeof ins === "object") tags = [ins] as unknown as Json;

        const safeMindmapCmt =
          sanitizeReportStudentPii(knowledgeCommentForUi.trim(), reportPrivacy) || null;
        const safeGrowthCmt = sanitizeReportStudentPii(roadmapText.trim(), reportPrivacy) || null;
        const safeTeacherSeed =
          sanitizeReportStudentPii(teacherCommentSeed.trim(), reportPrivacy) || null;
        const safeBestWriting =
          sanitizeReportStudentPii(bestWritingComment.trim(), reportPrivacy) || null;
        const safeTeacherAi = sanitizeReportStudentPii(teacherComment.trim(), reportPrivacy) || null;
        const safeTags = Array.isArray(tags)
          ? (tags as unknown[]).map((t) =>
              typeof t === "string" ? sanitizeReportStudentPii(t, reportPrivacy) : t,
            )
          : tags;

        try {
          await upsertQuarterReportDraft(client, {
            student_id: studentId,
            quarter_end_ym: qEnd,
            best_writing_url: bestWritingUrl.trim() || null,
            mindmap_book: mindmapBookSnapshot,
            mindmap_cmt: safeMindmapCmt,
            mindmap_data: mind,
            growth_keywords: safeTags as Json,
            growth_cmt: safeGrowthCmt,
            insight_tags: safeTags as Json,
            insight_desc: safeGrowthCmt,
            teacher_comment: safeTeacherSeed,
            best_writing_cmt: safeBestWriting,
            teacher_ai_comment: safeTeacherAi,
          });
        } catch (upErr) {
          setMsg(upErr instanceof Error ? upErr.message : String(upErr));
          return;
        }
        setMsg("분기(쿼터) 리포트가 저장되었습니다.");
        return;
      }

      setMsg("저장하려면 데이터 저장 연결이 필요합니다.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!studentId) return <p className="text-sm text-red-600">학생이 지정되지 않았습니다.</p>;

  if (viewIdCount > 1) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <p className="text-sm text-red-600">주소에 q_id, h_id, y_id 중 하나만 넣을 수 있습니다.</p>
        <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 상세
        </Link>
      </div>
    );
  }

  if ((qId || hId || yId) && prLoading) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <p className="text-sm text-slate-600">저장된 기간 레포트를 불러오는 중…</p>
      </div>
    );
  }
  if ((qId || hId || yId) && prError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <p className="text-sm text-red-600">불러오기 오류: {prError}</p>
        <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 상세
        </Link>
      </div>
    );
  }

  if (hId) {
    if (!savedHalf) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <p className="text-sm text-slate-600">해당 반기 저장 레포트를 찾을 수 없습니다.</p>
          <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
            ← 학생 상세
          </Link>
        </div>
      );
    }
    const halfEndYm =
      endYmForHalfYearCode(savedHalf.half_year_code) ??
      searchParams.get("end_ym")?.trim() ??
      "";
    const draftHrefHalf = halfEndYm
      ? `/students/${studentId}/period/new?type=6m&end_ym=${encodeURIComponent(halfEndYm)}&h_id=${encodeURIComponent(savedHalf.h_report_id)}`
      : `/students/${studentId}`;

    if (draftUrlType === "6m" && halfEndYm && studentId) {
      return (
        <HalfYearReportComposer
          studentId={studentId}
          endYm={halfEndYm}
          reports={reports}
          studentNick={currentStudent?.student_nick}
          studentGrade={currentStudent?.student_grade}
          enrollmentAnchorYm={anchorYm}
          savedHalf={savedHalf}
          halves={halves}
        />
      );
    }

    return (
      <PeriodSavedViewShell
        studentId={studentId}
        title="반기 레포트 (저장본)"
        subtitle={`${savedHalf.half_year_code} · 발행 ${formatPublishedYmd(savedHalf.created_at)}`}
        newDraftHref={draftHrefHalf}
      >
        <HalfSavedBody row={savedHalf} />
      </PeriodSavedViewShell>
    );
  }

  if (yId) {
    if (!savedYear) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <p className="text-sm text-slate-600">해당 연간 저장 레포트를 찾을 수 없습니다.</p>
          <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
            ← 학생 상세
          </Link>
        </div>
      );
    }
    const draftHrefYear = `/students/${studentId}`;
    return (
      <PeriodSavedViewShell
        studentId={studentId}
        title="연간 레포트 (저장본)"
        subtitle={`${savedYear.target_year}년 · 발행 ${formatPublishedYmd(savedYear.created_at)}`}
        newDraftHref={draftHrefYear}
      >
        <YearSavedBody row={savedYear} />
      </PeriodSavedViewShell>
    );
  }

  if (qId) {
    if (!savedQuarter) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 p-4">
          <p className="text-sm text-slate-600">해당 분기 저장 레포트를 찾을 수 없습니다.</p>
          <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
            ← 학생 상세
          </Link>
        </div>
      );
    }
  }

  const isQuarterComposer = !hId && !yId && draftUrlType === "3m";
  const isHalfComposer = !hId && !yId && !qId && draftUrlType === "6m";

  if (!hId && !yId && !qId && draftUrlType === "12m") {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <p className="text-sm font-medium text-slate-800">이 화면은 분기·반기 레포트 작성 전용입니다.</p>
        <p className="text-sm text-slate-600">연간 레포트는 학생 상세에서 해당 메뉴를 이용해 주세요.</p>
        <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 상세
        </Link>
      </div>
    );
  }

  if (isHalfComposer && !draftEndYm) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <p className="text-sm font-medium text-slate-800">
          반기 레포트는 학생 상세의 「반기별 레포트 생성하기」 링크로 들어와 주세요.
        </p>
        <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 상세
        </Link>
      </div>
    );
  }

  if (isHalfComposer && studentsLoading) {
    return <div className="mx-auto max-w-4xl p-6 text-sm text-slate-600">학생 정보를 불러오는 중…</div>;
  }

  if (isHalfComposer && draftEndYm && studentId) {
    const savedHalfForEdit = halves.find((h) => h.half_year_code === halfYearCodeForEndYm(draftEndYm)) ?? null;
    return (
      <HalfYearReportComposer
        studentId={studentId}
        endYm={draftEndYm}
        reports={reports}
        studentNick={currentStudent?.student_nick}
        studentGrade={currentStudent?.student_grade}
        enrollmentAnchorYm={anchorYm}
        savedHalf={savedHalfForEdit}
        halves={halves}
      />
    );
  }

  if (isQuarterComposer && !draftEndYm && !qId) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <p className="text-sm font-medium text-slate-800">
          분기 레포트는 학생 상세에서 제공되는 링크로 들어와 주세요. 주소에 분기 마지막 달 정보가 없으면 이 화면을 열 수 없습니다.
        </p>
        <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 상세에서 분기 작성 링크로 들어오기
        </Link>
      </div>
    );
  }

  if (isQuarterComposer && studentsLoading) {
    return <div className="mx-auto max-w-4xl p-6 text-sm text-slate-600">학생 정보를 불러오는 중…</div>;
  }

  if (isQuarterComposer && !students.some((s) => s.student_id === studentId)) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <p className="text-sm text-red-600">학생 목록에서 이 학생을 찾을 수 없습니다.</p>
        <Link to="/students" className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 목록
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link to={`/students/${studentId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
          ← 학생 상세
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{qId ? "분기별 리포트 보기 · 수정" : "분기별 리포트 작성"}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {qId
            ? "저장된 분기 레포트를 불러왔습니다. 상단 단계 탭으로 이동해 내용을 고칠 수 있으며, 「레포트 확인 · 저장」 화면은 작성 직후와 동일합니다."
            : "분기 마지막 달을 기준으로 연속 3개월의 월간 데이터로 분기를 구성합니다. 입력이 끝나면 「레포트 확인 · 저장」에서 검토합니다."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
          <p className="text-sm text-slate-700">

            <code className="rounded bg-white px-1.5 py-0.5 text-xs ring-1 ring-slate-200">{draftEndYm}</code>
            {" "}<span className="font-medium text-slate-800">분기 레포트</span>
          </p>
          {quarterRange ? (
            <p className="text-sm text-slate-600">
              참조 레포트 :{" "}
              <span className="font-medium text-slate-800">
                {quarterRange.start} ~ {quarterRange.end}
              </span>
            </p>
          ) : null}
          
        </div>

        <nav aria-label="분기 작성 단계" className="flex flex-wrap gap-1.5">
              {QUARTER_WIZARD_STEPS.map((s) => {
                const active = quarterWizardStep === s.id;
                const done = quarterWizardStep > s.id;
                const pill =
                  active
                    ? "rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white"
                    : done
                      ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900"
                      : "rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600";
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!canJumpQuarterSteps}
                    aria-current={active ? "step" : undefined}
                    title={
                      canJumpQuarterSteps
                        ? `${s.id}단계로 이동`
                        : "이 분기에 저장된 레포트가 있으면 탭으로 단계 이동이 가능합니다."
                    }
                    onClick={() => {
                      if (!canJumpQuarterSteps) return;
                      setMsg(null);
                      setQuarterWizardStep(s.id);
                    }}
                    className={
                      pill +
                      " border-0 font-inherit leading-none transition-opacity " +
                      (canJumpQuarterSteps
                        ? "cursor-pointer hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                        : "cursor-default disabled:opacity-90")
                    }
                  >
                    {s.id}. {s.title}
                  </button>
                );
              })}
            </nav>

            {quarterWizardStep === 1 ? (
              <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">1. best 글쓰기 선정</legend>
                <p className="text-xs text-slate-600">
                  이 분기에 해당하는 월간 글쓰기 이미지가 나열됩니다. 대표로 쓸 <strong>한 장</strong>만 선택하세요.
                </p>
                {quarterWritingPicks.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                    {anchorYm && focusRoundForQuarter > 0 ? (
                      <>
                        해당 회차 구간에 월간 레포트가 없거나, 글쓰기 이미지가 비어 있습니다.{" "}
                        <Link
                          to={`/students/${studentId}/monthly/new?ym=${encodeURIComponent(yearMonthForRound(anchorYm, focusRoundForQuarter))}`}
                          className="font-medium text-indigo-800 underline hover:text-indigo-950"
                        >
                          월간 레포트에서 이미지를 먼저 올려 주세요.
                        </Link>
                      </>
                    ) : (
                      "학생 등록월을 불러오지 못했습니다."
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {quarterWritingPicks.map((p) => {
                      const selected = bestWritingUrl.trim() === p.url;
                      return (
                        <button
                          key={`${p.mReportId}-w${p.slot}`}
                          type="button"
                          onClick={() => {
                            setMsg(null);
                            setBestWritingUrl(p.url);
                          }}
                          className={
                            "group flex flex-col overflow-hidden rounded-xl border-2 bg-white text-left shadow-sm transition-all " +
                            (selected
                              ? "border-indigo-600 ring-2 ring-indigo-300"
                              : "border-slate-200 hover:border-indigo-300 hover:ring-1 hover:ring-indigo-200")
                          }
                        >
                          <div className="relative aspect-[4/3] w-full bg-slate-100">
                            <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                            {selected ? (
                              <span className="absolute right-2 top-2 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                                선택됨
                              </span>
                            ) : null}
                          </div>
                          <div className="space-y-0.5 px-2 py-2">
                            <p className="text-xs font-semibold text-slate-900">{p.round}회차</p>
                            <p className="text-[11px] text-slate-500">
                              {p.ym} · 이미지 {p.slot}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!canQuarterNext1}
                    onClick={goQuarterNext}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    다음
                  </button>
                </div>
                {!canQuarterNext1 ? (
                  <p className="text-xs text-amber-700">
                    {quarterWritingPicks.length === 0
                      ? "선택할 글쓰기 이미지가 없습니다."
                      : "썸네일 중 하나를 눌러 대표 이미지를 선택해 주세요."}
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            {quarterWizardStep === 2 ? (
              <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">2. 지식 마인드맵 생성</legend>
                <p className="text-xs text-slate-600">
                  이 분기 월간에 연결된 도서 정보를 바탕으로, AI가「이 학년에서 이 책들로 수업한 것이 왜 좋은 선택이었는지」코멘트를 생성합니다.
                </p>

                <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-3">
                  <p className="text-xs font-semibold text-indigo-950">이번 분기 3개월에 연결된 도서</p>
                  <p className="mt-1 text-[11px] leading-snug text-indigo-900/90">
                    표지·분류·키워드로 어떤 책들로 수업했는지 한눈에 확인한 뒤, 아래에서 AI 코멘트를 생성해 보세요.
                  </p>
                  {quarterMindmapBooksLoading ? (
                    <p className="mt-3 text-xs text-slate-600">도서 정보를 불러오는 중…</p>
                  ) : null}
                  {quarterMindmapBooksErr ? (
                    <p className="mt-2 text-xs text-red-600">{quarterMindmapBooksErr}</p>
                  ) : null}
                  {!quarterMindmapBooksLoading && quarterMindmapBookIds.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-600">월간 레포트에 연결된 도서가 없습니다.</p>
                  ) : null}
                  {!quarterMindmapBooksLoading && quarterMindmapBookIds.length > 0 && orderedQuarterMindmapBooks.length === 0 ? (
                    <p className="mt-3 text-xs text-amber-800">연결된 도서 정보를 찾을 수 없습니다.</p>
                  ) : null}
                  {orderedQuarterMindmapBooks.length > 0 ? (
                    <QuarterReadingMindmapPreview books={orderedQuarterMindmapBooks} />
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      mindmapGenBusy ||
                      quarterMindmapBookIds.length === 0 ||
                      !isSupabaseConfigured()
                    }
                    onClick={() => void runMindmapGeneration()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {mindmapGenBusy ? "생성 중…" : "지식 마인드맵 생성"}
                  </button>
                  <span className="text-xs text-slate-500">
                    연결된 도서 {quarterMindmapBookIds.length}권
                    {currentStudent?.student_grade?.trim() ? (
                      <> · 학년: {formatSchoolGradeLabel(currentStudent.student_grade)}</>
                    ) : null}
                  </span>
                </div>
                {mindmapGenErr ? <p className="text-sm text-red-600">{mindmapGenErr}</p> : null}
                <label className="block text-sm font-medium text-slate-800">
                  지식·수업 타당성 코멘트
                  <textarea
                    className="mt-1 min-h-[220px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-900"
                    value={knowledgeCommentForUi}
                    onChange={(e) => mergeMindmapKnowledgeComment(e.target.value)}
                    disabled={!mindmapRecord}
                    placeholder="AI 생성 또는 직접 입력…"
                    spellCheck
                  />
                </label>
                {!mindmapRecord ? (
                  <p className="text-xs text-amber-800">
                    마인드맵 데이터 형식에 문제가 있을 수 있습니다. 아래「고급」에서 확인해 주세요.
                  </p>
                ) : null}
                
                
                <div className="flex justify-between gap-2 pt-2">
                  <button type="button" onClick={goQuarterPrev} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                    이전
                  </button>
                  <button
                    type="button"
                    disabled={!canQuarterNext2}
                    onClick={goQuarterNext}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    다음
                  </button>
                </div>
                {!mindmapJsonOk ? (
                  <p className="text-xs text-amber-700">올바른 JSON 형식인지 확인해 주세요. (빈 객체 {"{}"}도 가능합니다)</p>
                ) : null}
              </fieldset>
            ) : null}

            {quarterWizardStep === 3 ? (
              <fieldset className="space-y-4 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">3. 성장 인사이트</legend>
                

                {quarterGrowthColumns.length === 0 ? (
                  <p className="text-xs text-amber-800">분기 월간 데이터를 불러올 수 없습니다. 학생 등록월·end_ym을 확인해 주세요.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="sticky left-0 z-[2] w-28 min-w-[7rem] border-r border-slate-200 bg-slate-50 px-2 py-2 font-semibold text-slate-700">
                              항목
                            </th>
                            {quarterGrowthColumns.map((col) => (
                              <th
                                key={col.ym}
                                className="min-w-[10.5rem] border-l border-slate-100 px-2 py-2 text-center font-semibold text-slate-800"
                              >
                                <span className="block text-[11px] text-indigo-700">{col.round}회차</span>
                                <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-500">{col.ym}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {GROWTH_INSIGHT_TABLE_ROWS.map((row) => (
                            <tr key={row.field} className="border-t border-slate-100">
                              <th className="sticky left-0 z-[2] border-r border-slate-200 bg-slate-50/95 px-2 py-2 align-top text-[11px] font-medium text-slate-700">
                                {row.label}
                              </th>
                              {quarterGrowthColumns.map((col) => {
                                const text = readGrowthInsightCell(col.report, row.field);
                                const key = growthInsightCellKey(col.ym, row.field);
                                const selected = growthInsightSelection.includes(key);
                                const has = Boolean(text);
                                return (
                                  <td key={key} className="border-l border-slate-100 p-1 align-top">
                                    <button
                                      type="button"
                                      disabled={!has}
                                      onClick={() => {
                                        if (!has) return;
                                        setGrowthInsightSelection((prev) =>
                                          prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
                                        );
                                      }}
                                      className={
                                        "h-full min-h-[4.5rem] w-full rounded-md px-1.5 py-1.5 text-left transition-colors " +
                                        (!has
                                          ? "cursor-not-allowed bg-slate-50 text-slate-400"
                                          : selected
                                            ? "bg-indigo-50 ring-2 ring-indigo-400 ring-offset-1 ring-offset-white"
                                            : "bg-white hover:bg-slate-50")
                                      }
                                    >
                                      <span className={has ? "line-clamp-6 text-[11px] leading-snug text-slate-800" : ""}>
                                        {has ? text : "—"}
                                      </span>
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={growthInsightAllCellKeys.length === 0}
                        onClick={() => setGrowthInsightSelection([...growthInsightAllCellKeys])}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                      >
                        전체 선택
                      </button>
                      <button
                        type="button"
                        disabled={growthInsightSelection.length === 0}
                        onClick={() => setGrowthInsightSelection([])}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                      >
                        전체 해제
                      </button>
                      <button
                        type="button"
                        disabled={growthInsightGenBusy || growthInsightSelection.length === 0}
                        onClick={() => void runGrowthInsightGeneration()}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {growthInsightGenBusy ? "추출 중…" : "성장 인사이트 생성"}
                      </button>
                      <span className="text-[11px] text-slate-500">선택 {growthInsightSelection.length}칸</span>
                    </div>
                    {growthInsightGenErr ? <p className="text-sm text-red-600">{growthInsightGenErr}</p> : null}
                  </>
                )}

                <div className="overflow-hidden rounded-lg border border-sky-200 bg-sky-100/90">
                  <p className="border-b border-sky-200/80 px-3 py-2 text-sm font-bold text-slate-900">성장 인사이트</p>
                  <div className="space-y-3 bg-white/60 px-3 py-3">
                    <div>
                      <p className="mb-2 text-[11px] font-medium text-slate-600">핵심 태도 · 자세 · 모습 (3가지)</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                        {([0, 1, 2] as const).map((idx) => {
                          const [t0, t1, t2] = parseInsightTagsTriple(insightsText);
                          const val = idx === 0 ? t0 : idx === 1 ? t1 : t2;
                          return (
                            <input
                              key={idx}
                              type="text"
                              value={val}
                              onChange={(e) => {
                                const v = e.target.value;
                                setInsightsText((prev) => {
                                  const [a, b, c] = parseInsightTagsTriple(prev);
                                  const next = idx === 0 ? [v, b, c] : idx === 1 ? [a, v, c] : [a, b, v];
                                  return JSON.stringify(next);
                                });
                              }}
                              placeholder={`키워드 ${idx + 1}`}
                              className="min-w-0 flex-1 rounded-lg border border-sky-900/25 bg-[#1e4d7b] px-3 py-2 text-center text-xs font-medium text-white placeholder:text-sky-200/70 sm:min-w-[8rem]"
                            />
                          );
                        })}
                      </div>
                    </div>
                    <label className="block text-sm font-medium text-slate-800">
                      긍정적 행동 패턴에 대한 코멘트
                      <textarea
                        className="mt-1 min-h-[200px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900"
                        value={roadmapText}
                        onChange={(e) => setRoadmapText(e.target.value)}
                        placeholder="아이가 반복적으로 보여 준 태도를 바탕으로, 학부모에게 전하는 한 덩어리의 메시지를 적어 주세요."
                        spellCheck
                      />
                    </label>
                  </div>
                </div>

                

                <div className="flex justify-between gap-2 pt-2">
                  <button type="button" onClick={goQuarterPrev} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                    이전
                  </button>
                  <button
                    type="button"
                    disabled={!canQuarterNext3}
                    onClick={goQuarterNext}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    다음
                  </button>
                </div>
                {!insightsJsonOk ? (
                  <p className="text-xs text-amber-700">insight_tags는 올바른 JSON 배열 형식이어야 합니다.</p>
                ) : null}
                {insightsJsonOk && !growthInsightStepOk ? (
                  <p className="text-xs text-amber-700">키워드 3개와 코멘트를 모두 채운 뒤 다음 단계로 이동할 수 있습니다.</p>
                ) : null}
              </fieldset>
            ) : null}

            {quarterWizardStep === 4 ? (
              <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-800">4. 선생님의 따뜻한 한마디</legend>
                <p className="text-xs text-slate-600">
                  아래에 <strong>초안</strong>을 적은 뒤 <strong>레포트 생성하기</strong>를 누르면, 2단계 지식 마인드맵 텍스트·3단계 핵심 태도 3가지·긍정적 행동
                  패턴 코멘트·이 초안을 함께 반영해 <strong>Best 글쓰기 짧은 소개</strong>와 <strong>학부모용으로 확장된 따뜻한 한마디</strong>가 만들어지며{" "}
                  <strong>5. 레포트 확인 · 저장</strong>으로 이동합니다. (AI 응답이 비면 같은 맥락으로 자동 보완합니다.)
                </p>
                <textarea
                  className="min-h-[120px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed"
                  value={teacherCommentSeed}
                  onChange={(e) => setTeacherCommentSeed(e.target.value)}
                  placeholder="이번 분기에 인상 깊었던 점, 아이에게 전하고 싶은 마음을 짧게 적어 주세요."
                  spellCheck
                />
                {quarterFinalizeErr ? <p className="text-sm text-red-600">{quarterFinalizeErr}</p> : null}
                <div className="flex flex-wrap justify-between gap-2 pt-2">
                  <button type="button" onClick={goQuarterPrev} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                    이전
                  </button>
                  <button
                    type="button"
                    disabled={quarterFinalizeBusy || !teacherCommentSeed.trim()}
                    onClick={() => void runQuarterReportFinalize()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {quarterFinalizeBusy ? "생성 중…" : "레포트 생성하기"}
                  </button>
                </div>
                {!teacherCommentSeed.trim() ? (
                  <p className="text-xs text-amber-700">초안을 입력한 뒤 레포트를 생성할 수 있습니다.</p>
                ) : null}
              </fieldset>
            ) : null}

            {quarterWizardStep === 5 ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
                  {qId ? (
                    <>
                      아래는 <strong>저장된 분기 레포트</strong>와 동일한 화면입니다. 각 블록은 <strong>수정</strong>을 누른 뒤 내용을 고치고{" "}
                      <strong>저장</strong> 또는 <strong>취소</strong>하면 됩니다(월간 레포트 확인 화면과 동일). 다듬은 뒤{" "}
                      <strong>분기 리포트 저장</strong>을 눌러 변경 사항을 반영하세요.
                    </>
                  ) : (
                    <>
                      아래는 저장될 분기 레포트 <strong>목차</strong>와 동일합니다. 각 블록은 <strong>수정</strong>을 누른 뒤 내용을 고치고{" "}
                      <strong>저장</strong> 또는 <strong>취소</strong>하면 됩니다(월간 레포트 확인 화면과 동일). 다듬은 뒤{" "}
                      <strong>분기 리포트 저장</strong>을 눌러 주세요.
                    </>
                  )}
                </div>

                <div id="hanuri-export-root" className="rounded-xl bg-[#eaf1f9] py-6 font-sans shadow-sm ring-1 ring-slate-200/60">
                  <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                    <div className="relative mb-8 overflow-hidden rounded-t-xl bg-gradient-to-r from-[#d9e8fb] to-[#c2dcf9] px-6 pt-10 pb-8 sm:px-8">
                      <div className="absolute top-0 right-0 h-64 w-64 translate-x-1/3 -translate-y-1/2 rounded-full bg-white/30 blur-3xl" />
                      <p className="relative z-10 text-sm font-medium text-[#2a5b9c]/90">
                        {quarterYearLabel ? formatQuarterLabelKo(quarterYearLabel) : ""}
                        {quarterRange ? ` · ${quarterRange.start} ~ ${quarterRange.end}` : ""}
                      </p>
                      <h2 className="relative z-10 mt-2 text-2xl font-extrabold tracking-tight text-[#2a5b9c] md:text-3xl">
                        {quarterReportHeaderTitle}
                      </h2>
                    </div>

                    <ReportSection
                      title="3개월 Best 글쓰기"
                      headerRight={
                        quarterEditSection === "bestWriting" ? (
                          <>
                            <button type="button" className={QUARTER_RESULT_BTN_PRIMARY} onClick={saveQuarterResultBestWriting}>
                              저장
                            </button>
                            <button type="button" className={QUARTER_RESULT_BTN_GHOST} onClick={cancelQuarterResultEdit}>
                              취소
                            </button>
                          </>
                        ) : (
                          <button type="button" className={QUARTER_RESULT_BTN_EDIT} onClick={() => startQuarterResultEdit("bestWriting")}>
                            수정
                          </button>
                        )
                      }
                    >
                      <div className="space-y-4 text-gray-700">
                        {bestWritingUrl.trim() ? (
                          <div className="flex justify-center">
                            <div className="w-full max-w-sm border border-gray-100 bg-gray-50 p-2 shadow-sm">
                              <img
                                src={bestWritingUrl.trim()}
                                alt="분기 대표 글쓰기"
                                className="h-auto w-full object-contain"
                              />
                            </div>
                          </div>
                        ) : (
                          <p className="text-center text-sm text-gray-500">선정된 글쓰기 이미지가 없습니다.</p>
                        )}
                        {quarterEditSection === "bestWriting" ? (
                          <textarea
                            className={`${QUARTER_RESULT_EDIT_TEXTAREA_CLASS} min-h-[88px]`}
                            value={draftQuarterBestWriting}
                            onChange={(e) => setDraftQuarterBestWriting(e.target.value)}
                            placeholder="최근 3개월 글쓰기 중 Best 작품을 소개하는 짧은 문장을 적어 주세요."
                            aria-label="Best 글 소개 문구 편집"
                            spellCheck
                          />
                        ) : splitQuarterBodyParagraphs(bestWritingComment).length > 0 ? (
                          <div className="space-y-2">
                            {splitQuarterBodyParagraphs(bestWritingComment).map((p, i) => (
                              <p key={i} className="whitespace-pre-line text-[15px] leading-relaxed">
                                {p}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Best 글 소개 문구가 비어 있습니다. 4단계에서 레포트 생성하기를 실행하거나 수정으로 입력해 주세요.</p>
                        )}
                      </div>
                    </ReportSection>

                    <ReportSection
                      title="지식 마인드맵"
                      headerRight={
                        quarterEditSection === "mindmap" ? (
                          <>
                            <button type="button" className={QUARTER_RESULT_BTN_PRIMARY} onClick={saveQuarterResultMindmap}>
                              저장
                            </button>
                            <button type="button" className={QUARTER_RESULT_BTN_GHOST} onClick={cancelQuarterResultEdit}>
                              취소
                            </button>
                          </>
                        ) : (
                          <button type="button" className={QUARTER_RESULT_BTN_EDIT} onClick={() => startQuarterResultEdit("mindmap")}>
                            수정
                          </button>
                        )
                      }
                    >
                      <div className="space-y-4 text-gray-700">
                        {orderedQuarterMindmapBooks.length > 0 ? (
                          <QuarterReadingMindmapPreview books={orderedQuarterMindmapBooks} />
                        ) : (
                          <p className="text-sm text-gray-500">이번 분기 월간에 연결된 도서가 없습니다.</p>
                        )}
                        {quarterEditSection === "mindmap" ? (
                          <textarea
                            className={`${QUARTER_RESULT_EDIT_TEXTAREA_CLASS} min-h-[120px]`}
                            value={draftQuarterMindmap}
                            onChange={(e) => setDraftQuarterMindmap(e.target.value)}
                            placeholder="지식·수업 타당성 코멘트(mindmap_cmt)"
                            aria-label="지식·수업 타당성 코멘트 편집"
                            spellCheck
                          />
                        ) : knowledgeCommentForUi.trim() ? (
                          <div className="space-y-3">
                            {splitQuarterBodyParagraphs(knowledgeCommentForUi).map((p, i) => (
                              <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed">
                                {p}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">지식·수업 타당성 코멘트가 비어 있습니다. 수정으로 입력하거나 이전 단계에서 생성해 주세요.</p>
                        )}
                      </div>
                    </ReportSection>

                    <ReportSection
                      title="성장 인사이트"
                      headerRight={
                        quarterEditSection === "growth" ? (
                          <>
                            <button type="button" className={QUARTER_RESULT_BTN_PRIMARY} onClick={saveQuarterResultGrowth}>
                              저장
                            </button>
                            <button type="button" className={QUARTER_RESULT_BTN_GHOST} onClick={cancelQuarterResultEdit}>
                              취소
                            </button>
                          </>
                        ) : (
                          <button type="button" className={QUARTER_RESULT_BTN_EDIT} onClick={() => startQuarterResultEdit("growth")}>
                            수정
                          </button>
                        )
                      }
                    >
                      <div className="space-y-4 text-gray-700">
                        <div className="flex flex-wrap gap-2">
                          {parseInsightTagsTriple(insightsText).map((t, i) =>
                            t.trim() ? (
                              <span
                                key={i}
                                className="rounded-lg bg-[#1e4d7b] px-2.5 py-1.5 text-sm font-medium text-white shadow-sm"
                              >
                                {t.trim()}
                              </span>
                            ) : null,
                          )}
                        </div>
                        <p className="text-xs text-gray-500">키워드는 저장 시 growth_keywords·insight_tags에 동기화됩니다. 키워드 변경은 3단계에서 할 수 있습니다.</p>
                        {quarterEditSection === "growth" ? (
                          <textarea
                            className={`${QUARTER_RESULT_EDIT_TEXTAREA_CLASS} min-h-[120px]`}
                            value={draftQuarterGrowthCmt}
                            onChange={(e) => setDraftQuarterGrowthCmt(e.target.value)}
                            placeholder="긍정적 행동 패턴에 대한 코멘트(growth_cmt)"
                            aria-label="성장 인사이트 코멘트 편집"
                            spellCheck
                          />
                        ) : splitQuarterBodyParagraphs(roadmapText).length > 0 ? (
                          <div className="space-y-3">
                            {splitQuarterBodyParagraphs(roadmapText).map((p, i) => (
                              <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed">
                                {p}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">긍정적 행동 패턴 코멘트가 비어 있습니다.</p>
                        )}
                      </div>
                    </ReportSection>

                    <ReportSection
                      title="선생님의 따뜻한 한마디"
                      headerRight={
                        quarterEditSection === "teacher" ? (
                          <>
                            <button type="button" className={QUARTER_RESULT_BTN_PRIMARY} onClick={saveQuarterResultTeacher}>
                              저장
                            </button>
                            <button type="button" className={QUARTER_RESULT_BTN_GHOST} onClick={cancelQuarterResultEdit}>
                              취소
                            </button>
                          </>
                        ) : (
                          <button type="button" className={QUARTER_RESULT_BTN_EDIT} onClick={() => startQuarterResultEdit("teacher")}>
                            수정
                          </button>
                        )
                      }
                    >
                      <div className="space-y-2 text-gray-700">
                        {quarterEditSection === "teacher" ? (
                          <textarea
                            className={`${QUARTER_RESULT_EDIT_TEXTAREA_CLASS} min-h-[160px]`}
                            value={draftQuarterTeacher}
                            onChange={(e) => setDraftQuarterTeacher(e.target.value)}
                            placeholder="선생님의 따뜻한 한마디(확장본, teacher_ai_comment)"
                            aria-label="선생님 한마디 편집"
                            spellCheck
                          />
                        ) : splitQuarterBodyParagraphs(teacherComment).length > 0 ? (
                          <div className="space-y-4 font-medium text-gray-700">
                            {splitQuarterBodyParagraphs(teacherComment).map((p, i) => (
                              <p key={i} className="leading-loose whitespace-pre-line">
                                {p}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">선생님 한마디(확장본)가 비어 있습니다.</p>
                        )}
                      </div>
                    </ReportSection>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={goQuarterPrev} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                    이전 단계로
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "저장 중…" : "분기 리포트 저장"}
                </button>
              </div>
            ) : null}

        {msg ? <p className="text-center text-sm text-slate-700">{msg}</p> : null}
      </form>
    </div>
  );
}
