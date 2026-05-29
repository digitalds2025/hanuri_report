import {
  applyReportPrivacy,
  REPORT_NO_PII_PROMPT_RULES,
  sanitizeReportSources,
  type ReportPrivacyContext,
} from "./reportStudentPrivacy";

/** 분기 성장 인사이트 긍정 패턴 코멘트 — 프롬프트 목표 상한 */
export const GROWTH_INSIGHT_COMMENT_TARGET_CHARS = 150;
const DISTINCT_KEYWORD_FALLBACKS = [
  "호기심",
  "꾸준한 참여",
  "또래와의 소통",
  "차분한 집중",
  "스스로 이어가는 태도",
] as const;

function getApiKey(): string {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() ?? "";
}

function getModel(): string {
  const m = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  return m || "gemini-2.0-flash";
}

type GeminiPlainResult = { text: string; finishReason?: string };

async function geminiGeneratePlainText(
  prompt: string,
  temperature: number,
  maxOutputTokens: number,
): Promise<GeminiPlainResult> {
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
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: "text/plain",
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
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new Error(`프롬프트 차단: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  return { text: trimmed, finishReason: candidate?.finishReason };
}

function sourcesBlock(sources: { heading: string; body: string }[]): string {
  return sources.map((s) => `### ${s.heading}\n${s.body}`).join("\n\n");
}

function keywordNorm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** 키워드 중복 제거 (공백·대소문자 무시) */
export function dedupeGrowthKeywords(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const k = raw.trim();
    if (k.length < 2) continue;
    const n = keywordNorm(k);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(k);
  }
  return out;
}

function pickDistinctFallbackKeywords(exclude: Set<string>, need: number): string[] {
  const out: string[] = [];
  for (const fb of DISTINCT_KEYWORD_FALLBACKS) {
    if (out.length >= need) break;
    const n = keywordNorm(fb);
    if (exclude.has(n)) continue;
    exclude.add(n);
    out.push(fb);
  }
  return out;
}

/** 성장 인사이트 코멘트 — JSON 부분 파싱(따옴표로 본문이 잘리는 regex) 사용 안 함 */
function normalizeGrowthInsightComment(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      for (const k of ["comment", "text", "message", "content"] as const) {
        const v = j[k];
        if (typeof v === "string" && v.trim()) {
          t = v.trim();
          break;
        }
      }
    } catch {
      /* plain text */
    }
  }
  return t.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, " ").trim();
}

