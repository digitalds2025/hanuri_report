import { buildFactCatalog } from "./briefingSlidePlanningFacts";
import type {
  BriefingLayoutSlide,
  BriefingMaterialFormInput,
  BriefingSlidePlan,
  BriefingStorylineBrief,
  MasterOutline,
  ScreenChunk,
  SlideDataRef,
  StoryPhase,
} from "./briefingMaterialTypes";
import { geminiGenerateJson, type GeminiTokenUsage } from "./geminiClient";
import {
  STORYLINE_PLANNING_RULES,
  applyStorylinePhases,
  buildPlansForPageCount,
  extractHeroMetric,
  getSlideContentPlan,
  normalizePlanCount,
  toNounKeyword,
  truncate,
} from "./briefingStorylinePlanning";

const PER_SLIDE_PLAN_SYSTEM = `설명회 슬라이드별 기획 엔진.
${STORYLINE_PLANNING_RULES}

JSON 필드 (slidePlans 각 항목):
slideNumber, title, purpose, storyPhase(intro|development|climax|closing),
recommendedLayout, visualHint, dataRefs[{id,category,fact,...}],
slideContentPlan(슬라이드 내용 기획·2~4문장), screenChunks[{label,sublabel?,emphasis?}] (최대 3),
heroMetric?: {value,label,sourceFactId} (METRIC/CHART 시 fact 수치),
keyMessages (screenChunks와 동일), speakerNotes (구어체+fact 원문+수치)

JSON만: { "slidePlans": [ ... ] }`;

export function buildPerSlidePlansSync(
  outline: MasterOutline,
  catalog: SlideDataRef[] = [],
  targetCount = 18,
  storyline?: BriefingStorylineBrief | null,
): BriefingSlidePlan[] {
  return buildPlansForPageCount(targetCount, outline, catalog, storyline);
}

