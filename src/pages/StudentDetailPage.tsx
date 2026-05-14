import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { XAxisTickContentProps } from "recharts";
import { useAuth } from "../auth/AuthContext";
import { useMonthlyReports } from "../hooks/useMonthlyReports";
import { useStudentPeriodReports } from "../hooks/useStudentPeriodReports";
import { useStudents } from "../hooks/useStudents";
import { formatSchoolGradeLabel } from "../lib/schoolGrade";
import { studentsSectionTitle } from "../lib/studentsSectionTitle";
import {
  annualTargetYearForEndYm,
  enrollmentYearMonth,
  endYmForAnnualTargetYear,
  endYmForHalfYearCode,
  halfYearCodeForEndYm,
  quarterEndYmForYearMonth,
  quarterYearKeyForEndYm,
  reportsByYearMonth,
  roundTableWindowBounds,
  currentYearMonth,
  isMonthDeadlinePassed,

  roundsElapsedThroughNow,
  roundForYearMonth,
  visibleRoundCount,
  yearMonthForRound,
} from "../lib/reportRounds";
import { PILLAR_KEYS, parsePillarScores, pillarLabelsKo, type PillarKey } from "../lib/reportAggregates";

/** 회차 열 「AI 레포트」 버튼 안쪽 여백(px). 여기 숫자만 바꿔 조절하세요. */
const AI_REPORT_BTN_PAD_X_PX = 10;
const AI_REPORT_BTN_PAD_Y_PX = 8;

/** 회차 칸 신호등 — 월간·(해당 시)분기·반기·연간 충족도 */
type RoundBundleLight = "empty" | "partial" | "done" | "danger";

function bundleLightClass(s: RoundBundleLight): string {
  switch (s) {
    case "done":
      return "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]";
    case "partial":
      return "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]";
    case "danger":
      return "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.75)]";
    default:
      return "border-2 border-slate-200 bg-white shadow-none";
  }
}

function bundleLabelKo(s: RoundBundleLight): string {
  switch (s) {
    case "done":
      return "필수 레포트 모두 작성";
    case "partial":
      return "필수 중 일부만 작성";
    case "danger":
      return "해당 달 지남 · 필수 미완성";
    default:
      return "미래 달이거나 아직 미작성(기한 전)";
  }
}

/**
 * - 미래 달(회차 `ym` > 이번 달): 빈 신호
 * - 필수 전부 충족: 초록
 * - 해당 달 지남 + 필수 미전부: 빨강
 * - 해당 달 전 + 일부만: 노랑
 * - 해당 달 전 + 전부 없음: 빈 신호
 */
function computeRoundBundleLight(input: {
  ym: string;
  r: number;
  now: Date;
  hasMonthly: boolean;
  hasQuarter: boolean;
  hasHalf: boolean;
  hasYear: boolean;
}): RoundBundleLight {
  const nowYm = currentYearMonth(input.now);
  if (input.ym > nowYm) return "empty";

  let required = 0;
  let filled = 0;
  required += 1;
  if (input.hasMonthly) filled += 1;
  if (input.r % 3 === 0) {
    required += 1;
    if (input.hasQuarter) filled += 1;
  }
  if (input.r % 6 === 0) {
    required += 1;
    if (input.hasHalf) filled += 1;
  }
  if (input.r % 12 === 0) {
    required += 1;
    if (input.hasYear) filled += 1;
  }

  const monthPassed = isMonthDeadlinePassed(input.ym, input.now);
  if (filled === required && required > 0) return "done";
  if (monthPassed && filled < required) return "danger";
  if (!monthPassed && filled > 0 && filled < required) return "partial";
  return "empty";
}

