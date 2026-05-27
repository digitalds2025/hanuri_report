import type {
  BriefingSlidePlan,
  HeroMetric,
  ScreenChunk,
  SlideContextSet,
  SlideDataRef,
  SlideHeroFact,
} from "./briefingMaterialTypes";
import { isWeakOrPressFact } from "./briefingFactQuality";
import { extractHeroMetric, toNounKeyword, truncate, truncateAtWord } from "./briefingStorylinePlanning";

const BANNED_GENERIC = [
  "중요합니다",
  "어려워집니다",
  "준비해야",
  "필수입니다",
  "점점 중요",
  "수행평가가 중요",
  "공부가 어려워",
  "많은 학부모",
  "교육 환경이 변화",
];

export function isGenericPhrase(text: string): boolean {
  const t = text.toLowerCase();
  return BANNED_GENERIC.some((p) => t.includes(p.replace(/\s/g, "")) || t.includes(p));
}

function extractProperNouns(fact: string, regionHint: string): string[] {
  const nouns: string[] = [];
  const school = fact.match(
    /[\uac00-\ud7a3]+(?:초|중|고|초등학교|중학교|고등학교|초등|중등|고등)/g,
  );
  if (school) nouns.push(...school.slice(0, 3));
  if (regionHint && fact.includes(regionHint.replace(/시|군|구/g, ""))) {
    nouns.push(regionHint);
  }
  const agencies = fact.match(
    /(?:학교알리미|교육청|지자체|교육지원청|KESS|에듀넷|나이스)/g,
  );
  if (agencies) nouns.push(...agencies);
  return [...new Set(nouns)].slice(0, 6);
}

