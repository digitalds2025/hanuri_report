/**
 * html2canvas 1.x는 CSS `oklab()` / `oklch()` / `color-mix()` 를 파싱하지 못함 (Tailwind v4).
 * 스타일시트는 유지하고 색 함수만 rgb 로 치환 + 캡처 시 텍스트 색·폰트를 인라인합니다.
 */

const MODERN_COLOR_START = /\b(oklch|oklab|color-mix)\(/i;
const FALLBACK_TEXT_RGB = "rgb(55, 65, 81)";
const FALLBACK_FILL_RGB = "rgb(75, 85, 99)";

function hasModernColorFn(value: string): boolean {
  return MODERN_COLOR_START.test(value);
}

function isReadableColor(value: string | null | undefined): boolean {
  if (!value) return false;
  if (hasModernColorFn(value)) return false;
  if (value === "transparent" || value === "rgba(0, 0, 0, 0)") return false;
  return true;
}

function findClosingParenIndex(text: string, openParenIndex: number): number {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function modernColorToRgb(expr: string, probe: HTMLElement): string {
  const attempts: Array<() => string | null> = [
    () => {
      probe.style.cssText = "";
      probe.style.setProperty("color", expr);
      return getComputedStyle(probe).color;
    },
    () => {
      probe.style.cssText = "";
      probe.style.setProperty("background-color", expr);
      return getComputedStyle(probe).backgroundColor;
    },
    () => {
      probe.style.cssText = "";
      probe.style.setProperty("border-color", expr);
      return getComputedStyle(probe).borderTopColor;
    },
    () => {
      probe.style.cssText = "";
      probe.style.setProperty("outline-color", expr);
      return getComputedStyle(probe).outlineColor;
    },
    () => {
      probe.style.cssText = "";
      probe.style.setProperty("background", expr);
      return getComputedStyle(probe).backgroundColor;
    },
  ];

  for (const attempt of attempts) {
    try {
      const c = attempt();
      if (isReadableColor(c)) return c!;
    } catch {
      /* invalid for this property */
    }
  }

  if (/color-mix/i.test(expr)) return FALLBACK_TEXT_RGB;
  return FALLBACK_TEXT_RGB;
}

export function sanitizeCssText(css: string, doc: Document): string {
  if (!hasModernColorFn(css)) return css;

  const probe = doc.createElement("div");
  probe.style.display = "none";
  probe.setAttribute("aria-hidden", "true");
  doc.documentElement.appendChild(probe);

  try {
    let out = css;
    let guard = 0;
    const scan = /\b(oklch|oklab|color-mix)\(/gi;

    while (guard++ < 10_000) {
      scan.lastIndex = 0;
      const m = scan.exec(out);
      if (!m || m.index === undefined) break;

      const start = m.index;
      const openParen = start + m[0].length - 1;
      const end = findClosingParenIndex(out, openParen);
      if (end < 0) break;

      const expr = out.slice(start, end);
      const rgb = modernColorToRgb(expr, probe);
      out = out.slice(0, start) + rgb + out.slice(end);
    }

    return out;
  } finally {
    probe.remove();
  }
}

function sanitizeStyleElement(styleEl: HTMLStyleElement, doc: Document): void {
  const raw = styleEl.textContent ?? "";
  if (!hasModernColorFn(raw)) return;
  styleEl.textContent = sanitizeCssText(raw, doc);
}

function sanitizeInlineStyleAttr(el: Element, doc: Document): void {
  if (!(el instanceof HTMLElement)) return;
  const raw = el.getAttribute("style");
  if (!raw || !hasModernColorFn(raw)) return;
  el.setAttribute("style", sanitizeCssText(raw, doc));
}

type StyleBackup = { el: HTMLStyleElement; text: string };

const TEXT_PAINT_PROPS = [
  "font-size",
  "font-weight",
  "font-family",
  "line-height",
  "letter-spacing",
  "text-align",
] as const;

function elementHasDirectText(el: HTMLElement): boolean {
  return Array.from(el.childNodes).some(
    (n) => n.nodeType === Node.TEXT_NODE && (n.textContent?.trim() ?? "").length > 0,
  );
}

function isTextPaintTarget(el: HTMLElement): boolean {
  if (isCaptureCenterElement(el)) return true;
  if (elementHasDirectText(el)) return true;
  return /^(P|H1|H2|H3|H4|H5|H6|SPAN|LABEL|LI|TD|TH|STRONG|EM|B|I|A|BUTTON|LEGEND)$/i.test(el.tagName);
}

type TextPaintBackup = { style: string | null; fill?: string | null };

/** PDF 캡처 — 뱃지·통계 박스 등 짧은 텍스트 래퍼 (세로 가운데 정렬) */
export const REPORT_CAPTURE_CENTER_SELECTOR =
  "[data-report-capture-badge], [data-report-capture-box]";

type CaptureBoxMarkBackup = { el: HTMLElement };

function isCaptureCenterElement(el: HTMLElement): boolean {
  return (
    el.hasAttribute("data-report-capture-badge") || el.hasAttribute("data-report-capture-box")
  );
}

function isInsideCaptureCenter(el: HTMLElement): boolean {
  return el.closest(REPORT_CAPTURE_CENTER_SELECTOR) instanceof HTMLElement;
}

function shouldSkipLineHeightForCapture(el: HTMLElement): boolean {
  return isCaptureCenterElement(el) || isInsideCaptureCenter(el);
}

function inlineCaptureTextLineHeight(el: HTMLElement): void {
  const cs = getComputedStyle(el);
  const fontSize = cs.fontSize || "14px";
  el.style.setProperty("line-height", fontSize, "important");
  el.style.setProperty("margin-top", "0", "important");
  el.style.setProperty("margin-bottom", "0", "important");
}

function inlineCaptureCenterLayout(el: HTMLElement, _cs: CSSStyleDeclaration): void {
  const childEls = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
  const textChildren = childEls.filter((c) => /^(P|SPAN|STRONG|EM|B|I)$/i.test(c.tagName));
  const hasDirectText = elementHasDirectText(el);
  const isMultiLineBox = textChildren.length > 0 && !hasDirectText;

  el.style.setProperty("box-sizing", "border-box", "important");

  if (isMultiLineBox) {
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("flex-direction", "column", "important");
    el.style.setProperty("align-items", "center", "important");
    el.style.setProperty("justify-content", "center", "important");
    for (const child of textChildren) {
      inlineCaptureTextLineHeight(child);
    }
  } else {
    el.style.setProperty("display", "inline-flex", "important");
    el.style.setProperty("align-items", "center", "important");
    el.style.setProperty("justify-content", "center", "important");
    el.style.setProperty("vertical-align", "middle", "important");
    inlineCaptureTextLineHeight(el);
    const label = el.querySelector(":scope > p, :scope > span");
    if (label instanceof HTMLElement && label !== el) {
      inlineCaptureTextLineHeight(label);
    }
  }
}

function needsAutoCaptureBox(el: HTMLElement, cs: CSSStyleDeclaration): boolean {
  const tag = el.tagName;
  if (/^(SECTION|ARTICLE|MAIN|FORM|FIELDSET|TEXTAREA|TABLE|UL|OL|NAV|BUTTON|INPUT|SELECT)$/i.test(tag)) {
    return false;
  }
  if (el.closest("textarea, input, select, button")) return false;

  const pt = parseFloat(cs.paddingTop) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  if (pt + pb < 3) return false;

  const h = el.getBoundingClientRect().height;
  if (h > 180) return false;

  const hasDirectText = elementHasDirectText(el);
  const childEls = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
  const textChildren = childEls.filter((c) => /^(P|SPAN|STRONG|EM|B|I)$/i.test(c.tagName));
  if (!hasDirectText && textChildren.length === 0) return false;
  if (childEls.length > 6) return false;

  const br = Math.max(
    parseFloat(cs.borderTopLeftRadius) || 0,
    parseFloat(cs.borderTopRightRadius) || 0,
  );
  const hasBg = isReadableColor(cs.backgroundColor);

  if (br >= 6) return true;
  if (hasBg && pt + pb >= 6 && h > 0 && h <= 140) return true;
  if (
    (cs.display === "inline-block" || cs.display === "inline-flex") &&
    (hasDirectText || textChildren.length > 0)
  ) {
    return true;
  }
  if (cs.display === "flex" && cs.alignItems === "center" && h > 0 && h <= 120) {
    return true;
  }
  return false;
}

export function autoMarkReportCaptureBoxes(root: HTMLElement): CaptureBoxMarkBackup[] {
  const marked: CaptureBoxMarkBackup[] = [];
  for (const el of root.querySelectorAll("*")) {
    if (!(el instanceof HTMLElement)) continue;
    if (isCaptureCenterElement(el)) continue;
    if (el.closest(REPORT_CAPTURE_CENTER_SELECTOR)) continue;
    /** 마인드맵 책 카드 등 — 자식 뱃지·표지가 있으면 카드 전체에 box 마크 금지 */
    if (el.querySelector("[data-report-capture-badge], img")) continue;
    if (!needsAutoCaptureBox(el, getComputedStyle(el))) continue;
    el.setAttribute("data-report-capture-box", "");
    marked.push({ el });
  }
  return marked;
}

export function restoreAutoMarkedCaptureBoxes(backups: CaptureBoxMarkBackup[]): void {
  for (const { el } of backups) {
    el.removeAttribute("data-report-capture-box");
  }
}

function inlineCaptureCenterColors(el: HTMLElement, cs: CSSStyleDeclaration, opts?: { skipWebkitFill?: boolean }): void {
  if (isReadableColor(cs.backgroundColor)) {
    el.style.setProperty("background-color", cs.backgroundColor, "important");
  }
  if (isReadableColor(cs.color)) {
    el.style.setProperty("color", cs.color, "important");
    if (!opts?.skipWebkitFill) {
      el.style.setProperty("-webkit-text-fill-color", cs.color, "important");
    }
  }
  const borderColor = cs.borderTopColor;
  if (isReadableColor(borderColor)) {
    el.style.setProperty("border-style", "solid", "important");
    el.style.setProperty("border-width", cs.borderTopWidth || "1px", "important");
    el.style.setProperty("border-color", borderColor, "important");
  }
  el.style.setProperty("box-shadow", "none", "important");
  el.style.setProperty("background-image", "none", "important");
}

function isCaptureBadge(el: HTMLElement): boolean {
  return el.hasAttribute("data-report-capture-badge");
}

/** html2canvas — pill 뱃지: flex 대신 inline-block + 고정 padding (세로 중앙) */
function paintCaptureBadgeElement(el: HTMLElement, cs: CSSStyleDeclaration): void {
  const fontSize = cs.fontSize || "10px";
  const lh = `${Math.round(parseFloat(fontSize) * 1.25) || 12}px`;
  el.style.setProperty("display", "inline-block", "important");
  el.style.setProperty("box-sizing", "border-box", "important");
  el.style.setProperty("max-width", "100%", "important");
  el.style.setProperty("padding", "3px 8px", "important");
  el.style.setProperty("line-height", lh, "important");
  el.style.setProperty("text-align", "center", "important");
  el.style.setProperty("vertical-align", "middle", "important");
  el.style.setProperty("border-radius", "9999px", "important");
  el.style.setProperty("font-size", fontSize, "important");
  if (cs.fontWeight) el.style.setProperty("font-weight", cs.fontWeight, "important");
  inlineCaptureCenterColors(el, cs, { skipWebkitFill: true });
}

function paintCaptureCenterOnElement(el: HTMLElement, cs?: CSSStyleDeclaration): void {
  const computed = cs ?? getComputedStyle(el);
  if (isCaptureBadge(el)) {
    paintCaptureBadgeElement(el, computed);
    return;
  }
  inlineCaptureCenterLayout(el, computed);
  inlineCaptureCenterColors(el, computed);
  for (const label of el.querySelectorAll("p, span")) {
    if (!(label instanceof HTMLElement)) continue;
    if (label.closest(REPORT_CAPTURE_CENTER_SELECTOR) !== el) continue;
    const lcs = getComputedStyle(label);
    if (isReadableColor(lcs.color)) {
      label.style.setProperty("color", lcs.color, "important");
      label.style.setProperty("-webkit-text-fill-color", lcs.color, "important");
    }
    if (lcs.fontSize) label.style.setProperty("font-size", lcs.fontSize);
    if (lcs.fontWeight) label.style.setProperty("font-weight", lcs.fontWeight);
    inlineCaptureTextLineHeight(label);
  }
}

function assignCaptureCenterIndices(root: HTMLElement): void {
  let i = 0;
  for (const el of root.querySelectorAll(REPORT_CAPTURE_CENTER_SELECTOR)) {
    if (el instanceof HTMLElement) el.setAttribute("data-report-capture-idx", String(i++));
  }
}

function inlineExportCaptureCenterPaint(root: HTMLElement): void {
  assignCaptureCenterIndices(root);
  for (const el of root.querySelectorAll(REPORT_CAPTURE_CENTER_SELECTOR)) {
    if (el instanceof HTMLElement) paintCaptureCenterOnElement(el);
  }
}

function syncExportCaptureCenterToClone(sourceRoot: HTMLElement, cloneRoot: HTMLElement): void {
  for (const src of sourceRoot.querySelectorAll(REPORT_CAPTURE_CENTER_SELECTOR)) {
    if (!(src instanceof HTMLElement)) continue;
    const idx = src.getAttribute("data-report-capture-idx");
    if (idx === null) continue;
    const clone = cloneRoot.querySelector(`[data-report-capture-idx="${idx}"]`);
    if (!(clone instanceof HTMLElement)) continue;
    const cs = getComputedStyle(src);
    paintCaptureCenterOnElement(clone, cs);
    if (!isCaptureBadge(clone)) {
      const srcLabels = src.querySelectorAll(":scope > p, :scope > span");
      const cloneLabels = clone.querySelectorAll(":scope > p, :scope > span");
      for (let j = 0; j < srcLabels.length; j++) {
        const srcLabel = srcLabels[j];
        const cloneLabel = cloneLabels[j];
        if (!(srcLabel instanceof HTMLElement) || !(cloneLabel instanceof HTMLElement)) continue;
        const lcs = getComputedStyle(srcLabel);
        if (isReadableColor(lcs.color)) {
          cloneLabel.style.setProperty("color", lcs.color, "important");
          cloneLabel.style.setProperty("-webkit-text-fill-color", lcs.color, "important");
        }
        if (lcs.fontSize) cloneLabel.style.setProperty("font-size", lcs.fontSize);
        if (lcs.fontWeight) cloneLabel.style.setProperty("font-weight", lcs.fontWeight);
        inlineCaptureTextLineHeight(cloneLabel);
      }
    }
  }
}

/** 캡처 직전 원본 DOM — 브라우저가 계산한 rgb 텍스트 색·폰트를 인라인 */
export function inlineTextPaintForCapture(root: HTMLElement): Map<Element, TextPaintBackup> {
  const saved = new Map<Element, TextPaintBackup>();
  const nodes = [root, ...Array.from(root.querySelectorAll("*"))];

  for (const el of nodes) {
    if (el instanceof SVGTextElement) {
      const cs = getComputedStyle(el);
      const fill = isReadableColor(cs.fill) ? cs.fill : isReadableColor(cs.color) ? cs.color : FALLBACK_FILL_RGB;
      saved.set(el, { style: el.getAttribute("style"), fill: el.getAttribute("fill") });
      el.setAttribute("fill", fill);
      if (cs.fontSize) el.setAttribute("font-size", cs.fontSize);
      if (cs.fontFamily) el.setAttribute("font-family", cs.fontFamily);
      if (cs.fontWeight) el.setAttribute("font-weight", cs.fontWeight);
      continue;
    }

    if (!(el instanceof HTMLElement)) continue;
    if (isCaptureCenterElement(el)) continue;
    if (!isTextPaintTarget(el)) continue;

    const cs = getComputedStyle(el);
    if (!isReadableColor(cs.color)) continue;

    saved.set(el, { style: el.getAttribute("style") });
    el.style.setProperty("color", cs.color, "important");
    if (!isInsideCaptureCenter(el)) {
      el.style.setProperty("-webkit-text-fill-color", cs.color, "important");
    }

    for (const prop of TEXT_PAINT_PROPS) {
      if (prop === "line-height" && shouldSkipLineHeightForCapture(el)) continue;
      const val = cs.getPropertyValue(prop);
      if (val && !hasModernColorFn(val)) el.style.setProperty(prop, val);
    }
  }

  inlineExportCaptureCenterPaint(root);

  return saved;
}

export function restoreTextPaintInline(saved: Map<Element, TextPaintBackup>): void {
  for (const [el, prev] of saved) {
    if (el instanceof SVGTextElement) {
      if (prev.style === null) el.removeAttribute("style");
      else el.setAttribute("style", prev.style);
      if (prev.fill === null || prev.fill === undefined) el.removeAttribute("fill");
      else el.setAttribute("fill", prev.fill);
      continue;
    }
    if (!(el instanceof HTMLElement)) continue;
    if (prev.style === null) el.removeAttribute("style");
    else el.setAttribute("style", prev.style);
  }
}

/** html2canvas 클론 — 원본 computed 텍스트 스타일을 클론에 복사 */
export function syncTextPaintToClone(sourceRoot: HTMLElement, cloneRoot: HTMLElement): void {
  const sources = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll("*"))];
  const clones = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll("*"))];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const clone = clones[i];
    if (!src || !clone) continue;

    if (src instanceof SVGTextElement && clone instanceof SVGTextElement) {
      const cs = getComputedStyle(src);
      const fill = isReadableColor(cs.fill) ? cs.fill : isReadableColor(cs.color) ? cs.color : FALLBACK_FILL_RGB;
      clone.setAttribute("fill", fill);
      if (cs.fontSize) clone.setAttribute("font-size", cs.fontSize);
      if (cs.fontFamily) clone.setAttribute("font-family", cs.fontFamily);
      if (cs.fontWeight) clone.setAttribute("font-weight", cs.fontWeight);
      continue;
    }

    if (!(clone instanceof HTMLElement) || !(src instanceof HTMLElement)) continue;
    if (isCaptureCenterElement(src)) continue;
    if (!isTextPaintTarget(src)) continue;

    const cs = getComputedStyle(src);
    if (isReadableColor(cs.color)) {
      clone.style.setProperty("color", cs.color, "important");
      if (!isInsideCaptureCenter(src)) {
        clone.style.setProperty("-webkit-text-fill-color", cs.color, "important");
      }
    }
    for (const prop of TEXT_PAINT_PROPS) {
      if (prop === "line-height" && shouldSkipLineHeightForCapture(src)) continue;
      const val = cs.getPropertyValue(prop);
      if (val && !hasModernColorFn(val)) clone.style.setProperty(prop, val);
    }
  }

  syncExportCaptureCenterToClone(sourceRoot, cloneRoot);
}

