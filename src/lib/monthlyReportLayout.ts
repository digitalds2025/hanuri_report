import type { CSSProperties } from "react";

/**
 * 월간 레포트 목차 본문 래퍼(흰 박스·글쓰기/도서 이미지 프레임) 안쪽 패딩(px).
 * 네 방향 동일 — 이 값만 바꾸면 MonthlyReportResultView 전체에 반영됩니다.
 */
export const MONTHLY_REPORT_SECTION_PADDING_PX = 20;

/** 인라인 padding (Tailwind purge와 무관하게 항상 적용) */
export function monthlyReportSectionPaddingStyle(): CSSProperties {
  const p = MONTHLY_REPORT_SECTION_PADDING_PX;
  return { padding: `${p}px` };
}

/** 월간 레포트·3단계 도서 선택과 동일한 표지 비율 (고해상도 Storage URL도 이 크기로만 표시) */
export const MONTHLY_REPORT_BOOK_COVER_IMG_CLASS =
  "mx-auto h-[10.75rem] w-[6.5rem] shrink-0 object-cover object-center";
