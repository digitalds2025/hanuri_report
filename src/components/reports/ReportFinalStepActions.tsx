type ReportFinalStepActionsProps = {
  onPrev?: () => void;
  prevLabel?: string;
  onRegenerate?: () => void;
  regenerateBusy?: boolean;
  regenerateDisabled?: boolean;
  regenerateLabel?: string;
  reportEditMode: boolean;
  onToggleEditMode: () => void;
  editDisabled?: boolean;
  exportBusy: "jpg" | "pdf" | null;
  exportDisabled?: boolean;
  onExportJpg: () => void;
  onExportPdf: () => void;
  saveLabel: string;
  saving?: boolean;
};

/** 월간·기간 레포트 6단계(확인·저장) 공통 액션 바 */
export function ReportFinalStepActions({
  onPrev,
  prevLabel = "이전 단계로",
  onRegenerate,
  regenerateBusy = false,
  regenerateDisabled = false,
  regenerateLabel = "다시 생성하기",
  reportEditMode,
  onToggleEditMode,
  editDisabled = false,
  exportBusy,
  exportDisabled = false,
  onExportJpg,
  onExportPdf,
  saveLabel,
  saving = false,
}: ReportFinalStepActionsProps) {
  const exportBlocked = Boolean(exportBusy) || exportDisabled || reportEditMode;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {onPrev ? (
            <button
              type="button"
              onClick={onPrev}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              {prevLabel}
            </button>
          ) : null}
          {onRegenerate ? (
            <button
              type="button"
              disabled={regenerateDisabled || Boolean(exportBusy)}
              onClick={onRegenerate}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
            >
              {regenerateBusy ? "생성 중…" : regenerateLabel}
            </button>
          ) : null}
          <button
            type="button"
            disabled={editDisabled || Boolean(exportBusy)}
            onClick={onToggleEditMode}
            className={`rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              reportEditMode
                ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
            }`}
          >
            {reportEditMode ? "미리보기로 돌아가기" : "레포트 수정하기"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={exportBlocked}
            onClick={onExportJpg}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {exportBusy === "jpg" ? "JPG 생성 중…" : "JPG로 다운받기"}
          </button>
          <button
            type="button"
            disabled={exportBlocked}
            onClick={onExportPdf}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {exportBusy === "pdf" ? "PDF 생성 중…" : "PDF로 다운받기"}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {saving ? "저장 중…" : saveLabel}
      </button>
    </>
  );
}
