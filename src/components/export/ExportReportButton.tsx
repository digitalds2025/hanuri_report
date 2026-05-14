import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

type Props = {
  /** 캡처할 영역의 id (기본: hanuri-export-root) */
  targetId?: string;
};

/**
 * 단일 페이지 PDF보내기 (프로토타입).
 * 세로형 카카오 공유용 이미지·다중 페이지 PDF는 Phase 2에서 별도 레이아웃으로 추가.
 */
export function ExportReportButton({ targetId = "hanuri-export-root" }: Props) {
  const [busy, setBusy] = useState(false);
  const lastError = useRef<string | null>(null);

  async function exportPdf() {
    const el = document.getElementById(targetId);
    if (!el) {
      window.alert(`보낼 영역(#${targetId})을 찾을 수 없습니다.`);
      return;
    }
    setBusy(true);
    lastError.current = null;
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      pdf.addImage(img, "PNG", x, y, w, h);
      pdf.save("hanuri-report.pdf");
    } catch (e) {
      lastError.current = e instanceof Error ? e.message : "알 수 없는 오류";
      window.alert(`PDF 생성 실패: ${lastError.current}\n\nJPG/PNG·카카오 세로 레이아웃은 추후 지원 예정입니다.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void exportPdf()}
        disabled={busy}
        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? "생성 중…" : "PDF로 보내기 (A4 1페이지)"}
      </button>
      <span className="text-xs text-slate-500">이미지·세로 공유 레이아웃은 Phase 2</span>
    </div>
  );
}