/** 리포트 저장(발행) 시각 → 로컬 년·월·일 */
function formatPublishedYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function clipText(s: string | null | undefined, max: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
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

function formatQuarterLabelKo(quarterYear: string): string {
  const m = /^(\d{4})-(\d)Q$/.exec(quarterYear);
  if (!m) return quarterYear;
  return `${m[1]}년 제${m[2]}분기`;
}

function formatHalfLabelKo(hc: string): string {
  const m = /^(\d{4})-H([12])$/.exec(hc);
  if (!m) return hc;
  return `${m[1]}년 ${m[2] === "1" ? "상" : "하"}반기`;
}

function yearTimelinePreview(timeline: unknown): string {
  if (timeline == null) return "";
  if (typeof timeline === "string") return clipText(timeline, 200);
  if (typeof timeline === "object") {
    try {
      return clipText(JSON.stringify(timeline), 220);
    } catch {
      return "";
    }
  }
  return "";
}

type ArchiveKind = "monthly" | "quarter" | "half" | "year";

type ArchiveRow = {
  key: string;
  sortTs: number;
  kind: ArchiveKind;
  title: string;
  subtitle: string;
  preview: string;
  scoresLine: string;
  href?: string;
};

/** 회차별 5대 역량 꺾은선 — 항목별 색 */
const PILLAR_LINE_COLORS: Record<PillarKey, string> = {
  reading: "#2563eb",
  thinking: "#7c3aed",
  discussion: "#d97706",
  writing: "#059669",
  growth: "#e11d48",
};

function archiveKindBadge(kind: ArchiveKind): { label: string; className: string } {
  switch (kind) {
    case "monthly":
      return { label: "월간", className: "bg-indigo-50 text-indigo-800 ring-indigo-600/15" };
    case "quarter":
      return { label: "분기", className: "bg-violet-50 text-violet-900 ring-violet-600/15" };
    case "half":
      return { label: "반기", className: "bg-amber-50 text-amber-950 ring-amber-600/20" };
    default:
      return { label: "연간", className: "bg-teal-50 text-teal-950 ring-teal-600/15" };
  }
}

export function StudentDetailPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const { students, loading: ls } = useStudents();
  const { reports, loading: lr } = useMonthlyReports(id);
  const {
    quarters: periodQuarters,
    halves: periodHalves,
    years: periodYears,
    loading: lpr,
    error: periodErr,
  } = useStudentPeriodReports(id);

  const student = useMemo(() => students.find((s) => s.student_id === id), [students, id]);
  const now = useMemo(() => new Date(), []);

  const { anchorYm, roundCount, byYm, focusRound } = useMemo(() => {
    if (!student) {
      return {
        anchorYm: "",
        roundCount: 12,
        byYm: new Map<string, (typeof reports)[0]>(),
        focusRound: 1,
      };
    }
    const anchorYm = enrollmentYearMonth(student.created_at);
    const roundCount = visibleRoundCount(anchorYm, now);
    const byYm = reportsByYearMonth(reports);
    const focusRound = roundsElapsedThroughNow(anchorYm, now);
    return { anchorYm, roundCount, byYm, focusRound };
  }, [student, reports, now]);

  /** 열려 있는 회차 열의 레포트 메뉴 (한 번에 하나만) */
  const [openReportMenuRound, setOpenReportMenuRound] = useState<number | null>(null);
  const [reportMenuPos, setReportMenuPos] = useState<{ left: number; top: number } | null>(null);
  const reportMenuButtonRefs = useRef(new Map<number, HTMLButtonElement>());

  /** 열려 있는 회차 열의 「레포트 보기」 메뉴 */
  const [openViewMenuRound, setOpenViewMenuRound] = useState<number | null>(null);
  const [viewMenuPos, setViewMenuPos] = useState<{ left: number; top: number } | null>(null);
  const viewMenuButtonRefs = useRef(new Map<number, Element>());

  useLayoutEffect(() => {
    if (openReportMenuRound === null) {
      setReportMenuPos(null);
      return;
    }
    const round = openReportMenuRound;
    function measure() {
      const btn = reportMenuButtonRefs.current.get(round);
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setReportMenuPos({ left: rect.left + rect.width / 2, top: rect.top });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [openReportMenuRound]);

  useLayoutEffect(() => {
    if (openViewMenuRound === null) {
      setViewMenuPos(null);
      return;
    }
    const round = openViewMenuRound;
    function measure() {
      const btn = viewMenuButtonRefs.current.get(round);
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setViewMenuPos({ left: rect.left + rect.width / 2, top: rect.top });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [openViewMenuRound]);

  useEffect(() => {
    if (openReportMenuRound === null && openViewMenuRound === null) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (document.querySelector("[data-round-report-menu-portal]")?.contains(t)) return;
      if (document.querySelector("[data-round-view-report-menu-portal]")?.contains(t)) return;
      if (openReportMenuRound !== null) {
        const wrap = document.querySelector(`[data-round-report-menu="${openReportMenuRound}"]`);
        if (wrap?.contains(t)) return;
      }
      if (openViewMenuRound !== null) {
        const wrapV = document.querySelector(`[data-round-view-report-menu="${openViewMenuRound}"]`);
        if (wrapV?.contains(t)) return;
      }
      setOpenReportMenuRound(null);
      setOpenViewMenuRound(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenReportMenuRound(null);
        setOpenViewMenuRound(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openReportMenuRound, openViewMenuRound]);

  const roundWindow = useMemo(
    () => (student ? roundTableWindowBounds(focusRound, roundCount) : { start: 1, end: 12 }),
    [student, focusRound, roundCount],
  );
  const rounds = useMemo(
    () =>
      Array.from({ length: roundWindow.end - roundWindow.start + 1 }, (_, i) => roundWindow.start + i),
    [roundWindow],
  );

  /** 위 회차 표와 동일한 열 순서 — 저장된 월간만 점 표시, 미작성은 null 로 선이 끊김 */
  const roundPillarChartRows = useMemo(() => {
    if (!anchorYm) return [];
    return rounds.map((r) => {
      const ym = yearMonthForRound(anchorYm, r);
      const report = byYm.get(ym);
      const s = report ? parsePillarScores(report.competency_ratings) : {};
      return {
        round: r,
        name: `${r}회`,
        ym,
        reading: typeof s.reading === "number" ? s.reading : null,
        thinking: typeof s.thinking === "number" ? s.thinking : null,
        discussion: typeof s.discussion === "number" ? s.discussion : null,
        writing: typeof s.writing === "number" ? s.writing : null,
        growth: typeof s.growth === "number" ? s.growth : null,
      };
    });
  }, [anchorYm, rounds, byYm]);

  const hasAnyPillarChartPoint = useMemo(
    () =>
      roundPillarChartRows.some((row) =>
        PILLAR_KEYS.some((k) => {
          const v = row[k];
          return v != null && typeof v === "number";
        }),
      ),
    [roundPillarChartRows],
  );

  /** 차트 X축 회차 틱 클릭 시 메뉴 표시용 — 회차별 저장분 유무 */
  const roundReportViewSlots = useMemo(() => {
    if (!anchorYm || !id) return [];
    return rounds.map((r) => {
      const ym = yearMonthForRound(anchorYm, r);
      const report = byYm.get(ym);
      const hasMonthlyView = Boolean(report);
      const quarterSaved =
        r % 3 === 0
          ? periodQuarters.find((q) => q.quarter_end_ym === quarterEndYmForYearMonth(ym))
          : undefined;
      const halfKey = halfYearCodeForEndYm(ym);
      const halfSaved = r % 6 === 0 ? periodHalves.find((h) => h.half_year_code === halfKey) : undefined;
      const annualY = annualTargetYearForEndYm(ym);
      const yearSaved = r % 12 === 0 ? periodYears.find((y) => y.target_year === annualY) : undefined;
      const hasAnySavedView =
        Boolean(hasMonthlyView) ||
        Boolean(quarterSaved) ||
        Boolean(halfSaved) ||
        Boolean(yearSaved);
      return {
        r,
        hasAnySavedView,
        viewMenuOpen: openViewMenuRound === r,
      };
    });
  }, [
    anchorYm,
    id,
    rounds,
    byYm,
    now,
    periodQuarters,
    periodHalves,
    periodYears,
    openViewMenuRound,
  ]);

  const renderPillarXAxisTick = useCallback(
    (tickProps: XAxisTickContentProps) => {
      const idx = tickProps.index;
      const row = roundPillarChartRows[idx];
      const slot = roundReportViewSlots[idx];
      const x = Number(tickProps.x);
      const y = Number(tickProps.y);
      const ta = tickProps.textAnchor;
      const angle = tickProps.angle ?? -32;
      const transform = `rotate(${angle},${x},${y})`;
      const fs = 10;
      const idleFill = tickProps.fill ?? "#64748b";

      if (!row) {
        return (
          <text x={x} y={y} textAnchor={ta} transform={transform} fill={idleFill} fontSize={fs}>
            {String(tickProps.payload?.value ?? "")}
          </text>
        );
      }

      const clickable = Boolean(id && slot?.hasAnySavedView);
      const r = row.round;
      const active = openViewMenuRound === r;

      if (!clickable) {
        return (
          <text x={x} y={y} textAnchor={ta} transform={transform} fill={idleFill} fontSize={fs}>
            {row.name}
          </text>
        );
      }

      return (
        <g data-round-view-report-menu={r}>
          <title>{`${row.name} (${row.ym}) — 클릭하면 저장된 레포트 메뉴`}</title>
          <text
            ref={(el) => {
              if (el) viewMenuButtonRefs.current.set(r, el);
              else viewMenuButtonRefs.current.delete(r);
            }}
            x={x}
            y={y}
            textAnchor={ta}
            transform={transform}
            fill={active ? "#312e81" : "#4338ca"}
            fontSize={fs}
            fontWeight={600}
            style={{ cursor: "pointer" }}
            textDecoration="underline"
            onClick={(e) => {
              e.stopPropagation();
              setOpenReportMenuRound(null);
              setOpenViewMenuRound((cur) => (cur === r ? null : r));
            }}
            aria-expanded={active}
            aria-haspopup="true"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpenReportMenuRound(null);
                setOpenViewMenuRound((cur) => (cur === r ? null : r));
              }
            }}
          >
            {row.name}
          </text>
        </g>
      );
    },
    [roundPillarChartRows, roundReportViewSlots, id, openViewMenuRound],
  );

  const archiveRows = useMemo((): ArchiveRow[] => {
    if (!id || !student) return [];
    const rows: ArchiveRow[] = [];

    for (const r of reports) {
      const ts = Date.parse(r.created_at);
      const sortTs = Number.isFinite(ts) ? ts : 0;
      const round = anchorYm ? roundForYearMonth(anchorYm, r.year_month) : null;
      const title =
        round != null && Number.isFinite(round) ? `${round}회차 · ${r.year_month}` : r.year_month;
      const preview =
        clipText(r.growth_moments, 220) || clipText(r.teacher_note, 220) || "저장된 본문 요약이 없습니다.";
      rows.push({
        key: `m-${r.id}`,
        sortTs,
        kind: "monthly",
        title,
        subtitle: `발행 ${formatPublishedYmd(r.created_at)}`,
        preview,
        scoresLine: "",
        href: `/students/${id}/monthly/new?ym=${encodeURIComponent(r.year_month)}&step=6`,
      });
    }

    for (const q of periodQuarters) {
      const ts = Date.parse(q.created_at);
      const sortTs = Number.isFinite(ts) ? ts : 0;
      const preview =
        clipText(q.teacher_ai_comment, 160) ||
        clipText(q.teacher_comment, 160) ||
        clipText(q.growth_cmt, 160) ||
        clipText(q.insight_desc, 160) ||
        "교사 코멘트·로드맵 요약이 없습니다.";
      const endYm = q.quarter_end_ym;
      rows.push({
        key: `q-${q.q_report_id}`,
        sortTs,
        kind: "quarter",
        title: formatQuarterLabelKo(quarterYearKeyForEndYm(q.quarter_end_ym)),
        subtitle: `${q.quarter_end_ym} · 발행 ${formatPublishedYmd(q.created_at)}`,
        preview,
        scoresLine: "",
        href:
          endYm != null
            ? `/students/${id}/period/new?type=3m&end_ym=${encodeURIComponent(endYm)}&q_id=${encodeURIComponent(q.q_report_id)}`
            : undefined,
      });
    }

    for (const h of periodHalves) {
      const ts = Date.parse(h.created_at);
      const sortTs = Number.isFinite(ts) ? ts : 0;
      const preview =
        clipText(h.teacher_comment, 160) ||
        clipText(h.type_description, 160) ||
        clipText(h.reading_type_name, 80) ||
        "반기 프로필 설명이 없습니다.";
      const endYm = endYmForHalfYearCode(h.half_year_code);
      rows.push({
        key: `h-${h.h_report_id}`,
        sortTs,
        kind: "half",
        title: formatHalfLabelKo(h.half_year_code),
        subtitle: `${h.half_year_code} · 발행 ${formatPublishedYmd(h.created_at)}`,
        preview,
        scoresLine: formatScoresLine(h),
        href:
          endYm != null
            ? `/students/${id}/period/new?type=6m&end_ym=${encodeURIComponent(endYm)}&h_id=${encodeURIComponent(h.h_report_id)}`
            : undefined,
      });
    }

    for (const y of periodYears) {
      const ts = Date.parse(y.created_at);
      const sortTs = Number.isFinite(ts) ? ts : 0;
      const preview = yearTimelinePreview(y.annual_timeline) || "연간 타임라인 데이터가 없습니다.";
      const endYm = endYmForAnnualTargetYear(y.target_year);
      rows.push({
        key: `y-${y.y_report_id}`,
        sortTs,
        kind: "year",
        title: `${y.target_year}년 연간`,
        subtitle: `발행 ${formatPublishedYmd(y.created_at)}`,
        preview,
        scoresLine: formatScoresLine(y),
        href: `/students/${id}/period/new?type=12m&end_ym=${encodeURIComponent(endYm)}&y_id=${encodeURIComponent(y.y_report_id)}`,
      });
    }

    rows.sort((a, b) => b.sortTs - a.sortTs);
    return rows;
  }, [reports, periodQuarters, periodHalves, periodYears, anchorYm, id, student]);

  if (!id) return <p className="text-sm text-red-600">잘못된 경로입니다.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/students" className="text-sm text-indigo-600 hover:text-indigo-800">
            ← {studentsSectionTitle(user?.login_id)}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {ls ? "불러오는 중…" : student ? student.student_nick : "학생 없음"}
          </h1>
          {student ? (
            <p className="text-sm text-slate-600">
              {formatSchoolGradeLabel(student.student_grade)} · 누적 월간 리포트 {student.total_reports_written}회
            </p>
          ) : null}
        </div>
      </div>

      {lr ? <p className="text-sm text-slate-500">월간 데이터 불러오는 중…</p> : null}

      {!student && !ls ? (
        <p className="text-sm text-slate-500">해당 학생을 찾을 수 없습니다.</p>
      ) : null}

      {student ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="relative z-0 border-b border-slate-100 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-slate-800">회차별 월간 리포트</h2>
            
          </div>

          <div className="overflow-x-auto px-2 pb-4 pt-2 sm:px-4">
            <table
              className="w-full min-w-max border-separate border-spacing-x-1 border-spacing-y-2 text-center"
              style={{ minWidth: `${rounds.length * 6.75}rem` }}
            >
              <thead>
                <tr>
                  {rounds.map((r) => {
                    const menuOpen = openReportMenuRound === r;
                    return (
                      <th
                        key={r}
                        scope="col"
                        className={`min-w-[6.75rem] max-w-[7rem] px-1 pb-1 align-bottom text-xs font-semibold ${
                          r === focusRound ? "text-indigo-800" : "text-slate-700"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <div
                            data-round-report-menu={r}
                            className="relative flex w-full flex-col items-center"
                          >
                            <button
                              type="button"
                              ref={(el) => {
                                if (el) reportMenuButtonRefs.current.set(r, el);
                                else reportMenuButtonRefs.current.delete(r);
                              }}
                              aria-expanded={menuOpen}
                              aria-haspopup="menu"
                              aria-label={`${r}회차 레포트 생성`}
                              onClick={() => {
                                setOpenViewMenuRound(null);
                                setOpenReportMenuRound((cur) => (cur === r ? null : r));
                              }}
                              className="inline-flex max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-indigo-600 text-[9px] font-semibold leading-tight text-white hover:bg-indigo-700"
                              style={{
                                paddingLeft: AI_REPORT_BTN_PAD_X_PX,
                                paddingRight: AI_REPORT_BTN_PAD_X_PX,
                                paddingTop: AI_REPORT_BTN_PAD_Y_PX,
                                paddingBottom: AI_REPORT_BTN_PAD_Y_PX,
                              }}
                            >
                              AI 레포트 생성
                            </button>
                          </div>
                          <span className="tabular-nums">{r}회</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {rounds.map((r) => {
                    const ym = yearMonthForRound(anchorYm, r);
                    return (
                      <th
                        key={`sub-${r}`}
                        className="min-w-[6.75rem] max-w-[7rem] px-1 pb-2 text-[10px] font-normal tabular-nums text-slate-500"
                      >
                        {ym}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {rounds.map((r) => {
                    const ym = yearMonthForRound(anchorYm, r);
                    const report = byYm.get(ym);
                    const hasMonthly = Boolean(report);
                    const hasQuarter =
                      r % 3 === 0 &&
                      periodQuarters.some((q) => q.quarter_end_ym === quarterEndYmForYearMonth(ym));
                    const halfKey = halfYearCodeForEndYm(ym);
                    const hasHalf = r % 6 === 0 && periodHalves.some((h) => h.half_year_code === halfKey);
                    const annualY = annualTargetYearForEndYm(ym);
                    const hasYear = r % 12 === 0 && periodYears.some((y) => y.target_year === annualY);
                    const bundle = computeRoundBundleLight({
                      ym,
                      r,
                      now,
                      hasMonthly,
                      hasQuarter,
                      hasHalf,
                      hasYear,
                    });
                    const label = bundleLabelKo(bundle);
                    const published =
                      hasMonthly && report ? formatPublishedYmd(report.created_at) : null;
                    const detailTitle =
                      published != null
                        ? `${r}회차 (${ym}) — ${label}, 월간 발행 ${published}`
                        : `${r}회차 (${ym}) — ${label}`;
                    return (
                      <td key={r} className="align-top">
                        <div className="flex min-h-[4.5rem] min-w-[6.75rem] max-w-[7rem] flex-col items-center justify-start gap-1 py-1">
                          <span
                            role="img"
                            aria-label={
                              published != null
                                ? `${r}회차 ${ym} ${label}, 월간 발행 ${published}`
                                : `${r}회차 ${ym} ${label}`
                            }
                            title={detailTitle}
                            className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${bundleLightClass(bundle)}`}
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <p className="text-xs font-medium text-slate-600">범례 (해당 회차 달·필수 레포트)</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              필수: 매달 월간 · 3의 배수 회차에 분기 · 6의 배수에 반기 · 12의 배수에 연간
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <span
                  className={`inline-block h-3 w-3 shrink-0 rounded-full ${bundleLightClass("empty")}`}
                />
                미래 달 / 기한 전·미시작
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={`inline-block h-3 w-3 shrink-0 rounded-full ${bundleLightClass("partial")}`}
                />
                필수 중 일부만 작성
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={`inline-block h-3 w-3 shrink-0 rounded-full ${bundleLightClass("done")}`}
                />
                필수 모두 작성
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={`inline-block h-3 w-3 shrink-0 rounded-full ${bundleLightClass("danger")}`}
                />
                해당 달 지남 · 미완성
              </li>
            </ul>
          </div>

          {openReportMenuRound !== null &&
            reportMenuPos &&
            id &&
            createPortal(
              (() => {
                const r = openReportMenuRound;
                const ym = yearMonthForRound(anchorYm, r);
                const q = `/students/${id}/period/new?type=3m&end_ym=${encodeURIComponent(ym)}`;
                const h = `/students/${id}/period/new?type=6m&end_ym=${encodeURIComponent(ym)}`;
                const y = `/students/${id}/period/new?type=12m&end_ym=${encodeURIComponent(ym)}`;
                const canQuarter = r % 3 === 0;
                const canSemi = r % 6 === 0;
                const canAnnual = r % 12 === 0;
                const onNav = () => setOpenReportMenuRound(null);
                const activeCls =
                  "rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 hover:bg-slate-50";
                const disabledCls =
                  "cursor-not-allowed rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-400";
                return (
                  <div
                    data-round-report-menu-portal
                    role="menu"
                    aria-orientation="vertical"
                    className="flex w-max min-w-[12.5rem] max-w-[min(100vw-2rem,18rem)] flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
                    style={{
                      position: "fixed",
                      left: reportMenuPos.left,
                      top: reportMenuPos.top,
                      transform: "translate(-50%, calc(-100% - 6px))",
                      zIndex: 100,
                    }}
                  >
                    <Link
                      role="menuitem"
                      to={`/students/${id}/monthly/new?ym=${encodeURIComponent(ym)}`}
                      onClick={onNav}
                      className={activeCls}
                    >
                      월간 레포트 생성하기
                    </Link>
                    {canQuarter ? (
                      <Link role="menuitem" to={q} onClick={onNav} className={activeCls}>
                        분기별 레포트 생성하기
                      </Link>
                    ) : (
                      <span role="menuitem" aria-disabled className={disabledCls}>
                        분기별 레포트 생성하기
                      </span>
                    )}
                    {canSemi ? (
                      <Link role="menuitem" to={h} onClick={onNav} className={activeCls}>
                        반기별 레포트 생성하기
                      </Link>
                    ) : (
                      <span role="menuitem" aria-disabled className={disabledCls}>
                        반기별 레포트 생성하기
                      </span>
                    )}
                    {canAnnual ? (
                      <Link role="menuitem" to={y} onClick={onNav} className={activeCls}>
                        연간 레포트 생성하기
                      </Link>
                    ) : (
                      <span role="menuitem" aria-disabled className={disabledCls}>
                        연간 레포트 생성하기
                      </span>
                    )}
                  </div>
                );
              })(),
              document.body,
            )}

          {openViewMenuRound !== null &&
            viewMenuPos &&
            id &&
            createPortal(
              (() => {
                const r = openViewMenuRound;
                const ym = yearMonthForRound(anchorYm, r);
                const quarterSaved =
                  r % 3 === 0 ? periodQuarters.find((q) => q.quarter_end_ym === quarterEndYmForYearMonth(ym)) : undefined;
                const halfKey = halfYearCodeForEndYm(ym);
                const halfSaved =
                  r % 6 === 0 ? periodHalves.find((h) => h.half_year_code === halfKey) : undefined;
                const annualY = annualTargetYearForEndYm(ym);
                const yearSaved =
                  r % 12 === 0 ? periodYears.find((y) => y.target_year === annualY) : undefined;
                const cellReport = byYm.get(ym);
                const hasMonthlyView = Boolean(cellReport);

                const onNav = () => setOpenViewMenuRound(null);
                const activeCls =
                  "rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 hover:bg-slate-50";
                return (
                  <div
                    data-round-view-report-menu-portal
                    role="menu"
                    aria-orientation="vertical"
                    className="flex w-max min-w-[12.5rem] max-w-[min(100vw-2rem,18rem)] flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5"
                    style={{
                      position: "fixed",
                      left: viewMenuPos.left,
                      top: viewMenuPos.top,
                      transform: "translate(-50%, calc(-100% - 6px))",
                      zIndex: 100,
                    }}
                  >
                    {hasMonthlyView ? (
                      <Link
                        role="menuitem"
                        to={`/students/${id}/monthly/new?ym=${encodeURIComponent(ym)}&step=6`}
                        onClick={onNav}
                        className={activeCls}
                      >
                        월간 레포트 보기
                      </Link>
                    ) : null}
                    {quarterSaved ? (
                      <Link
                        role="menuitem"
                        to={`/students/${id}/period/new?type=3m&end_ym=${encodeURIComponent(ym)}&q_id=${encodeURIComponent(quarterSaved.q_report_id)}`}
                        onClick={onNav}
                        className={activeCls}
                      >
                        분기별 레포트 보기
                      </Link>
                    ) : null}
                    {halfSaved ? (
                      <Link
                        role="menuitem"
                        to={`/students/${id}/period/new?type=6m&end_ym=${encodeURIComponent(ym)}&h_id=${encodeURIComponent(halfSaved.h_report_id)}`}
                        onClick={onNav}
                        className={activeCls}
                      >
                        반기별 레포트 보기
                      </Link>
                    ) : null}
                    {yearSaved ? (
                      <Link
                        role="menuitem"
                        to={`/students/${id}/period/new?type=12m&end_ym=${encodeURIComponent(ym)}&y_id=${encodeURIComponent(yearSaved.y_report_id)}`}
                        onClick={onNav}
                        className={activeCls}
                      >
                        연간 레포트 보기
                      </Link>
                    ) : null}
                  </div>
                );
              })(),
              document.body,
            )}

     

          <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
            <h3 className="text-sm font-semibold text-slate-800">회차별 5대 역량 점수</h3>
            
            {lr ? (
              <p className="mt-3 text-sm text-slate-500">점수 불러오는 중…</p>
            ) : roundPillarChartRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">회차 데이터를 표시할 수 없습니다.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {!hasAnyPillarChartPoint ? (
                  <p className="text-xs text-slate-600">
                    이 구간에는 월간 역량 점수가 없습니다. X축 회차(파란 밑줄)를 누르면 저장된 레포트 메뉴가 열립니다.
                  </p>
                ) : null}
                <div className="h-[min(22rem,70vw)] w-full min-h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={roundPillarChartRows} margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        height={56}
                        angle={-32}
                        textAnchor="end"
                        tick={renderPillarXAxisTick}
                      />
                      <YAxis
                        domain={[1, 10]}
                        ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        width={28}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                        }}
                        labelFormatter={(_, payload) => {
                          const row = (payload?.[0] as { payload?: { name?: string; ym?: string } } | undefined)
                            ?.payload;
                          return row?.ym ? `${row.name ?? ""} · ${row.ym}` : String(row?.name ?? "");
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      {PILLAR_KEYS.map((k) => (
                        <Line
                          key={k}
                          type="monotone"
                          dataKey={k}
                          name={pillarLabelsKo[k]}
                          stroke={PILLAR_LINE_COLORS[k]}
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 1, fill: PILLAR_LINE_COLORS[k] }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-slate-800">저장된 레포트 목록</h2>
            </div>
            {periodErr ? (
              <p className="px-4 py-3 text-sm text-red-600 sm:px-5">기간 레포트 불러오기: {periodErr}</p>
            ) : null}
            {lr || lpr ? (
              <p className="px-4 py-3 text-sm text-slate-500 sm:px-5">레포트 목록 불러오는 중…</p>
            ) : null}
            {!lr && !lpr && archiveRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500 sm:px-5">저장된 레포트가 없습니다.</p>
            ) : null}
            {!lr && !lpr && archiveRows.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {archiveRows.map((row) => {
                  const b = archiveKindBadge(row.kind);
                  return (
                    <li key={row.key} className="px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${b.className}`}
                          >
                            {b.label}
                          </span>
                          <h3 className="mt-2 text-sm font-semibold text-slate-900">{row.title}</h3>
                          <p className="mt-0.5 text-xs text-slate-500">{row.subtitle}</p>
                          {row.scoresLine ? (
                            <p className="mt-2 text-xs text-slate-600">{row.scoresLine}</p>
                          ) : null}
                          <p className="mt-2 text-sm leading-snug text-slate-700 line-clamp-4">{row.preview}</p>
                        </div>
                        {row.href ? (
                          <Link
                            to={row.href}
                            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-slate-50"
                          >
                            열기
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          
        </>
      ) : null}
    </div>
  );
}
