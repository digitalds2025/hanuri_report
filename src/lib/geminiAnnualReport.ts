import type { GradeTransitionInfo } from "./gradeCurriculum";
import { pillarLabelsKo, PILLAR_KEYS, type PillarKey } from "./reportAggregates";
import {
  applyReportPrivacy,
  REPORT_NO_PII_PROMPT_RULES,
  type ReportPrivacyContext,
} from "./reportStudentPrivacy";
import type { GrowthMomentMonthInput } from "./annualReportCompute";
import type { AnnualTimelineData } from "./annualReportTypes";
import {
  ANNUAL_OUTLOOK_MAX_CHARS,
  ANNUAL_WARM_SECTION_MAX_CHARS,
  clampAnnualOutlook,
  finalizeAnnualWarmSectionAiText,
  sanitizeAnnualTimelineMonthSummary,
} from "./annualReportCopy";

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.0-flash";
}

async function geminiJson<T>(prompt: string, temperature: number, maxOutputTokens: number): Promise<T> {
  const key = getApiKey();
  if (!key) throw new Error("VITE_GEMINI_API_KEY 가 .env 에 설정되어 있지 않습니다.");
  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw;
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } };
      if (j.error?.message) detail = j.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Gemini HTTP ${res.status}`);
  }

  const envelope = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = envelope.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
  return JSON.parse(text) as T;
}

function growthMonthsBlock(rows: GrowthMomentMonthInput[]): string {
  return rows
    .map((r) => {
      const body = r.sourceText.length > 0 ? r.sourceText : "(월간 리포트 없음 — growth_moment 없음)";
      return `[${r.slotIndex}회차] ${r.ym}:\n${body}`;
    })
    .join("\n\n");
}

export type AnnualTimelineAiResult = {
  months: Record<string, string>;
  outlook: string;
};

/** 연간 타임라인: 월별 한 줄 요약 + 전망 코멘트 */
export async function generateAnnualTimelineCopy(input: {
  targetYear: number;
  windowLabel: string;
  /** end_ym 포함 12개월 슬롯 — m_reports.growth_moment 원문 */
  growthByMonth: GrowthMomentMonthInput[];
  privacy?: ReportPrivacyContext;
}): Promise<AnnualTimelineAiResult> {
  const filledCount = input.growthByMonth.filter((r) => r.sourceText.length > 0).length;

  const prompt = `당신은 독서·국어 교육 현장의 전문 교사입니다. 학부모용 **연간 성장 리포트**의 「연간 타임라인」을 작성합니다.

${REPORT_NO_PII_PROMPT_RULES}

연간 구간: ${input.windowLabel} (총 12개월, ${input.targetYear}년 연간 리포트)
데이터 출처: 월간 피드백 리포트(m_reports.growth_moment) — 성장 모멘트 있는 달: ${filledCount}/12

## 월별 원문 (표 1칸=가장 이른 달 → 12칸=가장 최근 달)
${growthMonthsBlock(input.growthByMonth)}

## 작업
6열×2행 표에 들어갈 **월별 한 줄 요약**과 표 아래 **전망 코멘트**를 작성합니다.
months 키 "1"~"12"는 달력 1월~12월이 아니라 **위 표 칸 번호**입니다.

JSON만 출력:

{
  "months": {
    "1": "1칸(가장 이른 달) 한 줄 요약",
    "2": "...",
    ...
    "12": "12칸(가장 최근 달) 한 줄 요약"
  },
  "outlook": "표 아래 전망. **공백 포함 ${ANNUAL_OUTLOOK_MAX_CHARS}자 이내** 한 덩어리(1~2문장). 12개월 흐름·강점·내년 기대를 압축"
}

