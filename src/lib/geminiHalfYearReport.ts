import {
  PILLAR_KEYS,
  pillarLabelsKo,
  type PillarKey,
} from "./reportAggregates";
import type { HalfYearMonthSlot } from "./halfYearReportCompute";
import type { HalfYearReadingTypeDef } from "./halfYearReadingTypes";
import {
  clampHalfYearGaugeDesc,
  clampHalfYearReadingTypeDesc,
  HALF_YEAR_GAUGE_DESC_MAX_CHARS,
  HALF_YEAR_READING_TYPE_DESC_MAX_CHARS,
} from "./halfYearReportCopy";
import {
  applyReportPrivacy,
  REPORT_NO_PII_PROMPT_RULES,
  type ReportPrivacyContext,
} from "./reportStudentPrivacy";

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.5-flash";
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
    throw new Error(`Gemini API 오류 (${res.status}): ${detail}`);
  }

  const data = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error(`프롬프트 차단: ${data.promptFeedback.blockReason}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  return JSON.parse(text.trim()) as T;
}

async function geminiPlain(prompt: string, temperature: number, maxOutputTokens: number): Promise<string> {
  const key = getApiKey();
  if (!key) throw new Error("VITE_GEMINI_API_KEY 가 .env 에 설정되어 있지 않습니다.");
  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens, responseMimeType: "text/plain" },
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Gemini API 오류 (${res.status}): ${raw.slice(0, 200)}`);

  const data = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error(`프롬프트 차단: ${data.promptFeedback.blockReason}`);
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  return text.trim();
}

function slotsSummary(slots: HalfYearMonthSlot[]): string {
  return slots
    .map((s) => {
      const rep = s.report;
      if (!rep) return `- ${s.ym} (제${s.round}회): (월간 레포트 없음)`;
      const scores = rep.competency_ratings;
      return `- ${s.ym} (제${s.round}회): competency_ratings=${JSON.stringify(scores)}`;
    })
    .join("\n");
}

function averagesBlock(avg: Record<PillarKey, number>): string {
  return PILLAR_KEYS.map((k) => `- ${pillarLabelsKo[k]}: 평균 ${(avg[k] ?? 0).toFixed(1)}/10`).join("\n");
}

const PILLAR_NAMES_FOR_PROMPT = PILLAR_KEYS.map((k) => pillarLabelsKo[k]).join(", ");

export type HalfYearAiCopy = {
  /** 3-4회차·5-6회차 구간 통합 서술 (2문단, \\n\\n 구분) */
  score_overview: string;
  gauge_high_desc: string;
  gauge_low_desc: string;
  /** 독서 유형 본문 (유형명·역량 조합 라벨 없이, 120자 이내) */
  reading_type_description: string;
};

