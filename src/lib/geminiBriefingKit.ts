import type { ParentAudience, SchoolLevel } from "../config/koreaRegions";
import {
  previewFullKeywordPool,
  scanOfficialData,
  supplementOfficialDataScan,
  type ScanProgress,
} from "./briefingOfficialDataScan";
import { geminiGenerateJson, parseJsonFromModelText, type GeminiTokenUsage } from "./geminiClient";
import { buildPerSlidePlansSync } from "./briefingSlidePlanning";
import { buildOutlineSkeleton, PPT_PRIORITY_BLOCKS } from "./briefingOutlineTemplates";
import { formatRegionContext, getRegionProfile } from "./briefingRegionProfiles";
import type {
  BriefingLayoutSlide,
  BriefingMaterialFormInput,
  BriefingSlidePlan,
  BriefingTopicCandidate,
  MasterOutline,
  MasterOutlineBlock,
  OfficialDataScanResult,
  TopicScoreBreakdown,
} from "./briefingMaterialTypes";

function todayDataAsOf(): string {
  return new Date().toISOString().slice(0, 10);
}

function formContextBlock(input: BriefingMaterialFormInput): string {
  const card = getRegionProfile(input.subRegion, input.region);
  const lines = [
    `지역: ${input.region} ${input.subRegion}`,
    formatRegionContext(card),
    `대상: ${input.schoolLevel} / ${input.targetGrade}`,
    `목적: ${purposeLabel(input.parentAudience)} (${input.parentAudience})`,
    `슬라이드 목표 분량: ${input.pageCount}장`,
    input.attachmentNames.length ? `B등급 첨부(보조): ${input.attachmentNames.join(", ")}` : "",
  ];
  if (input.officialScan) {
    lines.push("", "[공식 데이터 스캔]", input.officialScan.digestText.slice(0, 18000));
  }
  return lines.filter(Boolean).join("\n");
}

function averageScore(s: TopicScoreBreakdown): number {
  return Math.round(
    (s.dataReliability +
      s.localRelevance +
      s.targetAlignment +
      s.consultationConversion +
      s.brandIntegration) /
      5,
  );
}

function normalizeScores(raw: Record<string, unknown>): TopicScoreBreakdown {
  const n = (k: string, alt: string, fallback: number) =>
    Number(raw[k] ?? raw[alt]) || fallback;
  return {
    dataReliability: n("dataReliability", "officialData", 70),
    localRelevance: n("localRelevance", "regionalFit", 70),
    targetAlignment: n("targetAlignment", "targetFit", 70),
    consultationConversion: n("consultationConversion", "consultationConversion", 65),
    brandIntegration: n("brandIntegration", "brandConnection", 60),
  };
}

const TOPIC_SYSTEM = `당신은 지역 맞춤형 설명회·자료집의 "주제" 선정 엔진입니다.
이미 수집된 공식 데이터(facts)만 근거로, 이용자가 설정한 **필수 조건(지역·학년)·목적·핵심 주제**에 맞는 자료집 주제 3~5개를 제안합니다.

각 주제는 이후 "줄글 레포트 → 슬라이드 N장 분할"의 제목이 됩니다. 추상적 슬로건보다 수집 fact에 맞는 구체 주제(학군·평가·정책·학교명 등)를 쓰세요.

[5대 점수화 — 각 0~100]
1. dataReliability 2. localRelevance 3. targetAlignment 4. consultationConversion 5. brandIntegration

금지: 스캔에 없는 학교명·수치 창작, 서열·단정

반드시 JSON만, topics 배열 3~5개:
{
  "topics": [{
    "id": "t1",
    "title": "자료집 주제",
    "summary": "2문장",
    "rationale": "목적·핵심주제·fact 근거",
    "primarySources": ["출처"],
    "scores": { "dataReliability": 0, "localRelevance": 0, "targetAlignment": 0, "consultationConversion": 0, "brandIntegration": 0 },
    "suggestedSlideCount": 10
  }]
}`;

function extractTopicsArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const o = parsed as Record<string, unknown>;
  if (Array.isArray(o.topics)) return o.topics;
  if (Array.isArray(o.topicList)) return o.topicList;
  if (Array.isArray(o.recommendations)) return o.recommendations;
  return [];
}

export function fallbackBookletTopics(
  input: BriefingMaterialFormInput,
  officialScan: OfficialDataScanResult,
  coreTopicLabels: string[] = [],
): BriefingTopicCandidate[] {
  const region = `${input.region} ${input.subRegion}`.trim();
  const grade = `${input.schoolLevel} ${input.targetGrade}`;
  const purpose =
    input.purposeCustom?.trim() ||
    (input.parentAudience === "신입 모집" ? "신규 모집" : "재원생·승급");

  const fromFacts = officialScan.facts.slice(0, 3).map((f, i) => ({
    id: `fallback-fact-${i + 1}`,
    title: `${region} · ${f.category} — ${grade} 학부모 자료`,
    summary: f.fact.slice(0, 200),
    rationale: `수집 fact 기반 폴백 주제 (${purpose})`,
    primarySources: f.sourceTitle ? [f.sourceTitle] : ["학교알리미"],
    scores: {
      dataReliability: 75,
      localRelevance: 80,
      targetAlignment: 70,
      consultationConversion: 65,
      brandIntegration: 60,
    },
    totalScore: 70,
    suggestedSlideCount: input.pageCount,
  }));

  if (fromFacts.length >= 2) return fromFacts;

  const chips = coreTopicLabels.length ? coreTopicLabels : ["지역 학교·평가", "학부모 안내"];
  return chips.slice(0, 4).map((label, i) => ({
    id: `fallback-chip-${i + 1}`,
    title: `${region} ${grade} — ${label}`,
    summary: `${purpose} 목적에 맞춘 ${label} 중심 설명회·자료집`,
    rationale: "AI 주제 JSON 비어 있음 — 핵심 주제·지역 조건 기반 폴백",
    primarySources: ["학교알리미", "교육청"],
    scores: {
      dataReliability: 60,
      localRelevance: 75,
      targetAlignment: 70,
      consultationConversion: 60,
      brandIntegration: 55,
    },
    totalScore: 64,
    suggestedSlideCount: input.pageCount,
  }));
}

/** Step 2-A: 지역만 스캔 (시·도·구 선택 직후) */
export async function runRegionOfficialDataScan(
  input: BriefingMaterialFormInput,
  onProgress?: (p: ScanProgress) => void,
): Promise<OfficialDataScanResult> {
  return scanOfficialData(input, "", onProgress, "full");
}

/** Step 2-B: 학교급·학년 확정 후 ②③ 심화 스캔 병합 */
export async function runSchoolSupplementScan(
  prior: OfficialDataScanResult,
  attachmentText: string,
  input: BriefingMaterialFormInput,
  onProgress?: (p: ScanProgress) => void,
): Promise<OfficialDataScanResult> {
  return supplementOfficialDataScan(prior, input, attachmentText, onProgress);
}

