import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Json } from "../lib/types/database";
import type {
  HalfReportRow,
  QuarterReportRow,
  StudentPeriodReportsBundle,
  YearReportRow,
} from "../lib/studentPeriodReportsTypes";

export type { HalfReportRow, QuarterReportRow, StudentPeriodReportsBundle, YearReportRow };

type ReportCreated = { created_at: string } | null;

function reportCreatedAt(r: ReportCreated | ReportCreated[]): string {
  const x = Array.isArray(r) ? r[0] : r;
  return x?.created_at ?? new Date().toISOString();
}

export function useStudentPeriodReports(studentId?: string) {
  const [data, setData] = useState<StudentPeriodReportsBundle>({
    quarters: [],
    halves: [],
    years: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!studentId) {
      setData({ quarters: [], halves: [], years: [] });
      setLoading(false);
      setError(null);
      return;
    }

    if (isSupabaseConfigured()) {
      if (!supabase) {
        setData({ quarters: [], halves: [], years: [] });
        setLoading(false);
        setError("Supabase 미설정");
        return;
      }
      setLoading(true);
      const [qRes, hRes, yRes] = await Promise.all([
        supabase
          .from("q_reports")
          .select(
            "q_report_id, quarter_end_ym, insight_desc, insight_tags, teacher_comment, teacher_ai_comment, best_writing_url, best_writing_cmt, growth_keywords, growth_cmt, mindmap_cmt, mindmap_book, mindmap_data, report ( created_at )",
          )
          .eq("student_id", studentId)
          .order("quarter_end_ym", { ascending: false }),
        supabase
          .from("h_reports")
          .select(
            "h_report_id, half_year_code, reading_type_name, type_logic_code, type_description, teacher_comment, score_reading, score_thinking, score_discussion, score_writing, score_growth, score_overview, score_reading_desc, score_thinking_desc, score_discussion_desc, score_writing_desc, score_growth_desc, gauge_high_pillar, gauge_low_pillar, gauge_high_desc, gauge_low_desc, report ( created_at )",
          )
          .eq("student_id", studentId)
          .order("half_year_code", { ascending: false }),
        supabase
          .from("y_reports")
          .select(
            "y_report_id, target_year, annual_timeline, outlook_comment, total_books, lit_ratio, non_lit_ratio, book_lit_count, book_non_lit_count, roadmap_text, teacher_comment, cert_text, cert_grade_label, score_reading, score_thinking, score_discussion, score_writing, score_growth, report ( created_at )",
          )
          .eq("student_id", studentId)
          .order("target_year", { ascending: false }),
      ]);

      const errMsg = qRes.error?.message ?? hRes.error?.message ?? yRes.error?.message ?? null;
      if (errMsg) {
        setError(errMsg);
        setData({ quarters: [], halves: [], years: [] });
        setLoading(false);
        return;
      }

      const quarters: QuarterReportRow[] = (qRes.data ?? []).map((row: Record<string, unknown>) => ({
        q_report_id: String(row.q_report_id),
        quarter_end_ym: String(row.quarter_end_ym),
        insight_desc: (row.insight_desc as string | null) ?? null,
        insight_tags: (row.insight_tags as Json) ?? [],
        teacher_comment: (row.teacher_comment as string | null) ?? null,
        teacher_ai_comment: (row.teacher_ai_comment as string | null) ?? null,
        best_writing_url: (row.best_writing_url as string | null) ?? null,
        best_writing_cmt: (row.best_writing_cmt as string | null) ?? null,
        growth_keywords: (row.growth_keywords as Json) ?? [],
        growth_cmt: (row.growth_cmt as string | null) ?? null,
        mindmap_cmt: (row.mindmap_cmt as string | null) ?? null,
        mindmap_book: (row.mindmap_book as Json | null) ?? null,
        mindmap_data: (row.mindmap_data as Json) ?? {},
        created_at: reportCreatedAt(row.report as ReportCreated | ReportCreated[]),
      }));

      const halves: HalfReportRow[] = (hRes.data ?? []).map((row: Record<string, unknown>) => ({
        h_report_id: String(row.h_report_id),
        half_year_code: String(row.half_year_code),
        reading_type_name: (row.reading_type_name as string | null) ?? null,
        type_logic_code: (row.type_logic_code as string | null) ?? null,
        type_description: (row.type_description as string | null) ?? null,
        teacher_comment: (row.teacher_comment as string | null) ?? null,
        score_reading: Number(row.score_reading),
        score_thinking: Number(row.score_thinking),
        score_discussion: Number(row.score_discussion),
        score_writing: Number(row.score_writing),
        score_growth: Number(row.score_growth),
        score_overview: (row.score_overview as string | null) ?? null,
        score_reading_desc: (row.score_reading_desc as string | null) ?? null,
        score_thinking_desc: (row.score_thinking_desc as string | null) ?? null,
        score_discussion_desc: (row.score_discussion_desc as string | null) ?? null,
        score_writing_desc: (row.score_writing_desc as string | null) ?? null,
        score_growth_desc: (row.score_growth_desc as string | null) ?? null,
        gauge_high_pillar: (row.gauge_high_pillar as string | null) ?? null,
        gauge_low_pillar: (row.gauge_low_pillar as string | null) ?? null,
        gauge_high_desc: (row.gauge_high_desc as string | null) ?? null,
        gauge_low_desc: (row.gauge_low_desc as string | null) ?? null,
        created_at: reportCreatedAt(row.report as ReportCreated | ReportCreated[]),
      }));

      const years: YearReportRow[] = (yRes.data ?? []).map((row: Record<string, unknown>) => ({
        y_report_id: String(row.y_report_id),
        target_year: Number(row.target_year),
        annual_timeline: (row.annual_timeline ?? {}) as YearReportRow["annual_timeline"],
        outlook_comment: (row.outlook_comment as string | null) ?? null,
        total_books: Number(row.total_books ?? 0),
        lit_ratio: Number(row.lit_ratio ?? 0),
        non_lit_ratio: Number(row.non_lit_ratio ?? 0),
        book_lit_count: Number(row.book_lit_count ?? 0),
        book_non_lit_count: Number(row.book_non_lit_count ?? 0),
        roadmap_text: (row.roadmap_text as string | null) ?? null,
        teacher_comment: (row.teacher_comment as string | null) ?? null,
        cert_text: (row.cert_text as string | null) ?? null,
        cert_grade_label: (row.cert_grade_label as string | null) ?? null,
        score_reading: Number(row.score_reading),
        score_thinking: Number(row.score_thinking),
        score_discussion: Number(row.score_discussion),
        score_writing: Number(row.score_writing),
        score_growth: Number(row.score_growth),
        created_at: reportCreatedAt(row.report as ReportCreated | ReportCreated[]),
      }));

      setError(null);
      setData({ quarters, halves, years });
      setLoading(false);
      return;
    }

    setData({ quarters: [], halves: [], years: [] });
    setLoading(false);
    setError("기간(분기·반기·연간) 리포트 목록은 Supabase가 설정된 경우에만 불러올 수 있습니다.");
  }, [studentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...data, loading, error, refetch };
}
