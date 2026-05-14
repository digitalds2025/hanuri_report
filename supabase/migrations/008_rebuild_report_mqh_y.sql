-- 월간/기간 리포트 스키마 재구성: report 허브 + m_reports, q_reports, h_reports, y_reports
-- (기존 monthly_reports, period_reports, period_type 제거)

DROP TABLE IF EXISTS public.period_reports CASCADE;
DROP TABLE IF EXISTS public.monthly_reports CASCADE;
DROP TYPE IF EXISTS public.period_type CASCADE;

DROP TABLE IF EXISTS public.report CASCADE;

CREATE TABLE public.report (
  report_id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  student_id uuid NOT NULL REFERENCES public.students (student_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX idx_report_student_created ON public.report (student_id, created_at DESC);

CREATE TABLE public.m_reports (
  m_report_id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  report_id uuid NOT NULL UNIQUE REFERENCES public.report (report_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students (student_id) ON DELETE CASCADE,
  target_month date NOT NULL,
  score_reading smallint NOT NULL CHECK (score_reading BETWEEN 1 AND 10),
  score_thinking smallint NOT NULL CHECK (score_thinking BETWEEN 1 AND 10),
  score_discussion smallint NOT NULL CHECK (score_discussion BETWEEN 1 AND 10),
  score_writing smallint NOT NULL CHECK (score_writing BETWEEN 1 AND 10),
  score_growth smallint NOT NULL CHECK (score_growth BETWEEN 1 AND 10),
  growth_moment text,
  writing_img_url varchar(2048),
  book_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  teacher_comment text,
  CONSTRAINT m_reports_student_month_unique UNIQUE (student_id, target_month)
);

CREATE INDEX idx_m_reports_student ON public.m_reports (student_id);

CREATE TABLE public.q_reports (
  q_report_id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  report_id uuid NOT NULL UNIQUE REFERENCES public.report (report_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students (student_id) ON DELETE CASCADE,
  quarter_year varchar(16) NOT NULL,
  score_reading smallint NOT NULL CHECK (score_reading BETWEEN 1 AND 10),
  score_thinking smallint NOT NULL CHECK (score_thinking BETWEEN 1 AND 10),
  score_discussion smallint NOT NULL CHECK (score_discussion BETWEEN 1 AND 10),
  score_writing smallint NOT NULL CHECK (score_writing BETWEEN 1 AND 10),
  score_growth smallint NOT NULL CHECK (score_growth BETWEEN 1 AND 10),
  best_writing_url varchar(2048),
  mindmap_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  insight_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  insight_desc text,
  teacher_comment text,
  CONSTRAINT q_reports_student_quarter_unique UNIQUE (student_id, quarter_year)
);

CREATE INDEX idx_q_reports_student ON public.q_reports (student_id);

CREATE TABLE public.h_reports (
  h_report_id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  report_id uuid NOT NULL UNIQUE REFERENCES public.report (report_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students (student_id) ON DELETE CASCADE,
  half_year_code varchar(16) NOT NULL,
  score_reading smallint NOT NULL CHECK (score_reading BETWEEN 1 AND 10),
  score_thinking smallint NOT NULL CHECK (score_thinking BETWEEN 1 AND 10),
  score_discussion smallint NOT NULL CHECK (score_discussion BETWEEN 1 AND 10),
  score_writing smallint NOT NULL CHECK (score_writing BETWEEN 1 AND 10),
  score_growth smallint NOT NULL CHECK (score_growth BETWEEN 1 AND 10),
  reading_type_name varchar(128),
  type_logic_code varchar(32),
  type_description text,
  percentile_rank double precision,
  teacher_comment text,
  CONSTRAINT h_reports_student_half_unique UNIQUE (student_id, half_year_code)
);

CREATE INDEX idx_h_reports_student ON public.h_reports (student_id);

CREATE TABLE public.y_reports (
  y_report_id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  report_id uuid NOT NULL UNIQUE REFERENCES public.report (report_id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students (student_id) ON DELETE CASCADE,
  target_year smallint NOT NULL,
  score_reading smallint NOT NULL CHECK (score_reading BETWEEN 1 AND 10),
  score_thinking smallint NOT NULL CHECK (score_thinking BETWEEN 1 AND 10),
  score_discussion smallint NOT NULL CHECK (score_discussion BETWEEN 1 AND 10),
  score_writing smallint NOT NULL CHECK (score_writing BETWEEN 1 AND 10),
  score_growth smallint NOT NULL CHECK (score_growth BETWEEN 1 AND 10),
  annual_timeline jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_books integer NOT NULL DEFAULT 0,
  lit_ratio integer NOT NULL DEFAULT 0,
  non_lit_ratio integer NOT NULL DEFAULT 0,
  is_certified boolean NOT NULL DEFAULT false,
  cert_number varchar(128),
  CONSTRAINT y_reports_student_year_unique UNIQUE (student_id, target_year),
  CONSTRAINT y_reports_target_year_range CHECK (target_year >= 2000 AND target_year <= 2100)
);

CREATE INDEX idx_y_reports_student ON public.y_reports (student_id);

-- RLS (anon 앱 — 005와 동일 패턴)
ALTER TABLE public.report ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_anon_all ON public.report;
CREATE POLICY report_anon_all ON public.report FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS report_authenticated_all ON public.report;
CREATE POLICY report_authenticated_all ON public.report FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.m_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS m_reports_anon_all ON public.m_reports;
CREATE POLICY m_reports_anon_all ON public.m_reports FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS m_reports_authenticated_all ON public.m_reports;
CREATE POLICY m_reports_authenticated_all ON public.m_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.q_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS q_reports_anon_all ON public.q_reports;
CREATE POLICY q_reports_anon_all ON public.q_reports FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS q_reports_authenticated_all ON public.q_reports;
CREATE POLICY q_reports_authenticated_all ON public.q_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.h_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS h_reports_anon_all ON public.h_reports;
CREATE POLICY h_reports_anon_all ON public.h_reports FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS h_reports_authenticated_all ON public.h_reports;
CREATE POLICY h_reports_authenticated_all ON public.h_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.y_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS y_reports_anon_all ON public.y_reports;
CREATE POLICY y_reports_anon_all ON public.y_reports FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS y_reports_authenticated_all ON public.y_reports;
CREATE POLICY y_reports_authenticated_all ON public.y_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
