import type { ParentAudience, SchoolLevel } from "../config/koreaRegions";

export type DataTrustGrade = "A" | "B" | "C" | "D";

export type TargetGrade =
  | "초4"
  | "초5"
  | "초6"
  | "중1"
  | "중2"
  | "중3"
  | "고1"
  | "고2"
  | "고3";

/** 주제 5대 점수화 기준 (각 0~100) */
export type TopicScoreBreakdown = {
  /** 1. 공식 데이터 충분성 */
  dataReliability: number;
  /** 2. 지역 적합성 */
  localRelevance: number;
  /** 3. 대상(학년) 적합성 */
  targetAlignment: number;
  /** 4. 상담 전환성 */
  consultationConversion: number;
  /** 5. 브랜드 연결성 (독서토론논술) */
  brandIntegration: number;
};

export type OfficialDataFact = {
  category: string;
  fact: string;
  sourceTitle?: string;
  sourceUri?: string;
  /** 검색·출처 페이지에서 발췌한 원문 일부(있을 때만) */
  sourceExcerpt?: string;
  grade: DataTrustGrade;
};

export type OfficialDataScanResult = {
  scannedAt: string;
  regionName: string;
  targetGrade: TargetGrade;
  schoolLevel: SchoolLevel;
  purpose: ParentAudience;
  keywordBatches: { id: string; label: string; queries: string[] }[];
  discoveredSchools: string[];
  facts: OfficialDataFact[];
  searchQueries: string[];
  sourceLinks: { title: string; uri: string }[];
  summaries: string[];
  digestText: string;
  /** region | school_supplement | full */
  scanScope?: string;
};

export type BriefingTopicCandidate = {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  primarySources: string[];
  scores: TopicScoreBreakdown;
  totalScore: number;
  suggestedSlideCount: number;
};

export type MasterOutlineBlock = {
  blockId: string;
  title: string;
  purpose: string;
  bulletPoints: string[];
  dataGradesUsed: DataTrustGrade[];
  instructorInsightSlots?: string[];
  sources?: string[];
};

export type MasterOutline = {
  topicId: string;
  topicTitle: string;
  dataAsOf: string;
  regionLabel: string;
  targetLabel: string;
  purposeLabel: string;
  blocks: MasterOutlineBlock[];
};

export type GuardrailIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  slideIndex?: number;
  suggestion?: string;
};

export type GuardrailReport = {
  passed: boolean;
  issues: GuardrailIssue[];
  checkedAt: string;
};

/** 1단계: 슬라이드별 기획안(레거시·편집용) */
export type BriefingSlidePlan = {
  slideNumber: number;
  title: string;
  purpose: string;
  keyPoints: string[];
  speakerNotes: string;
  blockId?: string;
};

export type BriefingLayoutSlide = {
  type: string;
  [key: string]: unknown;
};

export type BriefingMaterialMeta = {
  region: string;
  subRegion: string;
  schoolLevel: SchoolLevel;
  targetGrade: TargetGrade;
  parentAudience: ParentAudience;
  pageCount: number;
  selectedTopicId?: string;
  selectedTopicTitle?: string;
  dataAsOf?: string;
  attachmentNames: string[];
  /** 레거시 호환 */
  schoolLevels?: SchoolLevel[];
  requirements?: string;
};

export type BriefingMaterialKit = {
  id: string;
  title: string;
  created_at: string;
  reference_text: string;
  meta: BriefingMaterialMeta;
  official_data_scan?: OfficialDataScanResult;
  topic_candidates?: BriefingTopicCandidate[];
  master_outline?: MasterOutline;
  guardrail_report?: GuardrailReport;
  slide_plans: BriefingSlidePlan[];
  slides: BriefingLayoutSlide[];
  docx_sections?: { blockId: string; title: string; paragraphs: string[] }[];
};

export type BriefingMaterialFormInput = {
  referenceText: string;
  region: string;
  subRegion: string;
  schoolLevel: SchoolLevel;
  targetGrade: TargetGrade;
  parentAudience: ParentAudience;
  /** 파이프라인 직접 입력 목적 */
  purposeCustom?: string;
  pageCount: number;
  attachmentNames: string[];
  selectedTopic?: BriefingTopicCandidate;
  masterOutline?: MasterOutline;
  officialScan?: OfficialDataScanResult;
};
