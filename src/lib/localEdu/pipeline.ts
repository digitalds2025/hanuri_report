import {
  assembleBriefingSlides,
  buildDocxSections,
  buildMasterOutline,
  recommendBriefingTopics,
} from "../geminiBriefingKit";
import type { BriefingTopicCandidate } from "../briefingMaterialTypes";
import type { ScanProgress } from "../briefingOfficialDataScan";
import { runLocalEduDataLayer, localEduToFormInput } from "./dataLayer";
import { buildConsultKit } from "./consultKit";
import { buildDocxMarkdown } from "./docxExport";
import { runLocalEduGuardrails } from "./guardrails";
import { layoutSlidesToPptxPayload } from "./pptxFromSlides";
import type {
  LocalEduGenerationOutput,
  LocalEduInput,
  LocalEduDataLayerResult,
} from "./types";

export type LocalEduProgress = {
  layer: "input" | "data" | "design" | "generation" | "guardrail";
  message: string;
};

export async function runLocalEduTopicRecommend(
  input: LocalEduInput,
  data: LocalEduDataLayerResult,
  attachmentText: string,
): Promise<BriefingTopicCandidate[]> {
  const form = localEduToFormInput(input, []);
  const formWithScan = { ...form, officialScan: data.scan };
  return recommendBriefingTopics(
    attachmentText + "\n\n" + data.corpusMarkdown,
    formWithScan,
    data.scan,
  );
}

export async function runLocalEduGeneration(
  input: LocalEduInput,
  data: LocalEduDataLayerResult,
  topic: BriefingTopicCandidate,
  attachmentText: string,
  attachmentNames: string[],
  onProgress?: (p: LocalEduProgress) => void,
): Promise<LocalEduGenerationOutput> {
  const form = localEduToFormInput(input, attachmentNames);
  const formWithScan = {
    ...form,
    officialScan: data.scan,
    selectedTopic: topic,
    pageCount: input.pageCount,
  };

  onProgress?.({ layer: "design", message: "마스터 아웃라인 조립 중…" });
  const outline = await buildMasterOutline(
    data.corpusMarkdown + "\n\n" + attachmentText,
    formWithScan,
    topic,
  );

  onProgress?.({ layer: "generation", message: "PPT 슬라이드 조립 (마스터 아웃라인 → 인스턴스)…" });
  const slides = await assembleBriefingSlides(formWithScan, outline);

  onProgress?.({ layer: "generation", message: "DOCX 자료집 파생…" });
  const docxSections = await buildDocxSections(outline);

  onProgress?.({ layer: "generation", message: "상담 키트 생성…" });
  const consultKit = await buildConsultKit(
    input,
    outline,
    data.corpusMarkdown,
  );

  const fullText = [
    outline.blocks.map((b) => b.bulletPoints.join("\n")).join("\n"),
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
    slides,
    docxSections,
    consultKit,
    guardrail,
    dataAsOf: outline.dataAsOf,
  };
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
