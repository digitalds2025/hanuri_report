import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  endYmForHalfYearCode,
  findQuarterReportForYearMonth,
  halfYearCodeForEndYm,
  reportsByYearMonth,
  currentYearMonth,
  isMonthDeadlinePassed,

  roundsElapsedThroughNow,
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

/** 회차별 5대 역량 꺾은선 — 항목별 색 */
const PILLAR_LINE_COLORS: Record<PillarKey, string> = {
  reading: "#2563eb",
  thinking: "#7c3aed",
  discussion: "#d97706",
  writing: "#059669",
  growth: "#e11d48",
};

export function StudentDetailPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const { students, loading: ls } = useStudents();
  const { reports, loading: lr } = useMonthlyReports(id);
  const {
    quarters: periodQuarters,
    halves: periodHalves,
    years: periodYears,
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
  const roundTableScrollRef = useRef<HTMLDivElement>(null);

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

  /** 1회차 ~ (현재+미래 버퍼) 전체 — 과거는 스크롤로, 미래는 시그널만 */
  const rounds = useMemo(
    () => (student ? Array.from({ length: roundCount }, (_, i) => i + 1) : []),
    [student, roundCount],
  );

  const pillarChartWidthPx = useMemo(() => Math.max(360, rounds.length * 52), [rounds.length]);

  useLayoutEffect(() => {
    const scroller = roundTableScrollRef.current;
    if (!scroller || focusRound < 1) return;
    const col = scroller.querySelector<HTMLElement>(`[data-round-col="${focusRound}"]`);
    col?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [focusRound, roundCount, anchorYm, student?.student_id]);

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
        r % 3 === 0 ? findQuarterReportForYearMonth(periodQuarters, ym) : undefined;
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
          <title>{`${row.name} (${row.ym}) — 클릭하면 레포트 보기 메뉴`}</title>
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
            <p className="mt-1 text-xs text-slate-500">
              1회차부터 전체 회차가 표시됩니다. 왼쪽으로 스크롤하면 과거 회차·레포트를 볼 수 있고, 오늘 회차
              근처로는 처음에 자동으로 맞춰 둡니다.
            </p>
            {periodErr ? (
              <p className="mt-2 text-xs text-red-600">기간(분기·반기·연간) 레포트 불러오기: {periodErr}</p>
            ) : null}
          </div>

          <div ref={roundTableScrollRef} className="overflow-x-auto px-2 pb-4 pt-2 sm:px-4">
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
                        data-round-col={r}
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
                    const hasQuarter = r % 3 === 0 && Boolean(findQuarterReportForYearMonth(periodQuarters, ym));
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
            <p className="text-xs font-medium text-slate-600">시그널 설명</p>
            
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
                const quarterSaved = r % 3 === 0 ? findQuarterReportForYearMonth(periodQuarters, ym) : undefined;
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
                        to={`/students/${id}/period/new?type=3m&end_ym=${encodeURIComponent(quarterSaved.quarter_end_ym)}&q_id=${encodeURIComponent(quarterSaved.q_report_id)}`}
                        onClick={onNav}
                        className={activeCls}
                      >
                        분기별 레포트 보기
                      </Link>
                    ) : null}
                    {halfSaved ? (
                      <Link
                        role="menuitem"
                        to={`/students/${id}/period/new?type=6m&end_ym=${encodeURIComponent(endYmForHalfYearCode(halfSaved.half_year_code) ?? ym)}&h_id=${encodeURIComponent(halfSaved.h_report_id)}`}
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
            <p className="mt-1 text-xs text-slate-500">
              저장된 월간 레포트 역량 점수를 1회차부터 표시합니다. 회차가 많으면 가로 스크롤하세요.
            </p>

            {lr ? (
              <p className="mt-3 text-sm text-slate-500">점수 불러오는 중…</p>
            ) : roundPillarChartRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">회차 데이터를 표시할 수 없습니다.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {!hasAnyPillarChartPoint ? (
                  <p className="text-xs text-slate-600">
                    아직 월간 역량 점수가 없습니다. X축 회차(파란 밑줄)를 누르면 저장된 레포트 보기 메뉴가 열립니다.
                  </p>
                ) : null}
                <div className="mt-2 overflow-x-auto">
                  <div
                    className="min-h-[240px]"
                    style={{ width: pillarChartWidthPx, height: "min(22rem, 70vw)" }}
                  >
                    <LineChart
                      width={pillarChartWidthPx}
                      height={280}
                      data={roundPillarChartRows}
                      margin={{ top: 8, right: 8, left: 0, bottom: 12 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        interval={rounds.length > 16 ? 1 : 0}
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
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        </>
      ) : null}
    </div>
  );
}
