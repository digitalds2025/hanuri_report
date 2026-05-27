import { buildDocxSections, recommendBriefingTopics } from "../geminiBriefingKit";
import { buildPerSlidePlans, produceSlidesFromPlans } from "../briefingSlidePlanning";
import { buildOutlineFromReport } from "../briefingBookletWorkflow";
import { expandReportToSlideDrafts, writeFoundationReport } from "../briefingReportPlanning";
import { CORE_TOPIC_OPTIONS } from "./types";
import type {
  BriefingFoundationReport,
  BriefingSlidePlan,
  BriefingStorylineBrief,
  BriefingTopicCandidate,
} from "../briefingMaterialTypes";
import type { ScanProgress } from "../briefingOfficialDataScan";
import { runLocalEduDataLayer, localEduToFormInput } from "./dataLayer";
import { buildConsultKit } from "./consultKit";
import { buildDocxMarkdown } from "./docxExport";
import { runLocalEduGuardrails } from "./guardrails";
import { layoutSlidesToPptxPayload } from "./pptxFromSlides";
import {
  addTokenUsage,
  emptyStageUsage,
  type LocalEduTokenLedger,
} from "./tokenUsage";
import type {
  LocalEduGenerationOutput,
  LocalEduInput,
  LocalEduDataLayerResult,
  LocalEduPlanningOutput,
} from "./types";

export type LocalEduProgress = {
  layer: "input" | "data" | "design" | "generation" | "guardrail";
  message: string;
};

export async function runLocalEduTopicRecommend(
  input: LocalEduInput,
  data: LocalEduDataLayerResult,
  attachmentText: string,
): Promise<{ topics: BriefingTopicCandidate[]; tokenLedger: LocalEduTokenLedger }> {
  const form = localEduToFormInput(input, []);
  const formWithScan = { ...form, officialScan: data.scan };
  const coreTopicLabels = input.coreTopics
    .map((id) => CORE_TOPIC_OPTIONS.find((o) => o.id === id)?.label ?? "")
    .filter((label) => label.length > 0);
  const { topics, usage } = await recommendBriefingTopics(
    attachmentText + "\n\n" + data.corpusMarkdown,
    formWithScan,
    data.scan,
    { coreTopicLabels },
  );
  const ledger = { ...data.tokenLedger };
  ledger.topicSelection = addTokenUsage(
    emptyStageUsage(),
    usage.inputTokens,
    usage.outputTokens,
  );
  return { topics, tokenLedger: ledger };
}

/** Design: 선택 주제 + 수집 데이터 → 설명자료 줄글(종합 레포트) */
export async function runLocalEduWriteManuscript(
  input: LocalEduInput,
  data: LocalEduDataLayerResult,
  topic: BriefingTopicCandidate,
  attachmentText: string,
  attachmentNames: string[],
  onProgress?: (p: LocalEduProgress) => void,
): Promise<{ report: BriefingFoundationReport; tokenLedger: LocalEduTokenLedger }> {
  const form = localEduToFormInput(input, attachmentNames);
  const formWithScan = {
    ...form,
    officialScan: data.scan,
    selectedTopic: topic,
    pageCount: input.pageCount,
  };
  const coreTopicLabels = input.coreTopics
    .map((id) => CORE_TOPIC_OPTIONS.find((o) => o.id === id)?.label ?? "")
    .filter((label) => label.length > 0);

  onProgress?.({ layer: "design", message: "설명자료 줄글(종합 레포트) 작성 중…" });
  const { report, usage } = await writeFoundationReport(
    formWithScan,
    topic,
    data.corpusMarkdown,
    attachmentText,
    { coreTopicLabels },
  );

  const ledger = { ...data.tokenLedger };
  ledger.manuscript = addTokenUsage(
    emptyStageUsage(),
    usage.inputTokens,
    usage.outputTokens,
  );

  return { report, tokenLedger: ledger };
}

/** Design: 승인된 줄글 → 슬라이드 장수 분할 + 슬라이드별 기획 */
export async function runLocalEduSlidePlanning(
  input: LocalEduInput,
  data: LocalEduDataLayerResult,
  topic: BriefingTopicCandidate,
  foundationReport: BriefingFoundationReport,
  _attachmentText: string,
  attachmentNames: string[],
  storylineBrief?: BriefingStorylineBrief | null,
  tokenLedgerIn?: LocalEduTokenLedger,
  onProgress?: (p: LocalEduProgress) => void,
): Promise<LocalEduPlanningOutput> {
  const form = localEduToFormInput(input, attachmentNames);
  const formWithScan = {
    ...form,
    officialScan: data.scan,
    selectedTopic: topic,
    pageCount: input.pageCount,
  };
  const ledger = { ...(tokenLedgerIn ?? data.tokenLedger) };

  onProgress?.({
    layer: "design",
    message: `줄글을 슬라이드 ${input.pageCount}장 분량으로 나누는 중…`,
  });
  const { drafts, usage: expandUsage } = await expandReportToSlideDrafts(
    formWithScan,
    topic,
    foundationReport,
    storylineBrief,
  );
  ledger.slidePlanning = addTokenUsage(
    ledger.slidePlanning ?? emptyStageUsage(),
    expandUsage.inputTokens,
    expandUsage.outputTokens,
  );

  const artifact = { foundationReport, slideDrafts: drafts };

  onProgress?.({ layer: "design", message: "슬라이드별 기획 (줄글 → PPT 기획안)…" });
  const outline = buildOutlineFromReport(formWithScan, topic, foundationReport);

  const { plans, usage: planUsage } = await buildPerSlidePlans(
    formWithScan,
    outline,
    storylineBrief,
    data.corpusMarkdown,
    artifact,
  );
  ledger.slidePlanning = addTokenUsage(
    ledger.slidePlanning,
    planUsage.inputTokens,
    planUsage.outputTokens,
  );

  return { outline, slidePlans: plans, planningArtifact: artifact, tokenLedger: ledger };
}