export async function generateHalfYearCompetencyCopy(input: {
  studentGradeLabel: string;
  halfLabel: string;
  slots: HalfYearMonthSlot[];
  averages: Record<PillarKey, number>;
  gaugeHigh: PillarKey;
  gaugeLow: PillarKey;
  readingTypeName: string;
  privacy?: ReportPrivacyContext;
}): Promise<HalfYearAiCopy> {
  const prompt = `당신은 독서·국어 교육 현장의 전문 교사입니다. 학부모용 **반기(6개월) 성장 리포트** 문구를 작성합니다.

${REPORT_NO_PII_PROMPT_RULES}

학년·급: ${input.studentGradeLabel}
반기: ${input.halfLabel}

## 월간 역량 기록 (6회차)
${slotsSummary(input.slots)}

## 6개월 평균 (내부 참고 — 본문에 숫자·점수·"/10" 노출 금지)
${averagesBlock(input.averages)}

## 게이지
- 집중 성취(최고): ${pillarLabelsKo[input.gaugeHigh]}
- 향후 강화(최저): ${pillarLabelsKo[input.gaugeLow]}

## 독서 유형 (화면에는 유형명 「${input.readingTypeName}」만 별도 표시)
- 본문에는 유형명·「논리적 사고 + …」 같은 **역량 조합 문구를 넣지 말 것**

## 작업
JSON만 출력하세요. 키는 정확히 아래 4개뿐입니다.

{
  "score_overview": "정확히 2문단. 문단 사이는 \\\\n\\\\n. 첫 문단은 반드시 『3-4회차 구간에서는』로 시작하고, 둘째 문단은 반드시 『5-6회차 구간에서는』로 시작합니다. 각 문단 안에서 ${PILLAR_NAMES_FOR_PROMPT} 등 역량을 **한 덩어리의 흐름**으로 엮어 서술하세요. 역량별 소제목·목록·줄바꿈 나열 금지.",
  "gauge_high_desc": "집중 성취 포인트 게이지 설명. **공백 포함 ${HALF_YEAR_GAUGE_DESC_MAX_CHARS}자 이내** 한 문장(숫자 금지)",
  "gauge_low_desc": "향후 강화 포인트 게이지 설명. **공백 포함 ${HALF_YEAR_GAUGE_DESC_MAX_CHARS}자 이내** 한 문장(숫자 금지, 격려 톤)",
  "reading_type_description": "『${input.readingTypeName}』 유형에 맞는 독서·학습 성향 설명. **공백 포함 ${HALF_YEAR_READING_TYPE_DESC_MAX_CHARS}자 이내** 한 덩어리. 유형명·역량 이름 나열·『+』 조합 표기 금지"
}


규칙:
- 역량마다 따로 문단·소제목을 두지 말 것
- 비난·낙인 금지. 아이는 「우리 아이」 등 비식별 호칭만
- gauge_high_desc·gauge_low_desc는 각각 ${HALF_YEAR_GAUGE_DESC_MAX_CHARS}자 초과 금지
- reading_type_description은 ${HALF_YEAR_READING_TYPE_DESC_MAX_CHARS}자 초과 금지
- ASCII 큰따옴표(") 대신 『』 사용`;

  const j = await geminiJson<Record<string, unknown>>(prompt, 0.45, 4096);
  const pick = (k: string) => (typeof j[k] === "string" ? (j[k] as string).trim() : "");

  const copy: HalfYearAiCopy = {
    score_overview: pick("score_overview"),
    gauge_high_desc: clampHalfYearGaugeDesc(pick("gauge_high_desc")),
    gauge_low_desc: clampHalfYearGaugeDesc(pick("gauge_low_desc")),
    reading_type_description: clampHalfYearReadingTypeDesc(pick("reading_type_description")),
  };

  if (!copy.reading_type_description) {
    copy.reading_type_description = clampHalfYearReadingTypeDesc(
      `6개월간의 활동 속에서 『${input.readingTypeName}』의 특징이 고르게 드러났습니다. 읽기와 생각이 자연스럽게 이어지며, 앞으로도 이 흐름을 이어가길 응원합니다.`,
    );
  }

  if (!copy.score_overview) {
    copy.score_overview = [
      "3-4회차 구간에서는 독서 몰입·이해와 글쓰기 완성도가 고르게 이어지는 모습이 돋보였으며, 논리적 사고와 언어·토론 태도도 안정적인 흐름을 보였습니다.",
      "5-6회차 구간에서는 학습 의지·참여가 꾸준히 이어졌고, 읽기·글쓰기 역량이 조금씩 깊어지는 성장의 결을 보여 주었습니다.",
    ].join("\n\n");
  }

  return copy;
}

export async function expandHalfYearTeacherComment(input: {
  studentGradeLabel: string;
  halfLabel: string;
  teacherSeed: string;
  readingType: HalfYearReadingTypeDef;
  scoreOverview: string;
  privacy?: ReportPrivacyContext;
}): Promise<string> {
  const prompt = `당신은 독서·국어 교육 현장의 전문 교사입니다.

${REPORT_NO_PII_PROMPT_RULES}

학년·급: ${input.studentGradeLabel}
반기: ${input.halfLabel}
독서 유형: ${input.readingType.typeName} (${input.readingType.comboLabel})

6개월 성장 요약(참고):
${input.scoreOverview.slice(0, 1200)}

교사 초안(1~2줄, 핵심 감정·표현 유지):
${input.teacherSeed}

## 작업
초안의 핵심 감정과 표현을 **그대로 살리면서** 학부모에게 전하는 **따뜻한 한마디**를 **5~7문장**, **2~3문단**(문단 사이 빈 줄)으로 확장하세요.

- JSON·목록·인사말 서두(안녕하세요 등) 금지
- 순수 한국어 본문만
- 마지막은 마침표로 끝낼 것`;

  let text = await geminiPlain(prompt, 0.5, 4096);
  text = text.replace(/^```[\w]*\s*/i, "").replace(/\s*```$/i, "").trim();
  if (text.length < 80) {
    text = [
      input.teacherSeed,
      "",
      `이번 반기 우리 아이는 『${input.readingType.typeName}』의 모습으로 꾸준히 성장해 왔습니다.`,
      "가정에서도 오늘 하루의 작은 기쁨을 함께 나누어 주시면, 아이의 자신감이 더 깊어질 것입니다.",
    ].join("\n\n");
  }
  return applyReportPrivacy(text, input.privacy);
}
