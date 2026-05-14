import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import { localListMonthlyReports } from "../lib/localStoreApi";
import type { Json, MonthlyReport } from "../lib/types/database";
import { pillarScoresToJson, type PillarKey } from "../lib/reportAggregates";

type MReportRowDb = {
  m_report_id: string;
  report_id: string;
  student_id: string;
  target_month: string;
  score_reading: number;
  score_thinking: number;
  score_discussion: number;
  score_writing: number;
  score_growth: number;
  growth_moment: string | null;
  growth_meta: Json;
  writing_img_url1: string | null;
  writing_img_url2: string | null;
  book_id1: string | null;
  book_id2: string | null;
  strength_point: string | null;
  weakness_point: string | null;
  strength_cmt: string | null;
  weakness_cmt: string | null;
  book_keywords: Json;
  teacher_comment: string | null;
  report: { created_at: string } | null;
};

function yearMonthFromTargetMonth(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function mapMRowToMonthly(row: MReportRowDb): MonthlyReport {
  const scores: Record<PillarKey, number> = {
    reading: row.score_reading,
    thinking: row.score_thinking,
    discussion: row.score_discussion,
    writing: row.score_writing,
    growth: row.score_growth,
  };
  const rpt = row.report;
  const created =
    (Array.isArray(rpt) ? (rpt[0] as { created_at?: string } | undefined) : rpt)?.created_at ??
    new Date().toISOString();
  return {
    id: row.m_report_id,
    year_month: yearMonthFromTargetMonth(row.target_month),
    growth_moments: row.growth_moment,
    growth_meta: row.growth_meta ?? ({} as Json),
    competency_ratings: pillarScoresToJson(scores),
    created_at: created,
    book_id: row.book_id1,
    book_id2: row.book_id2,
    teacher_note: row.teacher_comment,
    strength_cmt: row.strength_cmt,
    weakness_cmt: row.weakness_cmt,
    writing_image_url: row.writing_img_url1 ?? row.writing_img_url2,
    writing_img_url1: row.writing_img_url1,
    writing_img_url2: row.writing_img_url2,
    book_keywords: row.book_keywords ?? undefined,
  };
}

export function useMonthlyReports(studentId?: string) {
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (isSupabaseConfigured()) {
      if (!supabase) {
        setReports([]);
        setLoading(false);
        setError("Supabase 미설정");
        return;
      }
      setLoading(true);
      let q = supabase
        .from("m_reports")
        .select(
          "m_report_id, report_id, student_id, target_month, score_reading, score_thinking, score_discussion, score_writing, score_growth, growth_moment, growth_meta, writing_img_url1, writing_img_url2, book_id1, book_id2, strength_point, weakness_point, strength_cmt, weakness_cmt, book_keywords, teacher_comment, report ( created_at )",
        )
        .order("target_month", { ascending: false });
      if (studentId) q = q.eq("student_id", studentId);
      const { data, error: e } = await q;
      if (e) setError(e.message);
      else {
        setError(null);
        const rows = (data ?? []) as unknown as MReportRowDb[];
        setReports(rows.map(mapMRowToMonthly));
      }
      setLoading(false);
      return;
    }

    if (!import.meta.env.DEV) {
      setReports([]);
      setLoading(false);
      setError("로컬 파일 DB는 개발 서버(npm run dev)에서만 사용할 수 있습니다.");
      return;
    }

    setLoading(true);
    try {
      const list = await localListMonthlyReports(studentId);
      setError(null);
      setReports(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setReports([]);
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { reports, loading, error, refetch };
}
