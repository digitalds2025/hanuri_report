-- Hanuri Report 초기 스키마
-- 운영 배포 전: RLS 정책을 반드시 설계·적용하세요. 서비스 롤 키는 브라우저에 넣지 마세요.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 학생: 실명 대신 별명/표시 ID 사용
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname TEXT NOT NULL,
  grade SMALLINT NOT NULL DEFAULT 1 CHECK (grade >= 1 AND grade <= 12),
  total_reports_written INTEGER NOT NULL DEFAULT 0 CHECK (total_reports_written >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publisher TEXT NOT NULL,
  yes24_url TEXT,
  description TEXT,
  difficulty_grade TEXT,
  ai_keywords JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (title, author, publisher)
);

CREATE TABLE public.monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  growth_moments TEXT,
  competency_ratings JSONB NOT NULL DEFAULT '{}'::jsonb,
  book_id UUID REFERENCES public.books (id) ON DELETE SET NULL,
  teacher_note TEXT,
  writing_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, year_month)
);

CREATE TYPE public.period_type AS ENUM ('3m', '6m', '12m');

CREATE TABLE public.period_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  period_type public.period_type NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  ai_summary JSONB,
  growth_insights JSONB,
  roadmap JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_monthly_reports_student_month ON public.monthly_reports (student_id, year_month);
CREATE INDEX idx_period_reports_student_type ON public.period_reports (student_id, period_type);

CREATE OR REPLACE FUNCTION public.touch_students_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_students_updated
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.touch_students_updated_at();

-- TODO: ALTER TABLE ... ENABLE ROW LEVEL SECURITY; 및 교사별 정책
