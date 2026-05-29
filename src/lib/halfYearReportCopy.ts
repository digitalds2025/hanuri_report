/** 집중 성취·향후 강화 게이지 설명 최대 글자 수 */
export const HALF_YEAR_GAUGE_DESC_MAX_CHARS = 100;

/** 우리 아이 독서 유형 본문 최대 글자 수 */
export const HALF_YEAR_READING_TYPE_DESC_MAX_CHARS = 120;

export function clampHalfYearGaugeDesc(text: string): string {
  const t = text.trim();
  if (t.length <= HALF_YEAR_GAUGE_DESC_MAX_CHARS) return t;
  return t.slice(0, HALF_YEAR_GAUGE_DESC_MAX_CHARS);
}

export function clampHalfYearReadingTypeDesc(text: string): string {
  const t = text.replace(/\s*\n\s*/g, " ").trim();
  if (t.length <= HALF_YEAR_READING_TYPE_DESC_MAX_CHARS) return t;
  return t.slice(0, HALF_YEAR_READING_TYPE_DESC_MAX_CHARS);
}
