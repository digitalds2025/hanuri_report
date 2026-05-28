import type { Json } from "./types/database";

/** `y_reports.annual_timeline` 구조 */
export type AnnualTimelineData = {
  months: Record<string, string>;
  outlook?: string;
};

export function parseAnnualTimeline(raw: Json | null | undefined): AnnualTimelineData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { months: {} };
  }
  const o = raw as Record<string, unknown>;
  const monthsRaw = o.months;
  const months: Record<string, string> = {};
  if (monthsRaw && typeof monthsRaw === "object" && !Array.isArray(monthsRaw)) {
    for (const [k, v] of Object.entries(monthsRaw as Record<string, unknown>)) {
      if (typeof v === "string") months[k] = v.trim();
    }
  }
  const outlook = typeof o.outlook === "string" ? o.outlook.trim() : "";
  return { months, outlook: outlook || undefined };
}

export function annualTimelineToJson(data: AnnualTimelineData): Json {
  return {
    months: data.months,
    ...(data.outlook ? { outlook: data.outlook } : {}),
  } as Json;
}

export function monthKey(m: number): string {
  return String(m);
}

export function monthLabelKo(m: number): string {
  return `${m}월`;
}

/** 연간 타임라인 표 제목 — 1회차, 2회차 … */
export function roundLabelKo(round: number): string {
  return `${round}회차`;
}

export type TimelineSlotDisplay = {
  slotIndex: number;
  ym: string;
  month: number;
  summary: string;
};

export function buildTimelineSlotDisplay(
  slots: { slotIndex: number; month: number; ym: string }[],
  summaries: Record<number, string>,
): TimelineSlotDisplay[] {
  return slots.map((s) => ({
    slotIndex: s.slotIndex,
    ym: s.ym,
    month: s.month,
    summary: summaries[s.slotIndex] ?? "",
  }));
}
