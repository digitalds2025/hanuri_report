import type { CSSProperties } from "react";

/**
 * 목차·섹션 **세로·가로 간격** (월간 레포트 기준 Tailwind).
 * 간격을 바꿀 때는 이 객체만 수정하세요 — 아래 `REPORT_*_CLASS`가 함께 갱신됩니다.
 */
export const REPORT_SECTION_SPACING = {
  /** 메인 헤더 아래 ↔ 첫 목차 */
  belowHeader: "mb-8",
  /** 목차 블록(섹션) 사이 */
  betweenSections: "mb-5",
  /** 목차 리본 ↔ 흰 본문 */
  ribbonToContent: "mb-3",
  /** 2열 섹션 묶음 하단 */
  twoColumnBlockBottom: "mb-10",
  /** 2열 좌우 간격 (월간 글쓰기·도서 등) */
  twoColumnGap: "gap-8",
  /** 분기 2열 패널 묶음 하단 */
  pairedBlockBottom: "mb-5",
  pairedColumnGap: "gap-x-8",
  /** 분기: 목차 행 ↔ 흰 박스 행 */
  pairedRowGap: "gap-y-3",
  /** 섹션 본문 안 2열(반기 역량·독서유형 등) */
  contentGridGap: "gap-8",
} as const;

export type ReportSectionSpacing = typeof REPORT_SECTION_SPACING;

export function getReportSectionSpacing(): ReportSectionSpacing {
  return REPORT_SECTION_SPACING;
}

/**
 * 월간 레포트 UI 치수 (참고·인라인 패딩용).
 * 간격은 `REPORT_SECTION_SPACING` 사용.
 */
export const REPORT_LAYOUT = {
  a4WidthPx: 794,
  rootPaddingYPx: 24,
  innerPaddingXPx: 20,
  headerPaddingPx: 32,
  /** @see REPORT_SECTION_SPACING.belowHeader → mb-8 */
  headerMarginBottomPx: 32,
  /** @see REPORT_SECTION_SPACING.betweenSections → mb-10 */
  sectionMarginBottomPx: 40,
  /** @see REPORT_SECTION_SPACING.ribbonToContent → mb-3 */
  sectionRibbonMarginBelowPx: 12,
  sectionContentPaddingPx: 20,
  /** @see REPORT_SECTION_SPACING.twoColumnGap → gap-8 */
  twoColumnGapPx: 32,
  pairedColumnGapXPx: 32,
  pairedColumnGapYPx: 12,
} as const;

export type ReportLayoutTokens = typeof REPORT_LAYOUT;

export function getReportLayout(): ReportLayoutTokens {
  return REPORT_LAYOUT;
}

const S = REPORT_SECTION_SPACING;

/* ── 월간 레포트 기준 Tailwind 클래스 ── */

export const REPORT_A4_WIDTH_PX = REPORT_LAYOUT.a4WidthPx;

export const REPORT_ROOT_CLASS =
  "mx-auto w-full max-w-[794px] rounded-xl bg-[#eaf1f9] py-6 font-sans";

export const REPORT_INNER_CLASS = "px-5";

export const REPORT_SECTION_PADDING_PX = REPORT_LAYOUT.sectionContentPaddingPx;

export function reportSectionPaddingStyle(): CSSProperties {
  return { padding: `${REPORT_SECTION_PADDING_PX}px` };
}

export const REPORT_BOOK_COVER_IMG_CLASS =
  "mx-auto h-[10.75rem] w-[6.5rem] shrink-0 object-cover object-center";

export const REPORT_HEADER_CLASS = [
  "relative overflow-hidden rounded-t-xl bg-gradient-to-r from-[#d9e8fb] to-[#c2dcf9] px-8 py-3",
  S.belowHeader,
].join(" ");

export const REPORT_HEADER_TITLE_CLASS = "text-2xl font-extrabold text-[#2a5b9c]";

export const REPORT_HEADER_SUBTITLE_CLASS = "mt-1 text-sm font-medium text-[#2a5b9c]/90";

export const REPORT_SECTION_BLOCK_CLASS = S.betweenSections;

export const REPORT_SECTION_RIBBON_WRAP_CLASS = S.ribbonToContent;

export const REPORT_SECTION_CONTENT_CLASS =
  "relative bg-white text-[15px] leading-relaxed text-gray-800 shadow-sm";

export const REPORT_SECTION_PANEL_CLASS =
  "relative box-border min-w-0 bg-white text-[15px] leading-relaxed text-gray-800 shadow-sm";

export const REPORT_TWO_COLUMN_GRID_CLASS = [
  S.twoColumnBlockBottom,
  "grid grid-cols-2 items-stretch",
  S.twoColumnGap,
].join(" ");

export const REPORT_PAIRED_PANELS_GRID_CLASS = [
  S.pairedBlockBottom,
  "grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
  S.pairedColumnGap,
  S.pairedRowGap,
].join(" ");

export const REPORT_SECTION_CONTENT_GRID_CLASS = `grid ${S.contentGridGap}`;

/** @deprecated reportLayout 사용 */
export const MONTHLY_REPORT_A4_WIDTH_PX = REPORT_A4_WIDTH_PX;
export const MONTHLY_REPORT_ROOT_CLASS = REPORT_ROOT_CLASS;
export const MONTHLY_REPORT_INNER_CLASS = REPORT_INNER_CLASS;
export const MONTHLY_REPORT_SECTION_PADDING_PX = REPORT_SECTION_PADDING_PX;
export const monthlyReportSectionPaddingStyle = reportSectionPaddingStyle;
export const MONTHLY_REPORT_BOOK_COVER_IMG_CLASS = REPORT_BOOK_COVER_IMG_CLASS;