export async function buildPerSlidePlans(
  input: BriefingMaterialFormInput,
  outline: MasterOutline,
  storyline?: BriefingStorylineBrief | null,
): Promise<{ plans: BriefingSlidePlan[]; usage: GeminiTokenUsage; usedFallback: boolean }> {
  const scan = input.officialScan;
  const catalog = scan ? buildFactCatalog(scan) : [];
  const targetCount = Math.max(6, Math.min(40, input.pageCount));

  const fallback = buildPlansForPageCount(targetCount, outline, catalog, storyline);

  if (!scan || catalog.length === 0) {
    return {
      plans: fallback,
      usage: { inputTokens: 0, outputTokens: 0 },
      usedFallback: true,
    };
  }

  const slotsPreview = fallback.map((p) => ({
    slideNumber: p.slideNumber,
    title: p.title,
    storyPhase: p.storyPhase,
    recommendedLayout: p.recommendedLayout,
    blockId: p.blockId,
  }));

  const userPrompt = `지역: ${input.region} ${input.subRegion}
주제: ${outline.topicTitle}
기준 시점: ${outline.dataAsOf}
**요청 슬라이드 수: 정확히 ${targetCount}장** (slidePlans.length === ${targetCount})

${storyline ? `[설명회 흐름 기획]\n${storyline.overview}\n단계: ${storyline.phases.map((p) => `${p.label} ${p.slideCount}장`).join(" → ")}\n` : ""}

[스토리라인 골격 — 장수·흐름 참고]
${JSON.stringify(slotsPreview, null, 2)}

[fact catalog — dataRefs.id만 사용, 수치는 heroMetric·CHART·TABLE에 반영]
${JSON.stringify(catalog.slice(0, 50), null, 2)}

반드시 ${targetCount}개 slidePlans. CHECKLIST 남발 금지. 통계 fact는 METRIC/CHART_BAR/DATA_TABLE.`;

  try {
    const { data: parsed, usage } = await geminiGenerateJson<{ slidePlans?: unknown }>(
      PER_SLIDE_PLAN_SYSTEM,
      userPrompt,
      0.3,
      "writer",
      32768,
    );
    const arr = Array.isArray(parsed.slidePlans) ? parsed.slidePlans : [];
    if (!arr.length) throw new Error("슬라이드 기획 결과가 비어 있습니다.");

    const plans = arr.map((item, i) => {
      const o = item as Record<string, unknown>;
      const rawRefs = Array.isArray(o.dataRefs) ? o.dataRefs : [];
      const dataRefs: SlideDataRef[] = rawRefs
        .map((r) => {
          const ref = r as Record<string, unknown>;
          const id = String(ref.id ?? "");
          const fromCat = catalog.find((c) => c.id === id);
          if (fromCat) return fromCat;
          return {
            id: id || `fact-${i}`,
            category: String(ref.category ?? "기타"),
            fact: truncate(String(ref.fact ?? ""), 280),
            sourceTitle: ref.sourceTitle ? String(ref.sourceTitle) : undefined,
            grade: ref.grade as SlideDataRef["grade"],
          };
        })
        .filter((r) => r.fact)
        .slice(0, 5);

      const rawChunks = Array.isArray(o.screenChunks) ? o.screenChunks : [];
      const screenChunks: ScreenChunk[] = rawChunks
        .map((c) => {
          const ch = c as Record<string, unknown>;
          return {
            label: truncate(String(ch.label ?? ""), 48),
            sublabel: ch.sublabel ? truncate(String(ch.sublabel), 40) : undefined,
            emphasis: Boolean(ch.emphasis),
          };
        })
        .filter((c) => c.label)
        .slice(0, 3);

      const fb = fallback[i] ?? fallback[fallback.length - 1];
      const refs = dataRefs.length ? dataRefs : fb.dataRefs;
      const phase = (o.storyPhase as StoryPhase) ?? fb.storyPhase ?? "development";
      const layout = String(o.recommendedLayout ?? fb.recommendedLayout);
      const heroRaw = o.heroMetric as Record<string, unknown> | undefined;
      let heroMetric = fb.heroMetric;
      if (heroRaw?.value) {
        heroMetric = {
          value: String(heroRaw.value),
          label: String(heroRaw.label ?? ""),
          sourceFactId: heroRaw.sourceFactId ? String(heroRaw.sourceFactId) : refs[0]?.id,
        };
      } else if (refs[0] && (layout === "METRIC" || layout === "CHART_BAR")) {
        const m = extractHeroMetric(refs[0].fact);
        if (m) heroMetric = { ...m, sourceFactId: refs[0].id };
      }

      const chunks =
        screenChunks.length > 0
          ? screenChunks
          : fb.screenChunks.length > 0
            ? fb.screenChunks
            : [{ label: truncate(fb.title, 40) }];

      return {
        slideNumber: Number(o.slideNumber) || i + 1,
        title: String(o.title ?? fb.title),
        purpose: String(o.purpose ?? fb.purpose),
        storyPhase: phase,
        recommendedLayout: layout,
        visualHint: String(o.visualHint ?? fb.visualHint),
        dataRefs: refs,
        slideContentPlan: String(
          o.slideContentPlan ?? o.contentPlan ?? getSlideContentPlan(fb),
        ),
        screenChunks: chunks,
        heroMetric,
        keyMessages: chunks.map((c) => (c.sublabel ? `${c.label} · ${c.sublabel}` : c.label)),
        speakerNotes: String(o.speakerNotes ?? fb.speakerNotes),
        blockId: fb.blockId,
      } satisfies BriefingSlidePlan;
    });

    let normalized = normalizePlanCount(plans, targetCount, outline, catalog);
    if (storyline) normalized = applyStorylinePhases(normalized, storyline);
    return { plans: normalized, usage, usedFallback: false };
  } catch (e) {
    console.warn("[buildPerSlidePlans] AI 실패, 스토리라인 폴백", e);
    return {
      plans: fallback,
      usage: { inputTokens: 0, outputTokens: 0 },
      usedFallback: true,
    };
  }
}

const PRODUCE_SYSTEM = `설명회 슬라이드 제작. slidePlans의 screenChunks·heroMetric·dataRefs 수치만 화면에.
${STORYLINE_PLANNING_RULES}

type별 필드:
- METRIC: title, value(40%+ 크기), label, description(한 줄), speakerNotes
- CHART_BAR: bars[{label,value,display}] — value는 fact 수치
- COMPARISON: leftTitle, leftItems(3), rightTitle, rightItems(3) — 명사형
- PROCESS_FLOW: steps[{title}] — 단계당 1 액션
- DATA_TABLE: headers, rows — fact 원문 요약
- STAT_GRID: stats[{value,label,subtext}]
- ICON_GRID: icons[{icon,label,desc}]
- CHECKLIST: items 최대 3
- TITLE, SECTION_HEADER, SOURCES, INSTRUCTOR_INSIGHT

CHECKLIST 남발 금지. JSON만: { "slides": [ ... ] }`;

