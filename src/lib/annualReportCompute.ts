import {
  PILLAR_KEYS,
  averagePillarOverMonths,
  parsePillarScores,
  type PillarKey,
} from "./reportAggregates";
import { reportsByYearMonth, yearMonthForRound } from "./reportRounds";
import type { MonthlyReport } from "./types/database";

export type AnnualMonthSlot = {
  /** 표 12칸 순서(1=가장 이른 달) */
  slotIndex: number;
  /** 달력 월(셀 제목용) */
  month: number;
  ym: string;
  report: MonthlyReport | null;
};

/** 등록월(anchor) 기준 1~12회차 각각의 YYYY-MM */
export function annualRoundYearMonths(anchorYm: string, roundCount = 12): string[] {
  const out: string[] = [];
  for (let r = 1; r <= roundCount; r++) {
    out.push(yearMonthForRound(anchorYm, r));
  }
  return out;
}

export function annualRoundRangeLabel(anchorYm: string, roundCount = 12): string {
  const months = annualRoundYearMonths(anchorYm, roundCount);
  const start = months[0] ?? anchorYm;
  const end = months[months.length - 1] ?? anchorYm;
  return `1~${roundCount}회차 (${start} ~ ${end})`;
}

/** 12회차(연간) = 등록 후 1~12회차 월간 리포트와 동일한 달 매칭 */
export function collectAnnualMonthlySlots(anchorYm: string, reports: MonthlyReport[]): AnnualMonthSlot[] {
  const byYm = reportsByYearMonth(reports);
  return annualRoundYearMonths(anchorYm, 12).map((ym, idx) => ({
    slotIndex: idx + 1,
    month: Number(ym.slice(5, 7)),
    ym,
    report: byYm.get(ym) ?? null,
  }));
}

export function annualReportsWithScores(slots: AnnualMonthSlot[]): MonthlyReport[] {
  return slots.map((s) => s.report).filter((r): r is MonthlyReport => Boolean(r?.competency_ratings));
}

export function computeAnnualAverages(slots: AnnualMonthSlot[]): Record<PillarKey, number> {
  return averagePillarOverMonths(annualReportsWithScores(slots));
}

export function averagesToStoredScores(avg: Record<PillarKey, number>): Record<PillarKey, number> {
  const out = {} as Record<PillarKey, number>;
  for (const k of PILLAR_KEYS) {
    const v = avg[k] ?? 0;
    out[k] = v > 0 ? Math.min(10, Math.max(1, Math.round(v))) : 1;
  }
  return out;
}

/** `y_reports` INSERT/UPDATE용 score_* 컬럼 */
export function pillarScoresToYReportColumns(scores: Record<PillarKey, number>): {
  score_reading: number;
  score_thinking: number;
  score_discussion: number;
  score_writing: number;
  score_growth: number;
} {
  return {
    score_reading: scores.reading,
    score_thinking: scores.thinking,
    score_discussion: scores.discussion,
    score_writing: scores.writing,
    score_growth: scores.growth,
  };
}

export type BookGenreBucket = "lit" | "non_lit";

/** `ai_category` → 문학 / 비문학 (미분류는 비문학으로 근사) */
export function classifyBookGenre(aiCategory: string | null | undefined): BookGenreBucket {
  const c = (aiCategory ?? "").trim();
  if (!c) return "non_lit";
  if (c.includes("비문학") || c.includes("정보") || c.includes("과학") || c.includes("사회")) return "non_lit";
  if (c.includes("문학") || c.includes("동화") || c.includes("소설") || c.includes("시") || c.includes("창작"))
    return "lit";
  return "non_lit";
}

export type AnnualBookStats = {
  total: number;
  litCount: number;
  nonLitCount: number;
  litRatio: number;
  nonLitRatio: number;
  bookIds: string[];
};

export function collectBookIdsFromSlots(slots: AnnualMonthSlot[]): string[] {
  const ids = new Set<string>();
  for (const slot of slots) {
    const r = slot.report;
    if (!r) continue;
    if (r.book_id) ids.add(r.book_id);
    if (r.book_id2) ids.add(r.book_id2);
  }
  return [...ids];
}

export function computeBookStatsFromCategories(
  bookIds: string[],
  categoriesById: Map<string, string | null>,
): AnnualBookStats {
  let litCount = 0;
  let nonLitCount = 0;
  for (const id of bookIds) {
    const bucket = classifyBookGenre(categoriesById.get(id));
    if (bucket === "lit") litCount += 1;
    else nonLitCount += 1;
  }
  const total = litCount + nonLitCount;
  const litRatio = total > 0 ? Math.round((litCount / total) * 100) : 0;
  const nonLitRatio = total > 0 ? 100 - litRatio : 0;
  return { total, litCount, nonLitCount, litRatio, nonLitRatio, bookIds };
}

/** AI 타임라인용 — 12칸 슬롯 전체(원문 없으면 빈 문자열) */
export type GrowthMomentMonthInput = {
  slotIndex: number;
  month: number;
  ym: string;
  sourceText: string;
};

export function growthMomentsAllMonthsForAi(slots: AnnualMonthSlot[]): GrowthMomentMonthInput[] {
  return slots.map((s) => ({
    slotIndex: s.slotIndex,
    month: s.month,
    ym: s.ym,
    sourceText: (s.report?.growth_moments ?? "").trim(),
  }));
}

/** 원문이 있는 달만 (건수 표시용) */
export function growthMomentsForAi(slots: AnnualMonthSlot[]): { month: number; text: string }[] {
  return growthMomentsAllMonthsForAi(slots)
    .filter((x) => x.sourceText.length > 0)
    .map((x) => ({ month: x.month, text: x.sourceText }));
}

export function countMonthsWithGrowthMoment(slots: AnnualMonthSlot[]): number {
  return growthMomentsForAi(slots).length;
}

export function allTwelveMonthsHaveGrowthMoment(slots: AnnualMonthSlot[]): boolean {
  return countMonthsWithGrowthMoment(slots) === 12;
}

export function pillarSummaryForAi(avg: Record<PillarKey, number>): string {
  return PILLAR_KEYS.map((k) => `${k}: ${(avg[k] ?? 0).toFixed(1)}`).join(", ");
}

export function monthScoresLine(report: MonthlyReport | null): string {
  if (!report) return "—";
  const s = parsePillarScores(report.competency_ratings);
  return PILLAR_KEYS.map((k) => `${k}=${s[k] ?? "—"}`).join(" ");
}
