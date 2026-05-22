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

const TOPIC_SYSTEM = `당신은 설명회 주제 선정 엔진입니다.
이미 수집된 공식 데이터 스캔 결과만 근거로 주제 3~5개를 제안하고 5대 기준으로 점수를 매깁니다.

[목적 — 사용자 고정]
- 신규 모집(신입 모집): 문제 인식·평가 변화·학습 방식 전환, 상담 CTA
- 기존 재원생 관리(기존 학생): 성과 정리·다음 학년 공백 리스크·재등록

[5대 점수화 — 각 0~100, 수집 facts와 목적·학년에 근거]
1. dataReliability: 공식 통계·학교 공개 자료로 문서 작성 가능한가
2. localRelevance: 해당 지역 학부모 로컬 이슈(학군·지자체 프로그램) 반영
3. targetAlignment: 초등=문해력·과정평가, 중등=내신·고교구조, 고등=입시 — 학년에 맞는가
4. consultationConversion: 설명회 후 1:1 상담·진단 신청으로 이어지기 쉬운가
5. brandIntegration: 독서·토론·논술(읽기·생각·말하기·쓰기)로 자연스럽게 연결되는가

금지: 스캔에 없는 학교명·수치 창작, 서열·단정, D등급 단독 근거

JSON만 출력:
{
  "topics": [{
    "id": "t1",
    "title": "주제",
    "summary": "2문장",
    "rationale": "5대 기준 근거 요약",
    "primarySources": ["URL 또는 기관명"],
    "scores": { "dataReliability": 0, "localRelevance": 0, "targetAlignment": 0, "consultationConversion": 0, "brandIntegration": 0 },
    "suggestedSlideCount": 10
  }]
}`;

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

/** Step 3: 스캔 결과 기반 주제 추천·5대 점수화 */
export async function recommendBriefingTopics(
  referenceText: string,
  input: BriefingMaterialFormInput,
  officialScan: OfficialDataScanResult,
): Promise<{ topics: BriefingTopicCandidate[]; usage: GeminiTokenUsage }> {
  const scanInput: BriefingMaterialFormInput = { ...input, officialScan };
  const userPrompt = `${formContextBlock(scanInput)}

[B등급 첨부 발췌]
${referenceText ? referenceText.slice(0, 6000) : "(없음)"}

수집 facts ${officialScan.facts.length}건, 관내 학교 ${officialScan.discoveredSchools.length}곳.
위 공식 데이터만 사용해 주제 3~5개와 5대 점수를 JSON으로 제안하세요.`;

  const { data: parsed, usage } = await geminiGenerateJson<{ topics?: unknown }>(
    TOPIC_SYSTEM,
    userPrompt,
    0.35,
  );
  const arr = Array.isArray(parsed.topics) ? parsed.topics : [];
  if (!arr.length) throw new Error("주제 추천 결과가 비어 있습니다.");

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

  return { topics, usage };
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