/** Step 3: 수집 데이터 + 이용자 조건 → 자료집 주제 후보 */
export async function recommendBriefingTopics(
  referenceText: string,
  input: BriefingMaterialFormInput,
  officialScan: OfficialDataScanResult,
  options?: { coreTopicLabels?: string[] },
): Promise<{
  topics: BriefingTopicCandidate[];
  usage: GeminiTokenUsage;
  usedFallback: boolean;
}> {
  const scanInput: BriefingMaterialFormInput = { ...input, officialScan };
  const chipLine = options?.coreTopicLabels?.length
    ? `\n[이용자 핵심 주제] ${options.coreTopicLabels.join(", ")}`
    : "";
  const userPrompt = `${formContextBlock(scanInput)}
${chipLine}

[B등급 첨부 발췌]
${referenceText ? referenceText.slice(0, 6000) : "(없음)"}

수집 facts ${officialScan.facts.length}건, 관내 학교 ${officialScan.discoveredSchools.length}곳.
위 공식 데이터·필수 조건·목적·핵심 주제에 맞는 자료집 주제 3~5개를 JSON topics 배열로 제안하세요.`;

  let usage: GeminiTokenUsage = { inputTokens: 0, outputTokens: 0 };
  let arr: unknown[] = [];

  try {
    const res = await geminiGenerateJson<{ topics?: unknown }>(
      TOPIC_SYSTEM,
      userPrompt,
      0.35,
    );
    usage = res.usage;
    arr = extractTopicsArray(res.data);
  } catch (e) {
    console.warn("[recommendBriefingTopics] AI 실패, 폴백 주제", e);
  }

  if (!arr.length) {
    return {
      topics: fallbackBookletTopics(input, officialScan, options?.coreTopicLabels),
      usage,
      usedFallback: true,
    };
  }

  const topics = arr
    .map((item, i) => {
      const o = item as Record<string, unknown>;
      const scores = normalizeScores((o.scores ?? {}) as Record<string, unknown>);
      const sources = Array.isArray(o.primarySources)
        ? o.primarySources.filter((x): x is string => typeof x === "string")
        : officialScan.sourceLinks.slice(0, 5).map((s) => s.title);
      return {
        id: String(o.id ?? `topic-${i + 1}`),
        title: String(o.title ?? `주제 ${i + 1}`),
        summary: String(o.summary ?? ""),
        rationale: String(o.rationale ?? ""),
        primarySources: sources.length ? sources : ["학교알리미", "교육청"],
        scores,
        totalScore: averageScore(scores),
        suggestedSlideCount:
          typeof o.suggestedSlideCount === "number"
            ? Math.min(20, Math.max(6, o.suggestedSlideCount))
            : input.pageCount,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  return { topics, usage, usedFallback: false };
}

const OUTLINE_FILL_SYSTEM = `당신은 마스터 아웃라인 '조립' 엔진입니다.
공식 데이터 스캔 전건·사용자 업로드(B등급)만 근거로 블록 bullet을 채웁니다.
요약·생략 금지. 학교명·수치·연도는 스캔/첨부에 있는 것만.
정성·현장 영역은 instructorInsightSlots에 '노란 박스 보강' 항목으로 남기세요.
확인되지 않은 정보는 '교육청·학교 공고 확인'으로 표기.

JSON: { "blocks": [{ "blockId", "title", "purpose", "bulletPoints", "instructorInsightSlots" }] }`;

function mergeOutlineFromSkeleton(
  skeleton: MasterOutlineBlock[],
  filled: MasterOutlineBlock[],
  input: BriefingMaterialFormInput,
): MasterOutlineBlock[] {
  return skeleton.map((sk) => {
    const f = filled.find((b) => b.blockId === sk.blockId);
    return {
      ...sk,
      bulletPoints: f?.bulletPoints?.length ? f.bulletPoints : sk.bulletPoints,
      instructorInsightSlots: f?.instructorInsightSlots ?? sk.instructorInsightSlots,
      sources: [
        ...(sk.sources ?? []),
        ...(input.officialScan?.sourceLinks.slice(0, 3).map((s) => s.title) ?? []),
      ],
    };
  });
}

export async function buildMasterOutline(
  referenceText: string,
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
): Promise<{ outline: MasterOutline; usage: GeminiTokenUsage; usedFallback: boolean }> {
  const dataAsOf = input.officialScan?.scannedAt.slice(0, 10) ?? todayDataAsOf();
  const card = getRegionProfile(input.subRegion, input.region);
  const skeleton = buildOutlineSkeleton({
    schoolLevel: input.schoolLevel,
    targetGrade: input.targetGrade,
    parentAudience: input.parentAudience,
    regionCard: card,
    topicTitle: topic.title,
    dataAsOf,
  });

  const baseOutline: MasterOutline = {
    topicId: topic.id,
    topicTitle: topic.title,
    dataAsOf,
    regionLabel: `${input.region} ${input.subRegion}`,
    targetLabel: `${input.schoolLevel} ${input.targetGrade}`,
    purposeLabel: purposeLabel(input.parentAudience),
    blocks: skeleton,
  };

  const userPrompt = `${formContextBlock(input)}

[선택 주제] ${topic.title}: ${topic.summary}

[블록 골격]
${JSON.stringify(skeleton, null, 2)}

[B등급 첨부]
${referenceText ? referenceText.slice(0, 4000) : "(없음)"}`;

  try {
    const { data: parsed, usage } = await geminiGenerateJson<{ blocks?: MasterOutlineBlock[] }>(
      OUTLINE_FILL_SYSTEM,
      userPrompt,
      0.3,
      "writer",
      16384,
    );
    const filled = Array.isArray(parsed.blocks) ? parsed.blocks : skeleton;
    return {
      outline: { ...baseOutline, blocks: mergeOutlineFromSkeleton(skeleton, filled, input) },
      usage,
      usedFallback: false,
    };
  } catch (e) {
    console.warn("[buildMasterOutline] AI 실패, 골격 폴백 사용", e);
    return {
      outline: baseOutline,
      usage: { inputTokens: 0, outputTokens: 0 },
      usedFallback: true,
    };
  }
}

const ASSEMBLY_SYSTEM = `Gamma 스타일 슬라이드 조립. 아웃라인 bullet만 사용. 서열·단정 금지.
반드시 JSON만: { "slides": [ { "type": "TITLE|CHECKLIST|SECTION_HEADER|INSTRUCTOR_INSIGHT|SOURCES|DETAILED_TEXT", "title": "...", ... } ] }
각 slide에 speakerNotes(발표 멘트) 포함. SOURCES 슬라이드에 dataAsOf 필수.`;

function extractSlidesFromParsed(parsed: unknown): BriefingLayoutSlide[] {
  if (Array.isArray(parsed)) return parsed as BriefingLayoutSlide[];
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.slides)) return o.slides as BriefingLayoutSlide[];
    if (Array.isArray(o.data)) return o.data as BriefingLayoutSlide[];
  }
  return [];
}

