import type { Json } from "./types/database";

/** m_reports 5대 역량 (1~10점) — 레이더·평균용 */
export const PILLAR_KEYS = ["reading", "thinking", "discussion", "writing", "growth"] as const;

export type PillarKey = (typeof PILLAR_KEYS)[number];

export type PillarScores = Partial<Record<PillarKey, number>>;

export const pillarLabelsKo: Record<PillarKey, string> = {
  reading: "독서 몰입·이해",
  thinking: "논리적 사고",
  discussion: "언어·토론 태도",
  writing: "글쓰기 완성도",
  growth: "학습 의지·참여",
};

/** competency_ratings JSON (신 5키 또는 구 6키) → 1~10 스케일로 정규화 */
export function parsePillarScores(raw: Json): PillarScores {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: PillarScores = {};

  const get = (k: string): number | undefined => {
    const v = o[k];
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };

  /** 구 스키마 1~5 별점 → 1~10 근사 */
  const toTen = (v: number) => {
    if (v >= 1 && v <= 5) return Math.min(10, Math.max(1, v * 2));
    return Math.min(10, Math.max(1, Math.round(v)));
  };

  const r = get("reading");
  const t = get("thinking");
  const d = get("discussion") ?? get("expression");
  const w = get("writing");
  const g = get("growth") ?? get("attitude") ?? get("collaboration");

  if (r !== undefined) out.reading = toTen(r);
  if (t !== undefined) out.thinking = toTen(t);
  if (d !== undefined) out.discussion = toTen(d);
  if (w !== undefined) out.writing = toTen(w);
  if (g !== undefined) out.growth = toTen(g);

  return out;
}

export function pillarScoresToJson(scores: Record<PillarKey, number>): Json {
  return scores as unknown as Json;
}

/** 여러 월간 행의 competency_ratings(또는 동일 구조) 평균 */
export function averagePillarOverMonths(rows: { competency_ratings: Json }[]): Record<PillarKey, number> {
  const sums: Record<PillarKey, number> = {
    reading: 0,
    thinking: 0,
    discussion: 0,
    writing: 0,
    growth: 0,
  };
  const counts: Record<PillarKey, number> = { ...sums };

  for (const row of rows) {
    const scores = parsePillarScores(row.competency_ratings);
    for (const k of PILLAR_KEYS) {
      const v = scores[k];
      if (typeof v === "number") {
        sums[k] += v;
        counts[k] += 1;
      }
    }
  }

  const result = {} as Record<PillarKey, number>;
  for (const k of PILLAR_KEYS) {
    result[k] = counts[k] ? Math.round((sums[k] / counts[k]) * 10) / 10 : 0;
  }
  return result;
}
