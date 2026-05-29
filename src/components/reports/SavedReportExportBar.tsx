type SavedReportExportBarProps = {
  exportBusy: "jpg" | "pdf" | null;
  disabled?: boolean;
  onExportJpg: () => void;
  onExportPdf: () => void;
};

/** 저장본 읽기 전용 화면 — JPG/PDF만 */
export function SavedReportExportBar({
  exportBusy,
  disabled = false,
  onExportJpg,
  onExportPdf,
}: SavedReportExportBarProps) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-b border-slate-100 pb-4">
      <button
        type="button"
        disabled={disabled || Boolean(exportBusy)}
        onClick={onExportJpg}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      >
        {exportBusy === "jpg" ? "JPG 생성 중…" : "JPG로 다운받기"}
      </button>
      <button
        type="button"
        disabled={disabled || Boolean(exportBusy)}
        onClick={onExportPdf}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      >
        {exportBusy === "pdf" ? "PDF 생성 중…" : "PDF로 다운받기"}
      </button>
    </div>
  );
}
