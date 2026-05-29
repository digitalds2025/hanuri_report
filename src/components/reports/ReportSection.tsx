import type { ReactNode } from "react";
import {
  REPORT_SECTION_BLOCK_CLASS,
  REPORT_SECTION_RIBBON_WRAP_CLASS,
  reportSectionPaddingStyle,
} from "../../lib/reportLayout";

type ReportSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerRight?: ReactNode;
};

/** 리본형 섹션 제목 (분기 2열 레이아웃 등에서 단독 사용) */
export function ReportSectionRibbon({
  title,
  headerRight,
  className = "",
}: {
  title: string;
  headerRight?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div className="relative inline-block min-w-0">
        <div className="relative z-10 rounded-br-md rounded-tr-md bg-[#9bbdff] pl-8 pr-6 py-2.5 text-lg font-bold text-[#1a3b6b] shadow-sm">
          {title}
        </div>
        <div
          className="pointer-events-none absolute top-0 left-[-8px] z-0 h-0 w-0 border-b-[14px] border-r-[10px] border-t-[30px] border-transparent border-r-[#7da6f0]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-[-6px] left-0 z-0 h-0 w-0 border-r-[8px] border-t-[6px] border-transparent border-t-[#668bc7]"
          aria-hidden
        />
      </div>
      {headerRight ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-0.5">{headerRight}</div>
      ) : null}
    </div>
  );
}

export function ReportSection({
  title,
  children,
  className = "",
  contentClassName = "",
  headerRight,
}: ReportSectionProps) {
  return (
    <div className={`${REPORT_SECTION_BLOCK_CLASS} ${className}`.trim()}>
      <ReportSectionRibbon
        title={title}
        headerRight={headerRight}
        className={REPORT_SECTION_RIBBON_WRAP_CLASS}
      />

      <div
        className={`relative bg-white text-[15px] leading-relaxed text-gray-800 shadow-sm ${contentClassName}`}
        style={reportSectionPaddingStyle()}
      >
        {children}
      </div>
    </div>
  );
}
