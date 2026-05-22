import {
  buildFullResearchCorpus,
  scanOfficialDataWithBatches,
  type ScanProgress,
} from "../briefingOfficialDataScan";
import type { SearchKeywordBatch } from "../briefingSearchKeywords";
import type { BriefingMaterialFormInput } from "../briefingMaterialTypes";
import { buildBranchedScanBatches, getDataCollectionPlan } from "./dataMatrix";
import {
  addTokenUsage,
  emptyStageUsage,
  emptyTokenLedger,
} from "./tokenUsage";
import type { LocalEduDataLayerResult, LocalEduInput } from "./types";

const SCHOOL_BATCH_IDS = new Set([
  "curriculum_evaluation",
  "admission_stats",
]);

export function localEduToFormInput(
  input: LocalEduInput,
  attachmentNames: string[],
): BriefingMaterialFormInput {
  return {
    referenceText: "",
    region: input.region,
    subRegion: input.subRegion,
    schoolLevel: input.schoolLevel,
    targetGrade: input.targetGrade,
    parentAudience: input.parentAudience,
    purposeCustom: input.purposeCustom,
    pageCount: input.pageCount,
    attachmentNames,
  };
}

/** Data Layer — 대상×목적 분기 RAG 스캔 */
export async function runLocalEduDataLayer(
  input: LocalEduInput,
  attachmentText: string,
  attachmentNames: string[],
  onProgress?: (p: ScanProgress) => void,
): Promise<LocalEduDataLayerResult> {
  const form = localEduToFormInput(input, attachmentNames);
  const plan = getDataCollectionPlan(input);
  const regionName = input.subRegion || input.region;

  const regionBatches = buildBranchedScanBatches(input, [], plan).filter(
    (b) => !SCHOOL_BATCH_IDS.has(b.id),
  );

  let scan = await scanOfficialDataWithBatches(
    form,
    attachmentText,
    regionBatches,
    [],
    `LocalEdu · ${plan.targetBranch}`,
    onProgress,
  );

  const schoolBatches = buildBranchedScanBatches(input, scan.discoveredSchools, plan).filter(
    (b) => SCHOOL_BATCH_IDS.has(b.id),
  );

  let schoolScan: Awaited<ReturnType<typeof scanOfficialDataWithBatches>> | null = null;
  if (schoolBatches.length > 0) {
    schoolScan = await scanOfficialDataWithBatches(
      { ...form, purposeCustom: form.purposeCustom },
      attachmentText,
      [],
      schoolBatches,
      `LocalEdu · ${plan.purposeBranch}`,
      onProgress,
    );
    scan = {
      ...schoolScan,
      discoveredSchools: [
        ...new Set([...scan.discoveredSchools, ...schoolScan.discoveredSchools]),
      ],
      facts: [...scan.facts, ...schoolScan.facts],
      searchQueries: [...new Set([...scan.searchQueries, ...schoolScan.searchQueries])],
      sourceLinks: [
        ...new Map(
          [...scan.sourceLinks, ...schoolScan.sourceLinks].map((s) => [s.uri, s]),
        ).values(),
      ],
      keywordBatches: [...scan.keywordBatches, ...schoolScan.keywordBatches],
      summaries: [...(scan.summaries ?? []), ...(schoolScan.summaries ?? [])],
      digestText: buildFullResearchCorpus(
        regionName,
        form,
        schoolScan.scannedAt,
        [...new Set([...scan.discoveredSchools, ...schoolScan.discoveredSchools])],
        [...scan.facts, ...schoolScan.facts],
        [...scan.keywordBatches, ...schoolScan.keywordBatches] as SearchKeywordBatch[],
        `전체 · ${input.schoolLevel} ${input.targetGrade}`,
      ),
      scanScope: "local_edu_full",
      tokenUsage: {
        inputTokens:
          (scan.tokenUsage?.inputTokens ?? 0) + (schoolScan.tokenUsage?.inputTokens ?? 0),
        outputTokens:
          (scan.tokenUsage?.outputTokens ?? 0) + (schoolScan.tokenUsage?.outputTokens ?? 0),
      },
    };
  }

  const ledger = emptyTokenLedger();
  const scanUsage = scan.tokenUsage ?? { inputTokens: 0, outputTokens: 0 };
  const apiCalls = scan.keywordBatches.reduce(
    (n, b) => n + Math.ceil(b.queries.length / 5),
    0,
  );
  ledger.dataCollection = addTokenUsage(
    emptyStageUsage(),
    scanUsage.inputTokens,
    scanUsage.outputTokens,
    apiCalls,
  );

  const corpusMarkdown = [
    scan.digestText,
    "",
    "## 데이터 수집 분기 (Input×Data Matrix)",
    plan.matrixSummary,
    "",
    attachmentText.trim()
      ? `## 사용자 업로드 자료 (B등급 — 핵심 근거)\n${attachmentText.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    scan,
    corpusMarkdown,
    branchSummary: plan.matrixSummary,
    tokenLedger: ledger,
  };
}
