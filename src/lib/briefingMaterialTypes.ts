import type { ParentAudience, SchoolLevel } from "../config/koreaRegions";

/** 1단계: 슬라이드별 기획안(문구 중심) */
export type BriefingSlidePlan = {
  slideNumber: number;
  title: string;
  purpose: string;
  keyPoints: string[];
  speakerNotes: string;
};

/** 2단계: 레이아웃 JSON 슬라이드 */
export type BriefingLayoutSlide = {
  type: string;
  [key: string]: unknown;
};

export type BriefingMaterialMeta = {
  region: string;
  subRegion: string;
  schoolLevels: SchoolLevel[];
  parentAudience: ParentAudience;
  pageCount: number;
  requirements: string;
  attachmentNames: string[];
};

export type BriefingMaterialKit = {
  id: string;
  title: string;
  created_at: string;
  reference_text: string;
  meta: BriefingMaterialMeta;
  slide_plans: BriefingSlidePlan[];
  slides: BriefingLayoutSlide[];
};

export type BriefingMaterialFormInput = {
  referenceText: string;
  requirements: string;
  region: string;
  subRegion: string;
  schoolLevels: SchoolLevel[];
  parentAudience: ParentAudience;
  pageCount: number;
  attachmentNames: string[];
};
