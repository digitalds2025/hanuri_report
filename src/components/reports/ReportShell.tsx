import type { ReactNode } from "react";
import { MONTHLY_REPORT_EXPORT_ROOT_ID } from "../../lib/monthlyReportExport";
import {
  REPORT_HEADER_CLASS,
  REPORT_HEADER_SUBTITLE_CLASS,
  REPORT_HEADER_TITLE_CLASS,
  REPORT_INNER_CLASS,
  REPORT_ROOT_CLASS,
} from "../../lib/reportLayout";

type ReportShellProps = {
  headerTitle: string;
  headerSubtitle?: string;
  children: ReactNode;
  /** PDF/JPG 캡처 루트 id (기본 hanuri-export-root) */
  exportRootId?: string;
};

export function ReportShell({
  headerTitle,
  headerSubtitle,
  children,
  exportRootId = MONTHLY_REPORT_EXPORT_ROOT_ID,
}: ReportShellProps) {
  return (
    <div id={exportRootId} className={REPORT_ROOT_CLASS}>
      <div className={REPORT_INNER_CLASS}>
        <div className={REPORT_HEADER_CLASS}>
          {headerSubtitle ? (
            <p className={REPORT_HEADER_SUBTITLE_CLASS}>{headerSubtitle}</p>
          ) : null}
          <h1 className={REPORT_HEADER_TITLE_CLASS}>{headerTitle}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
