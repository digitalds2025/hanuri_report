/**
 * 자료집 워크플로 — 사용자가 기대하는 순서:
 * 1) 수집 데이터 + 목적·핵심주제·필수조건 → 자료집 주제 후보
 * 2) 사용자가 주제 1개 선택
 * 3) 선택 주제로 수집 fact 기반 줄글(종합 레포트) 작성
 * 4) 줄글을 슬라이드 장수(pageCount)에 맞게 분할 → 슬라이드·자료집 제작 입력
 */
import type { GeminiTokenUsage } from "./geminiClient";
import type {
  BriefingMaterialFormInput,
  BriefingPlanningArtifact,
  BriefingStorylineBrief,
  BriefingTopicCandidate,
} from "./briefingMaterialTypes";
import {
  expandReportToSlideDrafts,
  writeFoundationReport,
} from "./briefingReportPlanning";

export type BookletWorkflowProgress = {
  step: "topics" | "prose" | "split";
  message: string;
};

export { buildOutlineFromReport } from "./briefingOutlineFromReport";

/** 선택 주제 → 줄글 레포트 → 슬라이드 장수 분할 */
export async function runBookletContentPipeline(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  corpusMarkdown: string,
  attachmentText: string,
  storyline?: BriefingStorylineBrief | null,
  onProgress?: (p: BookletWorkflowProgress) => void,
): Promise<{ artifact: BriefingPlanningArtifact; usage: GeminiTokenUsage }> {
  let total: GeminiTokenUsage = { inputTokens: 0, outputTokens: 0 };

  onProgress?.({ step: "prose", message: "선택 주제로 종합 레포트(줄글) 작성 중…" });
  const { report, usage: u1 } = await writeFoundationReport(
    input,
    topic,
    corpusMarkdown,
    attachmentText,
  );
  total = {
    inputTokens: total.inputTokens + u1.inputTokens,
    outputTokens: total.outputTokens + u1.outputTokens,
  };

  onProgress?.({
    step: "split",
    message: `레포트를 슬라이드 ${input.pageCount}장 분량으로 나누는 중…`,
  });
  const { drafts, usage: u2 } = await expandReportToSlideDrafts(
    input,
    topic,
    report,
    storyline,
  );
  total = {
    inputTokens: total.inputTokens + u2.inputTokens,
    outputTokens: total.outputTokens + u2.outputTokens,
  };

  return {
    artifact: {
      foundationReport: report,
      slideDrafts: drafts,
    },
    usage: total,
  };
}
