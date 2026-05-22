import {
  buildDocxSections,
  buildMasterOutline,
  recommendBriefingTopics,
} from "../geminiBriefingKit";
import { buildPerSlidePlans, produceSlidesFromPlans } from "../briefingSlidePlanning";
import type {
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
  const { topics, usage } = await recommendBriefingTopics(
    attachmentText + "\n\n" + data.corpusMarkdown,
    formWithScan,
    data.scan,
  );
  const ledger = { ...data.tokenLedger };
  ledger.topicSelection = addTokenUsage(
    emptyStageUsage(),
    usage.inputTokens,
    usage.outputTokens,
  );
  return { topics, tokenLedger: ledger };
}

/** Design: 마스터 아웃라인 + 슬라이드별 기획안 */
export async function runLocalEduSlidePlanning(
  input: LocalEduInput,
  data: LocalEduDataLayerResult,
  topic: BriefingTopicCandidate,
  attachmentText: string,
  attachmentNames: string[],
  storylineBrief?: BriefingStorylineBrief | null,
  onProgress?: (p: LocalEduProgress) => void,
): Promise<LocalEduPlanningOutput> {
  const form = localEduToFormInput(input, attachmentNames);
  const formWithScan = {
    ...form,
    officialScan: data.scan,
    selectedTopic: topic,
    pageCount: input.pageCount,
  };
  const ledger = { ...data.tokenLedger };

  onProgress?.({ layer: "design", message: "마스터 아웃라인 조립 중…" });
  const { outline, usage: outlineUsage } = await buildMasterOutline(
    data.corpusMarkdown + "\n\n" + attachmentText,
    formWithScan,
    topic,
  );
  ledger.slidePlanning = addTokenUsage(
    emptyStageUsage(),
    outlineUsage.inputTokens,
    outlineUsage.outputTokens,
  );

  onProgress?.({ layer: "design", message: "슬라이드별 기획 (제목·목적·데이터·화면 구성)…" });
  const { plans, usage: planUsage } = await buildPerSlidePlans(
    formWithScan,
    outline,
    storylineBrief,
  );
  ledger.slidePlanning = addTokenUsage(
    ledger.slidePlanning,
    planUsage.inputTokens,
    planUsage.outputTokens,
  );

  return { outline, slidePlans: plans, tokenLedger: ledger };
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
  const planning = await runLocalEduSlidePlanning(
    input,
    data,
    topic,
    attachmentText,
    attachmentNames,
    null,
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
