import type { PillarKey } from "./reportAggregates";
import type { Json } from "./types/database";

export type GrowthMetaState = {
  step1: string[];
  step2: string[];
  step3: string;
};

export function growthMetaStateToJson(meta: GrowthMetaState): Json {
  return {
    step1_activities: meta.step1,
    step2_attitudes: meta.step2,
    step3_teacher_notes: meta.step3,
  };
}

/** DB·로컬 JSON에서 읽을 때 (확장 필드는 무시하고 기본 3단만 파싱) */
export function growthMetaFromJson(j: Json | null | undefined): GrowthMetaState {
  if (typeof j !== "object" || j === null || Array.isArray(j)) {
    return { step1: [], step2: [], step3: "" };
  }
  const o = j as Record<string, unknown>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
      : [];
  const s3 =
    typeof o.step3_teacher_notes === "string"
      ? o.step3_teacher_notes
      : typeof o.step3 === "string"
        ? o.step3
        : "";
  return {
    step1: strings(o.step1_activities ?? o.step1),
    step2: strings(o.step2_attitudes ?? o.step2),
    step3: s3,
  };
}

export type MonthlyGrowthMetaExtras = {
  pillar_comments: Record<PillarKey, string>;
  selected_book: { title: string; author: string; publisher: string } | null;
  warm_message_draft: string;
  /** 글쓰기 이미지 최대 2개 — `https?://` URL 또는 `data:image/...` */
  writing_images: string[];
  /** 리포트 생성 후 저장되는 AI 역량 분석 본문 */
  competency_analysis_ai: string | null;
};

/** m_reports.growth_meta 에 넣는 확장 JSON */
export function buildMonthlyGrowthMetaJson(base: GrowthMetaState, extras: MonthlyGrowthMetaExtras): Json {
  return {
    step1_activities: base.step1,
    step2_attitudes: base.step2,
    step3_teacher_notes: base.step3,
    pillar_comments: extras.pillar_comments,
    selected_book: extras.selected_book,
    warm_message_draft: extras.warm_message_draft,
    writing_images: extras.writing_images.slice(0, 2),
    competency_analysis_ai: extras.competency_analysis_ai,
  };
}

function recordStringMap(v: unknown): Record<string, string> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) {
    if (typeof val === "string" && val.trim()) out[k] = val.trim();
  }
  return Object.keys(out).length ? out : null;
}

/** 저장된 growth_meta 에서 역량 코멘트 등 읽기 (선택) */
export function readMonthlyGrowthMetaExtras(j: Json | null | undefined): Partial<MonthlyGrowthMetaExtras> {
  if (typeof j !== "object" || j === null || Array.isArray(j)) return {};
  const o = j as Record<string, unknown>;
  const sb = o.selected_book;
  const selectedBook =
    typeof sb === "object" &&
    sb !== null &&
    !Array.isArray(sb) &&
    typeof (sb as { title?: unknown }).title === "string" &&
    typeof (sb as { author?: unknown }).author === "string"
      ? {
          title: String((sb as { title: string }).title),
          author: String((sb as { author: string }).author),
          publisher:
            typeof (sb as { publisher?: unknown }).publisher === "string"
              ? String((sb as { publisher: string }).publisher)
              : "",
        }
      : null;

  const pc = recordStringMap(o.pillar_comments);

  return {
    pillar_comments: (pc as Record<PillarKey, string>) ?? undefined,
    selected_book: selectedBook,
    warm_message_draft: typeof o.warm_message_draft === "string" ? o.warm_message_draft : undefined,
    writing_images: (() => {
      const wi = o.writing_images;
      if (Array.isArray(wi)) {
        return wi
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((s) => s.trim())
          .slice(0, 2);
      }
      if (typeof o.writing_image_data_url === "string" && o.writing_image_data_url.trim()) {
        return [o.writing_image_data_url.trim()];
      }
      return undefined;
    })(),
    competency_analysis_ai:
      typeof o.competency_analysis_ai === "string" ? o.competency_analysis_ai : undefined,
  };
}

/** 표시용: DB `writing_img_url1`(또는 growth_meta 내 이미지 배열·레거시 data URL) */
export function resolveWritingImageSrc(growthMeta: Json | null | undefined, writingImgUrl: string | null): string | null {
  const url = writingImgUrl?.trim();
  if (url) return url;
  const ex = readMonthlyGrowthMetaExtras(growthMeta);
  const arr = ex.writing_images;
  if (Array.isArray(arr) && arr.length > 0) return arr[0].trim();
  return null;
}
