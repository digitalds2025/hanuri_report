import type { CSSProperties } from "react";
import type { Json } from "../../lib/types/database";

export type QuarterMindmapBookPreview = {
  id: string;
  title: string;
  cover_url: string | null;
  ai_category: string | null;
  ai_keywords: Json;
};

/** PDF(html2canvas) — 분류 뱃지는 인라인 hex (Tailwind 배경색은 PDF에서 깨짐) */
const BRANCHES = [
  {
    stroke: "#eab308",
    border: "border-amber-400",
    reportCardBorder: "border-[#fbbf24]",
    cat: "bg-amber-100 text-amber-900",
    pill: { bg: "#fef3c7", border: "#fbbf24", color: "#92400e" },
  },
  {
    stroke: "#22c55e",
    border: "border-green-500",
    reportCardBorder: "border-[#22c55e]",
    cat: "bg-green-100 text-green-900",
    pill: { bg: "#dcfce7", border: "#22c55e", color: "#166534" },
  },
  {
    stroke: "#38bdf8",
    border: "border-sky-400",
    reportCardBorder: "border-[#38bdf8]",
    cat: "bg-sky-100 text-sky-900",
    pill: { bg: "#e0f2fe", border: "#38bdf8", color: "#0c4a6e" },
  },
  {
    stroke: "#ec4899",
    border: "border-pink-500",
    reportCardBorder: "border-[#ec4899]",
    cat: "bg-pink-100 text-pink-900",
    pill: { bg: "#fce7f3", border: "#ec4899", color: "#9d174d" },
  },
  {
    stroke: "#a855f7",
    border: "border-purple-500",
    reportCardBorder: "border-[#a855f7]",
    cat: "bg-purple-100 text-purple-900",
    pill: { bg: "#f3e8ff", border: "#a855f7", color: "#6b21a8" },
  },
  {
    stroke: "#f97316",
    border: "border-orange-500",
    reportCardBorder: "border-[#f97316]",
    cat: "bg-orange-100 text-orange-900",
    pill: { bg: "#ffedd5", border: "#f97316", color: "#9a3412" },
  },
] as const;

const REPORT_PILL_BADGE_STYLE: CSSProperties = {
  display: "inline-block",
  boxSizing: "border-box",
  maxWidth: "100%",
  padding: "3px 8px",
  borderRadius: 9999,
  fontSize: 10,
  fontWeight: 500,
  lineHeight: "12px",
  textAlign: "center",
  verticalAlign: "middle",
};

type Branch = (typeof BRANCHES)[number];

const HUB_X = 50;
const HUB_Y = 52;
const END_X_LEFT = 24;
const END_X_RIGHT = 76;
const SLOT_Y_MIN = 20;
const SLOT_Y_MAX = 84;

/** 좌·우 책 개수(1~3)에 맞춰 연결선 끝 Y — justify-between 카드 배치와 동일 */
function slotYForIndex(index: number, count: number): number {
  if (count <= 1) return HUB_Y;
  const t = index / (count - 1);
  return SLOT_Y_MIN + t * (SLOT_Y_MAX - SLOT_Y_MIN);
}

function buildMindmapConnectorPath(side: "left" | "right", index: number, count: number): string {
  const endX = side === "left" ? END_X_LEFT : END_X_RIGHT;
  const endY = slotYForIndex(index, count);
  const ctrlX = side === "left" ? 36 : 64;
  const ctrlY = HUB_Y + (endY - HUB_Y) * 0.45;
  return `M ${HUB_X} ${HUB_Y} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
}

function columnLayoutClass(count: number, isReport: boolean): string {
  const base = "flex min-h-0 min-w-0 flex-1 flex-col py-1";
  if (count <= 1) return `${base} items-stretch justify-center ${isReport ? "h-full" : ""}`;
  return `${base} justify-between gap-2 ${isReport ? "h-full" : ""}`;
}

function bookAiKeywordsForPreview(kw: Json): string[] {
  if (!Array.isArray(kw)) return [];
  return kw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function QuarterReadingMindmapBookCard(props: {
  book: QuarterMindmapBookPreview;
  branch: Branch;
  layout: "wizard" | "report";
}) {
  const { book: b, branch, layout } = props;
  const kws = bookAiKeywordsForPreview(b.ai_keywords).slice(0, layout === "report" ? 5 : 4);
  const isReport = layout === "report";

  const coverClass = isReport
    ? "h-[4.25rem] w-[2.85rem] shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200/80"
    : "h-[3.25rem] w-[2.25rem] shrink-0 overflow-hidden rounded bg-slate-100 ring-1 ring-slate-200/80";

  const cardClass = isReport
    ? `box-border flex w-full max-w-full shrink-0 gap-2.5 rounded-lg border-2 border-solid bg-white p-2.5 shadow-sm ${branch.reportCardBorder}`
    : `box-border flex w-full max-w-full min-w-0 gap-1.5 overflow-hidden rounded-lg border-2 bg-white p-1.5 shadow-sm ${branch.border}`;

  return (
    <div className={cardClass}>
      <div className={coverClass}>
        {b.cover_url?.trim() ? (
          <img src={b.cover_url.trim()} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center text-center text-slate-500 ${isReport ? "text-[9px] leading-tight" : "text-[7px] leading-tight"}`}
          >
            —
          </div>
        )}
      </div>
      <div className={`min-w-0 flex-1 ${isReport ? "space-y-1.5" : "overflow-hidden"}`}>
        <p
          className={
            isReport
              ? "break-words text-[11px] font-semibold leading-snug text-slate-900"
              : "line-clamp-2 text-[10px] font-semibold leading-tight text-slate-900"
          }
          title={b.title}
        >
          {b.title}
        </p>
        {b.ai_category?.trim() ? (
          isReport ? (
            <span
              data-report-capture-badge
              className="max-w-full break-words"
              style={{
                ...REPORT_PILL_BADGE_STYLE,
                border: `1px solid ${branch.pill.border}`,
                backgroundColor: branch.pill.bg,
                color: branch.pill.color,
              }}
              title={b.ai_category.trim()}
            >
              {b.ai_category.trim()}
            </span>
          ) : (
            <p
              className={`mt-0.5 line-clamp-1 rounded-full px-1.5 py-px text-[9px] font-medium leading-tight ${branch.cat}`}
              title={b.ai_category.trim()}
            >
              {b.ai_category.trim()}
            </p>
          )
        ) : (
          <p className={isReport ? "text-[10px] text-slate-400" : "mt-0.5 text-[9px] text-slate-400"}>분류 없음</p>
        )}
        {kws.length > 0 ? (
          <p
            className={
              isReport
                ? "break-words text-[10px] leading-snug text-slate-600"
                : "mt-0.5 line-clamp-2 text-[8px] leading-tight text-slate-600"
            }
            title={kws.join(" · ")}
          >
            {kws.join(" · ")}
          </p>
        ) : (
          <p className={isReport ? "text-[10px] text-slate-400" : "mt-0.5 text-[8px] text-slate-400"}>키워드 없음</p>
        )}
      </div>
    </div>
  );
}

