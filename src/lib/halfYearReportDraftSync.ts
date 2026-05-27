import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database";
type HReportUpdate = Database["public"]["Tables"]["h_reports"]["Update"];
type HReportInsert = Database["public"]["Tables"]["h_reports"]["Insert"];

export type HalfYearReportDraftPayload = {
  student_id: string;
  /** 반기 마지막 달 YYYY-MM — `half_year_code`는 서버에서 `halfYearCodeForEndYm`으로 계산 */
  end_ym: string;
  score_reading?: number;
  score_thinking?: number;
  score_discussion?: number;
  score_writing?: number;
  score_growth?: number;
  score_overview?: string | null;
  score_reading_desc?: string | null;
  score_thinking_desc?: string | null;
  score_discussion_desc?: string | null;
  score_writing_desc?: string | null;
  score_growth_desc?: string | null;
  gauge_high_pillar?: string | null;
  gauge_low_pillar?: string | null;
  gauge_high_desc?: string | null;
  gauge_low_desc?: string | null;
  reading_type_name?: string | null;
  type_logic_code?: string | null;
  type_description?: string | null;
  teacher_comment?: string | null;
};

function omitUndefined<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** `end_ym` → DB `half_year_code` (예: 2025-12 → 2025-H2) */
export function halfYearCodeFromEndYm(endYm: string): string {
  const end = endYm.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(end);
  if (!m) return end;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return `${y}-H${mo <= 6 ? 1 : 2}`;
}

/**
 * 동일 학생·반기(`half_year_code`)에 대해 `h_reports` UPDATE 또는 `report` + `h_reports` INSERT.
 */
export async function upsertHalfYearReportDraft(
  client: SupabaseClient<Database>,
  payload: HalfYearReportDraftPayload,
): Promise<{ h_report_id: string; report_id: string }> {
  const { student_id, end_ym, ...rest } = payload;
  const half_year_code = halfYearCodeFromEndYm(end_ym);

  const { data: existing, error: selErr } = await client
    .from("h_reports")
    .select("h_report_id, report_id")
    .eq("student_id", student_id)
    .eq("half_year_code", half_year_code)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);

  const patch = omitUndefined({
    ...rest,
    half_year_code,
  } as Record<string, unknown>) as Record<string, unknown>;

  if (existing?.h_report_id && existing.report_id) {
    const { error: upErr } = await client.from("h_reports").update(patch as HReportUpdate).eq("h_report_id", existing.h_report_id);
    if (upErr) throw new Error(upErr.message);
    return { h_report_id: existing.h_report_id, report_id: existing.report_id };
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
    half_year_code,
    ...scores,
    ...patch,
  };

  const { data: ins, error: insErr } = await client
    .from("h_reports")
    .insert(insertRow as HReportInsert)
    .select("h_report_id")
    .single();
  if (insErr || !ins?.h_report_id) throw new Error(insErr?.message ?? "h_reports 생성 실패");

  return { h_report_id: ins.h_report_id, report_id: rep.report_id };
}
