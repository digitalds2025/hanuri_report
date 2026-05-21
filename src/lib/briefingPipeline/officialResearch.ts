import {
  scanOfficialData,
  type ScanProgress,
} from "../briefingOfficialDataScan";
import type { BriefingMaterialFormInput } from "../briefingMaterialTypes";
import type { BriefingPipelineInput, BriefingResearchResult } from "./types";

export function pipelineToFormInput(input: BriefingPipelineInput): BriefingMaterialFormInput {
  return {
    referenceText: "",
    region: input.region,
    subRegion: input.subRegion,
    schoolLevel: input.schoolLevel,
    targetGrade: input.targetGrade,
    parentAudience: input.purpose,
    purposeCustom: input.purposeCustom,
    pageCount: 20,
    attachmentNames: [],
  };
}

/** Step 1: ①~④ + 공식 포털 키워드 배치 스캔 (전건 corpus, 요약 없음) */
export async function runStep1OfficialResearch(
  input: BriefingPipelineInput,
  onProgress?: (p: ScanProgress) => void,
): Promise<BriefingResearchResult> {
  const form = pipelineToFormInput(input);
  const scan = await scanOfficialData(form, "", onProgress, "full");

  return {
    markdown: scan.digestText,
    officialScan: scan,
    factCount: scan.facts.length,
    discoveredSchools: scan.discoveredSchools,
    keywordBatches: scan.keywordBatches,
    groundingQueries: scan.searchQueries,
    sourceLinks: scan.sourceLinks,
    createdAt: scan.scannedAt,
  };
}
