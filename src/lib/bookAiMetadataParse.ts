/** Gemini·YES24 파이프라인 공통 — ai_category / ai_keywords 정규화 */

export type BookAiMetadata = {
  ai_category: string | null;
  ai_keywords: string[];
};

/** books.ai_keywords — 소개·코멘트 종합 대표어 (정확히 2개) */
export const BOOK_AI_KEYWORD_COUNT = 2;

const YES24_CATEGORY_NOISE = new Set([
  "관련분류",
  "카테고리 분류",
  "국내도서",
  "수상내역 및 미디어 추천",
  "분류",
  "YES24 올해의 책",
  "미디어 추천",
  "행복한아침독서/책둥이 추천",
  "교과서수록도서",
]);

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickKeywords(obj: Record<string, unknown>): string[] {
  const keys = ["ai_keywords", "aiKeywords", "keywords", "tags", "hashtags", "키워드", "keyword_list"];
  for (const k of keys) {
    const v = obj[k];
    if (!Array.isArray(v)) continue;
    const list = v
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length) return dedupeKeywords(list);
  }
  return [];
}

function dedupeKeywords(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const k = raw.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function normalizeYes24CategoryRaw(raw: string): string {
  return raw
    .replace(/관련분류\s*카테고리\s*분류\s*/gi, "")
    .replace(/수상내역[\s\S]*/i, "")
    .replace(/미디어\s*추천[\s\S]*/i, "")
    .replace(/\s+국내도서\s*>/g, " > ")
    .trim();
}

function splitYes24CategoryTrail(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const normalized = normalizeYes24CategoryRaw(raw);
  const segments: string[] = [];
  for (const chunk of normalized.split(">")) {
    const piece = chunk.trim();
    if (!piece) continue;
    for (const sub of piece.split(/\s+국내도서\s*/)) {
      const s = sub.trim();
      if (s) segments.push(s);
    }
  }
  return segments.filter((s) => {
    if (!s || YES24_CATEGORY_NOISE.has(s)) return false;
    if (/^국내도서$/i.test(s)) return false;
    if (/^\d{4}년/.test(s)) return false;
    if (/학년도/.test(s)) return false;
    if (s.length > 48) return false;
    return true;
  });
}

/**
 * YES24 「관련분류」 긴 문자열 → ai_category 한 줄 (Gemini 실패 시만).
 * 고정 화이트리스트가 아니라 경로의 의미 있는 끝 구간을 사용합니다.
 */
export function parseYes24CategoryForAiCategory(raw: string | null | undefined): string | null {
  const parts = splitYes24CategoryTrail(raw);
  if (!parts.length) return null;
  const tail = parts.slice(-2);
  const joined = tail.join(" · ");
  if (joined.length <= 36) return joined;
  const last = tail[tail.length - 1];
  return last ?? null;
}

function isLikelyYes24ShelfLabel(keyword: string, yes24Category?: string | null): boolean {
  if (/[/>]/.test(keyword)) return true;
  if (/^\d+[-~]\d+/.test(keyword)) return true;
  const parts = splitYes24CategoryTrail(yes24Category);
  return parts.some((p) => p === keyword || keyword.includes(p));
}

/** Gemini가 뽑은 키워드만 정규화 — YES24 분류명·장르 경로는 제거 */
export function normalizeBookAiKeywordsFromModel(
  keywords: string[],
  options?: { yes24Category?: string | null },
): string[] {
  const cleaned = dedupeKeywords(keywords).filter((k) => {
    if (k.length < 2 || k.length > 24) return false;
    if (isLikelyYes24ShelfLabel(k, options?.yes24Category)) return false;
    return true;
  });
  return cleaned.slice(0, BOOK_AI_KEYWORD_COUNT);
}

/** introduce · author_cmt · pub_cmt 만 (키워드 분석용) */
export function buildBookTextCorpus(input: {
  introduce?: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
}): string {
  const parts = [
    input.introduce?.trim() ? `[책 소개]\n${input.introduce.trim().slice(0, 12000)}` : null,
    input.author_cmt?.trim() ? `[만든이 코멘트]\n${input.author_cmt.trim().slice(0, 8000)}` : null,
    input.pub_cmt?.trim() ? `[출판사 리뷰]\n${input.pub_cmt.trim().slice(0, 8000)}` : null,
  ].filter(Boolean);
  return parts.join("\n\n");
}

export function hasBookTextCorpus(input: {
  introduce?: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
}): boolean {
  return Boolean(buildBookTextCorpus(input).trim());
}

/** Gemini 프롬프트 — 키워드는 반드시 소개·코멘트 3블록 종합, 정확히 2개 */
export function buildBookAiMetadataPrompt(input: {
  category?: string | null;
  introduce?: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
}): string {
  const corpus = buildBookTextCorpus(input);
  const categoryHint = input.category?.trim()
    ? `[참고: YES24 분야 — ai_category 추론에만 활용, ai_keywords 에 넣지 마세요]\n${input.category.trim().slice(0, 2000)}`
    : null;

  const blocks = [corpus, categoryHint].filter(Boolean).join("\n\n");

  return `당신은 도서 메타데이터를 정리하는 도우미입니다.

반드시 JSON 한 객체만 출력하세요. 마크다운·코드펜스·설명 문장 금지.
키 이름은 정확히 "ai_category", "ai_keywords" 만 사용하세요.

규칙:
1. ai_keywords (필수, 정확히 ${BOOK_AI_KEYWORD_COUNT}개)
   - [책 소개], [만든이 코멘트], [출판사 리뷰] 세 블록을 모두 읽고, 그 전체 내용을 가장 잘 대표하는 한국어 명사구를 정확히 ${BOOK_AI_KEYWORD_COUNT}개만 고르세요.
   - YES24 분야·장르 경로·카테고리 문자열·슬래시(/)가 들어간 분류명은 키워드로 쓰지 마세요.
   - 책 제목·저자 이름만으로 키워드를 채우지 마세요.
2. ai_category (필수)
   - 위 소개·코멘트와 참고 분야를 바탕으로, 독서 지도용 짧은 장르 한 줄(예: 유아 그림책, 청소년 문학).
   - YES24 분류 경로 전체를 그대로 넣지 마세요.

예시: {"ai_category":"유아 그림책","ai_keywords":["회복탄력성","감정"]}

--- 내용 ---
${blocks}
--- 끝 ---`;
}

/** 모델 텍스트 → ai_category · ai_keywords (키 이름 변형·코드펜스 허용) */
export function parseBookAiMetadataFromModelText(text: string): BookAiMetadata {
  const trimmed = text.trim();
  if (!trimmed) return { ai_category: null, ai_keywords: [] };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    let t = trimmed;
    const fence = /^```(?:json)?\s*([\s\S]*?)```/m.exec(t);
    if (fence) t = fence[1]!.trim();
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start) return { ai_category: null, ai_keywords: [] };
    try {
      parsed = JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return { ai_category: null, ai_keywords: [] };
    }
  }

  const nested = parsed.data ?? parsed.result ?? parsed.output;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    parsed = { ...parsed, ...(nested as Record<string, unknown>) };
  }

  const ai_category = pickString(parsed, [
    "ai_category",
    "aiCategory",
    "category_label",
    "categoryLabel",
    "genre",
    "분류",
    "카테고리",
    "category",
  ]);
  const ai_keywords = pickKeywords(parsed);

  return { ai_category, ai_keywords };
}

