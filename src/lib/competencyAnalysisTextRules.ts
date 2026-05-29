import { joinCompetencyMReportComments, splitCompetencyAnalysis } from "./competencyAnalysisSplit";

/** [강점] 본문 — 공백 포함 한글 기준 최대 글자 수 */
export const COMPETENCY_STRENGTH_MAX_CHARS = 90;

/** [보완점] 본문 — 공백 포함 한글 기준 최대 글자 수 */
export const COMPETENCY_WEAKNESS_MAX_CHARS = 90;

const STRENGTH_ROLE =
  "[강점] 블록: 가장 두드러진 역량 하나에 대한 칭찬·기대만. 보완·집에서 할 일·아쉬운 점은 쓰지 마세요.";

const WEAKNESS_ROLE =
  "[보완점] 블록: 보완이 필요한 역량 하나와 집에서 도울 수 있는 짧은 실천. 강점 내용 반복·과장·낙인 금지.";

/** 관찰 기반 역량 종합 분석 — 수석 편집자식 분량 규칙 */
export function competencyAnalysisEditorRulesBlock(
  strengthMax = COMPETENCY_STRENGTH_MAX_CHARS,
  weaknessMax = COMPETENCY_WEAKNESS_MAX_CHARS,
): string {
  return `# [역할]
당신은 방대한 관찰·역량 기록을 핵심만 추출해 극도로 정제된 언어로 쓰는 '수석 편집자'이면서, 학부모용 월간 레포트의 **관찰 기반 역량 종합 분석**을 작성하는 교육 전문가입니다.

# [블록별 분량 — 필수 준수]
- 출력은 **[강점]** 과 **[보완점]** 두 블록만. 라벨은 반드시 \`[강점]\`, \`[보완점]\` 그대로.
- **[강점] 본문**(라벨 제외): 공백 포함 한글 기준 **${strengthMax}자 이하**. ${strengthMax}자를 **절대** 넘기지 마세요.
- **[보완점] 본문**(라벨 제외): 공백 포함 한글 기준 **${weaknessMax}자 이하**. ${weaknessMax}자를 **절대** 넘기지 마세요.
- 「${strengthMax}자 내외」「짧게」처럼 느슨히 쓰지 말고 **숫자 상한**으로 지키세요.
- 출력 전 각 블록 본문 글자 수를 세고, 초과 시 더 밀도 있게 재구성(Rewording)한 뒤 **최종본만** 출력하세요.

# [정보 보존]
- 입력(역량 점수·코멘트·활동 맥락)의 **핵심 관찰**을 빠뜨리지 마세요. 없는 사실은 지어내지 마세요.

# [작성 방식]
- **강점과 보완을 한 덩어리에 섞지 마세요.** 「한편,」「반면,」으로 이어 붙이지 말고 블록을 나눕니다.
- 미사여구·중복·형식적 인사 제거, 압축적 언어. 문장 **중간 절단 금지**, 완결된 문장으로 마무리.
- 마크다운(#, **, 불릿) 금지. **[강점]** / **[보완점]** 라벨만 예외.
- 백슬래시, '\\n' 이스케이프 문자열을 본문에 넣지 마세요. 블록 사이 빈 줄 한 줄 허용.
- 레이더·차트·점수 숫자 언급 금지.

# [블록 역할]
- ${STRENGTH_ROLE}
- ${WEAKNESS_ROLE}`;
}

export function countCompetencyBlockChars(s: string): number {
  return [...s].length;
}

export function formatCompetencyAnalysis(strength: string, weakness: string): string {
  const s = strength.trim();
  const w = weakness.trim();
  if (!s && !w) return "";
  if (!w) return `[강점]\n${s}`;
  if (!s) return `[보완점]\n${w}`;
  return `[강점]\n${s}\n\n[보완점]\n${w}`;
}

export function buildCompressCompetencyBlockPrompt(
  blockBody: string,
  role: string,
  maxChars: number,
  context?: { otherBlock?: string },
): string {
  const current = countCompetencyBlockChars(blockBody);
  const other = context?.otherBlock?.trim();
  return `당신은 방대한 정보를 핵심만 추출해 극도로 정제된 언어로 요약하는 '수석 편집자'입니다.

[제공 블록 본문] (현재 ${current}자 — 상한 ${maxChars}자 초과)
${blockBody}
${other ? `\n[다른 블록 — 참고만, 내용 반복·혼합 금지]\n${other}` : ""}

[블록 역할]
${role}

[출력 규칙 — 필수 준수]
1. 분량: 공백 포함 한글 기준 **최대 ${maxChars}자**. ${maxChars}자를 **절대** 넘기지 마세요.
2. 정보 보존: 원문의 핵심 관찰·역량 포인트를 생략하지 마세요.
3. 작성: 미사여구·중복 제거, 압축적 표현. 문장 중간 절단 금지, 완결된 문장으로 마무리.
4. 검토: 출력 전 글자 수를 세고 초과 시 재구성 후 **블록 본문만** 출력하세요. [강점]·[보완점] 라벨은 출력하지 마세요.

제목·설명·따옴표 장식 없이 본문 한 덩어리만.`;
}

/**
 * 강점·보완 본문 각각 상한 적용(최대 2라운드 압축 재생성).
 */
export async function enforceCompetencyAnalysisLimits(
  analysis: string,
  generateText: (prompt: string) => Promise<string>,
  strengthMax = COMPETENCY_STRENGTH_MAX_CHARS,
  weaknessMax = COMPETENCY_WEAKNESS_MAX_CHARS,
): Promise<string> {
  const { strength, weakness } = splitCompetencyAnalysis(analysis);
  if (!strength.trim() && !weakness?.trim()) return analysis.trim();

  let strengthBody = strength.trim();
  let weaknessBody = (weakness ?? "").trim();

  for (let round = 0; round < 2; round++) {
    const tasks: Promise<void>[] = [];

    if (strengthBody && countCompetencyBlockChars(strengthBody) > strengthMax) {
      tasks.push(
        (async () => {
          const raw = (
            await generateText(
              buildCompressCompetencyBlockPrompt(strengthBody, STRENGTH_ROLE, strengthMax, {
                otherBlock: weaknessBody,
              }),
            )
          ).trim();
          strengthBody = raw.replace(/^\[강점\]\s*/i, "").trim();
        })(),
      );
    }

    if (weaknessBody && countCompetencyBlockChars(weaknessBody) > weaknessMax) {
      tasks.push(
        (async () => {
          const raw = (
            await generateText(
              buildCompressCompetencyBlockPrompt(weaknessBody, WEAKNESS_ROLE, weaknessMax, {
                otherBlock: strengthBody,
              }),
            )
          ).trim();
          weaknessBody = raw.replace(/^\[보완점\]\s*/i, "").trim();
        })(),
      );
    }

    if (tasks.length === 0) break;
    await Promise.all(tasks);
  }

  return joinCompetencyMReportComments(strengthBody, weaknessBody) || formatCompetencyAnalysis(strengthBody, weaknessBody);
}
