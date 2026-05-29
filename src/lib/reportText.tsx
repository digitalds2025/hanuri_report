/** 레포트 섹션 편집 textarea (월간·분기·반기·연간 공통) */
export const REPORT_EDIT_TEXTAREA_CLASS =
  "w-full min-h-[160px] resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-[15px] leading-relaxed text-gray-800 shadow-inner outline-none focus:border-[#9bbdff] focus:ring-1 focus:ring-[#9bbdff]";

/** 분기 Best·마인드맵 설명 등 — 내용 높이에 맞춤(고정 min-height 없음) */
export const REPORT_QUARTER_DESC_TEXTAREA_CLASS =
  "w-full min-h-0 resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-[15px] leading-relaxed text-gray-800 shadow-inner outline-none focus:border-[#9bbdff] focus:ring-1 focus:ring-[#9bbdff]";

/** 문단 분리 — 빈 줄 두 줄, 없으면 단일 줄바꿈 */
export function splitReportParagraphs(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const byBlank = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return t.split("\n").map((p) => p.trim()).filter(Boolean);
}

export function ReportBodyParagraphs({
  text,
  compact,
}: {
  text: string;
  /** 분기 Best·마인드맵 등 짧은 설명 — 문단 간격 축소 */
  compact?: boolean;
}) {
  const paragraphs = splitReportParagraphs(text);
  if (paragraphs.length === 0) return null;
  return (
    <div className={compact ? "space-y-2 text-gray-700" : "space-y-4 text-gray-700"}>
      {paragraphs.map((p, index) => (
        <p key={index} className="whitespace-pre-line leading-relaxed">
          {p}
        </p>
      ))}
    </div>
  );
}