/** AI 없이 아웃라인 → 편집 가능 슬라이드 (폴백) */
export function outlineToLayoutSlides(outline: MasterOutline): BriefingLayoutSlide[] {
  const blocks = outline.blocks.filter((b) =>
    (PPT_PRIORITY_BLOCKS as readonly string[]).includes(b.blockId as (typeof PPT_PRIORITY_BLOCKS)[number]),
  );

  return blocks.map((b) => {
    const notes = b.instructorInsightSlots?.length
      ? `현장 보강: ${b.instructorInsightSlots.join(" / ")}`
      : "";

    if (b.blockId === "cover") {
      return {
        type: "TITLE",
        title: b.title,
        subtitle: b.bulletPoints[0] ?? b.purpose,
        speakerNotes: notes,
      };
    }
    if (b.blockId === "sources") {
      return {
        type: "SOURCES",
        title: b.title,
        dataAsOf: outline.dataAsOf,
        items: b.bulletPoints,
        speakerNotes: notes,
      };
    }
    if (b.instructorInsightSlots?.length) {
      return {
        type: "INSTRUCTOR_INSIGHT",
        title: b.title,
        prompts: b.instructorInsightSlots,
        speakerNotes: notes,
      };
    }
    return {
      type: "CHECKLIST",
      title: b.title,
      items: b.bulletPoints.length ? b.bulletPoints : [b.purpose],
      speakerNotes: notes,
    };
  });
}

