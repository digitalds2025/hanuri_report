import { geminiGenerateJson, geminiGenerateText, type GeminiTokenUsage } from "./geminiClient";
import {
  catalogSummaryForPrompt,
  getOutlineTemplate,
  OUTLINE_TEMPLATE_CATALOG,
  templateToOutlineBlock,
} from "./briefingOutlineTemplateCatalog";
import { buildOutlineSkeleton } from "./briefingOutlineTemplates";
import type {
  BriefingFoundationReport,
  BriefingMaterialFormInput,
  BriefingPlanningArtifact,
  BriefingStorylineBrief,
  BriefingTopicCandidate,
  DeliverableAdaptation,
  MasterOutline,
  MasterOutlineBlock,
  OutlineSelectionResult,
  SlideContentDraft,
} from "./briefingMaterialTypes";
import { buildOutlineFromReport } from "./briefingOutlineFromReport";
import { getRegionProfile } from "./briefingRegionProfiles";

function todayIso(): string {
  return new Date().toISOString();
}

function purposeLabel(audience: string): string {
  return audience === "신입 모집" ? "신규 모집·문제 인식" : "재원생 성과·승급";
}

function formBlock(input: BriefingMaterialFormInput, topic: BriefingTopicCandidate): string {
  const scan = input.officialScan;
  return [
    `지역: ${input.region} ${input.subRegion}`,
    `대상: ${input.schoolLevel} ${input.targetGrade}`,
    `목적: ${purposeLabel(input.parentAudience)}`,
    `주제: ${topic.title}`,
    `주제 요약: ${topic.summary}`,
    `슬라이드 목표: ${input.pageCount}장`,
    scan ? `수집 fact ${scan.facts.length}건` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const REPORT_SYSTEM = `당신은 지역 맞춤형 설명회·자료집용 '종합 레포트' 작성자입니다.
이용자가 선택한 **자료집 주제** 하나를 중심으로, 수집 corpus의 사실만으로 **줄글(장문)** 을 작성하세요.
학교명·수치·정책명·평가 항목을 풍부하게 인용. 일반론만으로 채우지 마세요.
마크다운: ## 대제목, ### 소제목, 본문(밀도 높게). 이후 슬라이드 N장으로 쪼갤 원고입니다.`;

export function buildReportFromMarkdown(
  topic: BriefingTopicCandidate,
  markdown: string,
): BriefingFoundationReport {
  return {
    title: topic.title,
    markdown,
    sections: parseMarkdownSections(markdown),
    generatedAt: todayIso(),
  };
}

export async function writeFoundationReport(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  corpusMarkdown: string,
  attachmentText: string,
  options?: { coreTopicLabels?: string[] },
): Promise<{ report: BriefingFoundationReport; usage: GeminiTokenUsage }> {
  const chipLine = options?.coreTopicLabels?.length
    ? `\n[핵심 주제 칩] ${options.coreTopicLabels.join(", ")}`
    : "";
  const userPrompt = `${formBlock(input, topic)}
${chipLine}

[작성 지침]
- 위 **필수 조건(지역·학년·목적)** 과 **선택 자료집 주제**에 정확히 부합하는 설명자료를 작성하세요.
- 수집 corpus의 A/B 등급 fact만 인용. 언론·맘카페는 참고만, 단독 근거 금지.
- 학부모가 읽는 **완결된 줄글** (서론→지역·학교 데이터→학년 이슈→대응→마무리).

[corpus / 수집 데이터]
${corpusMarkdown.slice(0, 28000)}

[첨부]
${attachmentText.slice(0, 8000) || "(없음)"}

위 근거만으로 **종합 레포트** 전문을 마크다운으로 작성하세요 (4000~8000자 권장).`;

  const { text, usage } = await geminiGenerateText(
    `${REPORT_SYSTEM}\n\n${userPrompt}`,
    0.35,
    "writer",
    65536,
  );
  const markdown = text.trim();
  const sections = parseMarkdownSections(markdown);

  return {
    report: {
      title: topic.title,
      markdown,
      sections,
      generatedAt: todayIso(),
    },
    usage,
  };
}

function parseMarkdownSections(md: string): BriefingFoundationReport["sections"] {
  const parts = md.split(/^##\s+/m).filter(Boolean);
  return parts.map((chunk, i) => {
    const lines = chunk.trim().split("\n");
    const heading = lines[0]?.trim() ?? `섹션 ${i + 1}`;
    const body = lines.slice(1).join("\n").trim();
    return { id: `sec-${i + 1}`, heading, body };
  });
}

const EXPAND_SLIDES_SYSTEM = `당신은 레포트를 설명회 슬라이드 N장 분량으로 확장하는 기획자입니다.
**선택 주제**에 맞게 레포트 내용을 N개 슬라이드로 나눕니다. 슬라이드마다 서로 다른 fact·다른 메시지.
슬라이드마다 narrative는 완결된 3~6문장(중간 절단 금지), keyFacts는 공식 출처 인용 2~4개(언론·맘카페 제외).
일반론 금지. slideDrafts 배열 길이는 userPrompt의 N과 정확히 일치.
1번 슬라이드는 TITLE용(주제 제시), 마지막은 CTA·다음 행동.

JSON만:
{
  "slideDrafts": [{
    "slideNumber": 1,
    "title": "구체 제목",
    "narrative": "확장 본문",
    "keyFacts": ["fact 인용"],
    "storyPhase": "intro|development|climax|closing",
    "suggestedLayout": "METRIC|DATA_TABLE|..."
  }]
}`;

export async function expandReportToSlideDrafts(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  report: BriefingFoundationReport,
  storyline?: BriefingStorylineBrief | null,
): Promise<{ drafts: SlideContentDraft[]; usage: GeminiTokenUsage }> {
  const n = Math.max(6, Math.min(40, input.pageCount));
  const userPrompt = `${formBlock(input, topic)}
총 ${n}장

${storyline ? `[스토리라인]\n${storyline.overview}\n${storyline.phases.map((p) => `${p.label} ${p.slideCount}장`).join("\n")}\n` : ""}

[종합 레포트]
${report.markdown.slice(0, 24000)}

레포트 내용을 ${n}개 slideDrafts로 확장·배분하세요.`;

  try {
    const { data, usage } = await geminiGenerateJson<{ slideDrafts?: unknown }>(
      EXPAND_SLIDES_SYSTEM,
      userPrompt,
      0.35,
      "writer",
      65536,
    );
    const arr = Array.isArray(data.slideDrafts) ? data.slideDrafts : [];
    const drafts = normalizeDraftCount(parseDrafts(arr), n, report);
    return { drafts, usage };
  } catch {
    return { drafts: fallbackDraftsFromReport(report, n), usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

function parseDrafts(arr: unknown[]): SlideContentDraft[] {
  return arr.map((item, i) => {
    const o = item as Record<string, unknown>;
    const facts = Array.isArray(o.keyFacts)
      ? o.keyFacts.filter((x): x is string => typeof x === "string")
      : [];
    return {
      slideNumber: Number(o.slideNumber) || i + 1,
      title: String(o.title ?? `슬라이드 ${i + 1}`),
      narrative: String(o.narrative ?? ""),
      keyFacts: facts,
      storyPhase: o.storyPhase as SlideContentDraft["storyPhase"],
      suggestedLayout: o.suggestedLayout ? String(o.suggestedLayout) : undefined,
    };
  });
}

function normalizeDraftCount(drafts: SlideContentDraft[], n: number, report: BriefingFoundationReport): SlideContentDraft[] {
  if (drafts.length === n) return drafts.map((d, i) => ({ ...d, slideNumber: i + 1 }));
  if (drafts.length > n) return drafts.slice(0, n).map((d, i) => ({ ...d, slideNumber: i + 1 }));
  const fb = fallbackDraftsFromReport(report, n);
  const merged = [...drafts];
  for (let i = drafts.length; i < n; i++) merged.push(fb[i] ?? fb[fb.length - 1]);
  return merged.map((d, i) => ({ ...d, slideNumber: i + 1 }));
}

function fallbackDraftsFromReport(report: BriefingFoundationReport, n: number): SlideContentDraft[] {
  const phases: SlideContentDraft["storyPhase"][] = ["intro", "development", "development", "climax", "closing"];
  const per = Math.max(1, Math.ceil(report.sections.length / n));
  const drafts: SlideContentDraft[] = [];
  for (let i = 0; i < n; i++) {
    const sec = report.sections.slice(i * per, (i + 1) * per);
    drafts.push({
      slideNumber: i + 1,
      title: sec[0]?.heading ?? report.title,
      narrative: sec.map((s) => s.body).join("\n\n").slice(0, 800),
      keyFacts: [],
      storyPhase: phases[Math.min(i, phases.length - 1)],
    });
  }
  return drafts;
}

const SELECT_OUTLINE_SYSTEM = `당신은 설명회·자료집 구조 설계 전문가입니다.
50종 아웃라인 블록 템플릿 카탈로그에서, 주어진 레포트·슬라이드 초안에 가장 효과적인 블록 순서를 고릅니다.

판단 기준:
1) PPT: 설명회 현장에서 설득·데이터 전달에 유리한 순서와 블록
2) 자료집(DOCX): 학부모가 집에서 읽기 쉬운 논리·깊이
3) slideDrafts 내용과 blockId가 의미적으로 맞아야 함
4) cover·sources·cta는 보통 포함, 중복 블록 최소화
5) 선택 블록 수: 8~18개 (내용 밀도에 따라)

JSON만:
{
  "selectedBlockIds": ["cover", "local_context", ...],
  "rationale": "왜 이 순서가 효과적인지 3~5문장",
  "pptEffectiveness": "PPT 관점",
  "docxReadability": "자료집 관점",
  "discardedAlternatives": ["blockId", ...]
}`;

export async function selectOutlineFromCatalog(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  report: BriefingFoundationReport,
  slideDrafts: SlideContentDraft[],
): Promise<{ selection: OutlineSelectionResult; usage: GeminiTokenUsage }> {
  const userPrompt = `${formBlock(input, topic)}

[블록 템플릿 카탈로그 — blockId만 선택]
${catalogSummaryForPrompt(50)}

[종합 레포트 요약]
${report.markdown.slice(0, 12000)}

[슬라이드 초안 ${slideDrafts.length}장]
${JSON.stringify(slideDrafts.slice(0, 25), null, 2)}

최적 blockId 순서를 고르세요.`;

  try {
    const { data, usage } = await geminiGenerateJson<OutlineSelectionResult>(
      SELECT_OUTLINE_SYSTEM,
      userPrompt,
      0.3,
      "writer",
      16384,
    );
    const ids = Array.isArray(data.selectedBlockIds)
      ? data.selectedBlockIds.filter((id) => getOutlineTemplate(String(id)))
      : [];
    if (ids.length < 5) throw new Error("선택 블록 부족");
    return {
      selection: {
        selectedBlockIds: ids,
        rationale: String(data.rationale ?? ""),
        pptEffectiveness: String(data.pptEffectiveness ?? ""),
        docxReadability: String(data.docxReadability ?? ""),
        discardedAlternatives: Array.isArray(data.discardedAlternatives)
          ? data.discardedAlternatives.map(String)
          : [],
      },
      usage,
    };
  } catch {
    return { selection: fallbackOutlineSelection(input, slideDrafts.length), usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

function fallbackOutlineSelection(
  input: BriefingMaterialFormInput,
  slideCount: number,
): OutlineSelectionResult {
  const isElem = input.schoolLevel === "초등";
  const base = [
    "cover",
    "how_to_read",
    "parent_pain",
    "local_context",
    isElem ? "middle_school_district" : "high_school_map",
    "school_compare",
    "school_evaluation_plan",
    "target_focus",
    isElem ? "performance_eval" : "written_exam",
    "parent_qa",
    "misconceptions",
    "brand_solution",
    "program_roadmap",
    "checklist",
    "consultation_prep",
    "sources",
    "cta",
  ];
  const count = Math.min(base.length, Math.max(8, Math.ceil(slideCount / 2)));
  return {
    selectedBlockIds: base.slice(0, count),
    rationale: "폴백: 기본 설명회 블록 순서",
    pptEffectiveness: "도입-데이터-해결-CTA",
    docxReadability: "읽는 법·지역·학교·Q&A·부록",
  };
}

const ADAPT_DELIVERABLES_SYSTEM = `당신은 동일 콘텐츠를 PPT(현장 설명)와 자료집(집에서 읽기) 컨셉으로 재작성하는 편집자입니다.
선택된 아웃라인 블록마다 pptAngle·docxAngle을 구체적으로 작성하세요.
JSON만:
{
  "pptConcept": "PPT 전체 톤·화면 원칙",
  "docxConcept": "자료집 전체 톤·문단 원칙",
  "toneNotes": "공통 톤",
  "blockAdaptations": [{ "blockId": "...", "pptAngle": "...", "docxAngle": "..." }]
}`;

export async function adaptContentForDeliverables(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  report: BriefingFoundationReport,
  slideDrafts: SlideContentDraft[],
  selection: OutlineSelectionResult,
): Promise<{ adaptation: DeliverableAdaptation; usage: GeminiTokenUsage }> {
  const userPrompt = `${formBlock(input, topic)}

[선택 블록]
${selection.selectedBlockIds.join(" → ")}

[선택 근거]
${selection.rationale}

[레포트 발췌]
${report.markdown.slice(0, 10000)}

[슬라이드 초안]
${JSON.stringify(slideDrafts.slice(0, 20), null, 2)}

PPT·자료집 컨셉으로 재작성 가이드를 JSON으로 주세요. blockAdaptations는 selectedBlockIds 각각 1건.`;

  try {
    const { data, usage } = await geminiGenerateJson<DeliverableAdaptation>(
      ADAPT_DELIVERABLES_SYSTEM,
      userPrompt,
      0.35,
      "writer",
      32768,
    );
    return {
      adaptation: {
        pptConcept: String(data.pptConcept ?? "화면은 수치·키워드, 멘트에서 근거"),
        docxConcept: String(data.docxConcept ?? "문단형·출처 각주"),
        toneNotes: String(data.toneNotes ?? ""),
        blockAdaptations: Array.isArray(data.blockAdaptations)
          ? data.blockAdaptations.map((b) => {
              const o = b as Record<string, unknown>;
              return {
                blockId: String(o.blockId ?? ""),
                pptAngle: String(o.pptAngle ?? ""),
                docxAngle: String(o.docxAngle ?? ""),
              };
            })
          : [],
      },
      usage,
    };
  } catch {
    return {
      adaptation: {
        pptConcept: "슬라이드는 fact·수치 중심, 3-3 규칙",
        docxConcept: "자료집은 서술·표·출처 병기",
        toneNotes: purposeLabel(input.parentAudience),
        blockAdaptations: selection.selectedBlockIds.map((blockId) => ({
          blockId,
          pptAngle: "핵심 수치·비교표",
          docxAngle: "배경 설명·근거 문단",
        })),
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

export function buildMasterOutlineFromPlanning(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  artifact: BriefingPlanningArtifact,
): MasterOutline {
  const dataAsOf = input.officialScan?.scannedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const card = getRegionProfile(input.subRegion, input.region);
  const { outlineSelection: selection, adaptation, foundationReport } = artifact;
  if (!selection || !adaptation) {
    return buildOutlineFromReport(input, topic, foundationReport);
  }

  const adaptByBlock = new Map(adaptation.blockAdaptations.map((a) => [a.blockId, a]));

  const blocks: MasterOutlineBlock[] = selection.selectedBlockIds
    .map((id: string) => {
      const tpl = getOutlineTemplate(id);
      if (!tpl) return null;
      const adapt = adaptByBlock.get(id);
      const bullets = [
        ...tpl.bulletPoints,
        ...(adapt?.docxAngle ? [`[자료집] ${adapt.docxAngle}`] : []),
        ...(adapt?.pptAngle ? [`[PPT] ${adapt.pptAngle}`] : []),
      ];
      return templateToOutlineBlock(tpl, {
        title: `${foundationReport.title} — ${tpl.title}`,
        bulletPoints: bullets.slice(0, 8),
      });
    })
    .filter((b: MasterOutlineBlock | null): b is MasterOutlineBlock => Boolean(b));

  if (!blocks.length) {
    const sk = buildOutlineSkeleton({
      schoolLevel: input.schoolLevel,
      targetGrade: input.targetGrade,
      parentAudience: input.parentAudience,
      regionCard: card,
      topicTitle: topic.title,
      dataAsOf,
    });
    return {
      topicId: topic.id,
      topicTitle: topic.title,
      dataAsOf,
      regionLabel: `${input.region} ${input.subRegion}`,
      targetLabel: `${input.schoolLevel} ${input.targetGrade}`,
      purposeLabel: purposeLabel(input.parentAudience),
      blocks: sk,
    };
  }

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    dataAsOf,
    regionLabel: `${input.region} ${input.subRegion}`,
    targetLabel: `${input.schoolLevel} ${input.targetGrade}`,
    purposeLabel: purposeLabel(input.parentAudience),
    blocks,
    selectedBlockIds: selection.selectedBlockIds,
    outlineSelectionRationale: selection.rationale,
  };
}

export type ReportPlanningProgress = {
  step: "report" | "expand" | "outline" | "adapt";
  message: string;
};

/** 레포트 선행 4단계 → PlanningArtifact */
export async function runBriefingReportPlanningPipeline(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  corpusMarkdown: string,
  attachmentText: string,
  storyline?: BriefingStorylineBrief | null,
  onProgress?: (p: ReportPlanningProgress) => void,
): Promise<{ artifact: BriefingPlanningArtifact; usage: GeminiTokenUsage }> {
  let total: GeminiTokenUsage = { inputTokens: 0, outputTokens: 0 };

  onProgress?.({ step: "report", message: "종합 레포트 작성 중…" });
  const { report, usage: u1 } = await writeFoundationReport(input, topic, corpusMarkdown, attachmentText);
  total = { inputTokens: total.inputTokens + u1.inputTokens, outputTokens: total.outputTokens + u1.outputTokens };

  onProgress?.({ step: "expand", message: `슬라이드 ${input.pageCount}장 분량으로 확장 중…` });
  const { drafts, usage: u2 } = await expandReportToSlideDrafts(input, topic, report, storyline);
  total = { inputTokens: total.inputTokens + u2.inputTokens, outputTokens: total.outputTokens + u2.outputTokens };

  onProgress?.({ step: "outline", message: "50종 템플릿 중 최적 아웃라인 선택 중…" });
  const { selection, usage: u3 } = await selectOutlineFromCatalog(input, topic, report, drafts);
  total = { inputTokens: total.inputTokens + u3.inputTokens, outputTokens: total.outputTokens + u3.outputTokens };

  onProgress?.({ step: "adapt", message: "PPT·자료집 컨셉으로 재작성 중…" });
  const { adaptation, usage: u4 } = await adaptContentForDeliverables(input, topic, report, drafts, selection);
  total = { inputTokens: total.inputTokens + u4.inputTokens, outputTokens: total.outputTokens + u4.outputTokens };

  return {
    artifact: { foundationReport: report, slideDrafts: drafts, outlineSelection: selection, adaptation },
    usage: total,
  };
}

export { OUTLINE_TEMPLATE_CATALOG };
