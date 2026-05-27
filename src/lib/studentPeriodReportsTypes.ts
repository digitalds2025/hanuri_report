import type { Json } from "./types/database";

export type QuarterReportRow = {
  q_report_id: string;
  /** 분기 마지막 달 YYYY-MM */
  quarter_end_ym: string;
  insight_desc: string | null;
  insight_tags: Json;
  /** 선생님이 적은 따뜻한 한마디 초안 */
  teacher_comment: string | null;
  /** AI 확장본(또는 최종 확정본) */
  teacher_ai_comment: string | null;
  best_writing_url: string | null;
  best_writing_cmt: string | null;
  growth_keywords: Json;
  growth_cmt: string | null;
  mindmap_cmt: string | null;
  mindmap_book: Json | null;
  mindmap_data: Json;
  created_at: string;
};

export type HalfReportRow = {
  h_report_id: string;
  half_year_code: string;
  reading_type_name: string | null;
  type_logic_code: string | null;
  type_description: string | null;
  teacher_comment: string | null;
  score_reading: number;
  score_thinking: number;
  score_discussion: number;
  score_writing: number;
  score_growth: number;
  score_overview: string | null;
  score_reading_desc: string | null;
  score_thinking_desc: string | null;
  score_discussion_desc: string | null;
  score_writing_desc: string | null;
  score_growth_desc: string | null;
  gauge_high_pillar: string | null;
  gauge_low_pillar: string | null;
  gauge_high_desc: string | null;
  gauge_low_desc: string | null;
  created_at: string;
};

export type YearReportRow = {
  y_report_id: string;
  target_year: number;
  annual_timeline: Json;
  score_reading: number;
  score_thinking: number;
  score_discussion: number;
  score_writing: number;
  score_growth: number;
  created_at: string;
};

export type StudentPeriodReportsBundle = {
  quarters: QuarterReportRow[];
  halves: HalfReportRow[];
  years: YearReportRow[];
};