export async function assembleBriefingSlides(
  input: BriefingMaterialFormInput,
  outline: MasterOutline,
): Promise<{ slides: BriefingLayoutSlide[]; usage: GeminiTokenUsage; usedFallback: boolean }> {
  const pptBlocks = outline.blocks.filter((b) =>
    (PPT_PRIORITY_BLOCKS as readonly string[]).includes(b.blockId as (typeof PPT_PRIORITY_BLOCKS)[number]),
  );

  const userPrompt = `[아웃라인 PPT 블록]
${JSON.stringify(pptBlocks, null, 2)}

지역: ${input.region} ${input.subRegion}
슬라이드 약 ${Math.min(input.pageCount, pptBlocks.length + 2)}장.
JSON: { "slides": [ ... ] }`;

  try {
    const { data: parsed, usage } = await geminiGenerateJson<unknown>(
      ASSEMBLY_SYSTEM,
      userPrompt,
      0.35,
      "writer",
      24576,
    );
    let slides = extractSlidesFromParsed(parsed);
    if (!slides.length && typeof parsed === "string") {
      slides = extractSlidesFromParsed(parseJsonFromModelText(parsed));
    }
    if (slides.length > 0) {
      return { slides, usage, usedFallback: false };
    }
  } catch (e) {
    console.warn("[assembleBriefingSlides] AI 실패, 아웃라인 폴백", e);
  }

  const fallback = outlineToLayoutSlides(outline);
  if (!fallback.length) {
    throw new Error("슬라이드를 만들 수 없습니다. 주제를 다시 선택해 주세요.");
  }
  return {
    slides: fallback,
    usage: { inputTokens: 0, outputTokens: 0 },
    usedFallback: true,
  };
}

export async function buildDocxSections(
  outline: MasterOutline,
): Promise<{ blockId: string; title: string; paragraphs: string[] }[]> {
  return outline.blocks.map((b) => ({
    blockId: b.blockId,
    title: b.title,
    paragraphs: [
      b.purpose,
      ...b.bulletPoints.map((p) => `• ${p}`),
      ...(b.instructorInsightSlots?.length
        ? ["", "[강사 인사이트]", ...b.instructorInsightSlots.map((s) => `▶ ${s}`)]
        : []),
      ...(b.sources?.length ? ["", "출처: " + b.sources.join(", ")] : []),
    ].filter(Boolean),
  }));
}

export function outlineToSlidePlans(outline: MasterOutline, pageCount = 18): BriefingSlidePlan[] {
  return buildPerSlidePlansSync(outline, [], pageCount);
}

export async function planBriefingSlides(
  referenceText: string,
  input: BriefingMaterialFormInput,
): Promise<BriefingSlidePlan[]> {
  const scan = await scanOfficialData(input, referenceText);
  const { topics } = await recommendBriefingTopics(referenceText, input, scan);
  const topic = topics[0];
  if (!topic) throw new Error("주제를 생성하지 못했습니다.");
  const { outline } = await buildMasterOutline(referenceText, { ...input, officialScan: scan }, topic);
  return outlineToSlidePlans(outline);
}

export async function designBriefingSlideLayouts(
  _referenceText: string,
  input: BriefingMaterialFormInput,
  plans: BriefingSlidePlan[],
): Promise<BriefingLayoutSlide[]> {
  const topic: BriefingTopicCandidate = input.selectedTopic ?? {
    id: "legacy",
    title: plans[0]?.title ?? "설명회",
    summary: "",
    rationale: "",
    primarySources: [],
    scores: {
      dataReliability: 70,
      localRelevance: 70,
      targetAlignment: 70,
      consultationConversion: 65,
      brandIntegration: 60,
    },
    totalScore: 68,
    suggestedSlideCount: input.pageCount,
  };
  const outline =
    input.masterOutline ??
    (await buildMasterOutline("", input, topic)).outline;
  return (await assembleBriefingSlides(input, outline)).slides;
}

export function targetGradesForLevel(level: SchoolLevel): import("./briefingMaterialTypes").TargetGrade[] {
  switch (level) {
    case "초등":
      return ["초4", "초5", "초6"];
    case "중등":
      return ["중1", "중2", "중3"];
    case "고등":
      return ["고1", "고2", "고3"];
  }
}

export function defaultTargetGrade(level: SchoolLevel): import("./briefingMaterialTypes").TargetGrade {
  return targetGradesForLevel(level)[0];
}

export function purposeLabel(audience: ParentAudience): string {
  return audience === "신입 모집" ? "신규 모집" : "기존 재원생 관리";
}

export type { ScanProgress } from "./briefingOfficialDataScan";
export { previewFullKeywordPool };
