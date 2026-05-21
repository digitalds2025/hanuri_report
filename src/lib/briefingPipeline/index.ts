import { geminiGenerateJson, geminiGenerateText } from "../geminiClient";
import { runLocalEduDataLayer } from "../localEdu/dataLayer";
import {
  step2TopicsSystem,
  step2TopicsUser,
  step3ManuscriptPrompt,
  step4CompileSystem,
} from "./prompts";
import type {
  BriefingPipelineInput,
  BriefingPptxPayload,
  BriefingResearchResult,
  BriefingTopicProposal,
} from "./types";

export type { BriefingPipelineInput, BriefingPptxPayload, BriefingResearchResult, BriefingTopicProposal };

function averageTopicScore(t: BriefingTopicProposal["scores"]): number {
  return Math.round(
    (t.dataReliability.score +
      t.localRelevance.score +
      t.ctaConversion.score +
      t.brandAlignment.score) /
      4,
  );
}

/** @deprecated LocalEdu Data Layer 사용 권장 */
export async function runStep1LocalResearch(
  input: BriefingPipelineInput,
  onProgress?: (p: import("../briefingOfficialDataScan").ScanProgress) => void,
): Promise<BriefingResearchResult> {
  const data = await runLocalEduDataLayer(
    {
      region: input.region,
      subRegion: input.subRegion,
      schoolLevel: input.schoolLevel,
      targetGrade: input.targetGrade,
      parentAudience: input.purpose,
      purposeCustom: input.purposeCustom,
      coreTopics: ["school_info", "performance_literacy"],
      brandIntensity: "중",
      tone: "안내형",
      pageCount: 18,
    },
    "",
    [],
    onProgress,
  );
  return {
    markdown: data.corpusMarkdown,
    officialScan: data.scan,
    factCount: data.scan.facts.length,
    discoveredSchools: data.scan.discoveredSchools,
    keywordBatches: data.scan.keywordBatches,
    groundingQueries: data.scan.searchQueries,
    sourceLinks: data.scan.sourceLinks,
    createdAt: data.scan.scannedAt,
  };
}

export { runStep1OfficialResearch, pipelineToFormInput } from "./officialResearch";

/** Step 2: gemini-3.5-flash → 주제 3개 + 점수 */
export async function runStep2TopicProposals(
  input: BriefingPipelineInput,
  research: BriefingResearchResult,
): Promise<BriefingTopicProposal[]> {
  const parsed = await geminiGenerateJson<{ topics?: BriefingTopicProposal[] }>(
    step2TopicsSystem(),
    step2TopicsUser(research.markdown, input, research.factCount),
    0.35,
    "writer",
    16384,
  );

  const raw = Array.isArray(parsed.topics) ? parsed.topics : [];
  if (raw.length < 1) throw new Error("주제 제안을 생성하지 못했습니다.");

  return raw.slice(0, 3).map((t, i) => {
    const scores = t.scores ?? ({} as BriefingTopicProposal["scores"]);
    const normalized: BriefingTopicProposal = {
      id: t.id ?? `t${i + 1}`,
      title: t.title ?? `주제 ${i + 1}`,
      subtitle: t.subtitle ?? "",
      localIssue: t.localIssue ?? "",
      salesStrategy: t.salesStrategy ?? "",
      scores: {
        dataReliability: scores.dataReliability ?? { score: 70, rationale: "" },
        localRelevance: scores.localRelevance ?? { score: 70, rationale: "" },
        ctaConversion: scores.ctaConversion ?? { score: 65, rationale: "" },
        brandAlignment: scores.brandAlignment ?? { score: 60, rationale: "" },
      },
      totalScore: 0,
    };
    normalized.totalScore = averageTopicScore(normalized.scores);
    return normalized;
  }).sort((a, b) => b.totalScore - a.totalScore);
}

/** Step 3: gemini-3.5-flash → 슬라이드 마크다운 원고 */
export async function runStep3SlideManuscript(
  input: BriefingPipelineInput,
  research: BriefingResearchResult,
  topic: BriefingTopicProposal,
): Promise<string> {
  const userPrompt = `${step3ManuscriptPrompt(input, topic, research.factCount)}

[Step 1 공식 리서치 원본 — 전건 사용, 임의 요약·생략 금지]
${research.markdown}`;

  return geminiGenerateText(userPrompt, 0.4, "writer", 32768);
}

/** Step 4: gemini-3.5-flash JSON → PPTX 빌드용 */
export async function runStep4CompilePptxJson(
  manuscriptMd: string,
): Promise<BriefingPptxPayload> {
  const parsed = await geminiGenerateJson<BriefingPptxPayload>(
    step4CompileSystem(),
    `마크다운 원고:\n${manuscriptMd}`,
    0.2,
    "writer",
  );

  if (!parsed.slides?.length) {
    throw new Error("PPTX JSON 슬라이드가 비어 있습니다.");
  }

  return {
    presentation_title: parsed.presentation_title ?? "설명회",
    total_slides_count: parsed.total_slides_count ?? parsed.slides.length,
    slides: parsed.slides.map((s, i) => ({
      slide_index: s.slide_index ?? i + 1,
      layout_type: s.layout_type ?? "BULLETS",
      slide_title: s.slide_title ?? `슬라이드 ${i + 1}`,
      content_bullets: Array.isArray(s.content_bullets) ? s.content_bullets : [],
      presenter_script: s.presenter_script ?? "",
      instructor_insight: s.instructor_insight ?? "",
    })),
  };
}
