import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./types/database";

type QReportUpdate = Database["public"]["Tables"]["q_reports"]["Update"];
type QReportInsert = Database["public"]["Tables"]["q_reports"]["Insert"];

/** Supabase `q_reports` 초안/업데이트에 넣는 필드(모두 선택, null이면 해당 컬럼은 업데이트하지 않음) */
export type QuarterReportDraftPayload = {
  student_id: string;
  /** 분기 마지막 달 YYYY-MM (마법사 `end_ym`과 동일) */
  quarter_end_ym: string;
  best_writing_url?: string | null;
  mindmap_book?: Json | null;
  mindmap_cmt?: string | null;
  mindmap_data?: Json | null;
  growth_keywords?: Json | null;
  growth_cmt?: string | null;
  insight_tags?: Json | null;
  insight_desc?: string | null;
  teacher_comment?: string | null;
  best_writing_cmt?: string | null;
  teacher_ai_comment?: string | null;
};

function omitUndefined<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * 동일 학생·분기(`quarter_end_ym`)에 대해 `q_reports` 행이 있으면 UPDATE, 없으면 `report` + `q_reports` INSERT.
 */
export async function upsertQuarterReportDraft(
  client: SupabaseClient<Database>,
  payload: QuarterReportDraftPayload,
): Promise<{ q_report_id: string; report_id: string }> {
  const { student_id, quarter_end_ym, ...rest } = payload;

  const { data: existing, error: selErr } = await client
    .from("q_reports")
    .select("q_report_id, report_id")
    .eq("student_id", student_id)
    .eq("quarter_end_ym", quarter_end_ym)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);

  const patch = omitUndefined(rest as Record<string, unknown>) as Record<string, unknown>;

  if (existing?.q_report_id && existing.report_id) {
    const { error: upErr } = await client
      .from("q_reports")
      .update(patch as QReportUpdate)
      .eq("q_report_id", existing.q_report_id);
    if (upErr) throw new Error(upErr.message);
    return { q_report_id: existing.q_report_id, report_id: existing.report_id };
  }

  const { data: rep, error: repErr } = await client.from("report").insert({ student_id }).select("report_id").single();
  if (repErr || !rep?.report_id) throw new Error(repErr?.message ?? "report 생성 실패");

  const insertRow: Record<string, unknown> = {
    report_id: rep.report_id,
    student_id,
    quarter_end_ym,
    ...patch,
  };
  if (insertRow.mindmap_data == null) insertRow.mindmap_data = {};
  if (insertRow.insight_tags == null) insertRow.insight_tags = [];
  if (insertRow.growth_keywords == null) insertRow.growth_keywords = [];

  const { data: ins, error: insErr } = await client
    .from("q_reports")
    .insert(insertRow as QReportInsert)
    .select("q_report_id")
    .single();
  if (insErr || !ins?.q_report_id) throw new Error(insErr?.message ?? "q_reports 생성 실패");

  return { q_report_id: ins.q_report_id, report_id: rep.report_id };
}