function dedupeContextSets(sets: SlideContextSet[]): SlideContextSet[] {
  const seen = new Set<string>();
  const out: SlideContextSet[] = [];
  for (const s of sets) {
    const key = s.phenomenon.replace(/\s/g, "").slice(0, 100);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function analysisForRef(r: SlideDataRef, purpose: string, regionLabel: string): string {
  const school = r.fact.match(/[\uac00-\ud7a3]+(?:초|중|고|초등학교|중학교|고등학교)/)?.[0];
  const m = extractHeroMetric(r.fact);
  const metric = m ? `${m.value}(${m.label})` : "";
  return truncate(
    [
      school ? `${school} 기준으로` : regionLabel,
      purpose.slice(0, 40),
      "학부모가 확인할 포인트:",
      metric || r.category,
    ]
      .filter(Boolean)
      .join(" "),
    200,
  );
}

export function contextSetsFromRefs(
  refs: SlideDataRef[],
  purpose: string,
  regionLabel: string,
): SlideContextSet[] {
  const usable = refs.filter((r) => !isWeakOrPressFact(r));
  const pool = usable.length ? usable : refs;

  const sets: SlideContextSet[] = pool.slice(0, 5).map((r) => {
    const m = extractHeroMetric(r.fact);
    return {
      phenomenon: truncate(r.fact, 280),
      analysis: analysisForRef(r, purpose, regionLabel),
      screenKeyword: m
        ? `${m.value} · ${truncate(m.label, 32)}`
        : truncate(toNounKeyword(r.fact) || r.category, 48),
      screenDetail: truncate(r.sourceTitle ?? "", 80),
      mappedFactId: r.id,
    };
  });

  let deduped = dedupeContextSets(sets);
  for (const r of pool) {
    if (deduped.length >= 3) break;
    const candidate = {
      phenomenon: truncate(r.fact, 240),
      analysis: analysisForRef(r, purpose, regionLabel),
      screenKeyword: truncate(r.category, 40),
      screenDetail: r.sourceTitle,
      mappedFactId: r.id,
    };
    deduped = dedupeContextSets([...deduped, candidate]);
  }
  return deduped.slice(0, 5);
}

export function heroFactFromRefs(
  refs: SlideDataRef[],
  title: string,
  regionLabel: string,
): SlideHeroFact {
  const primary = refs[0];
  if (!primary) {
    return {
      headline: truncate(title, 120),
      properNouns: [regionLabel],
    };
  }
  const m = extractHeroMetric(primary.fact);
  const nouns = extractProperNouns(primary.fact, regionLabel);
  return {
    headline: m
      ? `${nouns[0] ? nouns[0] + " · " : ""}${m.value} — ${truncate(m.label, 80)}`
      : truncate(`${primary.category}: ${primary.fact}`, 140),
    properNouns: nouns.length ? nouns : [regionLabel],
    metricValue: m?.value,
    metricLabel: m?.label,
    sourceFactId: primary.id,
  };
}

export function buildActionStrategy(
  purpose: string,
  phase: string,
  blockId?: string,
): string {
  const isRecruit = purpose.includes("모집") || purpose.includes("신입");
  if (blockId === "brand_solution" || phase === "climax") {
    return isRecruit
      ? "독서·토론·논술 기반 과정 대응 프로그램으로 수행평가·서술형 공백을 메우고, 설명회 후 1:1 진단 상담으로 연결"
      : "현재 성과를 과정·결과 평가 프레임으로 재정리하고, 승급 학년 공백 구간에 맞춘 맞춤 루틴·재등록 상담 제안";
  }
  if (phase === "intro") {
    return "공식 데이터로 문제 인식을 공유한 뒤, 가정에서 바로 점검할 체크 포인트(평가계획서·학교알리미)로 안내";
  }
  if (phase === "development") {
    return "표·수치로 이성적 신뢰를 확보한 후, 학교·학년별 차이를 선택 질문으로 상담 전환";
  }
  return "상담 예약·준비 자료(성적·평가계획)를 명시하고 다음 행동 일정을 고정";
}

export function compileSlideContentPlan(plan: {
  title: string;
  purpose: string;
  heroFact: SlideHeroFact;
  contextSets: SlideContextSet[];
  actionStrategy: string;
  consultantInsight?: string;
}): string {
  const lines = [
    `【슬라이드】${plan.title}`,
    `【목적】${plan.purpose}`,
    "",
    "■ Hero Fact & Metric",
    plan.heroFact.headline,
    plan.heroFact.properNouns.length
      ? `고유명사: ${plan.heroFact.properNouns.join(", ")}`
      : "",
    "",
    "■ Context Body (현상 → 분석 → 화면키워드)",
  ];
  plan.contextSets.forEach((c, i) => {
    lines.push(
      `${i + 1}) 현상: ${c.phenomenon}`,
      `   분석: ${c.analysis}`,
      `   화면: ${c.screenKeyword}${c.screenDetail ? ` (${c.screenDetail})` : ""}`,
      "",
    );
  });
  lines.push("■ Action Strategy", plan.actionStrategy);
  if (plan.consultantInsight) {
    lines.push("", "■ Consultant Insight", plan.consultantInsight);
  }
  return lines.join("\n").trim();
}

export function contextSetsToScreenChunks(sets: SlideContextSet[]): ScreenChunk[] {
  return sets.slice(0, 5).map((c) => ({
    label: truncate(c.screenKeyword, 56),
    sublabel: truncate(c.screenDetail ?? c.analysis, 72),
    emphasis: Boolean(extractHeroMetric(c.phenomenon) ?? extractHeroMetric(c.screenKeyword)),
  }));
}

export function syncPlanDerivedFields(plan: BriefingSlidePlan): BriefingSlidePlan {
  const chunks = contextSetsToScreenChunks(plan.contextSets);
  const heroMetric: HeroMetric | undefined = plan.heroFact.metricValue
    ? {
        value: plan.heroFact.metricValue,
        label: plan.heroFact.metricLabel ?? plan.heroFact.headline,
        sourceFactId: plan.heroFact.sourceFactId,
      }
    : plan.heroMetric;

  return {
    ...plan,
    screenChunks: chunks,
    keyMessages: chunks.map((c) => (c.sublabel ? `${c.label} · ${c.sublabel}` : c.label)),
    heroMetric,
    slideContentPlan: compileSlideContentPlan(plan),
    contentPlan: compileSlideContentPlan(plan),
  };
}

export function normalizeSlidePlan(
  raw: Partial<BriefingSlidePlan> & { slideNumber: number; title: string; purpose: string },
  catalog: SlideDataRef[],
  regionLabel: string,
  fallback?: BriefingSlidePlan,
): BriefingSlidePlan {
  const refs = (raw.dataRefs?.length ? raw.dataRefs : fallback?.dataRefs ?? [])
    .map((r) => catalog.find((c) => c.id === r.id) ?? r)
    .filter((r) => r.fact && !isWeakOrPressFact(r))
    .slice(0, 6);

  const rawSets = Array.isArray(raw.contextSets) ? raw.contextSets : [];
  let contextSets: SlideContextSet[] = rawSets
    .map((s) => ({
      phenomenon: truncate(String(s.phenomenon ?? ""), 240),
      analysis: truncate(String(s.analysis ?? ""), 240),
      screenKeyword: truncate(String(s.screenKeyword ?? ""), 56),
      screenDetail: s.screenDetail ? truncate(String(s.screenDetail), 100) : undefined,
      mappedFactId: s.mappedFactId ? String(s.mappedFactId) : undefined,
    }))
    .filter((s) => s.phenomenon || s.screenKeyword);

  contextSets = dedupeContextSets(contextSets);
  if (contextSets.length < 3) {
    const fromRefs = contextSetsFromRefs(refs, raw.purpose, regionLabel);
    contextSets = dedupeContextSets([...contextSets, ...fromRefs]).slice(0, 5);
  }

  const heroRaw = raw.heroFact;
  let heroFact: SlideHeroFact = heroRaw
    ? {
        headline: truncate(String(heroRaw.headline ?? ""), 160),
        properNouns: Array.isArray(heroRaw.properNouns)
          ? heroRaw.properNouns.map((n) => String(n)).slice(0, 8)
          : [],
        metricValue: heroRaw.metricValue ? String(heroRaw.metricValue) : undefined,
        metricLabel: heroRaw.metricLabel ? String(heroRaw.metricLabel) : undefined,
        sourceFactId: heroRaw.sourceFactId ? String(heroRaw.sourceFactId) : undefined,
      }
    : heroFactFromRefs(refs, raw.title, regionLabel);

  if (!heroFact.headline || heroFact.headline.length < 8) {
    heroFact = heroFactFromRefs(refs, raw.title, regionLabel);
  }

  const actionStrategy =
    String(raw.actionStrategy ?? "").trim() ||
    fallback?.actionStrategy ||
    buildActionStrategy(raw.purpose, raw.storyPhase ?? "development", raw.blockId);

  const consultantInsight =
    String(raw.consultantInsight ?? "").trim() ||
    fallback?.consultantInsight ||
    (refs[0]
      ? `학부모 체감 포인트: ${truncate(refs[0].fact, 150)} — 상담 시 "${refs[0].sourceTitle ?? "공식 출처"}" 근거를 함께 확인`
      : "");

  const base: BriefingSlidePlan = {
    slideNumber: raw.slideNumber,
    title: truncateAtWord(raw.title, 80),
    purpose: raw.purpose,
    storyPhase: raw.storyPhase ?? fallback?.storyPhase,
    recommendedLayout: raw.recommendedLayout ?? fallback?.recommendedLayout ?? "DATA_TABLE",
    visualHint: raw.visualHint ?? fallback?.visualHint ?? "table",
    dataRefs: refs,
    heroFact,
    contextSets: contextSets.slice(0, 5),
    actionStrategy,
    consultantInsight,
    slideContentPlan: "",
    screenChunks: [],
    keyMessages: [],
    speakerNotes:
      String(raw.speakerNotes ?? "").trim() ||
      fallback?.speakerNotes ||
      [
        "어머님, 화면은 숫자와 키워드만 보시고 제가 근거를 말씀드리겠습니다.",
        ...refs.map((r) => `[${r.category}] ${r.fact}`),
        consultantInsight,
      ].join("\n\n"),
    blockId: raw.blockId ?? fallback?.blockId,
  };

  return syncPlanDerivedFields(base);
}
