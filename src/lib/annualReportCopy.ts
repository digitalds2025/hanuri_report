/** 연간 「선생님의 따뜻한 한마디」 통합 본문(AI) 최대 글자 수 */
export const ANNUAL_WARM_SECTION_MAX_CHARS = 300;

/** 연간 타임라인 표 아래 전망 코멘트 최대 글자 수 */
export const ANNUAL_OUTLOOK_MAX_CHARS = 120;

export function clampAnnualWarmSection(text: string): string {
  const t = text.replace(/\s*\n\s*/g, " ").trim();
  if (t.length <= ANNUAL_WARM_SECTION_MAX_CHARS) return t;
  return t.slice(0, ANNUAL_WARM_SECTION_MAX_CHARS);
}

/** AI 본문 — 「학부모님께」 등 편지식 서두 제거 */
export function sanitizeAnnualWarmSectionOpener(text: string): string {
  let t = text.trim();
  const openers = [
    /^학부모\s*님께[,，]?\s*/i,
    /^학부모\s*여러분께[,，]?\s*/i,
    /^보호자\s*님께[,，]?\s*/i,
    /^Dear\s+parents[,，]?\s*/i,
  ];
  for (const re of openers) {
    t = t.replace(re, "");
  }
  return t.trim();
}

export function finalizeAnnualWarmSectionAiText(text: string): string {
  return clampAnnualWarmSection(sanitizeAnnualWarmSectionOpener(text));
}

export function clampAnnualOutlook(text: string): string {
  const t = text.replace(/\s*\n\s*/g, " ").trim();
  if (t.length <= ANNUAL_OUTLOOK_MAX_CHARS) return t;
  return t.slice(0, ANNUAL_OUTLOOK_MAX_CHARS);
}

/** 월별 한 줄 — 「~를 독서 후」 등 접속 표현 제거 */
export function sanitizeAnnualTimelineMonthSummary(text: string): string {
  let t = text.trim();
  if (!t) return "";

  const patterns: RegExp[] = [
    /(?:을|를)\s*독서\s*(?:하고|한)?\s*/gi,
    /(?:을|를)\s*독서\s*(?:한\s*)?후\s*[,.]?\s*/gi,
    /독서\s*(?:한\s*)?후\s*[,.]?\s*/gi,
    /(?:을|를)\s*읽고\s*/gi,
    /(?:을|를)\s*읽은\s*(?:후\s*)?[,.]?\s*/gi,
    /읽은\s*후\s*[,.]?\s*/gi,
    /^독서(?:를|과)?\s+/i,
    /^책을\s+/i,
  ];

  for (const re of patterns) {
    t = t.replace(re, "");
  }

  return t.replace(/\s{2,}/g, " ").replace(/^[,.]\s*/, "").trim();
}
