import { filterFactsForPlanning, matchFactsToDraft } from "./briefingFactQuality";
import { buildFactCatalog } from "./briefingSlidePlanningFacts";
import {
  contextSetsToScreenChunks,
  normalizeSlidePlan,
} from "./briefingSlidePlanNormalize";
import type {
  BriefingLayoutSlide,
  BriefingMaterialFormInput,
  BriefingPlanningArtifact,
  BriefingSlidePlan,
  BriefingStorylineBrief,
  BriefingTopicCandidate,
  SlideContentDraft,
  MasterOutline,
  SlideDataRef,
} from "./briefingMaterialTypes";
import { geminiGenerateJson, type GeminiTokenUsage } from "./geminiClient";
import {
  STORYLINE_PLANNING_RULES,
  applyStorylinePhases,
  buildPlansForPageCount,
  extractHeroMetric,
  layoutForContent,
  normalizePlanCount,
  truncate,
  truncateAtWord,
} from "./briefingStorylinePlanning";

function storyPhaseForIndex(index: number, total: number): "intro" | "development" | "climax" | "closing" {
  const r = index / total;
  if (r < 0.15) return "intro";
  if (r < 0.65) return "development";
  if (r < 0.85) return "climax";
  return "closing";
}

export function buildPlansFromSlideDrafts(
  drafts: SlideContentDraft[],
  catalog: SlideDataRef[],
  topic: BriefingTopicCandidate,
  regionLabel: string,
): BriefingSlidePlan[] {
  return drafts.map((d, i) => {
    const refs = matchFactsToDraft(d, catalog);
    const phase = d.storyPhase ?? storyPhaseForIndex(i, drafts.length);
    const { layout, visualHint } = layoutForContent(undefined, refs, phase);
    return normalizeSlidePlan(
      {
        slideNumber: d.slideNumber || i + 1,
        title: truncateAtWord(d.title, 72),
        purpose: topic.title,
        storyPhase: phase,
        recommendedLayout: d.suggestedLayout || layout,
        visualHint: visualHint,
        dataRefs: refs,
        speakerNotes: d.narrative,
        blockId: i === 0 ? "cover" : "data_spotlight",
      },
      catalog,
      regionLabel,
    );
  });
}

export const STRICT_SLIDE_PLAN_RULES = `
[Strict Generation Rules — 위반 시 실패]
1. 일반론 금지: "중학교에 가면 공부가 어려워집니다", "수행평가가 중요합니다" 등 뻔한 문장 절대 금지.
2. 데이터 그라운딩: userPrompt의 corpusMarkdown·fact catalog에서만 인용. 학교명·학생 수·평가 항목명·%·학군명·정책명을 슬라이드별로 강제 배분.
   - 학군/배정 슬라이드 → 중학교 배정·관내 학교명 fact 집중
   - 평가 슬라이드 → ○○초/○○중 평가계획서·서술형 비중·영역명 fact 집중
3. 정보 밀도: 슬라이드당 contextSets 최소 3세트. 각 세트는 phenomenon(2~3문장)·analysis(2문장)·screenKeyword(수치/고유명사) 필수.
4. 3단 구조: phenomenon(현상) → analysis(분석) → screenKeyword+screenDetail(화면 매핑).
5. heroFact.headline: 설득용 한 줄(고유명사+수치). properNouns에 학교·기관명 배열.
6. actionStrategy: 한우리 독서·토론·논술·맞춤 학습으로 연결하는 구체 전략 2~3문장.
7. consultantInsight: 공식 데이터 이면의 내신 경쟁도·학교 선택 유의점·현장 체감 추론.
8. speakerNotes: 구어체+인용 fact 원문+수치 (화면보다 길게).
`;

