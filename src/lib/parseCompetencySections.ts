import { splitCompetencyAnalysis } from "./competencyAnalysisSplit";

/** AI 역량 분석에서 강점·보완 블록 추출 — 표시용 */
export function parseCompetencySections(raw: string): {
  strength: { label: string; text: string };
  weakness: { label: string; text: string };
} {
  const { strength, weakness } = splitCompetencyAnalysis(raw);

  if (!strength.trim() && !weakness?.trim()) {
    return {
      strength: { label: "[강점]", text: "역량 분석 내용이 없습니다." },
      weakness: { label: "[보완점]", text: "역량 분석 내용이 없습니다." },
    };
  }

  return {
    strength: { label: "[강점]", text: strength.trim() || "역량 분석 내용이 없습니다." },
    weakness: {
      label: "[보완점]",
      text: weakness?.trim() || "(내용 없음)",
    },
  };
}
