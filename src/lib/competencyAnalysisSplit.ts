/**
 * 관찰 기반 역량 종합 분석 → 강점·보완 문단 분리 (저장·표시 공통)
 */

/** 보완 문단이 시작되는 전환 표현 (문장 경계 뒤) */
const WEAKNESS_TRANSITION_SPLIT =
  /(?<=[.!?…]["'」』)\]]?\s+)(?=(?:한편|반면|다만|그러나|아쉽게도|반대로|한편으로|다만,)(?:[,，]|\s))/u;

const MARKER_STRENGTH = /\[강점\]\s*/i;
const MARKER_WEAKNESS = /\[보완점\]\s*/i;

function stripLeadingStrengthHeader(text: string): string {
  return text.replace(/^##\s*강점\s*\n?/i, "").trim();
}

/** [강점] … [보완점] … 또는 ## 보완점 구분 */
function tryMarkerSplit(raw: string): { strength: string; weakness: string } | null {
  const t = raw.trim();
  if (!t) return null;

  const bracketWeakIdx = t.search(MARKER_WEAKNESS);
  if (bracketWeakIdx !== -1) {
    const head = t.slice(0, bracketWeakIdx).replace(MARKER_STRENGTH, "").trim();
    const tail = t.slice(bracketWeakIdx).replace(MARKER_WEAKNESS, "").trim();
    if (head && tail) return { strength: head, weakness: tail };
  }

  const mdWeak = /\n##\s*보완점\s*\n/i;
  const mdIdx = t.search(mdWeak);
  if (mdIdx !== -1) {
    const head = stripLeadingStrengthHeader(t.slice(0, mdIdx));
    const tail = t
      .slice(mdIdx)
      .replace(/^\n##\s*보완점\s*\n?/i, "")
      .trim();
    if (head && tail) return { strength: head, weakness: tail };
  }

  return null;
}

/** 빈 줄(2줄 이상) 문단 구분 */
function tryParagraphSplit(raw: string): { strength: string; weakness: string } | null {
  const parts = raw
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return {
    strength: parts[0]!,
    weakness: parts.slice(1).join("\n\n").trim(),
  };
}

function trimWeaknessLead(text: string): string {
  return text
    .replace(/^(?:한편|반면|다만|그러나|아쉽게도|반대로|한편으로)\s*[,，]?\s*/u, "")
    .trim();
}

/** 한 문단 안에서 「한편,」「반면,」 등으로 보완 구간 분리 */
function tryTransitionSplit(raw: string): { strength: string; weakness: string } | null {
  const t = raw.trim();
  const m = WEAKNESS_TRANSITION_SPLIT.exec(t);
  if (!m || m.index === undefined || m.index < 24) return null;
  const strength = t.slice(0, m.index).trim();
  const weakness = trimWeaknessLead(t.slice(m.index));
  if (!strength || !weakness || weakness.length < 20) return null;
  return { strength, weakness };
}

/**
 * 역량 분석 본문 → 강점·보완 텍스트 (표시·편집용)
 */
export function splitCompetencyAnalysis(analysis: string): {
  strength: string;
  weakness: string | null;
} {
  const t = analysis.trim();
  if (!t) return { strength: "", weakness: null };

  const fromMarkers = tryMarkerSplit(t);
  if (fromMarkers) return { strength: fromMarkers.strength, weakness: fromMarkers.weakness };

  const fromParagraphs = tryParagraphSplit(stripLeadingStrengthHeader(t));
  if (fromParagraphs) return { strength: fromParagraphs.strength, weakness: fromParagraphs.weakness };

  const fromTransition = tryTransitionSplit(stripLeadingStrengthHeader(t));
  if (fromTransition) return { strength: fromTransition.strength, weakness: fromTransition.weakness };

  return { strength: stripLeadingStrengthHeader(t) || t, weakness: null };
}

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
 * 「관찰 기반 역량 종합 분석」본문을 m_reports.strength_cmt / weakness_cmt 로 나눕니다.
 */
export function competencyAnalysisToMReportComments(analysis: string): {
  strength_cmt: string | null;
  weakness_cmt: string | null;
} {
  const { strength, weakness } = splitCompetencyAnalysis(analysis);
  if (!strength && !weakness) return { strength_cmt: null, weakness_cmt: null };
  if (!weakness) return { strength_cmt: strength || null, weakness_cmt: null };
  return {
    strength_cmt: strength || null,
    weakness_cmt: weakness,
  };
}