export type QuarterReadingMindmapPreviewProps = {
  books: QuarterMindmapBookPreview[];
  layout?: "wizard" | "report";
};

/** 최대 6권 — 좌 3 / 중앙 허브 / 우 3, SVG 곡선 연결 */
export function QuarterReadingMindmapPreview({ books, layout = "wizard" }: QuarterReadingMindmapPreviewProps) {
  const slice = books.slice(0, 6);
  const left = slice.slice(0, 3);
  const right = slice.slice(3, 6);
  const isReport = layout === "report";

  const leftBooks = left.filter((b): b is QuarterMindmapBookPreview => Boolean(b));
  const rightBooks = right.filter((b): b is QuarterMindmapBookPreview => Boolean(b));

  const renderColumn = (sideBooks: QuarterMindmapBookPreview[], branchOffset: number) =>
    sideBooks.map((b, i) => (
      <QuarterReadingMindmapBookCard
        key={b.id}
        book={b}
        branch={BRANCHES[branchOffset + i]!}
        layout={layout}
      />
    ));

  const renderConnectorPaths = (
    side: "left" | "right",
    sideBooks: QuarterMindmapBookPreview[],
    branchOffset: number,
  ) => {
    const count = sideBooks.length;
    return sideBooks.map((b, i) => (
      <path
        key={`path-${side}-${b.id}`}
        d={buildMindmapConnectorPath(side, i, count)}
        fill="none"
        stroke={BRANCHES[branchOffset + i]!.stroke}
        strokeWidth={0.55}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    ));
  };

  if (isReport) {
    return (
      <div className="flex h-full min-h-0 w-full max-w-full flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {renderConnectorPaths("left", leftBooks, 0)}
            {renderConnectorPaths("right", rightBooks, 3)}
          </svg>
          <div className="relative z-[1] flex min-h-0 flex-1 flex-row items-stretch justify-between gap-2">
            <div className={columnLayoutClass(leftBooks.length, isReport)}>{renderColumn(leftBooks, 0)}</div>
            <div className="flex w-10 shrink-0 items-center justify-center self-center" aria-hidden>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white/95 shadow-sm ring-1 ring-slate-100">
                <span className="text-sm leading-none">📖</span>
              </div>
            </div>
            <div className={columnLayoutClass(rightBooks.length, isReport)}>{renderColumn(rightBooks, 3)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-full overflow-hidden">
      <div className="relative mx-auto min-h-[220px] w-full max-w-full overflow-hidden sm:min-h-[240px]">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {renderConnectorPaths("left", leftBooks, 0)}
          {renderConnectorPaths("right", rightBooks, 3)}
        </svg>
        <div className="relative z-[1] flex w-full min-w-0 max-w-full flex-row items-stretch justify-between gap-1.5 py-2 sm:gap-2">
          <div className={columnLayoutClass(leftBooks.length, false)}>{renderColumn(leftBooks, 0)}</div>
          <div className="flex w-9 shrink-0 items-center justify-center" aria-hidden>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white/95 shadow-sm ring-1 ring-slate-100">
              <span className="text-xs leading-none">📖</span>
            </div>
          </div>
          <div className={columnLayoutClass(rightBooks.length, false)}>{renderColumn(rightBooks, 3)}</div>
        </div>
      </div>
    </div>
  );
}
