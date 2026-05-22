import {
  geminiGenerateWithGoogleSearch,
  parseJsonFromModelText,
  type GeminiTokenUsage,
} from "./geminiClient";
import {
  buildFullKeywordPool,
  buildSearchKeywordBatches,
  purposeBriefForScan,
  type SearchKeywordBatch,
} from "./briefingSearchKeywords";
import type {
  BriefingMaterialFormInput,
  DataTrustGrade,
  OfficialDataScanResult,
} from "./briefingMaterialTypes";
import { formatRegionContext, getRegionProfile } from "./briefingRegionProfiles";

export type ScanProgress = {
  phase: string;
  batchId?: string;
  batchLabel?: string;
  queryCount?: number;
};

type BatchParseResult = {
  discoveredSchools?: string[];
  facts?: {
    category?: string;
    fact?: string;
    sourceExcerpt?: string;
    sourceTitle?: string;
    sourceUri?: string;
    grade?: string;
  }[];
  summary?: string;
};

function toOfficialFact(
  f: NonNullable<BatchParseResult["facts"]>[number],
  batchId: string,
): OfficialDataScanResult["facts"][number] | null {
  if (!f.fact?.trim()) return null;
  return {
    category: f.category ?? batchId,
    fact: f.fact.trim(),
    sourceTitle: f.sourceTitle,
    sourceUri: f.sourceUri,
    sourceExcerpt: f.sourceExcerpt?.trim() || undefined,
    grade: (f.grade === "B" ? "B" : "A") as DataTrustGrade,
  };
}

const SCAN_SYSTEM = `당신은 한국 공교육 공식 데이터 수집 에이전트입니다.
Google Search 그라운딩으로 반드시 아래 출처를 우선합니다.

[① 반드시 우선 참고 — A등급]
- 학교알리미 schoolinfo.go.kr
- 시·도교육청 고입안내·평준화/비평준화 배정·입학전학포털
- 교육통계서비스 KESS kess.kedi.re.kr
- 대입정보포털 어디가 adiga.kr
- 대학입학처 전형결과 공개자료

[② 공식 보완 — B등급]
- 학교 홈페이지(학교소개, 교육과정, 평가계획, 진학지도)
- 교육지원청 자료실
- 교육청 설명회 자료/PDF

규칙:
- 맘카페·학원 블로그·언론은 facts에 단독 근거로 넣지 마세요.
- 확인되지 않은 수치·학교명을 만들지 마세요. 검색·그라운딩에 있는 것만 기록.
- 학교명은 공식 표기(예: ○○초등학교)로 정리.
- **요약·생략 금지**: 키워드마다 가능한 한 많은 facts를 JSON에 담으세요. 배치당 facts 15건 이상을 목표로 하세요.
- 각 fact의 sourceExcerpt는 출처 원문 3~8문장을 최대한 길게(수치·연도·학교명 포함).
- 데이터 연도·확인 시점(2024~2026)을 fact 문장에 포함.
- grade: schoolinfo/교육청/KESS/어디가/입학처=A, 학교홈·지원청·설명회PDF=B

반드시 아래 JSON만 출력 (마크다운 코드블록 가능):
{
  "discoveredSchools": ["학교명1", "..."],
  "facts": [
    {
      "category": "학군|평가|진학|지자체|정책|공식포털",
      "fact": "검증 가능한 사실(수치·연도 포함)",
      "sourceExcerpt": "출처 원문 발췌(3~8문장, 요약하지 말 것)",
      "sourceTitle": "출처 제목",
      "sourceUri": "URL",
      "grade": "A|B"
    }
  ],
  "summary": ""
}`;

const QUERY_CHUNK_SIZE = 5;

function regionDisplayName(input: BriefingMaterialFormInput): string {
  return input.subRegion || `${input.region}`;
}

function mergeUniqueSchools(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing.map((s) => s.trim()).filter(Boolean));
  for (const s of incoming) {
    const t = s.trim();
    if (t && (t.includes("학교") || t.includes("초") || t.includes("중") || t.includes("고"))) {
      set.add(t);
    }
  }
  return [...set].slice(0, 15);
}

function chunkQueries(queries: string[], size = QUERY_CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < queries.length; i += size) {
    chunks.push(queries.slice(i, i + size));
  }
  return chunks;
}

function mergeSourceLinks(
  acc: Map<string, { title: string; uri: string }>,
  chunks: { title?: string; uri?: string }[],
): void {
  for (const c of chunks) {
    const uri = c.uri?.trim();
    if (!uri) continue;
    const title = c.title?.trim() || uri;
    if (!acc.has(uri)) acc.set(uri, { title, uri });
  }
}

