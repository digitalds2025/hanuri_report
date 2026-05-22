import type { BriefingLayoutSlide } from "../briefingMaterialTypes";
import type { BriefingPptxPayload, BriefingPptxSlide } from "../briefingPipeline/types";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function bulletsFromSlide(slide: BriefingLayoutSlide): string[] {
  const bullets: string[] = [];
  const title = str(slide.title);
  if (title && slide.type !== "TITLE") bullets.push(title);

  for (const key of ["subtitle", "description", "content", "message"]) {
    const t = str(slide[key]);
    if (t) bullets.push(t);
  }

  bullets.push(...strArr(slide.bullets));
  bullets.push(...strArr(slide.points));
  bullets.push(...strArr(slide.items));

  if (Array.isArray(slide.cards)) {
    for (const c of slide.cards as { title?: string; desc?: string }[]) {
      if (c.title) bullets.push(`${c.title}: ${c.desc ?? ""}`.trim());
    }
  }

  if (Array.isArray(slide.rows)) {
    for (const row of slide.rows as string[][]) {
      bullets.push(row.filter(Boolean).join(" · "));
    }
  }

  if (Array.isArray(slide.steps)) {
    for (const s of slide.steps as { title?: string; desc?: string; content?: string }[]) {
      bullets.push(`${s.title ?? ""} — ${s.content ?? s.desc ?? ""}`.trim());
    }
  }

  if (Array.isArray(slide.stats)) {
    for (const s of slide.stats as { value?: string; label?: string }[]) {
      bullets.push(`${s.value ?? ""} ${s.label ?? ""}`.trim());
    }
  }

  if (Array.isArray(slide.bars)) {
    for (const b of slide.bars as { label?: string; display?: string; value?: number }[]) {
      bullets.push(`${b.label ?? ""}: ${b.display ?? b.value ?? ""}`.trim());
    }
  }

  if (Array.isArray(slide.icons)) {
    for (const ic of slide.icons as { label?: string; desc?: string }[]) {
      bullets.push(`${ic.label ?? ""} — ${ic.desc ?? ""}`.trim());
    }
  }

  if (Array.isArray(slide.kpis)) {
    for (const k of slide.kpis as { value?: string; label?: string }[]) {
      bullets.push(`${k.value ?? ""} · ${k.label ?? ""}`.trim());
    }
  }

  return bullets.filter(Boolean).slice(0, 6);
}

function insightFromSlide(slide: BriefingLayoutSlide): string {
  if (slide.type === "INSTRUCTOR_INSIGHT") {
    return str(slide.content) || str(slide.message) || str(slide.tip);
  }
  const slots = strArr(slide.instructorInsightSlots);
  if (slots.length) return `[💡 강사 가이드] ${slots.join(" / ")}`;
  return str(slide.instructorInsight) || str(slide.insight);
}

export function layoutSlidesToPptxPayload(
  slides: BriefingLayoutSlide[],
  presentationTitle: string,
): BriefingPptxPayload {
  const pptxSlides: BriefingPptxSlide[] = slides.map((slide, i) => {
    const bullets = bulletsFromSlide(slide);
    const insight = insightFromSlide(slide);
    return {
      slide_index: i + 1,
      layout_type: str(slide.type) || "BULLETS",
      slide_title: str(slide.title) || `슬라이드 ${i + 1}`,
      content_bullets: bullets.length ? bullets : [str(slide.purpose) || "—"],
      presenter_script: str(slide.speakerNotes) || str(slide.script) || "",
      instructor_insight: insight,
    };
  });

  return {
    presentation_title: presentationTitle,
    total_slides_count: pptxSlides.length,
    slides: pptxSlides,
  };
}