/** Generation: 승인된 기획안 → 구조화 슬라이드 + 부가 산출물 */
export async function runLocalEduSlideProduction(
  input: LocalEduInput,
  data: LocalEduDataLayerResult,
  topic: BriefingTopicCandidate,
  outline: LocalEduPlanningOutput["outline"],
  slidePlans: BriefingSlidePlan[],
  _attachmentText: string,
  attachmentNames: string[],
  tokenLedger: LocalEduTokenLedger,
  onProgress?: (p: LocalEduProgress) => void,
): Promise<LocalEduGenerationOutput> {
  const form = localEduToFormInput(input, attachmentNames);
  const formWithScan = {
    ...form,
    officialScan: data.scan,
    selectedTopic: topic,
    pageCount: input.pageCount,
  };
  const ledger = { ...tokenLedger };

  onProgress?.({ layer: "generation", message: "슬라이드 제작 (기획안 → 차트·인포그래픽 레이아웃)…" });
  const { slides, usage: slideUsage } = await produceSlidesFromPlans(
    formWithScan,
    slidePlans,
    outline.dataAsOf,
  );
  ledger.slideProduction = addTokenUsage(
    emptyStageUsage(),
    slideUsage.inputTokens,
    slideUsage.outputTokens,
  );

  onProgress?.({ layer: "generation", message: "DOCX 자료집 파생…" });
  const docxSections = await buildDocxSections(outline);

  onProgress?.({ layer: "generation", message: "상담 키트 생성…" });
  let consultKit: LocalEduGenerationOutput["consultKit"];
  try {
    const kitResult = await buildConsultKit(input, outline, data.corpusMarkdown);
    consultKit = kitResult.kit;
    ledger.slideProduction = addTokenUsage(
      ledger.slideProduction,
      kitResult.usage.inputTokens,
      kitResult.usage.outputTokens,
    );
  } catch (e) {
    console.warn("[runLocalEduSlideProduction] 상담 키트 생성 실패, 스킵", e);
    consultKit = {
      onePageSummaryMd: `# 상담 요약\n\n주제: ${outline.topicTitle}\n기준 시점: ${outline.dataAsOf}\n\n(AI 생성 실패 — 슬라이드·자료집은 사용 가능)`,
      questionListMd: "# 상담 핵심 질문\n(수동 작성)",
      kakaoMessageMd: "# 후속 안내문\n(수동 작성)",
    };
  }

  const fullText = [
    slidePlans.map((p) => p.slideContentPlan ?? p.contentPlan ?? "").join("\n"),
    JSON.stringify(slides),
    buildDocxMarkdown(outline, docxSections),
  ].join("\n");

  onProgress?.({ layer: "guardrail", message: "가드레일 검수…" });
  const guardrail = runLocalEduGuardrails(
    slides,
    formWithScan,
    outline.dataAsOf,
    fullText,
  );

  return {
    outline,
    slidePlans,
    slides,
    docxSections,
    consultKit,
    guardrail,
    dataAsOf: outline.dataAsOf,
    tokenLedger: ledger,
  };
}

/** @deprecated runLocalEduSlidePlanning + runLocalEduSlideProduction 사용 */
export async function runLocalEduGeneration(
  input: LocalEduInput,
  data: LocalEduDataLayerResult,
  topic: BriefingTopicCandidate,
  attachmentText: string,
  attachmentNames: string[],
  onProgress?: (p: LocalEduProgress) => void,
): Promise<LocalEduGenerationOutput> {
  const { report, tokenLedger: ledgerAfterMs } = await runLocalEduWriteManuscript(
    input,
    data,
    topic,
    attachmentText,
    attachmentNames,
    onProgress,
  );
  const planning = await runLocalEduSlidePlanning(
    input,
    data,
    topic,
    report,
    attachmentText,
    attachmentNames,
    null,
    ledgerAfterMs,
    onProgress,
  );
  return runLocalEduSlideProduction(
    input,
    data,
    topic,
    planning.outline,
    planning.slidePlans,
    attachmentText,
    attachmentNames,
    planning.tokenLedger,
    onProgress,
  );
}

export async function runLocalEduDataScan(
  input: LocalEduInput,
  attachmentText: string,
  attachmentNames: string[],
  onProgress?: (p: ScanProgress) => void,
): Promise<LocalEduDataLayerResult> {
  return runLocalEduDataLayer(input, attachmentText, attachmentNames, onProgress);
}

export { layoutSlidesToPptxPayload };