function safeParseScanBatch(text: string, batchLabel: string): BatchParseResult {
  try {
    return parseJsonFromModelText<BatchParseResult>(text);
  } catch {
    try {
      const schoolsMatch = text.match(/"discoveredSchools"\s*:\s*(\[[\s\S]*?\])/);
      const factsMatch = text.match(/"facts"\s*:\s*(\[[\s\S]*?\])\s*(?:,|\})/);
      const partial: BatchParseResult = { discoveredSchools: [], facts: [] };
      if (schoolsMatch?.[1]) {
        partial.discoveredSchools = JSON.parse(repairJsonSlice(schoolsMatch[1])) as string[];
      }
      if (factsMatch?.[1]) {
        partial.facts = JSON.parse(repairJsonSlice(factsMatch[1])) as BatchParseResult["facts"];
      }
      if ((partial.facts?.length ?? 0) > 0 || (partial.discoveredSchools?.length ?? 0) > 0) {
        return partial;
      }
    } catch {
      /* fall through */
    }
    console.warn(`[공식 스캔] JSON 파싱 실패 — ${batchLabel}, 해당 청크는 건너뜁니다.`);
    return { discoveredSchools: [], facts: [], summary: "" };
  }
}

function repairJsonSlice(s: string): string {
  return s.replace(/,\s*([}\]])/g, "$1");
}

async function runScanBatch(
  batch: SearchKeywordBatch,
  input: BriefingMaterialFormInput,
  regionName: string,
  discoveredSchools: string[],
  attachmentExcerpt: string,
): Promise<{
  parsed: BatchParseResult;
  queries: string[];
  chunks: { title?: string; uri?: string }[];
  usage: GeminiTokenUsage;
}> {
  const merged: BatchParseResult = { discoveredSchools: [], facts: [] };
  const allQueries: string[] = [];
  const allChunks: { title?: string; uri?: string }[] = [];
  let usage: GeminiTokenUsage = { inputTokens: 0, outputTokens: 0 };
  const card = getRegionProfile(input.subRegion, input.region);
  const queryChunks = chunkQueries(batch.queries);

  for (let ci = 0; ci < queryChunks.length; ci++) {
    const chunk = queryChunks[ci];
    const userPrompt = [
      purposeBriefForScan(input.parentAudience, input.purposeCustom),
      `지역: ${input.region} ${regionName}`,
      `대상: ${input.schoolLevel} / ${input.targetGrade}`,
      formatRegionContext(card),
      "",
      `[${batch.label}] (${ci + 1}/${queryChunks.length}) 아래 검색 키워드 각각에 대해 공식 데이터를 수집하세요:`,
      ...chunk.map((q, i) => `${i + 1}. ${q}`),
      discoveredSchools.length
        ? `\n이미 파악된 관내 학교(참고): ${discoveredSchools.join(", ")}`
        : "",
      attachmentExcerpt ? `\n[B등급 첨부 발췌]\n${attachmentExcerpt.slice(0, 4000)}` : "",
      "",
      "키워드별로 facts를 최대한 많이. sourceExcerpt는 요약하지 말고 원문을 길게. JSON만 출력.",
    ].join("\n");

    const { text, grounding, usage: chunkUsage } = await geminiGenerateWithGoogleSearch(
      SCAN_SYSTEM,
      userPrompt,
      0.15,
      "research",
      16384,
    );
    usage = {
      inputTokens: usage.inputTokens + chunkUsage.inputTokens,
      outputTokens: usage.outputTokens + chunkUsage.outputTokens,
    };
    const parsed = safeParseScanBatch(text, batch.label);
    allQueries.push(...grounding.webSearchQueries);
    allChunks.push(...grounding.groundingChunks);
    merged.discoveredSchools = mergeUniqueSchools(
      merged.discoveredSchools ?? [],
      parsed.discoveredSchools ?? [],
    );
    merged.facts = [...(merged.facts ?? []), ...(parsed.facts ?? [])];
  }

  return {
    parsed: merged,
    queries: allQueries,
    chunks: allChunks,
    usage,
  };
}

export type OfficialDataScanScope = "region" | "school_supplement" | "full";

