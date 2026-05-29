import {
  PILLAR_KEYS,
  pillarLabelsKo,
  type PillarKey,
} from "./reportAggregates";
import type { HalfYearMonthSlot } from "./halfYearReportCompute";
import type { HalfYearReadingTypeDef } from "./halfYearReadingTypes";
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

export type HalfYearAiCopy = {
  score_overview: string;
  score_reading_desc: string;
  score_thinking_desc: string;
  score_discussion_desc: string;
  score_writing_desc: string;
  score_growth_desc: string;
  gauge_high_desc: string;
  gauge_low_desc: string;
};

export async function generateHalfYearCompetencyCopy(input: {
  studentGradeLabel: string;
  halfLabel: string;
  slots: HalfYearMonthSlot[];
  averages: Record<PillarKey, number>;
  gaugeHigh: PillarKey;
  gaugeLow: PillarKey;
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

## 작업
JSON만 출력하세요. 키는 정확히 아래와 같습니다.

{
  "score_overview": "레이더 차트 옆 본문. 2문단(문단 사이 \\n\\n). 3~4회차 구간과 5~6회차 구간 성장 흐름을 자연스럽게 서술. 숫자·점수·별점 금지.",
  "score_reading_desc": "${pillarLabelsKo.reading} — 한 문장, '높은 편'·'꾸준히 상승' 등 자연어",
  "score_thinking_desc": "${pillarLabelsKo.thinking} — 한 문장",
  "score_discussion_desc": "${pillarLabelsKo.discussion} — 한 문장",
  "score_writing_desc": "${pillarLabelsKo.writing} — 한 문장",
  "score_growth_desc": "${pillarLabelsKo.growth} — 한 문장",
  "gauge_high_desc": "집중 성취 포인트 게이지용 1~2문장(숫자 금지)",
  "gauge_low_desc": "향후 강화 포인트 게이지용 1~2문장(숫자 금지, 격려 톤)"
}

규칙:
- 비난·낙인 금지. 아이는 「우리 아이」 등 비식별 호칭만.
- ASCII 큰따옴표(") 대신 『』 사용.`;

  const j = await geminiJson<Record<string, unknown>>(prompt, 0.45, 8192);
  const pick = (k: string) => (typeof j[k] === "string" ? (j[k] as string).trim() : "");

  const copy: HalfYearAiCopy = {
    score_overview: pick("score_overview"),
    score_reading_desc: pick("score_reading_desc"),
    score_thinking_desc: pick("score_thinking_desc"),
    score_discussion_desc: pick("score_discussion_desc"),
    score_writing_desc: pick("score_writing_desc"),
    score_growth_desc: pick("score_growth_desc"),
    gauge_high_desc: pick("gauge_high_desc"),
    gauge_low_desc: pick("gauge_low_desc"),
  };

  if (!copy.score_overview) {
    copy.score_overview = [
      "최근 6개월 동안 우리 아이는 여러 활동 속에서 고른 성장의 결을 보여 주었습니다.",
      "앞으로도 읽기·생각·말하기·글쓰기가 자연스럽게 이어지도록 따뜻하게 응원해 주시면 좋겠습니다.",
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