const PER_SLIDE_PLAN_SYSTEM = `당신은 지역 학원 설명회 슬라이드 기획 시니어 컨설턴트입니다.
${STORYLINE_PLANNING_RULES}
${STRICT_SLIDE_PLAN_RULES}

반드시 JSON만 출력. slidePlans 배열 길이 = userPrompt의 요청 장수.

각 slidePlan 스키마:
{
  "slideNumber": 1,
  "title": "구체적 슬라이드 제목 (지역·학교명 포함)",
  "purpose": "1슬라이드 1메시지",
  "storyPhase": "intro|development|climax|closing",
  "recommendedLayout": "METRIC|DATA_TABLE|CHART_BAR|COMPARISON|PROCESS_FLOW|...",
  "visualHint": "big_number|table|chart_bar|comparison|timeline|...",
  "dataRefs": [{ "id": "fact-0", "category": "...", "fact": "원문 인용" }],
  "heroFact": {
    "headline": "예: 의왕 백운중 학생 수 687명 · 2024 학교알리미",
    "properNouns": ["백운중", "의왕시", "학교알리미"],
    "metricValue": "687",
    "metricLabel": "백운중 학생 수",
    "sourceFactId": "fact-12"
  },
  "contextSets": [
    {
      "phenomenon": "fact 원문 기반 현상 2~3문장 (고유명사·수치)",
      "analysis": "학부모 관점 분석 2문장",
      "screenKeyword": "표/차트에 들어갈 짧은 키워드·수치",
      "screenDetail": "TABLE/METRIC 보조 셀",
      "mappedFactId": "fact-3"
    }
  ],
  "actionStrategy": "한우리 솔루션·학습 전략 연결 2~3문장",
  "consultantInsight": "컨설턴트 추론 1~2문장",
  "speakerNotes": "발표 멘트 (구어체, fact 인용, 150자 이상)"
}

contextSets는 슬라이드당 최소 3개, 서로 다른 fact·다른 phenomenon (동일 문장 3회 반복 금지).
언론·맘카페·블로그 fact 단독 사용 금지. 연도(2024 등)만 metric으로 쓰지 말 것.
선택 주제 제목과 무관한 슬라이드 금지. METRIC은 %·명·학교명 수치가 있을 때만.`;

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
  corpusMarkdown = "",
  planningArtifact?: BriefingPlanningArtifact | null,
): Promise<{ plans: BriefingSlidePlan[]; usage: GeminiTokenUsage; usedFallback: boolean }> {
  const scan = input.officialScan;
  const rawCatalog = scan ? buildFactCatalog(scan) : [];
  const topic = input.selectedTopic;
  const catalog =
    topic && rawCatalog.length ? filterFactsForPlanning(rawCatalog, topic) : rawCatalog;
  const targetCount = Math.max(6, Math.min(40, input.pageCount));
  const regionLabel = `${input.region} ${input.subRegion}`.trim();

  const fallback =
    planningArtifact?.slideDrafts?.length && topic
      ? buildPlansFromSlideDrafts(planningArtifact.slideDrafts, catalog, topic, regionLabel)
      : buildPlansForPageCount(targetCount, outline, catalog, storyline);

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
    heroHeadline: p.heroFact?.headline,
  }));

  const corpusExcerpt = corpusMarkdown.slice(0, 22000) || scan.digestText.slice(0, 22000);

  const artifactBlock = planningArtifact
    ? `
[종합 레포트 줄글 — 슬라이드·자료집의 원천]
${planningArtifact.foundationReport.markdown.slice(0, 14000)}

[${input.pageCount}장 분할 초안 — 각 slideDrafts.narrative를 heroFact/contextSets로 구체화]
${JSON.stringify(planningArtifact.slideDrafts, null, 2)}
`
    : "";

  const userPrompt = `지역: ${regionLabel}
[선택 자료집 주제 — 모든 슬라이드가 이 주제를 증명해야 함]
${topic?.title ?? outline.topicTitle}
${topic?.summary ?? ""}
대상: ${input.schoolLevel} ${input.targetGrade}
목적: ${input.parentAudience}${input.purposeCustom ? ` (${input.purposeCustom})` : ""}
기준 시점: ${outline.dataAsOf}
**요청 슬라이드 수: 정확히 ${targetCount}장** (slidePlans.length === ${targetCount})

${storyline ? `[설명회 흐름]\n${storyline.overview}\n${storyline.phases.map((p) => `${p.label} ${p.slideCount}장 · ${p.parentEmotion}`).join("\n")}\n` : ""}
${artifactBlock}

[마스터 아웃라인 블록]
${JSON.stringify(outline.blocks.map((b) => ({ blockId: b.blockId, title: b.title, purpose: b.purpose })), null, 2)}

[슬라이드 슬롯 골격]
${JSON.stringify(slotsPreview, null, 2)}

[fact catalog — dataRefs.id만 사용, fact 본문 재인용]
${JSON.stringify(catalog, null, 2)}

[corpusMarkdown — 슬라이드별로 fact를 쪼개 배분할 원천. 여기 없는 학교명·수치 창작 금지]
${corpusExcerpt}

줄글 레포트와 slideDrafts를 일치시키며 PPT 기획(heroFact, contextSets≥3, actionStrategy)으로 재작성하세요. 반드시 ${targetCount}개 slidePlans.`;

  try {
    const { data: parsed, usage } = await geminiGenerateJson<{ slidePlans?: unknown }>(
      PER_SLIDE_PLAN_SYSTEM,
      userPrompt,
      0.35,
      "writer",
      65536,
    );
    const arr = Array.isArray(parsed.slidePlans) ? parsed.slidePlans : [];
    if (!arr.length) throw new Error("슬라이드 기획 결과가 비어 있습니다.");

    const plans = arr.map((item, i) => {
      const o = item as Record<string, unknown> & Partial<BriefingSlidePlan>;
      const fb = fallback[i] ?? fallback[fallback.length - 1];

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
        .filter((r) => r.fact);

      return normalizeSlidePlan(
        {
          slideNumber: Number(o.slideNumber) || i + 1,
          title: String(o.title ?? fb.title),
          purpose: String(o.purpose ?? fb.purpose),
          storyPhase: (o.storyPhase as BriefingSlidePlan["storyPhase"]) ?? fb.storyPhase,
          recommendedLayout: String(o.recommendedLayout ?? fb.recommendedLayout),
          visualHint: String(o.visualHint ?? fb.visualHint),
          dataRefs: dataRefs.length ? dataRefs : fb.dataRefs,
          heroFact: o.heroFact as BriefingSlidePlan["heroFact"],
          contextSets: o.contextSets as BriefingSlidePlan["contextSets"],
          actionStrategy: o.actionStrategy ? String(o.actionStrategy) : undefined,
          consultantInsight: o.consultantInsight ? String(o.consultantInsight) : undefined,
          speakerNotes: o.speakerNotes ? String(o.speakerNotes) : undefined,
          blockId: fb.blockId,
        },
        catalog,
        regionLabel,
        fb,
      );
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

const PRODUCE_SYSTEM = `설명회 슬라이드 제작. slidePlans의 heroFact·contextSets·dataRefs만 화면에.
${STORYLINE_PLANNING_RULES}
${STRICT_SLIDE_PLAN_RULES}

type별 필드:
- METRIC: title, value, label, description
- CHART_BAR: bars[{label,value,display}]
- DATA_TABLE: headers, rows (contextSets의 phenomenon/screenDetail 활용)
- COMPARISON, PROCESS_FLOW, STAT_GRID, ICON_GRID
CHECKLIST 남발 금지. JSON만: { "slides": [ ... ] }`;

function chunksFromPlan(p: BriefingSlidePlan): ReturnType<typeof contextSetsToScreenChunks> {
  if (p.contextSets?.length >= 3) return contextSetsToScreenChunks(p.contextSets);
  if (p.screenChunks?.length) return p.screenChunks.slice(0, 5);
  return (p.keyMessages ?? []).slice(0, 5).map((m) => ({ label: truncate(m, 48) }));
}

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
    const hero =
      p.heroMetric ??
      (p.heroFact?.metricValue
        ? {
            value: p.heroFact.metricValue,
            label: p.heroFact.metricLabel ?? "",
          }
        : null);

    if (layout === "TITLE") {
      return {
        type: "TITLE",
        title: p.title,
        subtitle: p.heroFact?.headline ?? chunks[0]?.label ?? truncate(p.purpose, 80),
        speakerNotes: notes,
        storyPhase: p.storyPhase,
      };
    }
    if (layout === "SOURCES") {
      return {
        type: "SOURCES",
        title: p.title,
        dataAsOf,
        items: p.contextSets.slice(0, 6).map((c) => truncate(c.phenomenon, 90)),
        speakerNotes: notes,
      };
    }
    if (layout === "METRIC" || p.visualHint === "big_number") {
      const h =
        hero ??
        (refs[0] ? extractHeroMetric(refs[0].fact) : null) ??
        (chunks[0] ? { value: chunks[0].label, label: chunks[0].sublabel ?? "" } : null);
      return {
        type: "METRIC",
        title: p.title,
        value: h?.value ?? "—",
        label: h?.label ?? p.heroFact?.headline ?? "",
        description: p.contextSets[0]?.analysis ?? chunks[1]?.label ?? "",
        speakerNotes: notes,
        storyPhase: p.storyPhase,
      };
    }
    if (layout === "SECTION_HEADER") {
      const dark = p.storyPhase === "intro";
      return {
        type: "SECTION_HEADER",
        title: p.title,
        description: p.heroFact?.headline ?? chunks[0]?.label ?? truncate(p.purpose, 80),
        speakerNotes: notes,
        tone: dark ? "dark" : "default",
        storyPhase: p.storyPhase,
      };
    }
    if (layout === "STAT_GRID" || p.visualHint === "stat_grid") {
      const stats = p.contextSets.slice(0, 4).map((c, i) => {
        const m = extractHeroMetric(c.screenKeyword) ?? extractHeroMetric(c.phenomenon);
        return {
          value: m?.value ?? truncate(c.screenKeyword, 12),
          label: m?.label ?? truncate(c.screenKeyword, 40),
          subtext: truncate(c.screenDetail ?? c.analysis, 48),
          icon: ["chart", "school", "users", "target"][i % 4],
        };
      });
      return { type: "STAT_GRID", title: p.title, stats, speakerNotes: notes };
    }
    if (layout === "CHART_BAR" || p.visualHint === "chart_bar") {
      const bars = p.contextSets.slice(0, 4).map((c, i) => {
        const m = extractHeroMetric(c.screenKeyword) ?? extractHeroMetric(c.phenomenon);
        const v = m ? parseFloat(m.value.replace("%", "")) || 50 : 40 + i * 12;
        return {
          label: truncate(c.screenKeyword, 36),
          value: Math.min(100, v),
          display: m?.value ?? c.screenKeyword,
        };
      });
      return { type: "CHART_BAR", title: p.title, bars, speakerNotes: notes };
    }
    if (layout === "ICON_GRID" || p.visualHint === "icon_grid") {
      const icons = p.contextSets.slice(0, 4).map((c, i) => ({
        icon: ["book", "users", "lightbulb", "target"][i % 4],
        label: truncate(c.screenKeyword, 36),
        desc: truncate(c.screenDetail ?? c.analysis, 56),
      }));
      return { type: "ICON_GRID", title: p.title, icons, speakerNotes: notes };
    }
    if (layout === "COMPARISON" || p.visualHint === "comparison") {
      const half = Math.ceil(p.contextSets.length / 2) || 1;
      return {
        type: "COMPARISON",
        title: p.title,
        leftTitle: "비교 A",
        leftItems: p.contextSets.slice(0, half).map((c) => truncate(c.screenKeyword, 40)),
        rightTitle: "비교 B",
        rightItems: p.contextSets.slice(half).map((c) => truncate(c.screenKeyword, 40)),
        speakerNotes: notes,
      };
    }
    if (layout === "DATA_TABLE" || p.visualHint === "table") {
      return {
        type: "DATA_TABLE",
        title: p.title,
        headers: ["구분", "공식 데이터 / 분석"],
        rows: p.contextSets.slice(0, 5).map((c) => [
          truncate(c.screenKeyword, 32),
          truncate(c.phenomenon, 72),
        ]),
        speakerNotes: notes,
      };
    }
    if (layout === "CHECKLIST") {
      return {
        type: "CHECKLIST",
        title: p.title,
        items: p.contextSets.slice(0, 4).map((c) => truncate(c.screenKeyword, 48)),
        speakerNotes: notes,
      };
    }
    if (layout === "STEP_CARDS" || layout === "PROCESS_FLOW") {
      return {
        type: layout === "PROCESS_FLOW" ? "PROCESS_FLOW" : "STEP_CARDS",
        title: p.title,
        steps: p.contextSets.map((c) => ({
          title: truncate(c.screenKeyword, 32),
          content: truncate(c.analysis, 48),
        })),
        speakerNotes: notes,
      };
    }
    if (layout === "INSTRUCTOR_INSIGHT") {
      return {
        type: "INSTRUCTOR_INSIGHT",
        title: p.title,
        prompts: p.contextSets.map((c) => truncate(c.analysis, 80)),
        speakerNotes: notes,
      };
    }
    if (layout === "GRID_CARDS") {
      return {
        type: "GRID_CARDS",
        title: p.title,
        cards: p.contextSets.map((c) => ({
          title: c.screenKeyword,
          desc: truncate(c.analysis, 80),
        })),
        speakerNotes: notes,
      };
    }
    return {
      type: "DATA_TABLE",
      title: p.title,
      headers: ["항목", "내용"],
      rows: p.contextSets.map((c) => [c.screenKeyword, truncate(c.phenomenon, 72)]),
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
슬라이드 ${plans.length}장

[slidePlans]
${JSON.stringify(plans, null, 2)}`;

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
