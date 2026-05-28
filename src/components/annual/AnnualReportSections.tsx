import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { monthKey, roundLabelKo } from "../../lib/annualReportTypes";
import type { TimelineSlotDisplay } from "../../lib/annualReportTypes";

export type AnnualReportViewModel = {
  yearLabel: string;
  windowLabel: string;
  timelineSlots: TimelineSlotDisplay[];
  outlook: string;
  totalBooks: number;
  litCount: number;
  nonLitCount: number;
  litRatio: number;
  nonLitRatio: number;
  /** 미래 로드맵 + 선생님 한마디 통합 본문 */
  warmSectionText: string;
  certText: string;
  certGradeLabel: string;
  certDateLabel: string;
};

const PIE_COLORS = ["#5b9bd5", "#94a3b8"];

function splitParagraphs(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const byBlank = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return t.split("\n").map((p) => p.trim()).filter(Boolean);
}

function sectionHeader(title: string) {
  return (
    <div className="rounded-t-lg bg-[#7eb3ee] px-4 py-2.5">
      <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
    </div>
  );
}

function TimelineCell({ slot }: { slot: TimelineSlotDisplay }) {
  return (
    <div className="flex min-h-[5.5rem] flex-col border border-slate-200 bg-white p-2 text-center">
      <p className="text-xs font-bold text-[#1a3b6b]">{roundLabelKo(slot.slotIndex)}</p>
      <p className="text-[10px] text-slate-500">{slot.ym}</p>
      <p className="mt-1 flex-1 text-[11px] leading-snug text-slate-700">{slot.summary.trim() || " "}</p>
    </div>
  );
}

export function AnnualReportSections({ model }: { model: AnnualReportViewModel }) {
  const pieData = [
    { name: "문학", value: model.litCount },
    { name: "비문학", value: model.nonLitCount },
  ].filter((d) => d.value > 0);

  const bookSummary =
    model.totalBooks > 0
      ? `문학 ${model.litCount}권(약 ${model.litRatio}%) / 비문학 ${model.nonLitCount}권(약 ${model.nonLitRatio}%)`
      : "등록된 도서가 없습니다.";

  return (
    <div className="space-y-6 overflow-hidden rounded-xl border border-slate-200 bg-[#f4f8fc] shadow-sm">
      <header className="bg-gradient-to-r from-[#7eb3ee] to-[#5b9bd5] px-5 py-4 text-center">
        <p className="text-xs font-medium text-blue-50">한우리독서토론논술</p>
        <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">연간 성장 리포트</h2>
        <p className="mt-1 text-xs text-blue-50">
          {model.yearLabel} · {model.windowLabel}
        </p>
      </header>

      <div className="space-y-4 px-4 pb-4">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {sectionHeader("1. 연간 타임라인")}
          <div className="p-3">
            <div className="grid grid-cols-3 gap-0 sm:grid-cols-6">
              {model.timelineSlots.slice(0, 6).map((slot) => (
                <TimelineCell key={slot.slotIndex} slot={slot} />
              ))}
            </div>
            <div className="mt-0 grid grid-cols-3 gap-0 sm:grid-cols-6">
              {model.timelineSlots.slice(6, 12).map((slot) => (
                <TimelineCell key={slot.slotIndex} slot={slot} />
              ))}
            </div>
            {model.outlook.trim() ? (
              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-800">
                {splitParagraphs(model.outlook).map((p, i) => (
                  <p key={i} className={i > 0 ? "mt-2" : ""}>
                    {p}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {sectionHeader("2. 도서 데이터")}
          <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,140px)_1fr_minmax(0,1fr)] sm:items-center">
            <div className="rounded-2xl bg-slate-100 px-4 py-6 text-center">
              <p className="text-xs text-slate-600">총</p>
              <p className="mt-1 text-2xl font-bold text-[#1a3b6b]">{model.totalBooks}</p>
              <p className="text-sm font-medium text-slate-700">권 완독</p>
            </div>
            <div className="h-40 w-full">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" label>
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v ?? 0}권`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-sm text-slate-500">차트 데이터 없음</p>
              )}
            </div>
            <div className="relative rounded-2xl bg-slate-100 px-4 py-4 text-sm leading-relaxed text-slate-800 after:absolute after:-left-2 after:top-1/2 after:hidden after:h-0 after:w-0 after:-translate-y-1/2 after:border-y-8 after:border-r-8 after:border-y-transparent after:border-r-slate-100 sm:after:block">
              {bookSummary}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {sectionHeader("3. 선생님의 따뜻한 한마디")}
            <div className="space-y-3 p-4 text-sm leading-relaxed text-slate-800">
              {splitParagraphs(model.warmSectionText).length > 0 ? (
                splitParagraphs(model.warmSectionText).map((p, i) => <p key={i}>{p}</p>)
              ) : (
                <p className="text-slate-500">내용이 없습니다.</p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border-2 border-slate-600 bg-white shadow-md">
            {sectionHeader("4. 수료 인증서")}
            <div className="flex flex-col items-center px-4 py-6 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl" aria-hidden>
                🏅
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-slate-800">
                {model.certText.trim() ||
                  `1년의 긴 여정을 멋지게 완주한 【이름】의 성장을 축하하며 위와 같이 수료증을 수여합니다.`}
              </p>
              <p className="mt-4 text-xs text-slate-600">{model.certDateLabel}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {model.certGradeLabel.trim() ? `${model.certGradeLabel} 수료` : "수료"}
              </p>
              <p className="mt-4 text-sm font-bold tracking-wide text-[#1a3b6b]">한우리독서토론논술</p>
              <div
                className="mt-3 h-10 w-10 rounded border-2 border-red-700/80 bg-red-50 text-[9px] leading-tight text-red-800"
                aria-label="직인"
              >
                <span className="flex h-full items-center justify-center">인</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** 저장 행 → 화면 모델 */
export function timelineMonthsFromJson(
  months: Record<string, string>,
): Record<number, string> {
  const out: Record<number, string> = {};
  for (let m = 1; m <= 12; m++) {
    out[m] = months[monthKey(m)] ?? "";
  }
  return out;
}
