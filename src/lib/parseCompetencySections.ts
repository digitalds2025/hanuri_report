import { competencyAnalysisToMReportComments } from "./competencyAnalysisSplit";

/** AI 역량 분석(마크다운 `## 강점` / `## 보완점` 또는 빈 줄 두 줄 문단 구분)에서 강점·보완 블록 추출 — 표시용 */
export function parseCompetencySections(raw: string): {
  strength: { label: string; text: string };
  weakness: { label: string; text: string };
} {
  const t = raw.trim();
  if (!t) {
    return {
      strength: { label: "[강점]", text: "역량 분석 내용이 없습니다." },
      weakness: { label: "[보완점]", text: "역량 분석 내용이 없습니다." },
    };
  }

  const reWeak = /\n##\s*보완점\s*\n/i;
  const splitIdx = t.search(reWeak);
  if (splitIdx !== -1) {
    const head = t
      .slice(0, splitIdx)
      .replace(/^##\s*강점\s*\n?/i, "")
      .trim();
    const tail = t
      .slice(splitIdx)
      .replace(/^\n##\s*보완점\s*\n?/i, "")
      .trim();

    return {
      strength: { label: "[강점]", text: head || t },
      weakness: { label: "[보완점]", text: tail || "(내용 없음)" },
    };
  }

  const withoutLeadingStrengthHeader = t.replace(/^##\s*강점\s*\n?/i, "").trim() || t;
  const { strength_cmt, weakness_cmt } = competencyAnalysisToMReportComments(withoutLeadingStrengthHeader);

  if (weakness_cmt) {
    return {
      strength: { label: "[강점]", text: strength_cmt || withoutLeadingStrengthHeader },
      weakness: { label: "[보완점]", text: weakness_cmt },
    };
  }

  return {
    strength: { label: "[강점]", text: strength_cmt || withoutLeadingStrengthHeader },
    weakness: { label: "[보완점]", text: "(내용 없음)" },
  };
}