/** 자료집·Step2/3용 — 수집 전건(요약·50건 제한 없음) */
export function buildFullResearchCorpus(
  regionName: string,
  input: BriefingMaterialFormInput,
  scannedAt: string,
  discoveredSchools: string[],
  allFacts: OfficialDataScanResult["facts"],
  batchesRun: SearchKeywordBatch[],
  scopeNote: string,
): string {
  const factBlocks = allFacts.map((f, i) => {
    const lines = [
      `### [${f.grade}] 사실 ${i + 1} · ${f.category}`,
      `- **근거 문장**: ${f.fact}`,
    ];
    if (f.sourceExcerpt?.trim()) {
      lines.push(`- **출처 발췌(원문)**:`, f.sourceExcerpt.trim());
    }
    if (f.sourceTitle || f.sourceUri) {
      lines.push(`- **출처**: ${f.sourceTitle ?? ""} ${f.sourceUri ?? ""}`.trim());
    }
    return lines.join("\n");
  });

  return [
    `# 공식 리서치 원본 (${regionName})`,
    `스캔 시각: ${scannedAt} · ${scopeNote}`,
    purposeBriefForScan(input.parentAudience, input.purposeCustom),
    `대상: ${input.schoolLevel} / ${input.targetGrade}`,
    `수집 사실 **${allFacts.length}건** (아래 전건을 자료 제작에 사용. 임의 요약·생략 금지)`,
    "",
    "## 우선 참고 출처",
    "- 학교알리미 · 시·도교육청 고입/배정 · 입학전학포털 · KESS · 어디가 · 대학입학처 전형결과",
    "- 보완: 학교 홈페이지 · 교육지원청 자료실 · 교육청 설명회 PDF",
    "",
    "## 파악된 관내 학교",
    discoveredSchools.length ? discoveredSchools.join(", ") : "(미확인)",
    "",
    "## 수집 사실 전건",
    ...factBlocks,
    "",
    "## 실행 검색 키워드 (①~④ + 공식 포털)",
    ...batchesRun.flatMap((b) => [`### ${b.label}`, ...b.queries.map((q) => `- ${q}`)]),
  ].join("\n");
}

function buildDigest(
  regionName: string,
  input: BriefingMaterialFormInput,
  scannedAt: string,
  discoveredSchools: string[],
  _summaries: string[],
  allFacts: OfficialDataScanResult["facts"],
  batchesRun: SearchKeywordBatch[],
  scopeNote: string,
): string {
  return buildFullResearchCorpus(
    regionName,
    input,
    scannedAt,
    discoveredSchools,
    allFacts,
    batchesRun,
    scopeNote,
  );
}

async function processScanBatches(
  batches: SearchKeywordBatch[],
  input: BriefingMaterialFormInput,
  regionName: string,
  discoveredSchools: string[],
  attachmentExcerpt: string,
  allQueries: string[],
  sourceMap: Map<string, { title: string; uri: string }>,
  allFacts: OfficialDataScanResult["facts"],
  summaries: string[],
  batchesRun: SearchKeywordBatch[],
  tokenUsage: GeminiTokenUsage,
  onProgress?: (p: ScanProgress) => void,
  phaseLabel = "공식 데이터 스캔",
): Promise<string[]> {
  let schools = [...discoveredSchools];
  for (const batch of batches) {
    onProgress?.({
      phase: phaseLabel,
      batchId: batch.id,
      batchLabel: batch.label,
      queryCount: batch.queries.length,
    });
    batchesRun.push(batch);
    const { parsed, queries, chunks, usage } = await runScanBatch(
      batch,
      input,
      regionName,
      schools,
      attachmentExcerpt,
    );
    tokenUsage.inputTokens += usage.inputTokens;
    tokenUsage.outputTokens += usage.outputTokens;
    allQueries.push(...queries);
    mergeSourceLinks(sourceMap, chunks);
    schools = mergeUniqueSchools(schools, parsed.discoveredSchools ?? []);
    if (parsed.summary?.trim()) summaries.push(`[${batch.label}] ${parsed.summary}`);
    for (const f of parsed.facts ?? []) {
      const row = toOfficialFact(f, batch.id);
      if (row) allFacts.push(row);
    }
  }
  return schools;
}

