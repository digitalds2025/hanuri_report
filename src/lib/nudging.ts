import type { MonthlyReport } from "./types/database";

export type NudgeResult = {
  showQuarterlyPrompt: boolean;
  message: string;
  variant: "info" | "success" | "warning";
};

/**
 * 월간 리포트 개수·최근 3개월 여부로 분기 리포트 유도.
 * 고도화: 회차 건너뛰기(session_number 로그) 반영 시 이 함수 입력 모델을 확장.
 */
export function computeNudging(input: {
  monthlyReports: Pick<MonthlyReport, "year_month" | "created_at">[];
  now?: Date;
}): NudgeResult {
  const now = input.now ?? new Date();
  const count = input.monthlyReports.length;

  if (count >= 3) {
    const lastThree = input.monthlyReports
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 3);
    const oldest = lastThree.at(-1);
    if (oldest) {
      const days = Math.floor(
        (now.getTime() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (days <= 120) {
        return {
          showQuarterlyPrompt: true,
          message: "이번 달은 분기(3개월) 리포트 발행 시기입니다. 성장 모멘트를 묶어 학부모에게 전달해 보세요.",
          variant: "warning",
        };
      }
    }
  }

  if (count === 0) {
    return {
      showQuarterlyPrompt: false,
      message: "아직 월간 리포트가 없습니다. 첫 월간 리포트를 작성해 보세요.",
      variant: "info",
    };
  }

  return {
    showQuarterlyPrompt: count >= 2,
    message:
      count >= 2
        ? "월간 리포트가 쌓이고 있습니다. 3개월 단위 통합 리포트 작성을 권장합니다."
        : "한 달 성장 기록을 남겨 두면 이후 분기·연간 리포트에 자동으로 반영됩니다.",
    variant: "success",
  };
}
