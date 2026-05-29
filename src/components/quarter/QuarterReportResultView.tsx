import type { ReactNode } from "react";
import { GROWTH_INSIGHT_COMMENT_TARGET_CHARS } from "../../lib/geminiQuarterGrowthInsight";
import { QUARTER_BEST_WRITING_COMMENT_TARGET_CHARS } from "../../lib/geminiQuarterReportFinalize";
import { ReportSection } from "../reports/ReportSection";
import { ReportShell } from "../reports/ReportShell";
import { QuarterReportPairedPanels } from "./QuarterReportPairedPanels";
import {
  REPORT_EDIT_TEXTAREA_CLASS,
  REPORT_QUARTER_DESC_TEXTAREA_CLASS,
  ReportBodyParagraphs,
} from "../../lib/reportText";

export type QuarterReportResultViewProps = {
  headerTitle: string;
  editMode?: boolean;
  bestWritingUrl: string;
  bestWritingComment: string;
  onBestWritingCommentChange: (v: string) => void;
  mindmapPreview: ReactNode;
  knowledgeComment: string;
  onKnowledgeCommentChange: (v: string) => void;
  insightTags: string[];
  roadmapText: string;
  onRoadmapTextChange: (v: string) => void;
  teacherComment: string;
  onTeacherCommentChange: (v: string) => void;
};

export function QuarterReportResultView({
  headerTitle,
  editMode = false,
  bestWritingUrl,
  bestWritingComment,
  onBestWritingCommentChange,
  mindmapPreview,
  knowledgeComment,
  onKnowledgeCommentChange,
  insightTags,
  roadmapText,
  onRoadmapTextChange,
  teacherComment,
  onTeacherCommentChange,
}: QuarterReportResultViewProps) {
  const pairedMeasureKey = [
    editMode ? "1" : "0",
    bestWritingUrl,
    bestWritingComment,
    knowledgeComment,
  ].join("\0");

  return (
    <ReportShell headerTitle={headerTitle}>
      <QuarterReportPairedPanels
        leftTitle="3개월 Best 글쓰기"
        rightTitle="지식 마인드맵"
        measureKey={pairedMeasureKey}
        left={
          <div className="space-y-3 text-gray-700">
            {bestWritingUrl.trim() ? (
              <div className="flex w-full justify-center">
                <div className="flex w-full min-h-[22rem] items-center justify-center overflow-hidden border border-gray-100 bg-gray-50 p-1 shadow-sm sm:min-h-[26rem]">
                  <img
                    src={bestWritingUrl.trim()}
                    alt="분기 대표 글쓰기"
                    className="max-h-[24rem] w-full object-contain sm:max-h-[28rem]"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            ) : null}
            {editMode ? (
              <textarea
                className={REPORT_QUARTER_DESC_TEXTAREA_CLASS}
                rows={2}
                maxLength={QUARTER_BEST_WRITING_COMMENT_TARGET_CHARS}
                value={bestWritingComment}
                onChange={(e) => onBestWritingCommentChange(e.target.value)}
                aria-label="Best 글 소개"
                spellCheck
              />
            ) : (
              <ReportBodyParagraphs text={bestWritingComment} compact />
            )}
          </div>
        }
        right={
          <div className="flex h-full min-h-0 flex-col gap-3 text-gray-700">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
              {mindmapPreview}
            </div>
            <div className="shrink-0">
              {editMode ? (
                <textarea
                  className={REPORT_QUARTER_DESC_TEXTAREA_CLASS}
                  rows={3}
                  value={knowledgeComment}
                  onChange={(e) => onKnowledgeCommentChange(e.target.value)}
                  aria-label="지식·수업 타당성 코멘트"
                  spellCheck
                />
              ) : (
                <ReportBodyParagraphs text={knowledgeComment} compact />
              )}
            </div>
          </div>
        }
      />

      <ReportSection title="성장 인사이트">
        <div className="space-y-4 text-gray-700">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => {
              const label = (insightTags[i] ?? "").trim();
              return (
                <div
                  key={i}
                  data-report-capture-box
                  className="flex min-h-[4.25rem] items-center justify-center rounded-lg border border-solid border-[#1e4d7b] bg-[#1e4d7b] px-3 py-3 text-center text-[15px] font-semibold text-white shadow-sm sm:text-base"
                  title={label || undefined}
                >
                  <span className="break-words leading-none">{label || "—"}</span>
                </div>
              );
            })}
          </div>
          {editMode ? (
            <textarea
              className={REPORT_QUARTER_DESC_TEXTAREA_CLASS}
              rows={4}
              maxLength={GROWTH_INSIGHT_COMMENT_TARGET_CHARS}
              value={roadmapText}
              onChange={(e) => onRoadmapTextChange(e.target.value)}
              aria-label="성장 인사이트 코멘트"
              spellCheck
            />
          ) : (
            <ReportBodyParagraphs text={roadmapText} />
          )}
        </div>
      </ReportSection>

      <ReportSection title="선생님의 따뜻한 한마디">
        {editMode ? (
          <textarea
            className={REPORT_EDIT_TEXTAREA_CLASS}
            value={teacherComment}
            onChange={(e) => onTeacherCommentChange(e.target.value)}
            aria-label="선생님 한마디"
            spellCheck
          />
        ) : (
          <ReportBodyParagraphs text={teacherComment} />
        )}
      </ReportSection>
    </ReportShell>
  );
}
