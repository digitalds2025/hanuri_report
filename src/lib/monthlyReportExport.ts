import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import {
  buildSanitizedExportCss,
  collectDocumentStylesheetCss,
  prepareHtml2CanvasClone,
  withSanitizedStylesForCapture,
} from "./html2canvasPrepareClone";

export const MONTHLY_REPORT_EXPORT_ROOT_ID = "hanuri-export-root";

const CAPTURE_SCALE = 2;
const PDF_MARGIN_MM = 5;

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
        /* skip */
      }
    }),
  );
}

async function captureRootCanvas(rootId: string): Promise<HTMLCanvasElement> {
  const el = document.getElementById(rootId);
  if (!el) {
    throw new Error(`보낼 영역(#${rootId})을 찾을 수 없습니다.`);
  }

  el.scrollIntoView({ block: "start" });

  el.querySelectorAll("img").forEach((img) => {
    if (!img.crossOrigin) img.crossOrigin = "anonymous";
  });

  await embedImagesAsDataUrls(el);
  await waitForImages(el);
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const sourceEl = el;
  const viewportW = document.documentElement.clientWidth;
  const viewportH = document.documentElement.clientHeight;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const rawCss = await collectDocumentStylesheetCss(document);
  const sanitizedCss = buildSanitizedExportCss(rawCss, document);

  return withSanitizedStylesForCapture(
    document,
    el,
    async () =>
      html2canvas(el, {
        scale: CAPTURE_SCALE,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#eaf1f9",
        logging: false,
        /** Tailwind lg/md 판정을 화면과 동일하게 */
        windowWidth: viewportW,
        windowHeight: viewportH,
        onclone: (clonedDoc, clonedElement) => {
          const cloneRoot =
            clonedElement instanceof HTMLElement
              ? clonedElement
              : clonedDoc.getElementById(rootId);
          prepareHtml2CanvasClone(
            clonedDoc,
            sourceEl,
            cloneRoot instanceof HTMLElement ? cloneRoot : null,
            sanitizedCss,
          );
        },
      }),
    sanitizedCss,
  );
}

/** 캔버스를 A4 가로·세로 안에 맞춘 mm 크기 (비율 유지) */
function fitCanvasToA4Mm(canvas: HTMLCanvasElement): { w: number; h: number } {
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const availW = pageW - PDF_MARGIN_MM * 2;
  const availH = pageH - PDF_MARGIN_MM * 2;
  const ratio = canvas.width / canvas.height;

  let drawW = availW;
  let drawH = drawW / ratio;
  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * ratio;
  }
  return { w: drawW, h: drawH };
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function downloadMonthlyReportJpg(rootId: string, filenameBase: string): Promise<void> {
  const canvas = await captureRootCanvas(rootId);
  const name = filenameBase.endsWith(".jpg") ? filenameBase : `${filenameBase}.jpg`;
  downloadDataUrl(canvas.toDataURL("image/jpeg", 0.92), name);
}

export async function downloadMonthlyReportPdf(rootId: string, filenameBase: string): Promise<void> {
  const canvas = await captureRootCanvas(rootId);
  const name = filenameBase.endsWith(".pdf") ? filenameBase : `${filenameBase}.pdf`;
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const { w: drawW, h: drawH } = fitCanvasToA4Mm(canvas);
  const x = (pageW - drawW) / 2;
  const y = PDF_MARGIN_MM;

  pdf.addImage(imgData, "PNG", x, y, drawW, drawH);
  pdf.save(name);
}

export function monthlyReportExportFilename(headerTitle: string, ext: "jpg" | "pdf"): string {
  return `${sanitizeFilenameBase(headerTitle)}.${ext}`;
}
