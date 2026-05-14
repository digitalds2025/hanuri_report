import { normalizeQuarterMindmapModelText } from "./geminiQuarterMindmap";

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.0-flash";
}

async function geminiGenerateText(prompt: string, temperature: number, maxOutputTokens: number): Promise<string> {
  const key = getApiKey();
  if (!key) {
    throw new Error("VITE_GEMINI_API_KEY 가 .env 에 설정되어 있지 않습니다.");
  }
  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
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

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Gemini 응답 JSON 파싱 실패");
  }

  const d = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };

  if (d.promptFeedback?.blockReason) {
    throw new Error(`프롬프트 차단: ${d.promptFeedback.blockReason}`);
  }

  const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  return trimmed;
}

function stripCodeFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

function parseModelJson(raw: string): { keywords: string[]; comment: string } {
  const t = stripCodeFence(raw);
  let j: { keywords?: unknown; comment?: unknown };
  try {
    j = JSON.parse(t) as { keywords?: unknown; comment?: unknown };
  } catch {
    throw new Error("JSON 파싱 실패");
  }
  const kw = j.keywords;
  const commentRaw = typeof j.comment === "string" ? j.comment : "";
  const keywords = Array.isArray(kw)
    ? kw.filter((x): x is string => typeof x === "string").map((s) => s.trim())
    : [];
  return { keywords, comment: normalizeQuarterMindmapModelText(commentRaw) };
}

/**
 * 분기 성장 인사이트 — 선택된 월간 텍스트를 바탕으로 핵심 태도 키워드 3개 + 긍정 행동 패턴 코멘트(JSON) 생성.
 */
export async function generateQuarterGrowthInsight(input: {
  studentGradeLabel: string;
  quarterLabel: string;
  sources: { heading: string; body: string }[];
}): Promise<{ keywords: [string, string, string]; comment: string }> {
  if (!input.sources.length) {
    throw new Error("참조할 월간 기록을 한 칸 이상 선택해 주세요.");
  }
  const block = input.sources.map((s) => `### ${s.heading}\n${s.body}`).join("\n\n");

  const prompt = `당신은 초·중·고 독서·국어 교육 현장의 전문 교사입니다.

## 맥락
- 학생(또는 학급) 학년·급: **${input.studentGradeLabel}**
- 분기: **${input.quarterLabel}**
- 아래 블록은 **해당 분기에 포함된 월간 레포트(m_reports)**에서 선생님이 선택한 항목만 모은 것입니다. (성장의 순간, 강점/약점 코멘트, 선생님 코멘트 등)

${block}

## 출력 (반드시 JSON 한 덩어리만, 앞뒤 설명·마크다운 금지)
다음 키만 갖는 JSON:
1. \`keywords\`: 문자열 배열 **정확히 3개**. 각 항목은 이 학생이 **반복적으로 보인 핵심 태도·자세·모습**을 짧은 구절로 (각 25자 이내, 명사구·짧은 구문 위주).
2. \`comment\`: **한국어** 2~3문단, **350자 이내**. 위 자료에 근거해 **긍정적 행동 패턴**을 존중하는 교사의 톤으로 학부모에게 전하는 한 덩어리의 서술. 비난·낙인·과장 금지.

JSON 예시 형태만 따르고 다른 텍스트는 출력하지 마세요:
{"keywords":["…","…","…"],"comment":"…"}`;

  const raw = await geminiGenerateText(prompt, 0.42, 720);
  let keywords: string[];
  let comment: string;
  try {
    const parsed = parseModelJson(raw);
    keywords = parsed.keywords;
    comment = parsed.comment;
  } catch {
    throw new Error("AI 응답을 JSON으로 해석하지 못했습니다. 다시 시도해 주세요.");
  }
  if (keywords.length < 3) {
    throw new Error("AI 응답에 keywords가 3개 미만입니다. 다시 시도해 주세요.");
  }
  const tri: [string, string, string] = [
    keywords[0]!.slice(0, 40),
    keywords[1]!.slice(0, 40),
    keywords[2]!.slice(0, 40),
  ];
  return { keywords: tri, comment: comment.trim() };
}
