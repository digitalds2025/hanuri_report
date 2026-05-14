import type { Json } from "./types/database";

/** YYYY-MM → "2026년 4월" */
export function formatReportMonthLabel(ym: string): string {
  const [ys, ms] = ym.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  return `${y}년 ${m}월`;
}

export function reportHeaderTitle(ym: string): string {
  return `한우리독서토론논술 ${formatReportMonthLabel(ym)} 리포트`;
}

/** 성장 모멘트 본문 → 문단 배열 */
export function splitParagraphs(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  return t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export type BookDisplayItem = { image: string; keywords: string[] };

function bookPlaceholderImage(title: string): string {
  return `https://placehold.co/300x400/e6f2ff/1a3b6b?text=${encodeURIComponent(title.slice(0, 12) || "Book")}`;
}

/**
 * book_keywords JSON + 선택 도서 제목 → 카드용.
 * - 신규(books 연동): 칩은 **ai_category · ai_keywords** 만 사용. 표지는 **`cover_url`**(없으면 플레이스홀더).
 * - 구 저장분: `hashtags` / `cover_url` 등 레거시 필드가 있으면 기존처럼 표시.
 */
export function bookKeywordsToDisplayItems(
  bookKeywords: Json,
  fallbackTitle: string,
): BookDisplayItem[] {
  if (Array.isArray(bookKeywords)) {
    if (bookKeywords.length === 0) {
      return [{ image: bookPlaceholderImage(fallbackTitle), keywords: ["#도서 미선택"] }];
    }
    const out: BookDisplayItem[] = [];
    for (let i = 0; i < bookKeywords.length; i++) {
      const entry = bookKeywords[i];
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
      out.push(...bookKeywordsToDisplayItems(entry as Json, `${fallbackTitle} ${i + 1}`.trim()));
    }
    return out.length > 0
      ? out
      : [{ image: bookPlaceholderImage(fallbackTitle), keywords: ["#도서 미선택"] }];
  }

  if (typeof bookKeywords !== "object" || bookKeywords === null || Array.isArray(bookKeywords)) {
    return [
      {
        image: bookPlaceholderImage(fallbackTitle),
        keywords: ["#도서 미선택"],
      },
    ];
  }
  const o = bookKeywords as Record<string, unknown>;
  if (o.source === "none" || o.note === "도서 미선택") {
    return [{ image: bookPlaceholderImage(fallbackTitle), keywords: ["#도서 미선택"] }];
  }

  const usesAiOnly =
    Object.prototype.hasOwnProperty.call(o, "ai_category") ||
    Object.prototype.hasOwnProperty.call(o, "ai_keywords");

  if (usesAiOnly) {
    const ai_cat =
      typeof o.ai_category === "string" && o.ai_category.trim() ? o.ai_category.trim() : null;
    let kw: string[] = [];
    if (Array.isArray(o.ai_keywords)) {
      kw = o.ai_keywords
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const chips: string[] = [];
    if (ai_cat) chips.push(ai_cat.startsWith("#") ? ai_cat : `#${ai_cat}`);
    for (const k of kw) {
      chips.push(k.startsWith("#") ? k : `#${k}`);
    }
    if (chips.length === 0) chips.push("#AI분류·키워드 없음");
    const coverFromBook =
      typeof o.cover_url === "string" && o.cover_url.trim()
        ? o.cover_url.trim()
        : bookPlaceholderImage(fallbackTitle);
    return [{ image: coverFromBook, keywords: chips }];
  }

  const cover =
    typeof o.cover_url === "string" && o.cover_url.trim()
      ? o.cover_url.trim()
      : bookPlaceholderImage("표지");
  let hashtags: string[] = [];
  if (Array.isArray(o.hashtags)) {
    hashtags = o.hashtags.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  if (hashtags.length === 0) {
    hashtags = ["#Yes24연동예정"];
    if (typeof o.genre === "string" && o.genre.trim()) hashtags.push(`#${o.genre.trim()}`);
  }
  return [{ image: cover, keywords: hashtags }];
}