/** 분기된 배치 시퀀스로 공식 데이터 수집 (LocalEdu Data Layer) */
export async function scanOfficialDataWithBatches(
  input: BriefingMaterialFormInput,
  attachmentText: string,
  regionBatches: SearchKeywordBatch[],
  schoolBatches: SearchKeywordBatch[],
  scopeNote: string,
  onProgress?: (p: ScanProgress) => void,
): Promise<OfficialDataScanResult> {
  const regionName = regionDisplayName(input);
  const scannedAt = new Date().toISOString();
  const allQueries: string[] = [];
  const sourceMap = new Map<string, { title: string; uri: string }>();
  let discoveredSchools: string[] = [];
  const allFacts: OfficialDataScanResult["facts"] = [];
  const summaries: string[] = [];
  const batchesRun: SearchKeywordBatch[] = [];
  const attachmentExcerpt = attachmentText.trim();
  let tokenUsage: GeminiTokenUsage = { inputTokens: 0, outputTokens: 0 };

  onProgress?.({ phase: "Data Layer · 지역·공식 포털 스캔" });
  discoveredSchools = await processScanBatches(
    regionBatches,
    input,
    regionName,
    discoveredSchools,
    attachmentExcerpt,
    allQueries,
    sourceMap,
    allFacts,
    summaries,
    batchesRun,
    tokenUsage,
    onProgress,
  );

  if (discoveredSchools.length === 0) {
    discoveredSchools = mergeUniqueSchools(discoveredSchools, [
      `${regionName} 관내 초등학교`,
      `${regionName} 관내 중학교`,
    ]);
  }

  if (schoolBatches.length > 0) {
    onProgress?.({ phase: "Data Layer · 학교별 심화 스캔" });
    discoveredSchools = await processScanBatches(
      schoolBatches,
      input,
      regionName,
      discoveredSchools,
      attachmentExcerpt,
      allQueries,
      sourceMap,
      allFacts,
      summaries,
      batchesRun,
      tokenUsage,
      onProgress,
      "학교명 기반 심화 검색",
    );
  }

  const digestText = buildDigest(
    regionName,
    input,
    scannedAt,
    discoveredSchools,
    summaries,
    allFacts,
    batchesRun,
    scopeNote,
  );

  return {
    scannedAt,
    regionName,
    targetGrade: input.targetGrade,
    schoolLevel: input.schoolLevel,
    purpose: input.parentAudience,
    keywordBatches: batchesRun,
    discoveredSchools,
    facts: allFacts,
    searchQueries: [...new Set(allQueries)],
    sourceLinks: [...sourceMap.values()],
    summaries,
    digestText,
    scanScope: scopeNote,
    tokenUsage,
  };
}

