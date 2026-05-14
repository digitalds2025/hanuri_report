import { PILLAR_KEYS, pillarLabelsKo, type PillarKey } from "./reportAggregates";

/** 코멘트만으로 동점(역량 점수 동률)을 가늠할 때 사용하는 단순 극성 점수 */
function commentPolarity(cmt: string): number {
  const t = cmt.trim();
  if (!t) return 0;
  const pos = (t.match(/좋|훌륭|성장|뛰어난|적극|잘함|탁월|우수|늘었|긍정|발전|성숙|자신|참 잘|훌륭해/g) ?? []).length;
  const neg = (t.match(/부족|아쉬|개선|주의|어려|힘들|미흡|집중|보완|더 필요|연습|낮|약해/g) ?? []).length;
  return pos - neg + t.length * 1e-6;
}

function pickAmong(
  keys: PillarKey[],
  comments: Record<PillarKey, string>,
  mode: "maxPolarity" | "minPolarity",
): PillarKey {
  const scored = keys.map((k) => ({ k, p: commentPolarity(comments[k] ?? "") }));
  scored.sort((a, b) => (mode === "maxPolarity" ? b.p - a.p : a.p - b.p));
  const best = scored[0]?.p ?? 0;
  const tier = scored.filter((x) => x.p === best).map((x) => x.k);
  const ix = (k: PillarKey) => PILLAR_KEYS.indexOf(k);
  tier.sort((a, b) => (mode === "maxPolarity" ? ix(a) - ix(b) : ix(b) - ix(a)));
  return tier[0] ?? keys[0]!;
}

/**
 * 역량별 점수가 최고인 영역 1개(강점), 최저인 영역 1개(보완점)를 고릅니다.
 * 동률이면 교사 코멘트 극성으로 가늠하고, 그래도 같으면 역량 고정 순서로 결정합니다.
 * 강점과 보완점은 서로 다른 기둥이 되도록 합니다.
 */
export function pickStrengthWeaknessPillars(
  scores: Record<PillarKey, number>,
  comments: Record<PillarKey, string>,
): { strength: PillarKey; weakness: PillarKey } {
  const vals = PILLAR_KEYS.map((k) => scores[k]);
  const maxS = Math.max(...vals);
  const minS = Math.min(...vals);

  const atMax = PILLAR_KEYS.filter((k) => scores[k] === maxS);
  const atMin = PILLAR_KEYS.filter((k) => scores[k] === minS);

  let strength = pickAmong(atMax, comments, "maxPolarity");
  let weakness = pickAmong(atMin, comments, "minPolarity");

  if (strength === weakness) {
    const altW = atMin.filter((k) => k !== strength);
    if (altW.length) weakness = pickAmong(altW, comments, "minPolarity");
    else {
      const altS = atMax.filter((k) => k !== weakness);
      if (altS.length) strength = pickAmong(altS, comments, "maxPolarity");
      else {
        const rest = PILLAR_KEYS.filter((k) => k !== strength);
        weakness = rest[rest.length - 1] ?? strength;
      }
    }
  }

  return { strength, weakness };
}

/** 강점·보완 역량 키 + 화면용 한글 영역명 (저장되는 strength/weakness_cmt 는 리포트 역량 분석 본문에서 별도 추출) */
export function pickStrengthWeaknessPointsForReport(
  scores: Record<PillarKey, number>,
  comments: Record<PillarKey, string>,
): {
  strength: PillarKey;
  weakness: PillarKey;
  strength_point: string;
  weakness_point: string;
} {
  const { strength, weakness } = pickStrengthWeaknessPillars(scores, comments);
  return {
    strength,
    weakness,
    strength_point: pillarLabelsKo[strength],
    weakness_point: pillarLabelsKo[weakness],
  };
}