function chunksFromPlan(p: BriefingSlidePlan): ScreenChunk[] {
  if (p.screenChunks?.length) return p.screenChunks.slice(0, 3);
  return (p.keyMessages ?? []).slice(0, 3).map((m) => ({ label: truncate(m, 48) }));
}

/** 기획 1장 → 미리보기/제작용 레이아웃 */
export function planToPreviewSlide(plan: BriefingSlidePlan, dataAsOf: string): BriefingLayoutSlide {
  const slides = plansToLayoutSlides([plan], dataAsOf);
  return slides[0] ?? { type: "TITLE", title: plan.title };
}

export function plansToLayoutSlides(plans: BriefingSlidePlan[], dataAsOf: string): BriefingLayoutSlide[] {
  return plans.map((p) => {
    const chunks = chunksFromPlan(p);
    const notes = p.speakerNotes;
    const layout = p.recommendedLayout || "GRID_CARDS";
    const refs = p.dataRefs;

    if (layout === "TITLE") {
      return {
        type: "TITLE",
        title: p.title,
        subtitle: chunks[0]?.sublabel ?? chunks[0]?.label ?? truncate(p.purpose, 80),
        speakerNotes: notes,
        storyPhase: p.storyPhase,
      };
    }
    if (layout === "SOURCES") {
      return {
        type: "SOURCES",
        title: p.title,
        dataAsOf,
        items: refs.slice(0, 5).map((d) => truncate(`${d.category}: ${d.fact}`, 90)),
        speakerNotes: notes,
      };
    }
    if (layout === "METRIC" || p.visualHint === "big_number") {
      const hero =
        p.heroMetric ??
        (refs[0] ? extractHeroMetric(refs[0].fact) : null) ??
        (chunks[0] ? { value: chunks[0].label, label: chunks[0].sublabel ?? "" } : null);
      return {
        type: "METRIC",
        title: p.title,
        value: hero?.value ?? "—",
        label: hero?.label ?? chunks[0]?.sublabel ?? "",
        description: chunks[1]?.label ?? truncate(refs[0]?.fact ?? "", 80),
        speakerNotes: notes,
        storyPhase: p.storyPhase,
      };
    }
    if (layout === "SECTION_HEADER") {
      const dark = p.storyPhase === "intro";
      return {
        type: "SECTION_HEADER",
        title: p.title,
        description: chunks[0]?.label ?? truncate(p.purpose, 80),
        speakerNotes: notes,
        tone: dark ? "dark" : "default",
        storyPhase: p.storyPhase,
      };
    }
    if (layout === "STAT_GRID" || p.visualHint === "stat_grid") {
      const stats = refs.length
        ? refs.slice(0, 4).map((r, i) => {
            const m = extractHeroMetric(r.fact);
            return {
              value: m?.value ?? `${i + 1}`,
              label: m?.label ?? truncate(toNounKeyword(r.fact), 40),
              subtext: r.category,
              icon: ["chart", "school", "users", "target"][i % 4],
            };
          })
        : chunks.map((c, i) => ({
            value: c.label,
            label: c.sublabel ?? "",
            icon: ["chart", "school", "users", "target"][i % 4],
          }));
      return { type: "STAT_GRID", title: p.title, stats: stats.slice(0, 4), speakerNotes: notes };
    }
    if (layout === "CHART_BAR" || p.visualHint === "chart_bar") {
      const bars = refs.length
        ? refs.slice(0, 4).map((r) => {
            const m = extractHeroMetric(r.fact);
            const v = m ? parseFloat(m.value.replace("%", "")) || 50 : 50;
            return {
              label: truncate(toNounKeyword(r.category), 32),
              value: Math.min(100, v),
              display: m?.value,
            };
          })
        : chunks.map((c, i) => ({
            label: c.sublabel ?? c.label,
            value: 40 + i * 15,
            display: c.label,
          }));
      return { type: "CHART_BAR", title: p.title, bars, speakerNotes: notes };
    }
    if (layout === "ICON_GRID" || p.visualHint === "icon_grid") {
      const icons = chunks.slice(0, 3).map((c, i) => ({
        icon: ["book", "users", "lightbulb", "target"][i % 4],
        label: c.label,
        desc: c.sublabel ?? truncate(refs[i]?.fact ?? "", 50),
      }));
      return { type: "ICON_GRID", title: p.title, icons, speakerNotes: notes };
    }
    if (layout === "COMPARISON" || p.visualHint === "comparison") {
      const mid = Math.ceil(chunks.length / 2) || 1;
      return {
        type: "COMPARISON",
        title: p.title,
        leftTitle: "비교 A",
        leftItems: chunks.slice(0, mid).map((c) => c.label),
        rightTitle: "비교 B",
        rightItems:
          chunks.slice(mid).map((c) => c.label).length > 0
            ? chunks.slice(mid).map((c) => c.label)
            : refs.slice(0, 3).map((r) => truncate(toNounKeyword(r.fact), 36)),
        speakerNotes: notes,
      };
    }
    if (layout === "DATA_TABLE" || p.visualHint === "table") {
      return {
        type: "DATA_TABLE",
        title: p.title,
        headers: ["항목", "공식 데이터"],
        rows: refs.slice(0, 4).map((d) => [d.category, truncate(d.fact, 72)]),
        speakerNotes: notes,
      };
    }
    if (layout === "CHECKLIST") {
      return {
        type: "CHECKLIST",
        title: p.title,
        items: chunks.map((c) => c.label).slice(0, 3),
        speakerNotes: notes,
      };
    }
    if (layout === "STEP_CARDS" || layout === "PROCESS_FLOW") {
      return {
        type: layout === "PROCESS_FLOW" ? "PROCESS_FLOW" : "STEP_CARDS",
        title: p.title,
        steps: chunks.map((c) => ({ title: c.label, content: c.sublabel ?? "" })),
        speakerNotes: notes,
      };
    }
    if (layout === "INSTRUCTOR_INSIGHT") {
      return {
        type: "INSTRUCTOR_INSIGHT",
        title: p.title,
        prompts: chunks.map((c) => c.label),
        speakerNotes: notes,
      };
    }
    if (layout === "GRID_CARDS") {
      return {
        type: "GRID_CARDS",
        title: p.title,
        cards: chunks.map((c) => ({ title: c.label, desc: c.sublabel ?? "" })),
        speakerNotes: notes,
      };
    }
    return {
      type: "CHECKLIST",
      title: p.title,
      items: chunks.map((c) => c.label),
      speakerNotes: notes,
    };
  });
}

