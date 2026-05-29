/**
 * html2canvas 1.x는 CSS `oklab()` / `oklch()` 를 파싱하지 못함 (Tailwind v4).
 * 캡처 직전 클론에서 스타일시트를 제거하고, 계산된 스타일을 rgb 인라인으로 복사합니다.
 */

const INLINE_PROPS = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "fill",
  "stroke",
  "font-size",
  "font-weight",
  "font-family",
  "line-height",
  "letter-spacing",
  "text-align",
  "white-space",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "display",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "gap",
  "width",
  "height",
  "max-width",
  "min-width",
  "max-height",
  "min-height",
  "object-fit",
  "opacity",
  "visibility",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "overflow",
  "grid-template-columns",
] as const;

function inlineComputedStyles(source: Element, clone: HTMLElement): void {
  const cs = window.getComputedStyle(source);
  for (const prop of INLINE_PROPS) {
    const val = cs.getPropertyValue(prop);
    if (!val) continue;
    if (val.includes("oklab") || val.includes("oklch")) continue;
    clone.style.setProperty(prop, val);
  }
  const shadow = cs.boxShadow;
  if (shadow && shadow !== "none" && !shadow.includes("oklab") && !shadow.includes("oklch")) {
    clone.style.boxShadow = shadow;
  }
  const bgImg = cs.backgroundImage;
  if (bgImg && bgImg !== "none" && !bgImg.includes("oklab") && !bgImg.includes("oklch")) {
    clone.style.backgroundImage = bgImg;
  }
}

export function prepareHtml2CanvasClone(
  clonedDoc: Document,
  clonedRoot: HTMLElement,
  sourceRoot: HTMLElement,
): void {
  clonedDoc.querySelectorAll("style, link[rel='stylesheet']").forEach((node) => node.remove());

  const sources = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll("*"))];
  const clones = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll("*"))];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const clone = clones[i];
    if (!src || !clone || !(clone instanceof HTMLElement)) continue;
    inlineComputedStyles(src, clone);
  }
}
