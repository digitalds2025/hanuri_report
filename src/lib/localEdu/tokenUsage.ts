export type StageTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  apiCalls: number;
};

export type LocalEduTokenLedger = {
  /** Data Layer · 공식 데이터 스캔 */
  dataCollection: StageTokenUsage;
  /** Design Layer · 주제 선정 */
  topicSelection: StageTokenUsage;
  /** Design Layer · 설명자료 줄글(종합 레포트) */
  manuscript: StageTokenUsage;
  /** Design Layer · 슬라이드별 기획 */
  slidePlanning: StageTokenUsage;
  /** Generation Layer · 슬라이드 조립 + 상담키트 */
  slideProduction: StageTokenUsage;
};

export function emptyStageUsage(): StageTokenUsage {
  return { inputTokens: 0, outputTokens: 0, apiCalls: 0 };
}

export function emptyTokenLedger(): LocalEduTokenLedger {
  return {
    dataCollection: emptyStageUsage(),
    topicSelection: emptyStageUsage(),
    manuscript: emptyStageUsage(),
    slidePlanning: emptyStageUsage(),
    slideProduction: emptyStageUsage(),
  };
}

export function addTokenUsage(
  acc: StageTokenUsage,
  input: number,
  output: number,
  apiCalls = 1,
): StageTokenUsage {
  return {
    inputTokens: acc.inputTokens + input,
    outputTokens: acc.outputTokens + output,
    apiCalls: acc.apiCalls + apiCalls,
  };
}

export function formatStageTokens(u: StageTokenUsage): string {
  return `입력 ${u.inputTokens.toLocaleString("ko-KR")} · 출력 ${u.outputTokens.toLocaleString("ko-KR")}${u.apiCalls > 0 ? ` · API ${u.apiCalls}회` : ""}`;
}