export async function produceSlidesFromPlans(
  _input: BriefingMaterialFormInput,
  plans: BriefingSlidePlan[],
  dataAsOf: string,
): Promise<{ slides: BriefingLayoutSlide[]; usage: GeminiTokenUsage; usedFallback: boolean }> {
  const userPrompt = `기준 시점: ${dataAsOf}
**슬라이드 ${plans.length}장**

[slidePlans — screenChunks·heroMetric·dataRefs 수치를 화면에 반영]
${JSON.stringify(plans, null, 2)}

CHECKLIST 연속 금지. METRIC/CHART/DATA_TABLE/COMPARISON/PROCESS_FLOW 우선.`;

  try {
    const { data: parsed, usage } = await geminiGenerateJson<{ slides?: unknown }>(
      PRODUCE_SYSTEM,
      userPrompt,
      0.35,
      "writer",
      32768,
    );
    const arr = Array.isArray(parsed.slides) ? parsed.slides : [];
    if (arr.length >= Math.max(1, plans.length - 1)) {
      const slides = plans.map((plan, i) => {
        const fallback = plansToLayoutSlides([plan], dataAsOf)[0];
        const ai = arr[i] as BriefingLayoutSlide | undefined;
        if (!ai?.type) return fallback;
        return {
          ...fallback,
          ...ai,
          type: str(ai.type) || plan.recommendedLayout,
          speakerNotes: str(ai.speakerNotes) || plan.speakerNotes,
        };
      });
      return { slides, usage, usedFallback: false };
    }
  } catch (e) {
    console.warn("[produceSlidesFromPlans] AI 실패, 규칙 기반 제작", e);
  }

  return {
    slides: plansToLayoutSlides(plans, dataAsOf),
    usage: { inputTokens: 0, outputTokens: 0 },
    usedFallback: true,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
