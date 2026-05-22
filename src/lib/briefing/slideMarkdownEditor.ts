import type { BriefingLayoutSlide } from "../briefingMaterialTypes";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function extractBullets(slide: BriefingLayoutSlide): string[] {
  const from = [
    ...strArr(slide.bullets),
    ...strArr(slide.items),
    ...strArr(slide.points),
    ...strArr(slide.leftItems),
    ...strArr(slide.rightItems),
    ...strArr(slide.paragraphs),
  ];
  if (from.length) return from;
  const content = str(slide.content);
  if (content) return [content];
  return [];
}

function parseFrontmatter(md: string): { layout: string; body: string } {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { layout: "DETAILED_TEXT", body: md };
  const fm = m[1];
  const layoutMatch = fm.match(/layout:\s*(\S+)/i);
  return {
    layout: layoutMatch?.[1]?.trim() || "DETAILED_TEXT",
    body: m[2],
  };
}

function section(body: string, heading: string): string {
  const re = new RegExp(
    `##\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i",
  );
  const m = body.match(re);
  return m?.[1]?.trim() ?? "";
}

function parseBulletList(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
}

function parseBlockquote(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/^>\s?/, "").trim())
    .join("\n")
    .trim();
}

function parseH1(body: string): string {
  const m = body.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() ?? "";
}

/** 슬라이드 → Gamma 스타일 마크다운 편집 원본 */
export function slideToEditableMarkdown(slide: BriefingLayoutSlide): string {
  const layout = str(slide.type) || "DETAILED_TEXT";
  const lines: string[] = ["---", `layout: ${layout}`, "---", ""];

  const title = str(slide.title);
  if (title) lines.push(`# ${title}`, "");

  const subtitle = str(slide.subtitle);
  if (subtitle) lines.push(`부제: ${subtitle}`, "");

  const desc = str(slide.description);
  if (desc && layout !== "TITLE" && layout !== "SECTION_HEADER") {
    lines.push(`설명: ${desc}`, "");
  }

  if (layout === "STAT_GRID" && Array.isArray(slide.stats)) {
    lines.push("## 통계 카드");
    for (const s of slide.stats as { value?: string; label?: string; subtext?: string }[]) {
      lines.push(`- ${s.value ?? ""} | ${s.label ?? ""}${s.subtext ? ` | ${s.subtext}` : ""}`);
    }
    lines.push("");
  }

  if (layout === "CHART_BAR" && Array.isArray(slide.bars)) {
    lines.push("## 막대 차트");
    for (const b of slide.bars as { label?: string; value?: number; display?: string }[]) {
      lines.push(`- ${b.label ?? ""} | ${b.value ?? ""}${b.display ? ` | ${b.display}` : ""}`);
    }
    lines.push("");
  }

  if (layout === "ICON_GRID" && Array.isArray(slide.icons)) {
    lines.push("## 아이콘 카드");
    for (const ic of slide.icons as { icon?: string; label?: string; desc?: string }[]) {
      lines.push(`- ${ic.icon ?? "lightbulb"} | ${ic.label ?? ""} | ${ic.desc ?? ""}`);
    }
    lines.push("");
  }

  if (layout === "KPI_ROW" && Array.isArray(slide.kpis)) {
    lines.push("## KPI");
    for (const k of slide.kpis as { value?: string; label?: string }[]) {
      lines.push(`- ${k.value ?? ""} | ${k.label ?? ""}`);
    }
    lines.push("");
  }

  const bullets = extractBullets(slide);
  const simpleLayouts = new Set([
    "CHECKLIST",
    "DETAILED_TEXT",
    "COMPARISON",
    "TITLE",
    "SECTION_HEADER",
  ]);
  if (bullets.length && (simpleLayouts.has(layout) || !["STAT_GRID", "CHART_BAR", "ICON_GRID", "KPI_ROW"].includes(layout))) {
    lines.push("## 화면 (Slide Text)", ...bullets.map((b) => `- ${b}`), "");
  }

  if (layout === "GRID_CARDS" && Array.isArray(slide.cards)) {
    lines.push("## 카드");
    for (const c of slide.cards as { title?: string; desc?: string }[]) {
      lines.push(`- **${c.title ?? ""}**: ${c.desc ?? ""}`);
    }
    lines.push("");
  }

  if (layout === "DATA_TABLE") {
    const headers = strArr(slide.headers);
    if (headers.length) lines.push(`표 헤더: ${headers.join(" | ")}`, "");
    if (Array.isArray(slide.rows)) {
      lines.push("## 표 행");
      for (const row of slide.rows as string[][]) {
        lines.push(`- ${row.join(" | ")}`);
      }
      lines.push("");
    }
  }

  if (layout === "COMPARISON") {
    lines.push(
      `## 비교`,
      `### ${str(slide.leftTitle) || "왼쪽"}`,
      ...strArr(slide.leftItems).map((i) => `- ${i}`),
      `### ${str(slide.rightTitle) || "오른쪽"}`,
      ...strArr(slide.rightItems).map((i) => `- ${i}`),
      "",
    );
  }

  if (layout === "STEP_CARDS" && Array.isArray(slide.steps)) {
    lines.push("## 단계");
    for (const s of slide.steps as { title?: string; content?: string; desc?: string }[]) {
      lines.push(`- **${s.title ?? ""}**: ${s.content ?? s.desc ?? ""}`);
    }
    lines.push("");
  }

  if (layout === "METRIC") {
    if (str(slide.value)) lines.push(`수치: ${str(slide.value)}`, "");
    if (str(slide.label)) lines.push(`라벨: ${str(slide.label)}`, "");
  }

  if (layout === "QUOTE") {
    if (str(slide.text)) lines.push(`인용: ${str(slide.text)}`, "");
    if (str(slide.author)) lines.push(`출처: ${str(slide.author)}`, "");
  }

  if (layout === "SOURCES") {
    if (str(slide.dataAsOf)) lines.push(`기준 시점: ${str(slide.dataAsOf)}`, "");
  }

  const script =
    str(slide.speakerNotes) || str(slide.script) || str(slide.presenter_script);
  if (script) lines.push("## 발표 멘트 (Presenter Script)", script, "");

  const insight =
    str(slide.instructorInsight) ||
    str(slide.insight) ||
    str(slide.tip) ||
    (layout === "INSTRUCTOR_INSIGHT" ? strArr(slide.prompts).join("\n") : "");
  if (insight) {
    lines.push("## 강사 인사이트 (Instructor Insight)", `> ${insight.replace(/\n/g, "\n> ")}`, "");
  }

  return lines.join("\n").trimEnd() + "\n";
}

/** 마크다운 편집 → 슬라이드 객체 (기존 슬라이드와 병합) */
export function markdownToSlide(
  markdown: string,
  previous: BriefingLayoutSlide,
): BriefingLayoutSlide {
  const { layout, body } = parseFrontmatter(markdown);
  const type = layout || str(previous.type) || "DETAILED_TEXT";
  const title = parseH1(body) || str(previous.title);
  const slideText = parseBulletList(section(body, "화면"));
  const script = section(body, "발표 멘트") || section(body, "Presenter Script");
  const insightRaw = section(body, "강사 인사이트") || section(body, "Instructor Insight");
  const insight = parseBlockquote(insightRaw);

  const subtitleMatch = body.match(/^부제:\s*(.+)$/m);
  const descMatch = body.match(/^설명:\s*(.+)$/m);

  const next: BriefingLayoutSlide = {
    ...previous,
    type,
    title,
  };

  if (subtitleMatch) next.subtitle = subtitleMatch[1];
  if (descMatch) next.description = descMatch[1];

  if (type === "TITLE") {
    if (slideText[0]) next.subtitle = slideText[0];
    return next;
  }

  if (type === "SECTION_HEADER") {
    next.description = descMatch?.[1] ?? slideText.join(" ") ?? str(previous.description);
    return next;
  }

  if (type === "STAT_GRID") {
    const stats = parseBulletList(section(body, "통계")).map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      return { value: parts[0] ?? "", label: parts[1] ?? "", subtext: parts[2] };
    });
    if (stats.length) next.stats = stats;
  } else if (type === "CHART_BAR") {
    const bars = parseBulletList(section(body, "막대")).map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      return {
        label: parts[0] ?? "",
        value: Number(parts[1]) || 50,
        display: parts[2],
      };
    });
    if (bars.length) next.bars = bars;
  } else if (type === "ICON_GRID") {
    const icons = parseBulletList(section(body, "아이콘")).map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      return { icon: parts[0] ?? "lightbulb", label: parts[1] ?? "", desc: parts[2] ?? "" };
    });
    if (icons.length) next.icons = icons;
  } else if (type === "KPI_ROW") {
    const kpis = parseBulletList(section(body, "KPI")).map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      return { value: parts[0] ?? "", label: parts[1] ?? "" };
    });
    if (kpis.length) next.kpis = kpis;
  } else if (type === "CHECKLIST") {
    next.items = slideText.length ? slideText.slice(0, 5) : strArr(previous.items).slice(0, 5);
  } else if (type === "GRID_CARDS") {
    const cardSec = section(body, "카드");
    const cards = parseBulletList(cardSec).map((line) => {
      const bold = line.match(/^\*\*(.+?)\*\*:\s*(.*)$/);
      return bold
        ? { title: bold[1], desc: bold[2] }
        : { title: line, desc: "" };
    });
    if (cards.length) next.cards = cards;
    else if (slideText.length) next.cards = slideText.map((t) => ({ title: t, desc: "" }));
  } else if (type === "DATA_TABLE") {
    const headerLine = body.match(/^표 헤더:\s*(.+)$/m);
    if (headerLine) {
      next.headers = headerLine[1].split("|").map((h) => h.trim());
    }
    const rows = parseBulletList(section(body, "표 행")).map((r) =>
      r.split("|").map((c) => c.trim()),
    );
    if (rows.length) next.rows = rows;
  } else if (type === "COMPARISON") {
    const cmp = section(body, "비교");
    const parts = cmp.split(/###\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const leftLines = parts[0].split("\n");
      next.leftTitle = leftLines[0]?.trim();
      next.leftItems = parseBulletList(leftLines.slice(1).join("\n"));
      const rightLines = parts[1].split("\n");
      next.rightTitle = rightLines[0]?.trim();
      next.rightItems = parseBulletList(rightLines.slice(1).join("\n"));
    }
    if (slideText.length && strArr(next.leftItems).length === 0) {
      next.bullets = slideText;
    }
  } else if (type === "STEP_CARDS") {
    const steps = parseBulletList(section(body, "단계")).map((line) => {
      const bold = line.match(/^\*\*(.+?)\*\*:\s*(.*)$/);
      return bold
        ? { title: bold[1], content: bold[2] }
        : { title: line, content: "" };
    });
    if (steps.length) next.steps = steps;
  } else if (type === "METRIC") {
    const val = body.match(/^수치:\s*(.+)$/m);
    const lab = body.match(/^라벨:\s*(.+)$/m);
    if (val) next.value = val[1];
    if (lab) next.label = lab[1];
    if (slideText[0]) next.description = slideText[0];
  } else if (type === "QUOTE") {
    const q = body.match(/^인용:\s*(.+)$/m);
    const a = body.match(/^출처:\s*(.+)$/m);
    if (q) next.text = q[1];
    if (a) next.author = a[1];
  } else if (type === "SOURCES") {
    const d = body.match(/^기준 시점:\s*(.+)$/m);
    if (d) next.dataAsOf = d[1];
    next.items = slideText.length ? slideText : strArr(previous.items);
  } else if (type === "INSTRUCTOR_INSIGHT") {
    next.prompts = insight
      ? insight.split("\n").filter(Boolean)
      : slideText.length
        ? slideText
        : strArr(previous.prompts);
  } else if (type === "DETAILED_TEXT") {
    next.paragraphs = slideText.slice(0, 4);
  } else if (["STAT_GRID", "CHART_BAR", "ICON_GRID", "KPI_ROW", "PROCESS_FLOW"].includes(type)) {
    /* 구조화 섹션에서 이미 반영 */
  } else if (slideText.length) {
    next.items = slideText.slice(0, 5);
  }

  if (script) {
    next.speakerNotes = script;
    next.script = script;
    next.presenter_script = script;
  }
  if (insight) {
    next.instructorInsight = insight.startsWith("[") ? insight : `[💡 강사 가이드] ${insight}`;
    next.insight = insight;
  }

  return next;
}

export function slidesToMarkdownBundle(slides: BriefingLayoutSlide[]): string {
  return slides
    .map((s, i) => `<!-- slide ${i + 1} -->\n${slideToEditableMarkdown(s)}`)
    .join("\n\n");
}
