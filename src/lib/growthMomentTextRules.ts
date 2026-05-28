/** 성장 모멘트 — 문단당 최대 글자 수(공백 포함, 한글 기준) */
export const GROWTH_MOMENT_MAX_CHARS_PER_PARAGRAPH = 120;

export const GROWTH_MOMENT_PARAGRAPH_ROLES = [
  "1문단: 핵심 활동(1단 키워드·도서·글쓰기). 한 섹션의 도입—활동·책·수업 내용으로 바로 들어가도 됨.",
  "2문단: 태도·행동(2단 키워드·역량 관찰). 1문단 활동에 **이어지는** 관찰(「특히」「수업에서는」「토론·글쓰기에서는」 등).",
  "3문단: 성장 종합·격려('~해요'체). 앞 두 문단을 받아 **한 번만** 따뜻하게 마무리.",
] as const;

/** 문단 첫머리 반복 방지 — 프롬프트용 */
export const GROWTH_MOMENT_COHESION_RULES = `# [한 섹션·흐름 — 필수]
- 출력 전체는 **「이달의 성장 모멘트」 한 블록**입니다. 3문단은 화면용 나눔일 뿐, **서로 다른 소개글 3개**가 아닙니다.
- **문단마다** 「이번 달」「이번 달 아이는」「우리 아이는」「아이는」으로 **새로 시작하지 마세요.** (2·3문단은 특히 금지)
- 「이번 달」은 **전체 본문에서 최대 1회**(0회도 좋음). 1문단 첫머리에만 쓸 수 있고, 2·3문단에는 쓰지 마세요.
- 2문단: 활동·책·수업 맥락에 **연결**해 태도·행동을 씁니다(예: 「발표에서는 …」「독후 활동에서는 …」).
- 3문단: 앞 내용을 **받아** 격려·기대로 마무리합니다. 또 「이번 달~」로 리셋하지 마세요.
- 같은 호칭·시제·「~했어요」 패턴을 문단 첫 문장에 **연속 반복**하지 마세요.`;

/** 3문단 성장 모멘트 — 수석 편집자식 분량·압축 규칙(프롬프트 본문) */
export function growthMomentEditorRulesBlock(
  maxChars = GROWTH_MOMENT_MAX_CHARS_PER_PARAGRAPH,
): string {
  return `# [역할]
당신은 방대한 관찰 기록을 핵심만 추출해 극도로 정제된 언어로 쓰는 '수석 편집자'이면서, 학부모에게 보내는 월간 성장 리포트를 대신 쓰는 교사입니다.

# [문단별 분량 — 필수 준수]
- 반드시 **정확히 3문단**만 출력합니다. 문단 사이는 빈 줄 한 줄(실제 줄바꿈)만 넣습니다.
- **각 문단은 공백을 포함한 한글 기준 ${maxChars}자 이하**입니다. ${maxChars}자를 **절대** 넘기지 마세요.
- 「${maxChars}자 내외」「짧게」처럼 느슨한 표현으로 무시하지 말고, **숫자 상한**으로 지키세요.
- 답변 출력 전, **문단마다** 글자 수를 스스로 세고 초과 시 문장을 더 밀도 있게 재구성(Rewording)한 뒤 **최종 3문단만** 보여 주세요.

# [정보 보존]
- 입력된 키워드·메모의 **핵심 사실**은 빠뜨리지 말고 모두 반영하세요.
- 키워드에 없는 사실은 지어내지 마세요. 3단 교사 메모가 비어 있으면 3단 언급은 최소화하세요.

# [작성 방식]
- 미사여구, 중복 표현, 형식적 인사말을 제거하고 압축적 언어로 밀도를 높이세요.
- 문장을 **중간에서 강제로 자르지 말고**, 완결된 문장으로 마무리하세요.
- 마크다운(#, **, 불릿), 백슬래시, '\\n' 이스케이프, 제목·번호·불릿 금지. 본문만 출력합니다.

${GROWTH_MOMENT_COHESION_RULES}

# [문단 역할]
- ${GROWTH_MOMENT_PARAGRAPH_ROLES[0]}
- ${GROWTH_MOMENT_PARAGRAPH_ROLES[1]}
- ${GROWTH_MOMENT_PARAGRAPH_ROLES[2]}`;
}

export function splitGrowthMomentParagraphs(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const byBlank = t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlank.length >= 3) return byBlank.slice(0, 3);
  return byBlank;
}