규칙 (필수):
- months "1"~"12" 모두 포함.
- 원문 있는 칸: growth_moment를 20~45자 한 줄로 **그 달의 성장·변화만 직접** 서술(원문 복사·요약 접속어 금지).
- 월별 한 줄 금지 표현: 「~을/를 독서 후」「독서 후 ~」「~을 읽고」「~을 읽은 후」「이달」「○월에」로 시작.
- 좋은 예: 「토론에서 자신의 생각을 말로 표현하기 시작했습니다」「글쓰기에서 논리적으로 문장을 이어 가기를 시도했습니다」
- 나쁜 예: 「○○를 독서 후 토론에 참여했습니다」「독서 후 표현력이 좋아졌습니다」
- 원문 없는 칸: "".
- outlook: 있는 달만 근거, ${ANNUAL_OUTLOOK_MAX_CHARS}자 초과 금지, 빈 칸 지어내지 말 것.
- 숫자·점수·별점 금지. 「우리 아이」 호칭. 『』 사용.`;

  const j = await geminiJson<{ months?: Record<string, string>; outlook?: string }>(prompt, 0.45, 8192);
  const months: Record<string, string> = {};
  for (let m = 1; m <= 12; m++) {
    const k = String(m);
    const v = j.months?.[k];
    months[k] = sanitizeAnnualTimelineMonthSummary(typeof v === "string" ? v : "");
  }
  let outlook = clampAnnualOutlook(typeof j.outlook === "string" ? j.outlook : "");
  const privacy = input.privacy;
  if (privacy) {
    for (const k of Object.keys(months)) {
      months[k] = sanitizeAnnualTimelineMonthSummary(
        applyReportPrivacy(months[k] ?? "", privacy),
      );
    }
    outlook = clampAnnualOutlook(applyReportPrivacy(outlook, privacy));
  }
  return {
    months,
    outlook,
  };
}

export async function generateAnnualRoadmapCopy(input: {
  targetYear: number;
  studentGradeLabel: string;
  transition: GradeTransitionInfo | null;
  pillarAverages: Record<PillarKey, number>;
  privacy?: ReportPrivacyContext;
}): Promise<string> {
  const trans = input.transition;
  const transBlock = trans
    ? `현재 학년: ${trans.fromLabel} → 다음 학년: ${trans.toLabel}
교육과정 핵심: ${trans.curriculumHighlights.join(", ")}
한우리 수업 방향: ${trans.hanuriFocus}`
    : "학년 전환 정보 없음 — 일반적인 독서·논술·토론 성장 로드맵으로 작성.";

  const avgBlock = PILLAR_KEYS.map((k) => `${pillarLabelsKo[k]}: ${(input.pillarAverages[k] ?? 0).toFixed(1)}`).join(
    "\n",
  );

  const prompt = `당신은 한우리독서토론논술 교사입니다. 학부모용 **연간 리포트 「미래 로드맵」** 본문을 작성합니다.

${REPORT_NO_PII_PROMPT_RULES}

${input.targetYear}년 마무리 · 학년·급: ${input.studentGradeLabel}

## 학년 전환
${transBlock}

## 12개월 역량 평균 (내부 참고 — 본문에 숫자·"/10" 노출 금지)
${avgBlock}

## 작업
JSON만: { "roadmap": "본문 3~4문단, 문단 사이 \\n\\n. ① 다음 학년 교육과정 변화 ② 아이 강점·보완과 연결 ③ 한우리에서의 구체적 준비·내년 기대. 마지막은 내년 수업에 대한 따뜻한 기대로 마무리." }

규칙: 비난 금지, 「우리 아이」 호칭, 『』 사용.`;

  const j = await geminiJson<{ roadmap?: string }>(prompt, 0.5, 6144);
  const text = typeof j.roadmap === "string" ? j.roadmap.trim() : "";
  return input.privacy ? applyReportPrivacy(text, input.privacy) : text;
}

/** 미래 로드맵 + 선생님 한마디 — 학부모용 **한 섹션** 통합 본문 */
export async function generateAnnualWarmSectionCopy(input: {
  targetYear: number;
  studentGradeLabel: string;
  teacherSeed: string;
  transition: GradeTransitionInfo | null;
  pillarAverages: Record<PillarKey, number>;
  privacy?: ReportPrivacyContext;
}): Promise<string> {
  const trans = input.transition;
  const transBlock = trans
    ? `현재 학년: ${trans.fromLabel} → 다음 학년: ${trans.toLabel}
