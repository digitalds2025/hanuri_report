import type {
  BriefingSlidePlan,
  BriefingStorylineBrief,
  MasterOutline,
  MasterOutlineBlock,
  SlideDataRef,
  StoryPhase,
} from "./briefingMaterialTypes";

export type ScreenChunk = {
  label: string;
  sublabel?: string;
  emphasis?: boolean;
};

const PPT_BLOCK_ORDER = [
  "cover",
  "how_to_read",
  "local_context",
  "target_focus",
  "school_compare",
  "parent_qa",
  "checklist",
  "brand_solution",
  "sources",
  "cta",
] as const;

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** 서술형 → 명사형 키워드 (간이) */
export function toNounKeyword(text: string): string {
  return text
    .replace(/\s*(합니다|됩니다|입니다|해야 합니다|중요합니다|있습니다|드립니다)\s*\.?/g, "")
    .replace(/[~을를이가은는]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

export function extractHeroMetric(fact: string): { value: string; label: string } | null {
  const pct = fact.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) {
    return {
      value: `${pct[1]}%`,
      label: truncate(toNounKeyword(fact.replace(pct[0], "").trim()) || "지표", 56),
    };
  }
  const num = fact.match(/(\d+(?:\.\d+)?)/);
  if (num) {
    return {
      value: num[1],
      label: truncate(toNounKeyword(fact.replace(num[0], "").trim()) || "지표", 56),
    };
  }
  return null;
}

export function layoutForContent(
  blockId: string | undefined,
  refs: SlideDataRef[],
  phase: StoryPhase,
): { layout: string; visualHint: string } {
  if (blockId === "cover") return { layout: "TITLE", visualHint: "title" };
  if (blockId === "sources") return { layout: "SOURCES", visualHint: "sources" };
  if (blockId === "cta") return { layout: "SECTION_HEADER", visualHint: "cta" };
  if (blockId === "school_compare") return { layout: "COMPARISON", visualHint: "comparison" };
  if (blockId === "checklist") return { layout: "CHECKLIST", visualHint: "checklist" };
  if (blockId === "parent_qa") return { layout: "GRID_CARDS", visualHint: "icon_grid" };
  if (blockId === "brand_solution") return { layout: "ICON_GRID", visualHint: "icon_grid" };

  const hasMetric = refs.some((r) => extractHeroMetric(r.fact));
  if (hasMetric && refs.length <= 2) return { layout: "METRIC", visualHint: "big_number" };
  if (refs.length >= 3 && refs.some((r) => /비교|대비|vs|학교/.test(r.fact))) {
    return { layout: "COMPARISON", visualHint: "comparison" };
  }
  if (refs.length >= 2 && refs.filter((r) => extractHeroMetric(r.fact)).length >= 2) {
    return { layout: "CHART_BAR", visualHint: "chart_bar" };
  }
  if (refs.length >= 2) return { layout: "DATA_TABLE", visualHint: "table" };
  if (blockId === "target_focus" || /로드맵|단계|전환|일정/.test(refs.map((r) => r.fact).join(""))) {
    return { layout: "PROCESS_FLOW", visualHint: "timeline" };
  }
  if (phase === "intro") return { layout: "SECTION_HEADER", visualHint: "section" };
  if (phase === "development" && hasMetric) return { layout: "METRIC", visualHint: "big_number" };
  if (phase === "development") return { layout: "DATA_TABLE", visualHint: "table" };
  if (phase === "climax") return { layout: "ICON_GRID", visualHint: "icon_grid" };
  return { layout: "STAT_GRID", visualHint: "stat_grid" };
}

function phaseForIndex(index: number, total: number): StoryPhase {
  const r = index / total;
  if (r < 0.15) return "intro";
  if (r < 0.65) return "development";
  if (r < 0.85) return "climax";
  return "closing";
}

function buildScreenChunks(
  bullets: string[],
  refs: SlideDataRef[],
  layout: string,
): ScreenChunk[] {
  const chunks: ScreenChunk[] = [];
  if (layout === "METRIC" && refs[0]) {
    const m = extractHeroMetric(refs[0].fact);
    if (m) return [{ label: m.value, sublabel: m.label, emphasis: true }];
  }
  if (layout === "COMPARISON") {
    const left = refs.slice(0, 2).map((r) => ({
      label: truncate(toNounKeyword(r.category), 28),
      emphasis: true,
    }));
    return left.slice(0, 3);
  }
  for (const b of bullets.slice(0, 3)) {
    chunks.push({ label: toNounKeyword(b) || truncate(b, 40) });
  }
  if (chunks.length < 3) {
    for (const r of refs.slice(0, 3 - chunks.length)) {
      const m = extractHeroMetric(r.fact);
      chunks.push(
        m
          ? { label: m.value, sublabel: truncate(m.label, 36), emphasis: true }
          : { label: truncate(toNounKeyword(r.fact), 40) },
      );
    }
  }
  return chunks.slice(0, 3);
}

function buildSpeakerNotes(
  block: MasterOutlineBlock | null,
  refs: SlideDataRef[],
  phase: StoryPhase,
  purpose: string,
): string {
  const lines: string[] = [];
  if (phase === "intro") {
    lines.push(
      "어머님, 오늘 설명회에서 가장 먼저 짚어드릴 부분입니다. 화면은 키워드만 보시고, 구체 수치와 사례는 제가 말씀드리겠습니다.",
    );
  }
  lines.push(purpose);
  for (const r of refs.slice(0, 4)) {
    lines.push(`[${r.grade ?? "A"}·${r.category}] ${r.fact}`);
    if (r.sourceTitle) lines.push(`출처: ${r.sourceTitle}`);
  }
  if (block?.instructorInsightSlots?.length) {
    lines.push(`현장 보강: ${block.instructorInsightSlots.join(" / ")}`);
  }
  return lines.join("\n\n");
}

function planFromSlot(
  slideNumber: number,
  title: string,
  purpose: string,
  block: MasterOutlineBlock | null,
  refs: SlideDataRef[],
  phase: StoryPhase,
  blockId?: string,
): BriefingSlidePlan {
  const bullets = block?.bulletPoints ?? [];
  const { layout, visualHint } = layoutForContent(blockId, refs, phase);
  const screenChunks = buildScreenChunks(bullets, refs, layout);
  const hero = refs[0] ? extractHeroMetric(refs[0].fact) : null;

  return {
    slideNumber,
    title,
    purpose,
    storyPhase: phase,
    recommendedLayout: layout,
    visualHint,
    dataRefs: refs.slice(0, 5),
    slideContentPlan: [
      `【슬라이드 내용】${title}`,
      `한 줄 메시지: ${purpose}`,
      refs.length
        ? `근거 데이터: ${refs.map((r) => `${r.category} — ${truncate(r.fact, 120)}`).join(" / ")}`
        : "수집 fact 연결 필요",
      hero
        ? `화면 핵심 수치: ${hero.value} (${hero.label})`
        : `화면 키워드: ${screenChunks.map((c) => c.label).join(", ")}`,
      `발표 시 화면은 최소·멘트에서 수치·사례를 풀어 설명`,
    ].join("\n"),
    screenChunks,
    keyMessages: screenChunks.map((c) =>
      c.sublabel ? `${c.label} · ${c.sublabel}` : c.label,
    ),
    heroMetric: hero && layout === "METRIC" ? { ...hero, sourceFactId: refs[0]?.id } : undefined,
    speakerNotes: buildSpeakerNotes(block, refs, phase, purpose),
    blockId,
  };
}

/** 요청 장수에 맞춘 슬라이드 슬롯 생성 */
const PHASE_BLOCK_HINTS: Record<StoryPhase, string[]> = {
  intro: ["cover", "how_to_read", "local_context"],
  development: ["local_context", "target_focus", "school_compare", "parent_qa"],
  climax: ["brand_solution", "target_focus"],
  closing: ["checklist", "cta", "sources"],
};

export function buildStorylineSlideSlots(
  targetCount: number,
  outline: MasterOutline,
  catalog: SlideDataRef[],
  storyline?: BriefingStorylineBrief | null,
): Array<{
  title: string;
  purpose: string;
  block: MasterOutlineBlock | null;
  refs: SlideDataRef[];
  blockId?: string;
  phase?: StoryPhase;
}> {
  const blocks = PPT_BLOCK_ORDER.map((id) => outline.blocks.find((b) => b.blockId === id)).filter(
    Boolean,
  ) as MasterOutlineBlock[];

  const slots: Array<{
    title: string;
    purpose: string;
    block: MasterOutlineBlock | null;
    refs: SlideDataRef[];
    blockId?: string;
    phase?: StoryPhase;
  }> = [];

  let factIdx = 0;
  const usedFactIds = new Set<string>();

  function pickFacts(n: number, keywords: string): SlideDataRef[] {
    const kw = keywords.toLowerCase();
    const scored = catalog
      .filter((f) => !usedFactIds.has(f.id))
      .map((f) => {
        const hay = `${f.category} ${f.fact}`.toLowerCase();
        let score = extractHeroMetric(f.fact) ? 3 : 0;
        for (const w of kw.split(/\s+/).filter((x) => x.length > 2)) {
          if (hay.includes(w)) score += 2;
        }
        return { f, score };
      });
    scored.sort((a, b) => b.score - a.score);
    const picked = scored.slice(0, n).map((s) => s.f);
    picked.forEach((p) => usedFactIds.add(p.id));
    return picked;
  }

  const phaseQueue: StoryPhase[] = [];
  if (storyline?.phases?.length) {
    for (const p of storyline.phases) {
      for (let i = 0; i < p.slideCount; i++) phaseQueue.push(p.phase);
    }
  }
  while (phaseQueue.length < targetCount) {
    phaseQueue.push(phaseForIndex(phaseQueue.length, targetCount));
  }

  function currentPhase(): StoryPhase {
    return phaseQueue[slots.length] ?? "development";
  }

  function blockFitsPhase(blockId: string, phase: StoryPhase): boolean {
    return PHASE_BLOCK_HINTS[phase]?.includes(blockId) ?? true;
  }

  for (const block of blocks) {
    if (slots.length >= targetCount) break;
    const phase = currentPhase();
    if (!blockFitsPhase(block.blockId, phase) && slots.length < targetCount - 4) {
      continue;
    }
    const keywords = [block.title, block.purpose, ...block.bulletPoints].join(" ");
    if (block.blockId === "local_context" || block.blockId === "target_focus") {
      const factSlides = Math.min(4, Math.max(2, Math.floor(targetCount * 0.12)));
      for (let i = 0; i < factSlides && slots.length < targetCount; i++) {
        const refs = pickFacts(2, keywords);
        if (!refs.length && catalog[factIdx]) {
          refs.push(catalog[factIdx++]);
          usedFactIds.add(refs[0].id);
        }
        const hero = refs[0] ? extractHeroMetric(refs[0].fact) : null;
        slots.push({
          title: hero
            ? `${outline.regionLabel} · ${hero.label}`.trim() || block.title
            : `${block.title} (${i + 1})`,
          purpose: block.purpose,
          block,
          refs,
          blockId: block.blockId,
          phase: currentPhase(),
        });
      }
      continue;
    }
    if (block.blockId === "school_compare") {
      const refs = pickFacts(4, keywords);
      slots.push({
        title: block.title,
        purpose: block.purpose,
        block,
        refs,
        blockId: block.blockId,
        phase: currentPhase(),
      });
      continue;
    }
    const refs = pickFacts(block.blockId === "cover" ? 0 : 3, keywords);
    slots.push({
      title: block.title,
      purpose: block.purpose,
      block,
      refs,
      blockId: block.blockId,
      phase: currentPhase(),
    });
  }

  while (slots.length < targetCount) {
    const remaining = catalog.filter((f) => !usedFactIds.has(f.id));
    const ref = remaining[factIdx % Math.max(1, remaining.length)];
    if (!ref) break;
    usedFactIds.add(ref.id);
    factIdx++;
    const hero = extractHeroMetric(ref.fact);
    slots.push({
      title: hero ? hero.label : truncate(ref.category, 40),
      purpose: "수집 데이터 기반 전개 슬라이드",
      block: null,
      refs: [ref],
      blockId: "data_spotlight",
      phase: currentPhase(),
    });
  }

  return slots.slice(0, targetCount);
}

export function applyStorylinePhases(
  plans: BriefingSlidePlan[],
  storyline: BriefingStorylineBrief,
): BriefingSlidePlan[] {
  let idx = 0;
  const next = [...plans];
  for (const phase of storyline.phases) {
    for (let j = 0; j < phase.slideCount && idx < next.length; j++, idx++) {
      const phaseInfo = storyline.phases.find((p) => p.phase === phase.phase);
      next[idx] = {
        ...next[idx],
        storyPhase: phase.phase,
        slideContentPlan: [
          getSlideContentPlan(next[idx]),
          `[${phaseInfo?.label ?? phase.phase}] ${phaseInfo?.narrative ?? ""}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    }
  }
  return next;
}

export function getSlideContentPlan(p: BriefingSlidePlan): string {
  return p.slideContentPlan ?? p.contentPlan ?? "";
}

export function buildPlansForPageCount(
  targetCount: number,
  outline: MasterOutline,
  catalog: SlideDataRef[],
  storyline?: BriefingStorylineBrief | null,
): BriefingSlidePlan[] {
  const slots = buildStorylineSlideSlots(targetCount, outline, catalog, storyline);
  let plans = slots.map((slot, i) =>
    planFromSlot(
      i + 1,
      slot.title,
      slot.purpose,
      slot.block,
      slot.refs,
      slot.phase ?? phaseForIndex(i, targetCount),
      slot.blockId,
    ),
  );
  if (storyline) {
    plans = applyStorylinePhases(plans, storyline);
  }
  return plans;
}

/** AI·폴백 결과를 요청 장수로 맞춤 */
export function normalizePlanCount(
  plans: BriefingSlidePlan[],
  targetCount: number,
  outline: MasterOutline,
  catalog: SlideDataRef[],
): BriefingSlidePlan[] {
  if (plans.length === targetCount) {
    return plans.map((p, i) => ({
      ...p,
      slideNumber: i + 1,
      storyPhase: p.storyPhase ?? phaseForIndex(i, targetCount),
    }));
  }
  if (plans.length > targetCount) {
    return plans.slice(0, targetCount).map((p, i) => ({
      ...p,
      slideNumber: i + 1,
      storyPhase: p.storyPhase ?? phaseForIndex(i, targetCount),
    }));
  }
  const generated = buildPlansForPageCount(targetCount, outline, catalog);
  const merged = [...plans];
  for (let i = plans.length; i < targetCount; i++) {
    merged.push(generated[i] ?? generated[generated.length - 1]);
  }
  return merged.map((p, i) => ({
    ...p,
    slideNumber: i + 1,
    storyPhase: p.storyPhase ?? phaseForIndex(i, targetCount),
  }));
}

export const STORYLINE_PLANNING_RULES = `
[설명회 PPT 기획 규칙 — 반드시 준수]

1. Design-Content Matching
- 비교/대조 → COMPARISON (2~3분할, 상단 비교기준 + 하단 키워드 3~4 bold)
- 시간/프로세스 → PROCESS_FLOW (가로 타임라인, 단계당 액션 1개)
- 통계/지표 → METRIC 또는 CHART_BAR (빅넘버 40%+, 수집 fact의 %·수치만)
- 표/다건 → DATA_TABLE

2. 3-3 Rule & 명사형 키워드
- screenChunks 최대 3개, 서술형 금지, 명사형 키워드만
- keyMessages는 screenChunks와 동일하게 유지 (호환)

3. Dual Layer
- 화면: screenChunks·수치만 / speakerNotes: 구어체 멘트+fact 원문+수치 근거 (장문 OK)

4. 스토리라인 (감정 변호)
- intro(15%): 문제 제기, SECTION_HEADER/TITLE, 밀도 낮음
- development(50%): 표·그래프·빅넘버, 데이터 밀도 최고
- climax(20%): 해결책·브랜드 ICON_GRID
- closing(15%): CTA·SOURCES·CHECKLIST

5. 슬라이드 수
- 요청한 pageCount와 slidePlans 배열 길이가 정확히 일치해야 함
- 수집 fact catalog의 수치를 heroMetric·CHART·TABLE에 반드시 반영
`;
