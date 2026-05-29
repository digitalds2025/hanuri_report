import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { monthKey, roundLabelKo } from "../../lib/annualReportTypes";
import type { TimelineSlotDisplay } from "../../lib/annualReportTypes";
import { ReportSection } from "../reports/ReportSection";
import { ReportShell } from "../reports/ReportShell";
import { ANNUAL_OUTLOOK_MAX_CHARS } from "../../lib/annualReportCopy";
import { REPORT_HEADER_TITLE_ANNUAL } from "../../lib/reportHeaderTitles";
import { REPORT_TWO_COLUMN_GRID_CLASS } from "../../lib/reportLayout";
import { REPORT_EDIT_TEXTAREA_CLASS, ReportBodyParagraphs } from "../../lib/reportText";

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
  warmSectionText: string;
  certText: string;
  certGradeLabel: string;
  certDateLabel: string;
};

const PIE_COLORS = ["#5b9bd5", "#94a3b8"];

type AnnualReportSectionsProps = {
  model: AnnualReportViewModel;
  editMode?: boolean;
  onOutlookChange?: (v: string) => void;
  onWarmSectionChange?: (v: string) => void;
  onCertTextChange?: (v: string) => void;
  onCertGradeLabelChange?: (v: string) => void;
};

function TimelineCell({ slot }: { slot: TimelineSlotDisplay }) {
  return (
    <div className="flex min-h-[5.5rem] flex-col border border-gray-200 bg-white p-2 text-center">
      <p className="text-xs font-bold text-[#1a3b6b]">{roundLabelKo(slot.slotIndex)}</p>
      <p className="text-[10px] text-gray-500">{slot.ym}</p>
      <p className="mt-1 flex-1 text-[11px] leading-snug text-gray-700">{slot.summary.trim() || " "}</p>
    </div>
  );
}

export function AnnualReportSections({
  model,
  editMode = false,
  onOutlookChange,
  onWarmSectionChange,
  onCertTextChange,
  onCertGradeLabelChange,
}: AnnualReportSectionsProps) {
  const pieData = [
    { name: "문학", value: model.litCount },
    { name: "비문학", value: model.nonLitCount },
  ].filter((d) => d.value > 0);

  const bookSummary =
    model.totalBooks > 0
      ? `문학 ${model.litCount}권(약 ${model.litRatio}%) / 비문학 ${model.nonLitCount}권(약 ${model.nonLitRatio}%)`
      : "";

  return (
    <ReportShell headerTitle={REPORT_HEADER_TITLE_ANNUAL}>
      <ReportSection title="연간 타임라인">
        <div>
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
          {editMode && onOutlookChange ? (
            <textarea
              className={REPORT_EDIT_TEXTAREA_CLASS + " mt-4 min-h-[80px]"}
              value={model.outlook}
              maxLength={ANNUAL_OUTLOOK_MAX_CHARS}
              onChange={(e) => onOutlookChange(e.target.value)}
              aria-label="연간 전망"
            />
          ) : model.outlook.trim() ? (
            <div className="mt-4">
              <p className="leading-relaxed text-gray-700">{model.outlook}</p>
            </div>
          ) : null}
        </div>
      </ReportSection>

      <ReportSection title="도서 데이터">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,140px)_1fr_minmax(0,1fr)] sm:items-center">
          <div
            data-report-capture-box
            className="rounded-2xl border-2 border-solid border-[#e5e7eb] bg-[#f9fafb] px-4 py-6 text-center"
          >
            <p className="text-sm text-[#4b5563]">총</p>
            <p className="mt-1 text-2xl font-bold text-[#1a3b6b]">{model.totalBooks}</p>
            <p className="text-[15px] font-medium text-[#374151]">권 완독</p>
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
            ) : null}
          </div>
          {bookSummary ? (
            <p className="text-[15px] leading-relaxed text-gray-700">{bookSummary}</p>
          ) : null}
        </div>
      </ReportSection>

      <div className={REPORT_TWO_COLUMN_GRID_CLASS}>
        <ReportSection title="선생님의 따뜻한 한마디" className="mb-0">
          {editMode && onWarmSectionChange ? (
            <textarea
              className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[200px]"}
              value={model.warmSectionText}
              onChange={(e) => onWarmSectionChange(e.target.value)}
              aria-label="로드맵·한마디"
            />
          ) : (
            <ReportBodyParagraphs text={model.warmSectionText} />
          )}
        </ReportSection>

        <ReportSection title="수료 인증서" className="mb-0" contentClassName="border-2 border-gray-600">
          <div className="flex flex-col items-center text-center">
            <p className="mb-3 text-3xl leading-none" aria-hidden>
              🏅
            </p>
            {editMode && onCertTextChange ? (
              <textarea
                className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[120px] text-center"}
                value={model.certText}
                onChange={(e) => onCertTextChange(e.target.value)}
                aria-label="수료증 문구"
              />
            ) : (
              <p className="max-w-sm text-[15px] leading-relaxed text-gray-700">
                {model.certText.trim() ||
                  `1년의 긴 여정을 멋지게 완주한 【이름】의 성장을 축하하며 위와 같이 수료증을 수여합니다.`}
              </p>
            )}
            <p className="mt-4 text-sm text-gray-600">{model.certDateLabel}</p>
            {editMode && onCertGradeLabelChange ? (
              <input
                className="mt-1 w-full max-w-xs rounded-md border border-gray-200 px-3 py-2 text-center text-[15px]"
                value={model.certGradeLabel}
                onChange={(e) => onCertGradeLabelChange(e.target.value)}
                aria-label="수료 학년"
              />
            ) : (
              <p className="mt-1 text-[15px] font-semibold text-gray-800">
                {model.certGradeLabel.trim() ? `${model.certGradeLabel} 수료` : "수료"}
              </p>
            )}
            <p className="mt-4 text-[15px] font-bold tracking-wide text-[#1a3b6b]">한우리독서토론논술</p>
          </div>
        </ReportSection>
      </div>
    </ReportShell>
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
