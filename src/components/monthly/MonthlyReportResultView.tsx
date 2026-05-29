import { useMemo } from "react";
import { parseCompetencySections } from "../../lib/parseCompetencySections";
import {
  competencyAnalysisToMReportComments,
  joinCompetencyMReportComments,
} from "../../lib/competencyAnalysisSplit";
import {
  REPORT_BOOK_COVER_IMG_CLASS,
  REPORT_TWO_COLUMN_GRID_CLASS,
  reportSectionPaddingStyle,
} from "../../lib/reportLayout";
import { REPORT_EDIT_TEXTAREA_CLASS, ReportBodyParagraphs, splitReportParagraphs } from "../../lib/reportText";
import { PolygonRadarChart, type RadarDatum } from "../reports/PolygonRadarChart";
import { ReportSection } from "../reports/ReportSection";
import { ReportShell } from "../reports/ReportShell";

export { ReportSection } from "../reports/ReportSection";
export { PolygonRadarChart, type RadarDatum } from "../reports/PolygonRadarChart";

export type MonthlyReportResultViewProps = {
  headerTitle: string;
  growthTitle?: string;
  growthText: string;
  onGrowthChange: (v: string) => void;
  writingTitle?: string;
  writingImageUrls: string[];
  booksTitle?: string;
  bookItems: { image: string; keywords: string[] }[];
  analysisTitle?: string;
  radarData: RadarDatum[];
  competencyAnalysis: string;
  onCompetencyChange: (v: string) => void;
  teacherTitle?: string;
  teacherNote: string;
  onTeacherChange: (v: string) => void;
  editMode?: boolean;
};

export function MonthlyReportResultView({
  headerTitle,
  growthTitle = "이달의 '성장 모멘트'",
  growthText,
  onGrowthChange,
  writingTitle = "이달의 글쓰기",
  writingImageUrls,
  booksTitle = "이달의 도서 키워드",
  bookItems,
  analysisTitle = "관찰 기반 역량 종합 분석",
  radarData,
  competencyAnalysis,
  onCompetencyChange,
  teacherTitle = "선생님의 따뜻한 한마디",
  teacherNote,
  onTeacherChange,
  editMode = false,
}: MonthlyReportResultViewProps) {
  const { strength, weakness } = useMemo(
    () => parseCompetencySections(competencyAnalysis),
    [competencyAnalysis],
  );

  const competencyComments = useMemo(
    () => competencyAnalysisToMReportComments(competencyAnalysis),
    [competencyAnalysis],
  );

  const strengthEditText = competencyComments.strength_cmt ?? strength.text;
  const weaknessEditText = competencyComments.weakness_cmt ?? weakness.text;

  const writingUrls =
    writingImageUrls.length > 0
      ? writingImageUrls
      : ["https://placehold.co/400x500/fdfbf2/333333?text=Writing"];

  const displayBooks =
    bookItems.length > 0
      ? bookItems
      : [
          {
            image: "https://placehold.co/300x400/e6f2ff/1a3b6b?text=Book",
            keywords: ["#도서", "#키워드"],
          },
        ];

  return (
    <ReportShell headerTitle={headerTitle}>
      <ReportSection title={growthTitle}>
        {editMode ? (
          <textarea
            className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[200px]"}
            value={growthText}
            onChange={(e) => onGrowthChange(e.target.value)}
            aria-label="성장 모멘트 편집"
          />
        ) : splitReportParagraphs(growthText).length > 0 ? (
          <ReportBodyParagraphs text={growthText} />
        ) : null}
      </ReportSection>

      <div className={REPORT_TWO_COLUMN_GRID_CLASS}>
        <ReportSection
          title={writingTitle}
          className="mb-0 flex h-full flex-col"
          contentClassName="flex flex-1 flex-col justify-center"
        >
          <div
            className={`flex justify-center gap-4 ${writingUrls.length === 1 ? "flex-row items-center" : "flex-wrap"}`}
          >
            {writingUrls.map((imgUrl, index) => (
              <div
                key={index}
                className={`bg-gray-50 shadow-sm ${writingUrls.length === 1 ? "w-full max-w-sm border border-gray-100" : "w-1/2 min-w-[140px] flex-1 border border-gray-100"}`}
                style={reportSectionPaddingStyle()}
              >
                <img
                  src={imgUrl}
                  alt={`글쓰기 ${index + 1}`}
                  className="h-auto w-full object-cover"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                />
              </div>
            ))}
          </div>
        </ReportSection>

        <ReportSection
          title={booksTitle}
          className="mb-0 flex h-full flex-col"
          contentClassName="flex flex-1 flex-col justify-center"
        >
          <div
            className={`flex justify-center gap-4 ${
              displayBooks.length === 1 ? "flex-col items-center" : "flex-row flex-wrap"
            }`}
          >
            {displayBooks.map((item, index) => (
              <div
                key={index}
                className={`flex flex-col items-center ${
                  displayBooks.length === 1
                    ? "w-full max-w-sm"
                    : "w-1/2 min-w-[7.5rem] max-w-[50%] flex-1"
                }`}
              >
                <div
                  className="inline-block border border-gray-100 bg-gray-50 shadow-sm"
                  style={reportSectionPaddingStyle()}
                >
                  <img
                    src={item.image}
                    alt={`도서 ${index + 1}`}
                    className={REPORT_BOOK_COVER_IMG_CLASS}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                  {item.keywords.map((kw, i) => (
                    <span key={i} className="text-sm font-bold text-gray-700">
                      {kw.startsWith("#") ? kw : `#${kw}`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ReportSection>
      </div>

      <ReportSection title={analysisTitle}>
        {editMode ? (
          <div className="space-y-6">
            <div className="flex justify-start">
              <PolygonRadarChart data={radarData} />
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">[강점]</label>
              <textarea
                className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[140px] text-sm"}
                value={strengthEditText}
                onChange={(e) =>
                  onCompetencyChange(joinCompetencyMReportComments(e.target.value, weaknessEditText))
                }
                aria-label="역량 분석 강점 편집"
              />
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">[보완점]</label>
              <textarea
                className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[140px] text-sm"}
                value={weaknessEditText}
                onChange={(e) =>
                  onCompetencyChange(joinCompetencyMReportComments(strengthEditText, e.target.value))
                }
                aria-label="역량 분석 보완점 편집"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-row items-start gap-12">
            <div className="relative w-1/3 shrink-0">
              <PolygonRadarChart data={radarData} />
            </div>
            <div className="w-2/3 space-y-6">
              <div>
                <h3 className="mb-2 font-bold text-[#1a3b6b]">{strength.label}</h3>
                <p className="whitespace-pre-wrap text-base leading-relaxed text-gray-700">
                  {strength.text}
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-bold text-[#1a3b6b]">{weakness.label}</h3>
                <p className="whitespace-pre-wrap text-base leading-relaxed text-gray-700">
                  {weakness.text}
                </p>
              </div>
            </div>
          </div>
        )}
      </ReportSection>

      <ReportSection title={teacherTitle}>
        {editMode ? (
          <textarea
            className={REPORT_EDIT_TEXTAREA_CLASS + " min-h-[140px]"}
            value={teacherNote}
            onChange={(e) => onTeacherChange(e.target.value)}
            aria-label="선생님 한마디 편집"
          />
        ) : (
          <ReportBodyParagraphs text={teacherNote} />
        )}
      </ReportSection>
    </ReportShell>
  );
}
