export type GeminiGroundingChunk = { title?: string; uri?: string };
export type GeminiGroundingMeta = {
  webSearchQueries: string[];
  groundingChunks: GeminiGroundingChunk[];
};

export function getGeminiApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

export type GeminiRole = "research" | "writer" | "legacy";

/** Step 1 구글 검색 그라운딩 (gemini-2.5-flash) */
export function getGeminiResearchModel(): string {
  const m =
    (import.meta.env.VITE_GEMINI_RESEARCH_MODEL as string | undefined)?.trim() ||
    (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.5-flash";
}

/** Step 2~4 주제·원고·JSON (gemini-3.5-flash) */
export function getGeminiWriterModel(): string {
  const m =
    (import.meta.env.VITE_GEMINI_WRITER_MODEL as string | undefined)?.trim() ||
    (import.meta.env.VITE_GEMINI_SCAN_MODEL as string | undefined)?.trim();
  return m || "gemini-3.5-flash";
}

/** @deprecated getGeminiWriterModel 사용 */
export function getGeminiModel(): string {
  return getGeminiResearchModel();
}

/** @deprecated getGeminiResearchModel / getGeminiWriterModel 사용 */
export function getGeminiScanModel(): string {
  return getGeminiWriterModel();
}

function resolveModel(role: GeminiRole): string {
  if (role === "research" || role === "legacy") return getGeminiResearchModel();
  return getGeminiWriterModel();
}

type GenerateContentResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
};

function parseGeminiResponse(raw: string, resOk: boolean): GenerateContentResponse {
  if (!resOk) {
    let detail = raw;
    try {
      const j = JSON.parse(raw) as { error?: { message?: string } };
      if (j.error?.message) detail = j.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(`Gemini API 오류: ${detail}`);
  }
  try {
    return JSON.parse(raw) as GenerateContentResponse;
  } catch {
    throw new Error("Gemini 응답 JSON 파싱 실패");
  }
}

function extractTextAndGrounding(data: GenerateContentResponse): {
  text: string;
  grounding: GeminiGroundingMeta;
} {
  if (data.promptFeedback?.blockReason) {
    throw new Error(`프롬프트 차단: ${data.promptFeedback.blockReason}`);
  }
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const gm = cand?.groundingMetadata;
  const groundingChunks: GeminiGroundingChunk[] =
    gm?.groundingChunks?.map((c) => ({
      title: c.web?.title,
      uri: c.web?.uri,
    })) ?? [];
  return {
    text: text.trim(),
    grounding: {
      webSearchQueries: gm?.webSearchQueries ?? [],
      groundingChunks,
    },
  };
}

/** JSON 모드 (그라운딩 없음) */
export async function geminiGenerateText(
  userPrompt: string,
  temperature = 0.4,
  role: GeminiRole = "writer",
  maxOutputTokens = 8192,
): Promise<string> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("VITE_GEMINI_API_KEY 가 .env 에 설정되어 있지 않습니다.");
  const model = resolveModel(role);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    }),
  });

  const { text } = extractTextAndGrounding(parseGeminiResponse(await res.text(), res.ok));
  if (!text) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  return text;
}

export async function geminiGenerateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.35,
  role: GeminiRole = "writer",
  maxOutputTokens = 8192,
): Promise<T> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("VITE_GEMINI_API_KEY 가 .env 에 설정되어 있지 않습니다.");
  const model = resolveModel(role);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: "application/json",
      },
    }),
  });

  const { text } = extractTextAndGrounding(parseGeminiResponse(await res.text(), res.ok));
  if (!text) throw new Error("Gemini가 빈 응답을 반환했습니다.");

  try {
    return JSON.parse(text) as T;
  } catch {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence?.[1]) return JSON.parse(fence[1].trim()) as T;
    throw new Error("Gemini JSON 파싱 실패");
  }
}

/** Google Search 그라운딩 (ChatGPT 웹 검색과 유사) */
export async function geminiGenerateWithGoogleSearch(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.25,
  role: GeminiRole = "research",
  maxOutputTokens = 16384,
): Promise<{ text: string; grounding: GeminiGroundingMeta }> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("VITE_GEMINI_API_KEY 가 .env 에 설정되어 있지 않습니다.");
  const model = resolveModel(role);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    }),
  });

  return extractTextAndGrounding(parseGeminiResponse(await res.text(), res.ok));
}

export function parseJsonFromModelText<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence?.[1]) return JSON.parse(fence[1].trim()) as T;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
    throw new Error("모델 응답에서 JSON을 찾지 못했습니다.");
  }
}
