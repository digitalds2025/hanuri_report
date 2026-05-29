import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { prepareHtml2CanvasClone } from "./html2canvasPrepareClone";

export const MONTHLY_REPORT_EXPORT_ROOT_ID = "hanuri-export-root";

const CAPTURE_OPTS: Parameters<typeof html2canvas>[1] = {
  scale: 2,
  useCORS: true,
  allowTaint: false,
  backgroundColor: "#eaf1f9",
  logging: false,
};

function sanitizeFilenameBase(title: string): string {
  const t = title.trim() || "hanuri-monthly-report";
  return t.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

/** 외부 URL 이미지를 data URL로 바꿔 canvas CORS 오류를 줄입니다 (공개 버킷·CORS 허용 URL). */
async function embedImagesAsDataUrls(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;
      try {
        img.crossOrigin = "anonymous";
        const res = await fetch(src, { mode: "cors", credentials: "omit" });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("이미지 로드 실패"));
          img.src = dataUrl;
        });
      } catch {
        /* 원본 URL 유지 — 캡처 시 해당 이미지만 비어 있을 수 있음 */
      }
    }),
  );
}

async function captureRootCanvas(rootId: string): Promise<HTMLCanvasElement> {
  const el = document.getElementById(rootId);
  if (!el) {
    throw new Error(`보낼 영역(#${rootId})을 찾을 수 없습니다.`);
  }

  const imgs = el.querySelectorAll("img");
  imgs.forEach((img) => {
    if (!img.crossOrigin) img.crossOrigin = "anonymous";
  });

  await embedImagesAsDataUrls(el);
  await waitForImages(el);

  return html2canvas(el, {
    ...CAPTURE_OPTS,
    onclone: (clonedDoc, clonedElement) => {
      const source = document.getElementById(rootId);
      if (source && clonedElement instanceof HTMLElement) {
        prepareHtml2CanvasClone(clonedDoc, clonedElement, source);
      }
    },
  });
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/** 레포트 미리보기 영역 → JPG */
export async function downloadMonthlyReportJpg(rootId: string, filenameBase: string): Promise<void> {
  const canvas = await captureRootCanvas(rootId);
  const name = filenameBase.endsWith(".jpg") ? filenameBase : `${filenameBase}.jpg`;
  downloadDataUrl(canvas.toDataURL("image/jpeg", 0.92), name);
}

/** 레포트 미리보기 영역 → PDF (내용 높이에 맞춰 여러 A4 페이지) */
export async function downloadMonthlyReportPdf(rootId: string, filenameBase: string): Promise<void> {
  const canvas = await captureRootCanvas(rootId);
  const name = filenameBase.endsWith(".pdf") ? filenameBase : `${filenameBase}.pdf`;
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  let heightLeft = imgH;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
  heightLeft -= pageH;

  while (heightLeft > 0) {
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
    heightLeft -= pageH;
  }

  pdf.save(name);
}

export function monthlyReportExportFilename(headerTitle: string, ext: "jpg" | "pdf"): string {
  return `${sanitizeFilenameBase(headerTitle)}.${ext}`;
}