교육과정 핵심: ${trans.curriculumHighlights.join(", ")}
한우리 수업 방향: ${trans.hanuriFocus}`
    : "학년 전환 정보 없음 — 일반적인 독서·논술·토론 로드맵으로 작성.";

  const avgBlock = PILLAR_KEYS.map((k) => `${pillarLabelsKo[k]}: ${(input.pillarAverages[k] ?? 0).toFixed(1)}`).join(
    "\n",
  );

  const transitionExample = trans
    ? `예) ${trans.fromLabel} → ${trans.toLabel}: ${trans.curriculumHighlights.join(", ")}`
    : "학년 전환 정보가 없으면 일반적인 독서·논술·토론 성장 방향으로 작성.";

  const prompt = `당신은 한우리독서토론논술 교사입니다. 연간 리포트 **「선생님의 따뜻한 한마디」** 본문을 작성합니다.

${REPORT_NO_PII_PROMPT_RULES}

## 리포트에 반영된 정보 (아래를 근거로 맞춤형 로드맵을 구성)
- **현재 학년·급**(리포트 상단): ${input.studentGradeLabel}
- **12개월 역량 분석 평균**(내부 참고, 본문에 숫자·점수·"/10" 노출 금지):
${avgBlock}
- **현재 학년 → 다음 학년** 교육과정 핵심 역량(사전 DB 매핑):
${transBlock}
${transitionExample}

## 교사 초안 (1~2줄, 반드시 의미를 살려 반영)
${input.teacherSeed.trim()}

## 작성 컨셉 (필수)
1. 아이의 12개월 역량 경향(강점·보완)과 **다음 학년 교육과정에서 새로 강조되는 역량**을 비교해, 맞춤형 **내년 학습 로드맵**을 짧게 제시합니다.
2. 한우리 수업에서 어떻게 이어갈지(한우리 방향)를 자연스럽게 연결합니다.
3. 교사 초안을 풀어 **따뜻한 격려**로 이어지게 하고, **마지막은 다음 학년 수업에 대한 기대감**으로 마무리합니다.
4. 미래 로드맵과 한마디를 **한 덩어리**로 씁니다. 소제목·「미래 로드맵」·「한마디」 등 **섹션 라벨 금지**.

## 작업
JSON만 출력:
{ "warm_section": "통합 본문. **공백 포함 ${ANNUAL_WARM_SECTION_MAX_CHARS}자 이내** 한 덩어리(2~4문장 권장)." }

## 문체·금지 (필수)
- **「학부모님께,」「학부모님께」 등 편지식 서두로 시작하지 말 것** — 곧바로 우리 아이·올해 성장·내년 로드맵 서술로 시작.
- 비난 금지, 「우리 아이」 호칭, 『』 사용.
- ${ANNUAL_WARM_SECTION_MAX_CHARS}자 초과 금지.`;

  const j = await geminiJson<{ warm_section?: string }>(prompt, 0.45, 2048);
  let text = typeof j.warm_section === "string" ? finalizeAnnualWarmSectionAiText(j.warm_section) : "";
  if (input.privacy) text = finalizeAnnualWarmSectionAiText(applyReportPrivacy(text, input.privacy));
  return text;
}

export async function generateAnnualCertText(input: {
  targetYear: number;
  certGradeLabel: string;
  teacherHint: string;
  privacy?: ReportPrivacyContext;
}): Promise<string> {
  const prompt = `당신은 한우리독서토론논술 교사입니다. **수료 인증서** 축하 문구 1~2문장을 작성합니다.

${REPORT_NO_PII_PROMPT_RULES}

수료 연도: ${input.targetYear}
학년 표기: ${input.certGradeLabel}
참고(교사 메모, 이름은 직접 넣지 말 것): ${input.teacherHint.trim().slice(0, 300)}

JSON만: { "cert": "『1년의 긴 여정을 멋지게 완주한 ○○○의 성장을 축하하며』 형식. ○○○ 자리에는 반드시 【이름】 플레이스홀더만 사용(실명 금지). 학년·성장을 축하하는 톤." }`;

  const j = await geminiJson<{ cert?: string }>(prompt, 0.4, 2048);
  const text = typeof j.cert === "string" ? j.cert.trim() : "";
  return input.privacy ? applyReportPrivacy(text, input.privacy) : text;
}

export function mergeTimelineWithAi(
  existing: AnnualTimelineData,
  ai: AnnualTimelineAiResult,
): AnnualTimelineData {
  const months = { ...existing.months };
  for (let m = 1; m <= 12; m++) {
    const k = String(m);
    if (ai.months[k]) months[k] = ai.months[k]!;
  }
  return { months, outlook: ai.outlook || existing.outlook };
}
