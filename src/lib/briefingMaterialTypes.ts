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
  tokenUsage?: { inputTokens: number; outputTokens: number };
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

export type StoryPhase = "intro" | "development" | "climax" | "closing";

/** 주제 선택 후 표시 · 설명회 전체 감정 곡선 기획 */
export type StorylinePhaseBrief = {
  phase: StoryPhase;
  label: string;
  parentEmotion: string;
  designTone: string;
  slideCount: number;
  narrative: string;
  keyActions: string[];
};

export type BriefingStorylineBrief = {
  topicId: string;
  topicTitle: string;
  totalSlides: number;
  purposeLabel: string;
  targetLabel: string;
  overview: string;
  phases: StorylinePhaseBrief[];
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

/** 슬라이드 기획에 연결할 수집 데이터 */
export type SlideDataRef = {
  id: string;
  category: string;
  fact: string;
  sourceTitle?: string;
  grade?: DataTrustGrade;
};

export type ScreenChunk = {
  label: string;
  sublabel?: string;
  emphasis?: boolean;
};

export type HeroMetric = {
  value: string;
  label: string;
  sourceFactId?: string;
};

/** 슬라이드별 기획안 — 기획 화면에서 편집 후 제작 단계로 전달 */
export type BriefingSlidePlan = {
  slideNumber: number;
  title: string;
  purpose: string;
  /** 설명회 스토리라인 단계 */
  storyPhase?: StoryPhase;
  /** 권장 레이아웃 (TITLE, STAT_GRID, CHART_BAR, ICON_GRID, DATA_TABLE, …) */
  recommendedLayout: string;
  /** chart_bar | stat_grid | icon_grid | comparison | table | checklist | timeline | title | section | big_number */
  visualHint: string;
  /** 이 슬라이드에서 인용할 수집 fact */
  dataRefs: SlideDataRef[];
  /** 이 슬라이드에 담을 내용 기획 (화면·멘트 요약, 편집 가능) */
  slideContentPlan: string;
  /** @deprecated slideContentPlan */
  contentPlan?: string;
  /** 화면 레이어: 명사형 키워드 청크 (3-3 규칙, 최대 3) */
  screenChunks: ScreenChunk[];
  /** 빅넘버 레이아웃용 — 수집 데이터 수치 */
  heroMetric?: HeroMetric;
  /** @deprecated screenChunks 사용 — 제작 호환용 */
  keyMessages: string[];
  /** 발표 멘트 레이어: 구어체·수치 근거·fact 원문 */
  speakerNotes: string;
  blockId?: string;
  keyPoints?: string[];
};

export const SLIDE_LAYOUT_OPTIONS = [
  "TITLE",
  "SECTION_HEADER",
  "STAT_GRID",
  "CHART_BAR",
  "ICON_GRID",
  "KPI_ROW",
  "DATA_TABLE",
  "GRID_CARDS",
  "COMPARISON",
  "CHECKLIST",
  "STEP_CARDS",
  "PROCESS_FLOW",
  "METRIC",
  "IMAGE_AND_TEXT",
  "INSTRUCTOR_INSIGHT",
  "SOURCES",
] as const;

export type BriefingSlideLayoutType = (typeof SLIDE_LAYOUT_OPTIONS)[number];

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