/** Step 2: 키워드 풀 + Google Search 그라운딩으로 공식 데이터 수집 */
export async function scanOfficialData(
  input: BriefingMaterialFormInput,
  attachmentText: string,
  onProgress?: (p: ScanProgress) => void,
  scope: OfficialDataScanScope = "full",
  prior?: Pick<
    OfficialDataScanResult,
    "discoveredSchools" | "facts" | "sourceLinks" | "searchQueries" | "summaries"
  >,
): Promise<OfficialDataScanResult> {
  const regionName = regionDisplayName(input);
  const scannedAt = new Date().toISOString();
  const allQueries: string[] = [...(prior?.searchQueries ?? [])];
  const sourceMap = new Map<string, { title: string; uri: string }>();
  for (const s of prior?.sourceLinks ?? []) {
    sourceMap.set(s.uri, s);
  }
  let discoveredSchools: string[] = [...(prior?.discoveredSchools ?? [])];
  const allFacts: OfficialDataScanResult["facts"] = [...(prior?.facts ?? [])];
  const summaries: string[] = [...(prior?.summaries ?? [])];
  const batchesRun: SearchKeywordBatch[] = [];

  const attachmentExcerpt = attachmentText.trim();
  const runRegionBatches = scope === "region" || scope === "full";
  const runSchoolBatches = scope === "school_supplement" || scope === "full";
  const discoveryMode = scope !== "school_supplement";

  if (runRegionBatches) {
  onProgress?.({ phase: "⓪ 공식 포털·① 학군 구조 검색" });
  const phase1 = buildSearchKeywordBatches({
    regionName,
    region: input.region,
    subRegion: input.subRegion,
    schoolLevel: input.schoolLevel,
    targetGrade: input.targetGrade,
  }).filter((b) => b.id === "official_tier1" || b.id === "district_structure");

  for (const batch of phase1) {
    onProgress?.({
      phase: "공식 데이터 스캔",
      batchId: batch.id,
      batchLabel: batch.label,
      queryCount: batch.queries.length,
    });
    batchesRun.push(batch);
    const { parsed, queries, chunks } = await runScanBatch(
      batch,
      input,
      regionName,
      discoveredSchools,
      attachmentExcerpt,
    );
    allQueries.push(...queries);
    mergeSourceLinks(sourceMap, chunks);
    discoveredSchools = mergeUniqueSchools(
      discoveredSchools,
      parsed.discoveredSchools ?? [],
    );
    if (parsed.summary) summaries.push(`[${batch.label}] ${parsed.summary}`);
    for (const f of parsed.facts ?? []) {
      const row = toOfficialFact(f, batch.id);
      if (row) allFacts.push(row);
    }
  }
  }

  if (discoveredSchools.length === 0 && runRegionBatches) {
    discoveredSchools = mergeUniqueSchools(discoveredSchools, [
      `${regionName} 관내 초등학교`,
      `${regionName} 관내 중학교`,
    ]);
  }

  if (runRegionBatches) {
    onProgress?.({ phase: "④ 지자체 · ⓪ 공식 보완 검색" });
    const phaseInfra = buildSearchKeywordBatches({
      regionName,
      region: input.region,
      subRegion: input.subRegion,
      schoolLevel: input.schoolLevel,
      targetGrade: input.targetGrade,
    }).filter((b) => b.id === "local_infra" || b.id === "official_tier2");
    for (const batch of phaseInfra) {
      onProgress?.({
        phase: "공식 데이터 스캔",
        batchId: batch.id,
        batchLabel: batch.label,
        queryCount: batch.queries.length,
      });
      batchesRun.push(batch);
      const { parsed, queries, chunks } = await runScanBatch(
        batch,
        input,
        regionName,
        discoveredSchools,
        attachmentExcerpt,
      );
      allQueries.push(...queries);
      mergeSourceLinks(sourceMap, chunks);
      discoveredSchools = mergeUniqueSchools(discoveredSchools, parsed.discoveredSchools ?? []);
      if (parsed.summary) summaries.push(`[${batch.label}] ${parsed.summary}`);
      for (const f of parsed.facts ?? []) {
        const row = toOfficialFact(f, batch.id);
        if (row) allFacts.push(row);
      }
    }
  }

  if (runSchoolBatches) {
  const phase2Batches = buildSearchKeywordBatches({
    regionName,
    region: input.region,
    subRegion: input.subRegion,
    schoolLevel: input.schoolLevel,
    targetGrade: input.targetGrade,
    schoolNames: discoveredSchools,
    includeSchoolBatches: true,
    discoveryMode,
  }).filter((b) => b.id === "curriculum_evaluation" || b.id === "admission_stats");

  for (const batch of phase2Batches) {
    onProgress?.({
      phase: "학교명 기반 심화 검색",
      batchId: batch.id,
      batchLabel: batch.label,
      queryCount: batch.queries.length,
    });
    batchesRun.push(batch);
    const { parsed, queries, chunks } = await runScanBatch(
      batch,
      input,
      regionName,
      discoveredSchools,
      attachmentExcerpt,
    );
    allQueries.push(...queries);
    mergeSourceLinks(sourceMap, chunks);
    discoveredSchools = mergeUniqueSchools(
      discoveredSchools,
      parsed.discoveredSchools ?? [],
    );
    if (parsed.summary) summaries.push(`[${batch.label}] ${parsed.summary}`);
    for (const f of parsed.facts ?? []) {
      const row = toOfficialFact(f, batch.id);
      if (row) allFacts.push(row);
    }
  }
  }

  const scopeNote =
    scope === "region"
      ? `지역 공통 · ${input.schoolLevel} ${input.targetGrade} (심화 검색 전)`
      : scope === "school_supplement"
        ? `학교급 심화 · ${input.schoolLevel} ${input.targetGrade}`
        : `전체 · ${input.schoolLevel} ${input.targetGrade}`;

  const digestText = buildDigest(
    regionName,
    input,
    scannedAt,
    discoveredSchools,
    summaries,
    allFacts,
    batchesRun,
    scopeNote,
  );

  return {
    scannedAt,
    regionName,
    targetGrade: input.targetGrade,
    schoolLevel: input.schoolLevel,
    purpose: input.parentAudience,
    keywordBatches: batchesRun,
    discoveredSchools,
    facts: allFacts,
    searchQueries: [...new Set(allQueries)],
    sourceLinks: [...sourceMap.values()],
    summaries,
    digestText,
    scanScope: scope,
  };
}

/** UI용: ①~④ 전체 키워드 풀 미리보기 */
export function previewFullKeywordPool(region: string, subRegion: string): SearchKeywordBatch[] {
  const regionName = subRegion || region;
  return buildFullKeywordPool({ regionName, region, subRegion });
}

/** 학년·목적 확정 후 ②③ 심화 스캔 병합 */
export async function supplementOfficialDataScan(
  prior: OfficialDataScanResult,
  input: BriefingMaterialFormInput,
  attachmentText: string,
  onProgress?: (p: ScanProgress) => void,
): Promise<OfficialDataScanResult> {
  return scanOfficialData(input, attachmentText, onProgress, "school_supplement", {
    discoveredSchools: prior.discoveredSchools,
    facts: prior.facts,
    sourceLinks: prior.sourceLinks,
    searchQueries: prior.searchQueries,
    summaries: prior.summaries ?? [],
  });
}
