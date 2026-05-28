import type { MonthlyReport, PeriodType } from "./types/database";

export type RoundCellStatus = "done" | "pending" | "overdue";

function parseYearMonth(ym: string): { y: number; m: number } {
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return { y: 1970, m: 1 };
  return { y, m };
}

function monthIndex(ym: string): number {
  const { y, m } = parseYearMonth(ym);
  return y * 12 + (m - 1);
}

/** 학생 등록일이 속한 달 → YYYY-MM (로컬 타임존) */
export function enrollmentYearMonth(createdAtIso: string): string {
  const d = new Date(createdAtIso);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function currentYearMonth(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** anchor(YYYY-MM)에서 n개월 뒤의 달 (n 음수 가능) */
export function addMonthsToYearMonth(anchorYm: string, monthsToAdd: number): string {
  const { y, m } = parseYearMonth(anchorYm);
  const d = new Date(y, m - 1 + monthsToAdd, 1);
  const ny = d.getFullYear();
  const nm = d.getMonth() + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** 해당 월의 마지막 일 이후(다음 달 1일 0시)부터를 '기한 경과'로 본다. */
export function isMonthDeadlinePassed(roundYm: string, now: Date = new Date()): boolean {
  const { y, m } = parseYearMonth(roundYm);
  const nextStart = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1);
  return now.getTime() >= nextStart.getTime();
}

/** 등록월 ~ 현재월까지 포함한 회차 수 (최소 1) */
export function roundsElapsedThroughNow(anchorYm: string, now: Date = new Date()): number {
  const nowYm = currentYearMonth(now);
  return Math.max(1, monthIndex(nowYm) - monthIndex(anchorYm) + 1);
}

/**
 * 이번 달 회차를 첫 열로 두고, 그 오른쪽에 보여 줄 ''앞으로'' 회차 수.
 * (현재 달 1칸 + 이 값 11 = 총 12칸이 오늘 기준으로 우측 스트립)
 */
export const ROUNDS_AFTER_CURRENT_MONTH = 11;

/**
 * 표시할 회차 열 개수:
 * - 최소 12 (신규 학생)
 * - 이번 달까지의 경과 회차 + {@link ROUNDS_AFTER_CURRENT_MONTH} 만큼 미래 열까지 포함
 *   (예: 오늘이 17회차면 17~28회까지 열이 생김. 1~16회는 왼쪽 스크롤)
 */
export function visibleRoundCount(anchorYm: string, now: Date = new Date()): number {
  const elapsed = roundsElapsedThroughNow(anchorYm, now);
  return Math.max(12, elapsed + ROUNDS_AFTER_CURRENT_MONTH);
}

/** 상세 테이블에서 오늘 회차 양옆으로 붙일 회차 수(한쪽). 총 열 = {@link ROUND_TABLE_WINDOW_COLUMNS} */
export const ROUND_TABLE_HALF_SPAN = 6;
export const ROUND_TABLE_WINDOW_COLUMNS = ROUND_TABLE_HALF_SPAN * 2 + 1;

/**
 * 오늘 회차(`focusRound`)를 최대한 가운데에 두는 닫힌 구간 [start, end].
 * `totalRounds`는 전체 회차 수(예: {@link visibleRoundCount} 결과).
 */
export function roundTableWindowBounds(
  focusRound: number,
  totalRounds: number,
  halfSpan: number = ROUND_TABLE_HALF_SPAN,
): { start: number; end: number } {
  const span = halfSpan * 2 + 1;
  if (totalRounds <= span) {
    return { start: 1, end: totalRounds };
  }
  const start = Math.min(
    Math.max(focusRound - halfSpan, 1),
    Math.max(1, totalRounds - span + 1),
  );
  const end = start + span - 1;
  return { start, end };
}

export function yearMonthForRound(anchorYm: string, round: number): string {
  return addMonthsToYearMonth(anchorYm, round - 1);
}

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** YYYY-MM 달의 첫날 (로컬) */
export function firstDayOfYearMonthLocal(ym: string): string {
  const { y, m } = parseYearMonth(ym);
  return formatYmdLocal(new Date(y, m - 1, 1));
}

/** YYYY-MM 달의 마지막 날 (로컬) */
export function lastDayOfYearMonthLocal(ym: string): string {
  const { y, m } = parseYearMonth(ym);
  return formatYmdLocal(new Date(y, m, 0));
}

export function periodTypeMonthCount(type: PeriodType): number {
  if (type === "3m") return 3;
  if (type === "6m") return 6;
  return 12;
}

/** endYm 달을 마지막 달로 포함하는 기간 리포트용 시작일·종료일 (로컬 YYYY-MM-DD) */
export function dateRangeForPeriodEndingInMonth(
  endYm: string,
  type: PeriodType,
): { start: string; end: string } {
  const n = periodTypeMonthCount(type);
  const startYm = addMonthsToYearMonth(endYm, -(n - 1));
  return {
    start: firstDayOfYearMonthLocal(startYm),
    end: lastDayOfYearMonthLocal(endYm),
  };
}

export function roundCellStatus(input: {
  roundYm: string;
  hasReport: boolean;
  now?: Date;
}): RoundCellStatus {
  if (input.hasReport) return "done";
  const now = input.now ?? new Date();
  if (isMonthDeadlinePassed(input.roundYm, now)) return "overdue";
  return "pending";
}

export function reportsByYearMonth(reports: MonthlyReport[]): Map<string, MonthlyReport> {
  const m = new Map<string, MonthlyReport>();
  for (const r of reports) {
    const ym = r.year_month;
    if (!ym) continue;
    const prev = m.get(ym);
    if (!prev) {
      m.set(ym, r);
      continue;
    }
    const prevGm = (prev.growth_moments ?? "").trim();
    const nextGm = (r.growth_moments ?? "").trim();
    if (!prevGm && nextGm) {
      m.set(ym, r);
      continue;
    }
    if (prevGm && !nextGm) continue;
    if (r.created_at >= prev.created_at) m.set(ym, r);
  }
  return m;
}

/** 등록월(1회) 기준으로 해당 YYYY-MM이 몇 회차인지 */
export function roundForYearMonth(anchorYm: string, yearMonth: string): number {
  return monthIndex(yearMonth) - monthIndex(anchorYm) + 1;
}

/**
 * `endYm`(YYYY-MM) 달의 마지막 날이 속하는 분기 키 — 예: 2025-12 → `2025-4Q`.
 * DB `q_reports.quarter_end_ym`과 함께 쓰면 동일 분기를 가리킵니다.
 */
export function quarterYearKeyForEndYm(endYm: string): string {
  const end = lastDayOfYearMonthLocal(endYm);
  const d = new Date(`${end}T12:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const q = Math.ceil(m / 3);
  return `${y}-${q}Q`;
}

/** `endYm` 달의 마지막 날 기준 반기 코드 — DB `half_year_code` 와 동일 (예: 2025-12 → `2025-H2`). */
export function halfYearCodeForEndYm(endYm: string): string {
  const end = lastDayOfYearMonthLocal(endYm);
  const d = new Date(`${end}T12:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-H${m <= 6 ? 1 : 2}`;
}

/** `endYm` 달의 마지막 날이 속한 연도 — DB `y_reports.target_year` 와 동일. */
export function annualTargetYearForEndYm(endYm: string): number {
  const end = lastDayOfYearMonthLocal(endYm);
  return new Date(`${end}T12:00:00`).getFullYear();
}

/** 임의의 `YYYY-MM`이 속한 분기의 **마지막 달** `YYYY-MM` (저장·매칭용). */
export function quarterEndYmForYearMonth(ym: string): string {
  const t = ym.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(t);
  if (!m) return t;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const q = Math.ceil(mo / 3);
  const endMo = q * 3;
  return `${y}-${String(endMo).padStart(2, "0")}`;
}

/**
 * 회차 달 `roundYm`과 같은 달력 분기의 `q_reports` 행을 찾는다.
 * `quarter_end_ym`이 분기 마지막 달이 아니라 마법사에서 연 `end_ym`(분기 내 아무 달)으로 저장된 경우에도 맞춘다.
 */
export function findQuarterReportForYearMonth<T extends { quarter_end_ym: string }>(
  quarters: T[],
  roundYm: string,
): T | undefined {
  const key = quarterYearKeyForEndYm(roundYm);
  return quarters.find((q) => quarterYearKeyForEndYm(q.quarter_end_ym) === key);
}

/** 레거시 분기 키 `YYYY-nQ` → 그 분기가 끝나는 달 `YYYY-MM`. */
export function endYmForQuarterYearKey(quarterYear: string): string | null {
  const m = /^(\d{4})-([1-4])Q$/.exec(quarterYear.trim());
  if (!m) return null;
  const y = m[1]!;
  const q = Number(m[2]);
  const mo = q * 3;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** DB `half_year_code`(예: `2025-H1`) → 그 반기가 끝나는 달 `YYYY-MM`. */
export function endYmForHalfYearCode(halfYearCode: string): string | null {
  const m = /^(\d{4})-H([12])$/.exec(halfYearCode.trim());
  if (!m) return null;
  const y = m[1]!;
  const mo = m[2] === "1" ? 6 : 12;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** DB `y_reports.target_year` → 연간 리포트가 끝나는 달로 쓰는 `YYYY-MM`(12월). */
export function endYmForAnnualTargetYear(targetYear: number): string {
  return `${targetYear}-12`;
}
