type Props = {
  open: boolean;
  onClose: () => void;
  onGoStudentDetail: () => void;
  onGoStudentsList: () => void;
};

export function MonthlyReportSaveRedirectDialog({
  open,
  onClose,
  onGoStudentDetail,
  onGoStudentsList,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="monthly-save-redirect-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 id="monthly-save-redirect-title" className="text-base font-semibold text-slate-900">
          저장되었습니다
        </h2>
        <p className="mt-2 text-sm text-slate-600">이동할 화면을 선택해 주세요.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={onGoStudentDetail}
          >
            학생 상세로
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={onGoStudentsList}
          >
            학생 목록으로
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
            onClick={onClose}
          >
            이 화면에 머무르기
          </button>
        </div>
      </div>
    </div>
  );
}
