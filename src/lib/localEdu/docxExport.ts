import type { MasterOutline } from "../briefingMaterialTypes";

export function buildDocxMarkdown(
  outline: MasterOutline,
  sections: { blockId: string; title: string; paragraphs: string[] }[],
): string {
  const parts = [
    `# ${outline.topicTitle}`,
    "",
    `**지역**: ${outline.regionLabel}`,
    `**대상**: ${outline.targetLabel}`,
    `**목적**: ${outline.purposeLabel}`,
    `**지역 자료 기준 시점: ${outline.dataAsOf}**`,
    "",
    "---",
    "",
  ];

  for (const sec of sections) {
    parts.push(`## ${sec.title}`, "");
    for (const p of sec.paragraphs) {
      if (p.startsWith("▶") || p.startsWith("[강사")) {
        parts.push(`> **${p}**`, "");
      } else if (p.startsWith("•")) {
        parts.push(p);
      } else {
        parts.push(p, "");
      }
    }
    parts.push("");
  }

  parts.push(
    "---",
    "",
    "## 면책 및 출처",
    `- 본 자료는 공식 공시·학교 공개 자료를 바탕으로 작성되었으며, 지역 자료 기준 시점은 ${outline.dataAsOf} 입니다.`,
    "- 특정 학교·학원의 우열을 단정하지 않습니다. 상담 시 최신 공고를 확인하세요.",
  );

  return parts.join("\n");
}
