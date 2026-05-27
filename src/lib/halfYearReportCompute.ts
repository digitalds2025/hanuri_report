import {
  PILLAR_KEYS,
  averagePillarOverMonths,
  parsePillarScores,
  type PillarKey,
} from "./reportAggregates";
import { addMonthsToYearMonth, reportsByYearMonth, roundForYearMonth } from "./reportRounds";
import type { MonthlyReport } from "./types/database";

export type HalfYearMonthSlot = {
  ym: string;
  round: number;
  report: MonthlyReport | null;
};

/** 반기 마지막 달 포함 이전 5개월 → 총 6개 YYYY-MM (오래된 순) */
export function halfYearMonthYearMonths(endYm: string): string[] {
  const out: string[] = [];
  for (let i = 5; i >= 0; i--) {
    out.push(addMonthsToYearMonth(endYm, -i));
  }
  return out;
}

export function collectHalfYearMonthlySlots(
  anchorYm: string,
  endYm: string,
  reports: MonthlyReport[],
): HalfYearMonthSlot[] {
  const byYm = reportsByYearMonth(reports);
  return halfYearMonthYearMonths(endYm).map((ym) => ({
    ym,
    round: roundForYearMonth(anchorYm, ym),
    report: byYm.get(ym) ?? null,
  }));
}

export function halfYearReportsWithScores(slots: HalfYearMonthSlot[]): MonthlyReport[] {
  return slots.map((s) => s.report).filter((r): r is MonthlyReport => Boolean(r?.competency_ratings));
}

export function computeHalfYearAverages(slots: HalfYearMonthSlot[]): Record<PillarKey, number> {
  const rows = halfYearReportsWithScores(slots);
  return averagePillarOverMonths(rows);
}

export function averagesToStoredScores(avg: Record<PillarKey, number>): Record<PillarKey, number> {
  const out = {} as Record<PillarKey, number>;
  for (const k of PILLAR_KEYS) {
    const v = avg[k] ?? 0;
    out[k] = v > 0 ? Math.min(10, Math.max(1, Math.round(v))) : 1;
  }
  return out;
}

export function pickGaugePillars(avg: Record<PillarKey, number>): {
  high: PillarKey;
  low: PillarKey;
} {
  let high: PillarKey = "reading";
  let low: PillarKey = "growth";
  let max = -1;
  let min = 11;
  for (const k of PILLAR_KEYS) {
    const v = avg[k] ?? 0;
    if (v > max || (v === max && PILLAR_KEYS.indexOf(k) < PILLAR_KEYS.indexOf(high))) {
      max = v;
      high = k;
    }
    if (v < min || (v === min && PILLAR_KEYS.indexOf(k) > PILLAR_KEYS.indexOf(low))) {
      min = v;
      low = k;
    }
  }
  if (high === low) {
    const ranked = [...PILLAR_KEYS].sort((a, b) => (avg[b] ?? 0) - (avg[a] ?? 0));
    high = ranked[0] ?? "reading";
    low = ranked[ranked.length - 1] ?? "growth";
  }
  return { high, low };
}

/** 월별 추이 — 전반 3개월 vs 후반 3개월 평균 비교용 */
export function halfYearTrendByPillar(slots: HalfYearMonthSlot[]): Record<
  PillarKey,
  { early: number; late: number }
> {
  const earlySlots = slots.slice(0, 3);
  const lateSlots = slots.slice(3, 6);
  const earlyAvg = computeHalfYearAverages(earlySlots);
  const lateAvg = computeHalfYearAverages(lateSlots);
  const out = {} as Record<PillarKey, { early: number; late: number }>;
  for (const k of PILLAR_KEYS) {
    out[k] = { early: earlyAvg[k] ?? 0, late: lateAvg[k] ?? 0 };
  }
  return out;
}

export function monthScoresForSlot(report: MonthlyReport | null): PillarScoresView | null {
  if (!report) return null;
  return parsePillarScores(report.competency_ratings);
}

export type PillarScoresView = Partial<Record<PillarKey, number>>;
