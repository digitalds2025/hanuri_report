import pptxgen from "pptxgenjs";
import type { BriefingPptxPayload } from "./briefingPipeline/types";

export async function buildPptxBlob(payload: BriefingPptxPayload): Promise<Blob> {
  const pptx = new pptxgen();
  pptx.author = "Hreport Briefing";
  pptx.title = payload.presentation_title;
  pptx.layout = "LAYOUT_16x9";

  for (const slide of payload.slides) {
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };

    s.addText(slide.slide_title, {
      x: 0.5,
      y: 0.4,
      w: 9,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: "1E293B",
    });

    const bullets = slide.content_bullets.filter(Boolean);
    if (bullets.length) {
      s.addText(
        bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        {
          x: 0.6,
          y: 1.4,
          w: 8.8,
          h: 4.5,
          fontSize: 18,
          color: "334155",
          valign: "top",
        },
      );
    }

    if (slide.instructor_insight?.trim()) {
      s.addShape(pptx.ShapeType.rect, {
        x: 0.5,
        y: 5.2,
        w: 9,
        h: 1.1,
        fill: { color: "FEF3C7" },
        line: { color: "F59E0B", width: 1 },
      });
      s.addText(slide.instructor_insight.replace(/^\[💡[^\]]*\]\s*/i, ""), {
        x: 0.65,
        y: 5.35,
        w: 8.7,
        h: 0.9,
        fontSize: 11,
        color: "92400E",
      });
    }

    const notes = [slide.presenter_script, slide.instructor_insight].filter(Boolean).join("\n\n");
    if (notes) s.addNotes(notes);
  }

  const data = await pptx.write({ outputType: "blob" });
  return data as Blob;
}

export function buildInstructorGuideMarkdown(payload: BriefingPptxPayload): string {
  const parts = [
    `# ${payload.presentation_title}`,
    "",
    "강사 가이드집 (Presenter Script + Instructor Insight)",
    "",
  ];

  for (const slide of payload.slides) {
    parts.push(
      `## Slide ${slide.slide_index}: ${slide.slide_title}`,
      "",
      "### 화면 (Slide Text)",
      ...slide.content_bullets.map((b) => `- ${b}`),
      "",
      "### 발표 대사 (Presenter Script)",
      slide.presenter_script || "(없음)",
      "",
      "### 강사 인사이트 (노란 박스)",
      slide.instructor_insight || "(없음)",
      "",
      "---",
      "",
    );
  }

  return parts.join("\n");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTextFile(text: string, filename: string, mime = "text/markdown;charset=utf-8"): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