export function prepareHtml2CanvasClone(
  clonedDoc: Document,
  sourceRoot: HTMLElement | null,
  cloneRoot: HTMLElement | null,
): void {
  clonedDoc.querySelectorAll("style").forEach((node) => {
    if (node instanceof HTMLStyleElement) sanitizeStyleElement(node, clonedDoc);
  });

  if (cloneRoot) {
    const nodes = [cloneRoot, ...cloneRoot.querySelectorAll("*")];
    for (const el of nodes) sanitizeInlineStyleAttr(el, clonedDoc);
  }

  if (sourceRoot && cloneRoot) {
    syncTextPaintToClone(sourceRoot, cloneRoot);
    resetCloneRootForCapture(cloneRoot);
  }
}

/** 클론 문서에서 루트가 화면 밖으로 밀리지 않도록 (viewport 좌표 인라인 방지) */
function resetCloneRootForCapture(cloneRoot: HTMLElement): void {
  cloneRoot.style.position = "relative";
  cloneRoot.style.left = "0";
  cloneRoot.style.top = "0";
  cloneRoot.style.right = "auto";
  cloneRoot.style.bottom = "auto";
  cloneRoot.style.transform = "none";
  cloneRoot.style.margin = "0";
}

export function withSanitizedStylesForCapture<T>(
  doc: Document,
  exportRoot: HTMLElement | null,
  run: () => Promise<T> | T,
): Promise<T> {
  const styleBackups: StyleBackup[] = [];
  const inlineBackups: { el: HTMLElement; style: string | null }[] = [];
  let textPaintSaved: Map<Element, TextPaintBackup> | null = null;
  let captureBoxMarks: CaptureBoxMarkBackup[] = [];

  doc.querySelectorAll("style").forEach((node) => {
    if (!(node instanceof HTMLStyleElement)) return;
    const text = node.textContent ?? "";
    styleBackups.push({ el: node, text });
    sanitizeStyleElement(node, doc);
  });

  if (exportRoot) {
    captureBoxMarks = autoMarkReportCaptureBoxes(exportRoot);
    textPaintSaved = inlineTextPaintForCapture(exportRoot);

    const inlineRoots: Element[] = [exportRoot, ...exportRoot.querySelectorAll("*")];
    for (const el of inlineRoots) {
      if (!(el instanceof HTMLElement)) continue;
      const raw = el.getAttribute("style");
      if (!raw || !hasModernColorFn(raw)) continue;
      inlineBackups.push({ el, style: raw });
      sanitizeInlineStyleAttr(el, doc);
    }
  }

  const finish = (): void => {
    for (const { el, text } of styleBackups) {
      el.textContent = text;
    }
    for (const { el, style } of inlineBackups) {
      if (style === null) el.removeAttribute("style");
      else el.setAttribute("style", style);
    }
    if (textPaintSaved) restoreTextPaintInline(textPaintSaved);
    restoreAutoMarkedCaptureBoxes(captureBoxMarks);
  };

  try {
    const result = run();
    if (result instanceof Promise) {
      return result.finally(finish);
    }
    finish();
    return Promise.resolve(result);
  } catch (e) {
    finish();
    throw e;
  }
}
