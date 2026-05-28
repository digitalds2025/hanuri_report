import type { SupabaseClient } from "@supabase/supabase-js";
import { annualTargetYearForEndYm } from "./reportRounds";
import type { Database, Json } from "./types/database";

type YReportUpdate = Database["public"]["Tables"]["y_reports"]["Update"];
type YReportInsert = Database["public"]["Tables"]["y_reports"]["Insert"];

export type AnnualReportDraftPayload = {
  student_id: string;
  /** 연간 마지막 달 YYYY-MM (보통 12월) — `target_year`는 여기서 계산 */
  end_ym: string;
  score_reading?: number;
  score_thinking?: number;
  score_discussion?: number;
  score_writing?: number;
  score_growth?: number;
  annual_timeline?: Json;
  outlook_comment?: string | null;
  total_books?: number;
  lit_ratio?: number;
  non_lit_ratio?: number;
  book_lit_count?: number;
  book_non_lit_count?: number;
  roadmap_text?: string | null;
  teacher_comment?: string | null;
  cert_text?: string | null;
  cert_grade_label?: string | null;
  is_certified?: boolean;
};

const Y_REPORT_COLUMN_KEYS = new Set([
  "score_reading",
  "score_thinking",
  "score_discussion",
  "score_writing",
  "score_growth",
  "annual_timeline",
  "outlook_comment",
  "total_books",
  "lit_ratio",
  "non_lit_ratio",
  "book_lit_count",
  "book_non_lit_count",
  "roadmap_text",
  "teacher_comment",
  "cert_text",
  "cert_grade_label",
  "is_certified",
  "cert_number",
  "target_year",
]);

function omitUndefined<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && Y_REPORT_COLUMN_KEYS.has(k)) out[k] = v;
  }
  return out;
}

export async function upsertAnnualReportDraft(
  client: SupabaseClient<Database>,
  payload: AnnualReportDraftPayload,
): Promise<{ y_report_id: string; report_id: string }> {
  const { student_id, end_ym, ...rest } = payload;
  const target_year = annualTargetYearForEndYm(end_ym);

  const { data: existing, error: selErr } = await client
    .from("y_reports")
    .select("y_report_id, report_id")
    .eq("student_id", student_id)
    .eq("target_year", target_year)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);

  const patch = omitUndefined({
    ...rest,
    target_year,
  } as Record<string, unknown>) as Record<string, unknown>;

  if (existing?.y_report_id && existing.report_id) {
    const { error: upErr } = await client.from("y_reports").update(patch as YReportUpdate).eq("y_report_id", existing.y_report_id);
    if (upErr) throw new Error(upErr.message);
    return { y_report_id: existing.y_report_id, report_id: existing.report_id };
  }

  const scores = {
    score_reading: rest.score_reading ?? 5,
    score_thinking: rest.score_thinking ?? 5,
    score_discussion: rest.score_discussion ?? 5,
    score_writing: rest.score_writing ?? 5,
    score_growth: rest.score_growth ?? 5,
  };

  const { data: rep, error: repErr } = await client.from("report").insert({ student_id }).select("report_id").single();
  if (repErr || !rep?.report_id) throw new Error(repErr?.message ?? "report 생성 실패");

  const insertRow: Record<string, unknown> = {
    report_id: rep.report_id,
    student_id,
    target_year,
    ...scores,
    ...patch,
  };

  const { data: ins, error: insErr } = await client
    .from("y_reports")
    .insert(insertRow as YReportInsert)
    .select("y_report_id")
    .single();
  if (insErr || !ins?.y_report_id) throw new Error(insErr?.message ?? "y_reports 생성 실패");

  return { y_report_id: ins.y_report_id, report_id: rep.report_id };
}
