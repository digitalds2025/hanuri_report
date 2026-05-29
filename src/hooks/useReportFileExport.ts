import { useCallback, useState } from "react";
import {
  MONTHLY_REPORT_EXPORT_ROOT_ID,
  downloadMonthlyReportJpg,
  downloadMonthlyReportPdf,
  monthlyReportExportFilename,
} from "../lib/monthlyReportExport";

/** 레포트 미리보기(#hanuri-export-root) JPG/PDF 다운로드 */
export function useReportFileExport(canExport: boolean, filenameBase: string) {
  const [exportBusy, setExportBusy] = useState<"jpg" | "pdf" | null>(null);

  const runExport = useCallback(
    async (format: "jpg" | "pdf"): Promise<string | null> => {
      if (!canExport) return null;
      setExportBusy(format);
      try {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        const base = monthlyReportExportFilename(filenameBase, format);
        if (format === "jpg") {
          await downloadMonthlyReportJpg(MONTHLY_REPORT_EXPORT_ROOT_ID, base);
        } else {
          await downloadMonthlyReportPdf(MONTHLY_REPORT_EXPORT_ROOT_ID, base);
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      } finally {
        setExportBusy(null);
      }
    },
    [canExport, filenameBase],
  );

  return { exportBusy, runExport };
}
