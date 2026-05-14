/**
 * 저장·편집용: 강점/보완 문단을 하나의 역량 분석 문자열로 합칩니다(빈 줄 두 줄 구분).
 */
export function joinCompetencyMReportComments(strength: string, weakness: string): string {
  const a = strength.trim();
  const b = weakness.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}

/**
 * 「관찰 기반 역량 종합 분석」본문(주로 2문단)을 m_reports.strength_cmt / weakness_cmt 로 나눕니다.
 * 첫 번째 빈 줄 구간까지 → 강점, 그 이후 전체 → 보완.
 */
export function competencyAnalysisToMReportComments(analysis: string): {
  strength_cmt: string | null;
  weakness_cmt: string | null;
} {
  const t = analysis.trim();
  if (!t) return { strength_cmt: null, weakness_cmt: null };
  const parts = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { strength_cmt: null, weakness_cmt: null };
  if (parts.length === 1) return { strength_cmt: parts[0]!, weakness_cmt: null };
  const weakness = parts.slice(1).join("\n\n").trim();
  return {
    strength_cmt: parts[0]!,
    weakness_cmt: weakness || null,
  };
}
