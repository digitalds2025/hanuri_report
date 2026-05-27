import type { BriefingTopicCandidate, SlideDataRef } from "./briefingMaterialTypes";

const PRESS_OR_WEAK =
  /조선일보|중앙일보|한겨레|동아일보|맘카페|블로그|티스토리|카페|언론|기자|칼럼/i;

const OFFICIAL_HINT =
  /학교알리미|교육청|KESS|어디가|입학처|schoolinfo|adiga|kess|교육통계|학업성적관리|평가계획/i;

export function isWeakOrPressFact(ref: SlideDataRef): boolean {
  if (ref.grade === "D") return true;
  const hay = `${ref.sourceTitle ?? ""} ${ref.fact} ${ref.category}`;
  if (PRESS_OR_WEAK.test(hay)) return true;
  if (ref.category === "로컬 이슈" && PRESS_OR_WEAK.test(hay)) return true;
  return false;
}

function topicTokens(title: string): string[] {
  return title
    .replace(/[^\uac00-\ud7a3a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function scoreFactForTopic(ref: SlideDataRef, topic: BriefingTopicCandidate): number {
  let score = 0;
  const hay = `${ref.category} ${ref.fact}`.toLowerCase();
  if (OFFICIAL_HINT.test(hay) || OFFICIAL_HINT.test(ref.sourceTitle ?? "")) score += 4;
  if (ref.grade === "A") score += 3;
  if (ref.grade === "B") score += 2;
  if (isWeakOrPressFact(ref)) score -= 20;

  for (const tok of topicTokens(topic.title)) {
    if (hay.includes(tok.toLowerCase())) score += 3;
  }
  if (/내신|수행|지필|고교|중학|학점|평가계획|서술/.test(topic.title) && /내신|수행|지필|평가|학업성적/.test(hay)) {
    score += 2;
  }
  if (/초6|초등/.test(topic.title) && /초등|초등학교/.test(hay)) score += 2;
  if (/강남/.test(topic.title) && /강남/.test(hay)) score += 1;

  if (/\d+\s*%/.test(ref.fact)) score += 2;
  if (/\d+\s*명/.test(ref.fact)) score += 2;
  return score;
}

/** 슬라이드 기획·레포트용 — 주제·공식 출처 우선 fact */
export function filterFactsForPlanning(
  catalog: SlideDataRef[],
  topic: BriefingTopicCandidate,
): SlideDataRef[] {
  const ranked = catalog
    .filter((f) => f.fact.trim().length > 12)
    .map((f) => ({ f, score: scoreFactForTopic(f, topic) }))
    .filter((x) => x.score > -5)
    .sort((a, b) => b.score - a.score);

  const strong = ranked.filter((x) => !isWeakOrPressFact(x.f)).map((x) => x.f);
  if (strong.length >= 6) return strong.slice(0, 60);

  return ranked.map((x) => x.f).slice(0, 60);
}

export function matchFactsToDraft(
  draft: { keyFacts: string[]; narrative: string },
  catalog: SlideDataRef[],
): SlideDataRef[] {
  const matched: SlideDataRef[] = [];
  const used = new Set<string>();
  for (const kf of draft.keyFacts) {
    const hit = catalog.find(
      (c) =>
        !used.has(c.id) &&
        (c.fact.includes(kf.slice(0, 24)) || kf.includes(c.fact.slice(0, 24))),
    );
    if (hit) {
      matched.push(hit);
      used.add(hit.id);
    }
  }
  if (matched.length < 2) {
    for (const c of catalog) {
      if (matched.length >= 3) break;
      if (used.has(c.id) || isWeakOrPressFact(c)) continue;
      if (draft.narrative.includes(c.fact.slice(0, 40))) {
        matched.push(c);
        used.add(c.id);
      }
    }
  }
  return matched.slice(0, 5);
}
