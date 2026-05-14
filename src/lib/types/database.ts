/** Supabase Database 타입 (수동 정의 — supabase gen types 로 교체 가능) */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      students: {
        Row: {
          student_id: string;
          user_id: string;
          student_nick: string;
          student_grade: string;
          total_reports_written: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          student_id?: string;
          user_id: string;
          student_nick: string;
          student_grade?: string;
          total_reports_written?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          student_id?: string;
          user_id?: string;
          student_nick?: string;
          student_grade?: string;
          total_reports_written?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      books: {
        Row: {
          id: string;
          title: string;
          author: string;
          publisher: string;
          url: string | null;
          category: string | null;
          introduce: string | null;
          author_cmt: string | null;
          pub_cmt: string | null;
          ai_category: string | null;
          ai_keywords: Json;
          cover_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          author: string;
          publisher: string;
          url?: string | null;
          category?: string | null;
          introduce?: string | null;
          author_cmt?: string | null;
          pub_cmt?: string | null;
          ai_category?: string | null;
          ai_keywords?: Json;
          cover_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          author?: string;
          publisher?: string;
          url?: string | null;
          category?: string | null;
          introduce?: string | null;
          author_cmt?: string | null;
          pub_cmt?: string | null;
          ai_category?: string | null;
          ai_keywords?: Json;
          cover_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      report: {
        Row: {
          report_id: string;
          student_id: string;
          created_at: string;
        };
        Insert: {
          report_id?: string;
          student_id: string;
          created_at?: string;
        };
        Update: {
          report_id?: string;
          student_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      m_reports: {
        Row: {
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
        };
        Insert: {
          m_report_id?: string;
          report_id: string;
          student_id: string;
          target_month: string;
          score_reading: number;
          score_thinking: number;
          score_discussion: number;
          score_writing: number;
          score_growth: number;
          growth_moment?: string | null;
          growth_meta?: Json;
          writing_img_url1?: string | null;
          writing_img_url2?: string | null;
          book_id1?: string | null;
          book_id2?: string | null;
          strength_point?: string | null;
          weakness_point?: string | null;
          strength_cmt?: string | null;
          weakness_cmt?: string | null;
          book_keywords?: Json;
          teacher_comment?: string | null;
        };
        Update: {
          m_report_id?: string;
          report_id?: string;
          student_id?: string;
          target_month?: string;
          score_reading?: number;
          score_thinking?: number;
          score_discussion?: number;
          score_writing?: number;
          score_growth?: number;
          growth_moment?: string | null;
          growth_meta?: Json;
          writing_img_url1?: string | null;
          writing_img_url2?: string | null;
          book_id1?: string | null;
          book_id2?: string | null;
          strength_point?: string | null;
          weakness_point?: string | null;
          strength_cmt?: string | null;
          weakness_cmt?: string | null;
          book_keywords?: Json;
          teacher_comment?: string | null;
        };
        Relationships: [];
      };
      q_reports: {
        Row: {
          q_report_id: string;
          report_id: string;
          student_id: string;
          quarter_end_ym: string;
          best_writing_url: string | null;
          mindmap_book: Json | null;
          mindmap_cmt: string | null;
          mindmap_data: Json;
          growth_keywords: Json;
          growth_cmt: string | null;
          insight_tags: Json;
          insight_desc: string | null;
          teacher_comment: string | null;
          best_writing_cmt: string | null;
          teacher_ai_comment: string | null;
        };
        Insert: {
          q_report_id?: string;
          report_id: string;
          student_id: string;
          quarter_end_ym: string;
          best_writing_url?: string | null;
          mindmap_book?: Json | null;
          mindmap_cmt?: string | null;
          mindmap_data?: Json;
          growth_keywords?: Json;
          growth_cmt?: string | null;
          insight_tags?: Json;
          insight_desc?: string | null;
          teacher_comment?: string | null;
          best_writing_cmt?: string | null;
          teacher_ai_comment?: string | null;
        };
        Update: {
          q_report_id?: string;
          report_id?: string;
          student_id?: string;
          quarter_end_ym?: string;
          best_writing_url?: string | null;
          mindmap_book?: Json | null;
          mindmap_cmt?: string | null;
          mindmap_data?: Json;
          growth_keywords?: Json;
          growth_cmt?: string | null;
          insight_tags?: Json;
          insight_desc?: string | null;
          teacher_comment?: string | null;
          best_writing_cmt?: string | null;
          teacher_ai_comment?: string | null;
        };
        Relationships: [];
      };
      h_reports: {
        Row: {
          h_report_id: string;
          report_id: string;
          student_id: string;
          half_year_code: string;
          score_reading: number;
          score_thinking: number;
          score_discussion: number;
          score_writing: number;
          score_growth: number;
          reading_type_name: string | null;
          type_logic_code: string | null;
          type_description: string | null;
          percentile_rank: number | null;
          teacher_comment: string | null;
        };
        Insert: {
          h_report_id?: string;
          report_id: string;
          student_id: string;
          half_year_code: string;
          score_reading: number;
          score_thinking: number;
          score_discussion: number;
          score_writing: number;
          score_growth: number;
          reading_type_name?: string | null;
          type_logic_code?: string | null;
          type_description?: string | null;
          percentile_rank?: number | null;
          teacher_comment?: string | null;
        };
        Update: {
          h_report_id?: string;
          report_id?: string;
          student_id?: string;
          half_year_code?: string;
          score_reading?: number;
          score_thinking?: number;
          score_discussion?: number;
          score_writing?: number;
          score_growth?: number;
          reading_type_name?: string | null;
          type_logic_code?: string | null;
          type_description?: string | null;
          percentile_rank?: number | null;
          teacher_comment?: string | null;
        };
        Relationships: [];
      };
      y_reports: {
        Row: {
          y_report_id: string;
          report_id: string;
          student_id: string;
          target_year: number;
          score_reading: number;
          score_thinking: number;
          score_discussion: number;
          score_writing: number;
          score_growth: number;
          annual_timeline: Json;
          total_books: number;
          lit_ratio: number;
          non_lit_ratio: number;
          is_certified: boolean;
          cert_number: string | null;
        };
        Insert: {
          y_report_id?: string;
          report_id: string;
          student_id: string;
          target_year: number;
          score_reading: number;
          score_thinking: number;
          score_discussion: number;
          score_writing: number;
          score_growth: number;
          annual_timeline?: Json;
          total_books?: number;
          lit_ratio?: number;
          non_lit_ratio?: number;
          is_certified?: boolean;
          cert_number?: string | null;
        };
        Update: {
          y_report_id?: string;
          report_id?: string;
          student_id?: string;
          target_year?: number;
          score_reading?: number;
          score_thinking?: number;
          score_discussion?: number;
          score_writing?: number;
          score_growth?: number;
          annual_timeline?: Json;
          total_books?: number;
          lit_ratio?: number;
          non_lit_ratio?: number;
          is_certified?: boolean;
          cert_number?: string | null;
        };
        Relationships: [];
      };
      user: {
        Row: {
          user_id: string;
          login_id: string;
          password: string;
        };
        Insert: {
          user_id?: string;
          login_id: string;
          password: string;
        };
        Update: {
          user_id?: string;
          login_id?: string;
          password?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      verify_app_user: {
        Args: {
          p_login_id: string;
          p_password: string;
        };
        Returns: string | null;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

/** 기간 리포트 작성 UI (구 period_type) */
export type PeriodType = "3m" | "6m" | "12m";

/** 회차표·훅에서 쓰는 월간 뷰 (m_reports + report.created_at 가공) */
export type MonthlyReport = {
  id: string;
  year_month: string;
  growth_moments: string | null;
  /** 1·2·3단 키워드·메모 (AI 입력 메타) */
  growth_meta?: Json;
  competency_ratings: Json;
  created_at: string;
  book_id?: string | null;
  /** 두 번째 선택 도서 `books.id` (있을 때만) */
  book_id2?: string | null;
  teacher_note?: string | null;
  writing_image_url?: string | null;
  /** m_reports.strength_cmt */
  strength_cmt?: string | null;
  /** m_reports.weakness_cmt */
  weakness_cmt?: string | null;
  /** m_reports.writing_img_url1 — 글쓰기 이미지 1 */
  writing_img_url1?: string | null;
  /** m_reports.writing_img_url2 — 글쓰기 이미지 2 */
  writing_img_url2?: string | null;
  /** 저장 시 도서 칩용 JSON (배열 등) */
  book_keywords?: Json;
};

export type Student = Database["public"]["Tables"]["students"]["Row"];
export type Book = Database["public"]["Tables"]["books"]["Row"];
export type Report = Database["public"]["Tables"]["report"]["Row"];
export type MReport = Database["public"]["Tables"]["m_reports"]["Row"];
export type QReport = Database["public"]["Tables"]["q_reports"]["Row"];
export type HReport = Database["public"]["Tables"]["h_reports"]["Row"];
export type YReport = Database["public"]["Tables"]["y_reports"]["Row"];