/** 문장이 마침표·느낌표 등으로 끝났는지 */
function isGrowthCommentComplete(text: string): boolean {
  const t = text.trim();
  if (t.length < 36) return false;
  return /[.!?。]["'」』\s]*$/.test(t);
}

/** 모델 출력 → 키워드 최대 3개 (JSON·번호·불릿 제거) */
export function parseGrowthInsightKeywords(raw: string): string[] {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```\w*\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const arr = j.keywords ?? j.keyword ?? j.tags;
      if (Array.isArray(arr)) {
        return dedupeGrowthKeywords(
          arr
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim())
            .filter(Boolean),
        ).slice(0, 3);
      }
    } catch {
      /* plain text fallback */
    }
  }

  const lines = t
    .split(/\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^[\d]+[.)]\s*/, "")
        .replace(/^[-*•]\s*/, "")
        .replace(/^키워드\s*\d*\s*[:：]\s*/i, "")
        .trim(),
    )
    .filter((line) => line.length >= 2 && line.length <= 40);

  if (lines.length >= 1) return dedupeGrowthKeywords(lines).slice(0, 3);

  const inline = t
    .replace(/\n/g, " ")
    .split(/[,，、|]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 40);
  return dedupeGrowthKeywords(inline).slice(0, 3);
}

async function generateGrowthKeywordsSupplement(
  existing: string[],
  studentGradeLabel: string,
  quarterLabel: string,
  sources: { heading: string; body: string }[],
  need: number,
): Promise<string[]> {
  const used = existing.join(", ");
  const prompt = `당신은 독서·국어 교육 현장의 전문 교사입니다.

${REPORT_NO_PII_PROMPT_RULES}

학년·급: ${studentGradeLabel}
분기: ${quarterLabel}

이미 뽑은 키워드(아래와 **의미·표현이 겹치면 안 됨**): ${used}

선생님이 선택한 월간 기록:

${sourcesBlock(sources)}

## 작업
위 기록에서, 이미 뽑은 키워드와 **다른 관점**의 한국어 키워드를 **정확히 ${need}개** 더 뽑으세요.

출력:
- JSON·설명 금지
- **한 줄에 키워드 하나**, 총 **${need}줄만**
- 기존 키워드와 동의어·유사어·같은 뜻 반복 금지`;

  const { text: raw } = await geminiGeneratePlainText(prompt, 0.3, 256);
  return dedupeGrowthKeywords(parseGrowthInsightKeywords(raw));
}

async function ensureUniqueKeywordTriple(
  initial: string[],
  studentGradeLabel: string,
  quarterLabel: string,
  sources: { heading: string; body: string }[],
): Promise<[string, string, string]> {
  let kw = dedupeGrowthKeywords(initial);

  if (kw.length < 3 && kw.length > 0) {
    const extra = await generateGrowthKeywordsSupplement(
      kw,
      studentGradeLabel,
      quarterLabel,
      sources,
      3 - kw.length,
    );
    kw = dedupeGrowthKeywords([...kw, ...extra]);
  }

  if (kw.length < 3) {
    const exclude = new Set(kw.map(keywordNorm));
    kw = [...kw, ...pickDistinctFallbackKeywords(exclude, 3 - kw.length)];
  }

  if (kw.length < 3) {
    throw new Error("서로 다른 키워드 3개를 만들지 못했습니다. 선택 칸을 늘리거나 다시 시도해 주세요.");
  }

  return [kw[0]!, kw[1]!, kw[2]!];
}

async function generateGrowthKeywords(
  studentGradeLabel: string,
  quarterLabel: string,
  sources: { heading: string; body: string }[],
): Promise<string[]> {
  const prompt = `당신은 독서·국어 교육 현장의 전문 교사입니다.

${REPORT_NO_PII_PROMPT_RULES}

학년·급: ${studentGradeLabel}
분기: ${quarterLabel}

아래는 선생님이 선택한 월간 기록입니다.

${sourcesBlock(sources)}

## 작업
위 기록만 근거로, 이 아이에게 반복적으로 보인 **핵심 태도·자세·모습**을 대표하는 **한국어 키워드 정확히 3개**만 뽑으세요.

중복 금지 (필수):
- 세 키워드는 **서로 다른 관점**(예: 태도 / 관계 / 학습 방식)이어야 합니다.
- **동의어·유사 표현·같은 뜻**을 두 줄 이상 쓰지 마세요. (예: 「적극 참여」와 「열심히 참여」 동시 사용 불가)

출력 형식 (반드시 준수):
- JSON·마크다운·설명 문장 금지
- **한 줄에 키워드 하나**, 총 **3줄만**
- 각 키워드는 4~20자 명사구·짧은 구문

예시:
호기심
차분한 참여
소통 의지`;

  const { text: raw } = await geminiGeneratePlainText(prompt, 0.35, 512);
  const parsed = dedupeGrowthKeywords(parseGrowthInsightKeywords(raw));
  if (parsed.length === 0) {
    throw new Error("키워드를 추출하지 못했습니다. 선택 칸을 늘리거나 다시 시도해 주세요.");
  }
  return parsed;
}

async function generateGrowthComment(
  studentGradeLabel: string,
  quarterLabel: string,
  sources: { heading: string; body: string }[],
  keywords: [string, string, string],
): Promise<string> {
  const target = GROWTH_INSIGHT_COMMENT_TARGET_CHARS;
  const prompt = `당신은 독서·국어 교육 현장의 전문 교사입니다.

${REPORT_NO_PII_PROMPT_RULES}

학년·급: ${studentGradeLabel}
분기: ${quarterLabel}

핵심 태도·자세·모습 키워드: ${keywords.join(" · ")}

선생님이 선택한 월간 기록:

${sourcesBlock(sources)}

## 작업
위 기록과 키워드를 바탕으로, 학부모에게 전하는 **긍정적 행동 패턴** 코멘트를 **순수 한국어 본문**으로 작성하세요.

- JSON·마크다운·목록·코드 금지
- **1~2문단**, 필요 시 문단 사이 빈 줄 1줄
- 처음부터 **${target}자 이내**(공백 포함)로 **완결된 글**만 쓰세요. 길어지면 문장을 줄이고, 중간에서 끊기지 마세요
- **마지막 문장은 반드시 마침표(.)로 끝낼 것**
- 비난·낙인·과장 금지. 아이는 「우리 아이」 등으로만 지칭
- JSON·ASCII 큰따옴표(") 사용 금지. 인용은 『』만 사용`;

  const { text: raw, finishReason } = await geminiGeneratePlainText(prompt, 0.45, 8192);
  let comment = normalizeGrowthInsightComment(raw);

  const truncated =
    finishReason === "MAX_TOKENS" || !isGrowthCommentComplete(comment);
  if (truncated) {
    const retryPrompt = `${prompt}

## 중요 (재작성)
이전 응답이 중간에 끊겼습니다. 위 조건을 지키며 **처음부터 전체 코멘트**를 다시 작성하세요. **반드시 마침표로 끝내세요.**`;
    const retry = await geminiGeneratePlainText(retryPrompt, 0.4, 8192);
    const retried = normalizeGrowthInsightComment(retry.text);
    if (retried.length > comment.length) comment = retried;
  }

  return comment;
}

/**
 * 분기 성장 인사이트 — 선택 월간 텍스트 → 키워드 3개 + 긍정 행동 패턴 코멘트 (JSON 미사용).
 */
export async function generateQuarterGrowthInsight(input: {
  studentGradeLabel: string;
  quarterLabel: string;
  sources: { heading: string; body: string }[];
  privacy?: ReportPrivacyContext;
}): Promise<{ keywords: [string, string, string]; comment: string }> {
  if (!input.sources.length) {
    throw new Error("참조할 월간 기록을 한 칸 이상 선택해 주세요.");
  }
  const sources = sanitizeReportSources(input.sources, input.privacy);

  const keywordList = await generateGrowthKeywords(
    input.studentGradeLabel,
    input.quarterLabel,
    sources,
  );
  const keywords = await ensureUniqueKeywordTriple(
    keywordList,
    input.studentGradeLabel,
    input.quarterLabel,
    sources,
  );
  const tri: [string, string, string] = [
    applyReportPrivacy(keywords[0].slice(0, 40), input.privacy),
    applyReportPrivacy(keywords[1].slice(0, 40), input.privacy),
    applyReportPrivacy(keywords[2].slice(0, 40), input.privacy),
  ];

  let comment = await generateGrowthComment(
    input.studentGradeLabel,
    input.quarterLabel,
    sources,
    tri,
  );

  if (!isGrowthCommentComplete(comment)) {
    const kw = tri.filter(Boolean).join(", ");
    comment = kw
      ? `이번 분기 우리 아이는 ${kw}의 모습을 꾸준히 보여 주었습니다. 앞으로도 이 태도가 이어지길 응원합니다.`
      : "이번 분기 우리 아이는 교실에서 꾸준히 성장하는 모습을 보여 주었습니다. 앞으로도 따뜻한 격려를 이어 가겠습니다.";
  }

  return {
    keywords: tri,
    comment: applyReportPrivacy(comment.trim(), input.privacy),
  };
}

/** @deprecated JSON 일괄 파싱 — 하위 호환 */
export function parseQuarterGrowthInsightJson(raw: string): { keywords: string[]; comment: string } {
  const keywords = dedupeGrowthKeywords(parseGrowthInsightKeywords(raw));
  return { keywords, comment: normalizeGrowthInsightComment(raw) };
}