/** 공백 포함 글자 수(유니코드 코드 포인트) */
export function countGrowthMomentChars(s: string): number {
  return [...s].length;
}

export function joinGrowthMomentParagraphs(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

export function buildCompressParagraphPrompt(
  paragraph: string,
  role: string,
  maxChars = GROWTH_MOMENT_MAX_CHARS_PER_PARAGRAPH,
  context?: { paragraphIndex: number; previousParagraph?: string; nextParagraph?: string },
): string {
  const current = countGrowthMomentChars(paragraph);
  const prev = context?.previousParagraph?.trim();
  const next = context?.nextParagraph?.trim();
  const flowHint =
    context?.paragraphIndex === 0
      ? "이 문단은 **한 섹션의 첫 문단**입니다. '이번 달 아이는' 같은 뻔한 도입은 피하고, 활동·책·수업으로 바로 들어가도 됩니다."
      : context?.paragraphIndex === 1
        ? "이 문단은 **중간 문단**입니다. 앞 문단에 이어지게 쓰고, 「이번 달」「아이는」으로 시작하지 마세요."
        : context?.paragraphIndex === 2
          ? "이 문단은 **마지막 문단**입니다. 앞 흐름을 받아 격려로 마무리하고, 「이번 달」로 다시 시작하지 마세요."
          : "";

  return `당신은 방대한 정보를 핵심만 추출해 극도로 정제된 언어로 요약하는 '수석 편집자'입니다.

[제공 문단] (현재 ${current}자 — 상한 ${maxChars}자 초과)
${paragraph}
${prev ? `\n[바로 앞 문단 — 흐름 참고, 반복 표현은 피할 것]\n${prev}` : ""}
${next ? `\n[바로 뒤 문단 — 흐름 참고]\n${next}` : ""}

[문단 역할]
${role}
${flowHint ? `\n${flowHint}` : ""}

${GROWTH_MOMENT_COHESION_RULES}

[출력 규칙 — 필수 준수]
1. 분량: 공백 포함 한글 기준 **최대 ${maxChars}자**. ${maxChars}자를 **절대** 넘기지 마세요.
2. 정보 보존: 원문의 핵심 관찰·키워드 의미를 생략하지 마세요.
3. 작성: 미사여구·중복 제거, 압축적 표현. 문장 중간 절단 금지, 완결된 문장으로 마무리.
4. 검토: 출력 전 글자 수를 세고 초과 시 재구성 후 **재작성한 문단 한 덩어리만** 출력하세요.

제목·설명·따옴표 장식 없이 문단 본문만.`;
}

function indicesOverCharLimit(paragraphs: string[], maxChars: number): number[] {
  return paragraphs
    .map((p, i) => (countGrowthMomentChars(p) > maxChars ? i : -1))
    .filter((i) => i >= 0);
}

/**
 * 초과 문단만 압축 재생성(최대 2라운드).
 * 3문단 구조가 아니면 원문 그대로 반환.
 */
export async function enforceGrowthMomentParagraphLimits(
  text: string,
  generateText: (prompt: string) => Promise<string>,
  maxChars = GROWTH_MOMENT_MAX_CHARS_PER_PARAGRAPH,
): Promise<string> {
  let paragraphs = splitGrowthMomentParagraphs(text);
  if (paragraphs.length !== 3) return text.trim();

  for (let round = 0; round < 2; round++) {
    const over = indicesOverCharLimit(paragraphs, maxChars);
    if (over.length === 0) break;

    paragraphs = await Promise.all(
      paragraphs.map(async (p, i) => {
        if (!over.includes(i)) return p;
        const role = GROWTH_MOMENT_PARAGRAPH_ROLES[i] ?? GROWTH_MOMENT_PARAGRAPH_ROLES[0];
        const raw = (
          await generateText(
            buildCompressParagraphPrompt(p, role, maxChars, {
              paragraphIndex: i,
              previousParagraph: i > 0 ? paragraphs[i - 1] : undefined,
              nextParagraph: i < paragraphs.length - 1 ? paragraphs[i + 1] : undefined,
            }),
          )
        ).trim();
        const one = splitGrowthMomentParagraphs(raw)[0] ?? raw;
        return one.trim();
      }),
    );
  }

  return joinGrowthMomentParagraphs(paragraphs);
}
