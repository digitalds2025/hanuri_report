import { PolygonRadarChart, type RadarDatum } from "../reports/PolygonRadarChart";
import { ReportSection } from "../reports/ReportSection";
import { ReportShell } from "../reports/ReportShell";
import { PILLAR_KEYS, pillarLabelsKo, type PillarKey } from "../../lib/reportAggregates";
import type { HalfYearReadingTypeDef } from "../../lib/halfYearReadingTypes";
import { REPORT_EDIT_TEXTAREA_CLASS, ReportBodyParagraphs } from "../../lib/reportText";
import { REPORT_HEADER_TITLE_HALF } from "../../lib/reportHeaderTitles";
import { REPORT_SECTION_CONTENT_GRID_CLASS } from "../../lib/reportLayout";
import {
  HALF_YEAR_GAUGE_DESC_MAX_CHARS,
  HALF_YEAR_READING_TYPE_DESC_MAX_CHARS,
} from "../../lib/halfYearReportCopy";
import { HalfYearGauge } from "./HalfYearGauge";

/** 반기 「최근 6개월간의 점수 평균」 — 레이더·구간 서술 ↔ 게이지 블록 간격 */
const HALF_YEAR_SCORE_GAUGES_DIVIDER_CLASS = "mt-3 grid w-full grid-cols-1 gap-4 border-t border-gray-100 pt-3 sm:grid-cols-2";

export type HalfYearReportViewModel = {
  halfLabel: string;
  scoreOverview: string;
  gaugeHighLabel: string;
  gaugeLowLabel: string;
  gaugeHighDesc: string;
  gaugeLowDesc: string;
  readingType: HalfYearReadingTypeDef | null;
  teacherComment: string;
  radarAverages: Record<PillarKey, number>;
};

type HalfYearReportSectionsProps = {
  model: HalfYearReportViewModel;
  editMode?: boolean;
  onScoreOverviewChange?: (v: string) => void;
  onTeacherCommentChange?: (v: string) => void;
  onGaugeHighDescChange?: (v: string) => void;
  onGaugeLowDescChange?: (v: string) => void;
  onReadingTypeDescriptionChange?: (v: string) => void;
};

export function HalfYearReportSections({
  model,
  editMode = false,
  onScoreOverviewChange,
  onTeacherCommentChange,
  onGaugeHighDescChange,
  onGaugeLowDescChange,
  onReadingTypeDescriptionChange,
}: HalfYearReportSectionsProps) {
  const radarData: RadarDatum[] = PILLAR_KEYS.map((k) => ({
    subject: pillarLabelsKo[k],
    score: Math.min(100, Math.max(0, (model.radarAverages[k] ?? 0) * 10)),
  }));

  return (
    <ReportShell headerTitle={REPORT_HEADER_TITLE_HALF}>
      <ReportSection title="최근 6개월간의 점수 평균">
        <div className={`${REPORT_SECTION_CONTENT_GRID_CLASS} lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]`}>
          <div className="flex flex-col items-center justify-center">
            <PolygonRadarChart data={radarData} />
          </div>
          <div>
            {editMode && onScoreOverviewChange ? (
              <textarea
                className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[200px]"}
                value={model.scoreOverview}
                onChange={(e) => onScoreOverviewChange(e.target.value)}
                aria-label="3-4회차·5-6회차 구간 성장 서술"
                placeholder={"3-4회차 구간에서는 …\n\n5-6회차 구간에서는 …"}
              />
            ) : (
              <ReportBodyParagraphs text={model.scoreOverview} />
            )}
          </div>
        </div>
        <div className={HALF_YEAR_SCORE_GAUGES_DIVIDER_CLASS}>
          <HalfYearGauge
            variant="high"
            label="집중 성취 포인트"
            description={
              editMode && onGaugeHighDescChange ? (
                <textarea
                  className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[72px] w-full text-sm"}
                  value={model.gaugeHighDesc}
                  maxLength={HALF_YEAR_GAUGE_DESC_MAX_CHARS}
                  onChange={(e) => onGaugeHighDescChange(e.target.value)}
                  aria-label="집중 성취 설명"
                />
              ) : (
                `${model.gaugeHighLabel} — ${model.gaugeHighDesc}`
              )
            }
          />
          <HalfYearGauge
            variant="low"
            label="향후 강화 포인트"
            description={
              editMode && onGaugeLowDescChange ? (
                <textarea
                  className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[72px] w-full text-sm"}
                  value={model.gaugeLowDesc}
                  maxLength={HALF_YEAR_GAUGE_DESC_MAX_CHARS}
                  onChange={(e) => onGaugeLowDescChange(e.target.value)}
                  aria-label="향후 강화 설명"
                />
              ) : (
                `${model.gaugeLowLabel} — ${model.gaugeLowDesc}`
              )
            }
          />
        </div>
      </ReportSection>

      <ReportSection title="우리 아이 독서 유형">
        <div className={`${REPORT_SECTION_CONTENT_GRID_CLASS} sm:grid-cols-[minmax(0,200px)_1fr] sm:items-center`}>
          <div className="flex justify-center">
            <div
              data-report-capture-box
              className="rounded-3xl border-2 border-solid border-[#bae6fd] bg-[#e0f2fe] px-6 py-8 text-center"
            >
              <p className="text-lg font-bold leading-snug text-[#1a3b6b]">
                {model.readingType?.typeName ?? "—"}
              </p>
            </div>
          </div>
          <div className="text-[15px] leading-relaxed text-gray-700">
            {model.readingType ? (
              editMode && onReadingTypeDescriptionChange ? (
                <textarea
                  className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[100px] w-full"}
                  value={model.readingType.description}
                  maxLength={HALF_YEAR_READING_TYPE_DESC_MAX_CHARS}
                  onChange={(e) => onReadingTypeDescriptionChange(e.target.value)}
                  aria-label="독서 유형 설명"
                />
              ) : (
                <p className="leading-relaxed">{model.readingType.description.trim() || "—"}</p>
              )
            ) : null}
          </div>
        </div>
      </ReportSection>

      <ReportSection title="선생님의 따뜻한 한마디">
        {editMode && onTeacherCommentChange ? (
          <textarea
            className={REPORT_EDIT_TEXTAREA_CLASS}
            value={model.teacherComment}
            onChange={(e) => onTeacherCommentChange(e.target.value)}
            aria-label="선생님 한마디"
          />
        ) : (
          <ReportBodyParagraphs text={model.teacherComment} />
        )}
      </ReportSection>
    </ReportShell>
  );
}