export type EnsureBookAiMetadataOptions = {
  yes24Category?: string | null;
};

/**
 * Gemini 결과 정규화.
 * - ai_keywords: 모델이 소개·코멘트에서 뽑은 것만 (YES24 분류·제목으로 채우지 않음)
 * - ai_category: 모델 우선, 없을 때만 YES24 분야 경로에서 짧게 추출
 */
export function ensureQualityBookAiMetadata(
  parsed: BookAiMetadata,
  options?: EnsureBookAiMetadataOptions,
): BookAiMetadata {
  let ai_category = parsed.ai_category?.trim() || null;
  const ai_keywords = normalizeBookAiKeywordsFromModel(parsed.ai_keywords, {
    yes24Category: options?.yes24Category,
  });

  if (!ai_category) {
    ai_category = parseYes24CategoryForAiCategory(options?.yes24Category);
  }

  return { ai_category, ai_keywords };
}

/** @deprecated ensureQualityBookAiMetadata 사용 */
export function finalizeBookAiMetadata(
  parsed: BookAiMetadata,
  options?: { yes24Category?: string | null; title?: string | null },
): BookAiMetadata {
  return ensureQualityBookAiMetadata(parsed, { yes24Category: options?.yes24Category });
}

export function bookAiKeywordsFromJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return normalizeBookAiKeywordsFromModel(
    raw.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean),
  );
}

export function bookRowMissingAiCategory(row: { ai_category?: string | null }): boolean {
  return !row.ai_category?.trim();
}

export function bookRowMissingAiKeywords(row: { ai_keywords?: unknown }): boolean {
  return bookAiKeywordsFromJson(row.ai_keywords).length < BOOK_AI_KEYWORD_COUNT;
}

/** 분류 또는 키워드 중 하나라도 기준 미달이면 다시 생성·저장 대상 */
export function bookRowNeedsAiMetadataFill(row: {
  ai_category?: string | null;
  ai_keywords?: unknown;
}): boolean {
  return bookRowMissingAiCategory(row) || bookRowMissingAiKeywords(row);
}

export function bookRowHasAiMetadata(row: {
  ai_category?: string | null;
  ai_keywords?: unknown;
}): boolean {
  return !bookRowNeedsAiMetadataFill(row);
}
