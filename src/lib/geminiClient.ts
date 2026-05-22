export type GeminiGroundingChunk = { title?: string; uri?: string };
export type GeminiGroundingMeta = {
  webSearchQueries: string[];
  groundingChunks: GeminiGroundingChunk[];
};

export type GeminiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
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
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
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

export function readGeminiTokenUsage(data: GenerateContentResponse): GeminiTokenUsage {
  const meta = data.usageMetadata;
  const input = meta?.promptTokenCount;
  const output = meta?.candidatesTokenCount;
  return {
    inputTokens: typeof input === "number" && Number.isFinite(input) ? input : 0,
    outputTokens: typeof output === "number" && Number.isFinite(output) ? output : 0,
  };
}

function extractTextAndGrounding(data: GenerateContentResponse): {
  text: string;
  grounding: GeminiGroundingMeta;
  usage: GeminiTokenUsage;
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
    usage: readGeminiTokenUsage(data),
  };
}

/** JSON 모드 (그라운딩 없음) */
export async function geminiGenerateText(
  userPrompt: string,
  temperature = 0.4,
  role: GeminiRole = "writer",
  maxOutputTokens = 8192,
): Promise<{ text: string; usage: GeminiTokenUsage }> {
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

  const parsed = parseGeminiResponse(await res.text(), res.ok);
  const { text, usage } = extractTextAndGrounding(parsed);
  if (!text) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  return { text, usage };
}

function shouldRetryWithResearchModel(role: GeminiRole, err: unknown): boolean {
  if (role !== "writer") return false;
  const writer = getGeminiWriterModel();
  const research = getGeminiResearchModel();
  if (writer === research) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /not found|404|invalid model|does not exist|unsupported/i.test(msg) ||
    /Gemini API 오류/i.test(msg)
  );
}

export async function geminiGenerateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.35,
  role: GeminiRole = "writer",
  maxOutputTokens = 8192,
): Promise<{ data: T; usage: GeminiTokenUsage }> {
  const key = getGeminiApiKey();
  if (!key) throw new Error("VITE_GEMINI_API_KEY 가 .env 에 설정되어 있지 않습니다.");

  async function call(modelRole: GeminiRole): Promise<{ data: T; usage: GeminiTokenUsage }> {
    const model = resolveModel(modelRole);
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

    const parsed = parseGeminiResponse(await res.text(), res.ok);
    const { text, usage } = extractTextAndGrounding(parsed);
    if (!text) throw new Error("Gemini가 빈 응답을 반환했습니다.");
    const data = parseJsonFromModelText<T>(text);
    return { data, usage };
  }

  try {
    return await call(role);
  } catch (e) {
    if (shouldRetryWithResearchModel(role, e)) {
      console.warn("[geminiGenerateJson] writer 모델 실패, research 모델로 재시도", e);
      return call("research");
    }
    throw e;
  }
}

/** Google Search 그라운딩 (ChatGPT 웹 검색과 유사) */
export async function geminiGenerateWithGoogleSearch(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.25,
  role: GeminiRole = "research",
  maxOutputTokens = 16384,
): Promise<{ text: string; grounding: GeminiGroundingMeta; usage: GeminiTokenUsage }> {
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

function repairJsonLike(raw: string): string {
  return raw
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'");
}

export function parseJsonFromModelText<T>(text: string): T {
  const trimmed = text.trim();
  const attempts: string[] = [trimmed];

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) attempts.push(fence[1].trim());

  const objStart = trimmed.indexOf("{");
  const objEnd = trimmed.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    attempts.push(trimmed.slice(objStart, objEnd + 1));
  }

  const arrStart = trimmed.indexOf("[");
  const arrEnd = trimmed.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    attempts.push(trimmed.slice(arrStart, arrEnd + 1));
  }

  for (const candidate of attempts) {
    for (const variant of [candidate, repairJsonLike(candidate)]) {
      try {
        return JSON.parse(variant) as T;
      } catch {
        /* next */
      }
    }
  }

  throw new Error("모델 응답에서 JSON을 찾지 못했습니다.");
}
