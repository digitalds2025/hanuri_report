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
  /** 선택된 템플릿 blockId 순서 (없으면 blocks 순서) */
  selectedBlockIds?: string[];
  outlineSelectionRationale?: string;
};

/** Design Layer 1단계: 주제 기반 종합 레포트 원고 */
export type BriefingFoundationReport = {
  title: string;
  markdown: string;
  sections: { id: string; heading: string; body: string }[];
  generatedAt: string;
};

/** Design Layer 2단계: 슬라이드 장수에 맞춘 확장 초안 */
export type SlideContentDraft = {
  slideNumber: number;
  title: string;
  narrative: string;
  keyFacts: string[];
  storyPhase?: StoryPhase;
  suggestedLayout?: string;
};

/** Design Layer 3단계: 50종 템플릿 중 선택 결과 */
export type OutlineSelectionResult = {
  selectedBlockIds: string[];
  rationale: string;
  pptEffectiveness: string;
  docxReadability: string;
  discardedAlternatives?: string[];
};

/** Design Layer 4단계: PPT·자료집 컨셉 재작성 메모 */
export type DeliverableAdaptation = {
  pptConcept: string;
  docxConcept: string;
  toneNotes: string;
  blockAdaptations: { blockId: string; pptAngle: string; docxAngle: string }[];
};

/** 레포트 선행 기획 산출물 (줄글 + 장수 분할 → 슬라이드 기획 입력) */
export type BriefingPlanningArtifact = {
  foundationReport: BriefingFoundationReport;
  slideDrafts: SlideContentDraft[];
  /** 레거시 4단계 파이프라인용 (선택) */
  outlineSelection?: OutlineSelectionResult;
  adaptation?: DeliverableAdaptation;
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

/** 슬라이드 기획 — 현상·분석·화면키워드 1세트 (최소 3세트/슬라이드) */
export type SlideContextSet = {
  /** 현상: corpus fact 기반 구체 서술 (학교명·수치·정책명) */
  phenomenon: string;
  /** 분석: 학부모·입시 관점 해석 */
  analysis: string;
  /** 화면 키워드/수치 — METRIC·TABLE·CHART 셀에 직접 매핑 */
  screenKeyword: string;
  screenDetail?: string;
  mappedFactId?: string;
};

/** Hero Fact & Metric — 슬라이드 설득용 핵심 로컬 데이터 */
export type SlideHeroFact = {
  headline: string;
  properNouns: string[];
  metricValue?: string;
  metricLabel?: string;
  sourceFactId?: string;
};

/** 슬라이드별 기획안 — 기획 화면에서 편집 후 제작 단계로 전달 */
export type BriefingSlidePlan = {
  slideNumber: number;
  title: string;
  purpose: string;
  storyPhase?: StoryPhase;
  recommendedLayout: string;
  visualHint: string;
  dataRefs: SlideDataRef[];
  /** 1) Hero Fact & Metric */
  heroFact: SlideHeroFact;
  /** 2) Context Body — 현상·분석·화면 (최소 3세트) */
  contextSets: SlideContextSet[];
  /** 3) Action Strategy — 한우리/학습 전략 연결 */
  actionStrategy: string;
  /** 컨설턴트 추론 인사이트 */
  consultantInsight?: string;
  /** 위 3요소를 합친 읽기용 기획서 (자동 생성·편집 가능) */
  slideContentPlan: string;
  contentPlan?: string;
  /** contextSets → 화면 레이어 파생 */
  screenChunks: ScreenChunk[];
  heroMetric?: HeroMetric;
  keyMessages: string[];
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
