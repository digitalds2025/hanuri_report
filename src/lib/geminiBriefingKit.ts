import type { BriefingLayoutSlide, BriefingMaterialFormInput, BriefingSlidePlan } from "./briefingMaterialTypes";

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.0-flash";
}

async function geminiGenerateJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
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
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.55,
        maxOutputTokens: 8192,
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
  if (!trimmed) {
    throw new Error("Gemini가 빈 응답을 반환했습니다.");
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence?.[1]) {
      return JSON.parse(fence[1].trim()) as T;
    }
    throw new Error("Gemini JSON 파싱 실패");
  }
}

function formContextBlock(input: BriefingMaterialFormInput): string {
  return [
    `지역: ${input.region} ${input.subRegion}`,
    `대상 학년: ${input.schoolLevels.join(", ") || "(미지정)"}`,
    `참석 학부모: ${input.parentAudience}`,
    `제작 분량: ${input.pageCount}장(슬라이드)`,
    `요청 사항:\n${input.requirements}`,
    input.attachmentNames.length ? `첨부 파일: ${input.attachmentNames.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const PLAN_SYSTEM = `당신은 학원·교육기관 설명회용 PPT 자료집 기획자입니다.
참고 자료와 요청 사항을 바탕으로 설명회용 슬라이드별 기획안을 작성합니다.

반드시 JSON 배열만 출력하세요. 각 항목 구조:
{
  "slideNumber": 1,
  "title": "슬라이드 제목",
  "purpose": "이 슬라이드의 목적(1~2문장)",
  "keyPoints": ["핵심 메시지1", "핵심 메시지2"],
  "speakerNotes": "발표자가 말할 내용 요약(2~4문장)"
}

규칙:
- 요청된 슬라이드 수와 정확히 일치할 것
- 1번은 표지/인사, 마지막은 Q&A 또는 마무리·연락처 권장
- 참고 자료의 고유명사·수치를 정확히 반영
- 학부모 대상에 맞는 따뜻하고 신뢰감 있는 톤`;

/** 1단계: 슬라이드별 기획안 생성 */
export async function planBriefingSlides(
  referenceText: string,
  input: BriefingMaterialFormInput,
): Promise<BriefingSlidePlan[]> {
  const userPrompt = `${formContextBlock(input)}

[참고 자료]
${referenceText || "(첨부 텍스트 없음 — 요청 사항만 반영)"}

슬라이드 ${input.pageCount}장 분량의 기획안 JSON 배열을 작성하세요.`;

  const parsed = await geminiGenerateJson<unknown>(PLAN_SYSTEM, userPrompt);
  const arr = Array.isArray(parsed) ? parsed : (parsed as { slides?: unknown }).slides;
  if (!Array.isArray(arr)) {
    throw new Error("기획안 형식이 올바르지 않습니다.");
  }

  return arr.map((item, i) => {
    const o = item as Record<string, unknown>;
    const keyPoints = Array.isArray(o.keyPoints)
      ? o.keyPoints.filter((x): x is string => typeof x === "string")
      : [];
    return {
      slideNumber: typeof o.slideNumber === "number" ? o.slideNumber : i + 1,
      title: String(o.title ?? `슬라이드 ${i + 1}`),
      purpose: String(o.purpose ?? ""),
      keyPoints,
      speakerNotes: String(o.speakerNotes ?? ""),
    };
  });
}

const LAYOUT_SYSTEM = `당신은 전문 PPT 기획자이자 정보 설계자(Information Architect)입니다.
슬라이드 기획안과 참고 자료를 바탕 '설명회용 전문 자료집' 수준의 고퀄리티 PPT 구성을 설계하세요.
단순 요약이 아니라, 데이터의 성격에 따라 가장 적합한 레이아웃 타입을 선택하는 것이 핵심입니다.

결과는 반드시 다음 구조의 JSON 배열이어야 하며, 기획안 슬라이드 수와 동일한 개수여야 합니다:

레이아웃 타입 가이드 (데이터 성격에 맞춰 선택):
1. { "type": "TITLE", "title": "메인 제목", "subtitle": "부제목/설명" }
2. { "type": "SECTION_HEADER", "title": "섹션 제목", "description": "섹션 요약" }
3. { "type": "GRID_CARDS", "title": "제목", "cards": [{ "title": "소제목", "desc": "내용" }] }
4. { "type": "DATA_TABLE", "title": "표 제목", "headers": ["헤더1", "헤더2"], "rows": [["값1", "값2"]] }
5. { "type": "COMPARISON", "title": "비교 제목", "leftTitle": "A", "leftItems": [], "rightTitle": "B", "rightItems": [] }
6. { "type": "CHECKLIST", "title": "점검 제목", "items": ["체크항목1", "체크항목2"] }
7. { "type": "STEP_CARDS", "title": "단계 제목", "steps": [{ "title": "1단계", "content": "설명" }] }
8. { "type": "METRIC", "title": "지표 제목", "value": "90%", "label": "설명", "description": "상세" }
9. { "type": "DETAILED_TEXT", "title": "상세 설명", "paragraphs": ["문단1", "문단2"] }
10. { "type": "QUOTE", "text": "인용구", "author": "출처" }
11. { "type": "IMAGE_AND_TEXT", "title": "제목", "imageDescription": "이미지 설명", "content": "본문" }

참고 자료의 명칭을 정확히 사용하고 전문적인 톤을 유지하세요.`;

/** 2단계: 기획안 → 레이아웃 JSON 슬라이드 */
export async function designBriefingSlideLayouts(
  referenceText: string,
  input: BriefingMaterialFormInput,
  plans: BriefingSlidePlan[],
): Promise<BriefingLayoutSlide[]> {
  const plansJson = JSON.stringify(plans, null, 2);
  const userPrompt = `${formContextBlock(input)}

[참고 자료]
${referenceText || "(없음)"}

[확정된 슬라이드 기획안]
${plansJson}

위 기획안 순서와 내용에 맞춰 각 슬라이드에 적합한 type을 선택한 JSON 배열을 작성하세요.`;

  const parsed = await geminiGenerateJson<unknown>(LAYOUT_SYSTEM, userPrompt);
  const arr = Array.isArray(parsed) ? parsed : (parsed as { slides?: unknown }).slides;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("레이아웃 설계 결과가 비어 있습니다.");
  }
  return arr as BriefingLayoutSlide[];
}
