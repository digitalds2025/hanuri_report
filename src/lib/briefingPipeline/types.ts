import type { ParentAudience, SchoolLevel } from "../../config/koreaRegions";
import type { OfficialDataScanResult, TargetGrade } from "../briefingMaterialTypes";

export type BriefingPipelineInput = {
  region: string;
  subRegion: string;
  targetLabel: string;
  schoolLevel: SchoolLevel;
  targetGrade: TargetGrade;
  purpose: ParentAudience;
  /** 비어 있지 않으면 프리셋 대신 설명회 목적·수집 힌트에 사용 */
  purposeCustom?: string;
};

export type TopicCriterionScore = {
  score: number;
  rationale: string;
};

export type BriefingTopicProposal = {
  id: string;
  title: string;
  subtitle: string;
  localIssue: string;
  salesStrategy: string;
  scores: {
    dataReliability: TopicCriterionScore;
    localRelevance: TopicCriterionScore;
    ctaConversion: TopicCriterionScore;
    brandAlignment: TopicCriterionScore;
  };
  totalScore: number;
};

export type BriefingResearchResult = {
  /** 수집 사실 전건 마크다운 (요약·건수 제한 없음) */
  markdown: string;
  officialScan?: OfficialDataScanResult;
  factCount: number;
  discoveredSchools: string[];
  keywordBatches: { id: string; label: string; queries: string[] }[];
  groundingQueries: string[];
  sourceLinks: { title: string; uri: string }[];
  createdAt: string;
};

export type BriefingPptxSlide = {
  slide_index: number;
  layout_type: string;
  slide_title: string;
  content_bullets: string[];
  presenter_script: string;
  instructor_insight: string;
};

export type BriefingPptxPayload = {
  presentation_title: string;
  total_slides_count: number;
  slides: BriefingPptxSlide[];
};

export type BriefingSession = {
  input: BriefingPipelineInput;
  research: BriefingResearchResult | null;
  topics: BriefingTopicProposal[];
  selectedTopicId: string | null;
  slideManuscriptMd: string;
  pptxPayload: BriefingPptxPayload | null;
};
