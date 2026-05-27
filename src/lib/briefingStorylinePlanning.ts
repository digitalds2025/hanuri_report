import { normalizeSlidePlan } from "./briefingSlidePlanNormalize";
import type {
  BriefingSlidePlan,
  BriefingStorylineBrief,
  MasterOutline,
  MasterOutlineBlock,
  SlideDataRef,
  StoryPhase,
} from "./briefingMaterialTypes";

const DEFAULT_BLOCK_ORDER = [
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

function outlineBlockOrder(outline: MasterOutline): string[] {
  if (outline.selectedBlockIds?.length) return [...outline.selectedBlockIds];
  const fromBlocks = outline.blocks.map((b) => b.blockId);
  return fromBlocks.length ? fromBlocks : [...DEFAULT_BLOCK_ORDER];
}

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
  const students = fact.match(/(\d{1,3}(?:,\d{3})*)\s*명/);
  if (students) {
    return {
      value: `${students[1]}명`,
      label: truncate(toNounKeyword(fact.replace(students[0], "").trim()) || "학생 수", 56),
    };
  }
  const num = fact.match(/(\d+(?:\.\d+)?)/);
  if (num) {
    if (/^\d{4}$/.test(num[1])) return null;
    const n = parseFloat(num[1]);
    if (n <= 10 && !fact.includes("%")) return null;
    return {
      value: num[1],
      label: truncate(toNounKeyword(fact.replace(num[0], "").trim()) || "지표", 56),
    };
  }
  return null;
}

/** 제목·라벨용 — 문장 중간 절단 완화 */
export function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.5) return cut.slice(0, lastSpace).trim() + "…";
  return cut.trimEnd() + "…";
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
  const metricRef = refs.find((r) => extractHeroMetric(r.fact));
  if (metricRef && extractHeroMetric(metricRef.fact) && refs.length <= 2) {
    return { layout: "METRIC", visualHint: "big_number" };
  }
  if (refs.length >= 2) return { layout: "DATA_TABLE", visualHint: "table" };
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

export function phaseForIndex(index: number, total: number): StoryPhase {
  const r = index / total;
  if (r < 0.15) return "intro";
  if (r < 0.65) return "development";
  if (r < 0.85) return "climax";
  return "closing";
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
  blockId: string | undefined,
  regionLabel: string,
  catalog: SlideDataRef[],
): BriefingSlidePlan {
  const { layout, visualHint } = layoutForContent(blockId, refs, phase);
  return normalizeSlidePlan(
    {
      slideNumber,
      title,
      purpose,
      storyPhase: phase,
      recommendedLayout: layout,
      visualHint,
      dataRefs: refs.slice(0, 6),
      speakerNotes: buildSpeakerNotes(block, refs, phase, purpose),
      blockId,
    },
    catalog.length ? catalog : refs,
    regionLabel,
  );
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
  const order = outlineBlockOrder(outline);
  const blocks = order
    .map((id) => outline.blocks.find((b) => b.blockId === id))
    .filter(Boolean) as MasterOutlineBlock[];
  const extraBlocks = outline.blocks.filter((b) => !order.includes(b.blockId));
  blocks.push(...extraBlocks);

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

  const topicKw = outline.topicTitle.toLowerCase();

  function pickFacts(n: number, keywords: string): SlideDataRef[] {
    const kw = `${keywords} ${outline.topicTitle}`.toLowerCase();
    const scored = catalog
      .filter((f) => !usedFactIds.has(f.id))
      .map((f) => {
        const hay = `${f.category} ${f.fact} ${f.sourceTitle ?? ""}`.toLowerCase();
        let score = extractHeroMetric(f.fact) ? 3 : 0;
        if (/조선일보|중앙일보|맘카페|블로그/.test(hay)) score -= 15;
        if (/학교알리미|교육청|kess|어디가|평가계획/.test(hay)) score += 4;
        for (const w of kw.split(/\s+/).filter((x) => x.length > 2)) {
          if (hay.includes(w)) score += 2;
        }
        for (const w of topicKw.split(/\s+/).filter((x) => x.length > 2)) {
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
    slots.push({
      title: truncateAtWord(ref.fact, 56) || ref.category,
      purpose: outline.topicTitle,
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
      outline.regionLabel,
      catalog,
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
