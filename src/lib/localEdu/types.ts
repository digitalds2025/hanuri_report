import type { ParentAudience, SchoolLevel } from "../../config/koreaRegions";
import type {
  BriefingLayoutSlide,
  BriefingTopicCandidate,
  GuardrailReport,
  MasterOutline,
  OfficialDataScanResult,
  TargetGrade,
} from "../briefingMaterialTypes";

/** 핵심 주제 칩 (복수 선택) */
export const CORE_TOPIC_OPTIONS = [
  { id: "school_info", label: "학교 정보" },
  { id: "admission_change", label: "입시 변화" },
  { id: "performance_literacy", label: "수행평가·문해력" },
  { id: "credit_system", label: "고교학점제" },
  { id: "local_policy", label: "지역 교육 정책" },
  { id: "parent_faq", label: "학부모 FAQ" },
] as const;

export type CoreTopicId = (typeof CORE_TOPIC_OPTIONS)[number]["id"];

export type BrandIntensity = "약" | "중" | "강";
export type ToneStyle = "안내형" | "설득형" | "전문형";

/** Input Layer — 드롭다운·칩 중심 */
export type LocalEduInput = {
  region: string;
  subRegion: string;
  schoolLevel: SchoolLevel;
  targetGrade: TargetGrade;
  parentAudience: ParentAudience;
  purposeCustom?: string;
  coreTopics: CoreTopicId[];
  eventDate?: string;
  centerName?: string;
  brandIntensity: BrandIntensity;
  tone: ToneStyle;
  pageCount: number;
};

export type LocalEduDataLayerResult = {
  scan: OfficialDataScanResult;
  corpusMarkdown: string;
  branchSummary: string;
};

export type ConsultKitOutput = {
  onePageSummaryMd: string;
  questionListMd: string;
  kakaoMessageMd: string;
};

export type LocalEduGenerationOutput = {
  outline: MasterOutline;
  slides: BriefingLayoutSlide[];
  docxSections: { blockId: string; title: string; paragraphs: string[] }[];
  consultKit: ConsultKitOutput;
  guardrail: GuardrailReport;
  dataAsOf: string;
};

export type LocalEduSession = {
  input: LocalEduInput;
  attachmentText: string;
  attachmentNames: string[];
  data: LocalEduDataLayerResult | null;
  topics: BriefingTopicCandidate[];
  selectedTopicId: string | null;
  generation: LocalEduGenerationOutput | null;
};

export function localEduTargetLabel(input: LocalEduInput): string {
  return `${input.schoolLevel} ${input.targetGrade} 학부모`;
}
