-- students: user 테이블과 연결 + 컬럼명 정리 (PK: student_id)
-- report: 학생당 리포트 행 (report_id PK, student_id FK)
--
-- 선행 조건: 001_initial.sql 이 적용되어 public.students(및 monthly_reports 등)가 있어야 합니다.
-- SQL 에디터에서 004만 단독 실행하면 안 됩니다. 001 → 002 → 003 → 004 순서이거나 `supabase db push` 로 전체 적용하세요.

DO $$
BEGIN
  IF to_regclass('public.students') IS NULL THEN
    RAISE EXCEPTION
      'public.students 가 없습니다. supabase/migrations/001_initial.sql 을 먼저 실행한 뒤 이 파일(004)을 다시 실행하세요. 로컬이면 프로젝트 루트에서: supabase db push';
  END IF;
END $$;

-- 1) 소유자 연결
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public."user" (user_id) ON DELETE CASCADE;

UPDATE public.students AS s
SET user_id = u.user_id
FROM (
  SELECT user_id
  FROM public."user"
  ORDER BY login_id
  LIMIT 1
) AS u
WHERE s.user_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.students WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'students.user_id 백필 실패: public.user 에 행이 없어 학생의 user_id를 채울 수 없습니다.';
  END IF;
END $$;

ALTER TABLE public.students
  ALTER COLUMN user_id SET NOT NULL;

-- 2) 컬럼 이름 변경 (FK: monthly_reports·period_reports.student_id → students PK)
ALTER TABLE public.students RENAME COLUMN id TO student_id;
ALTER TABLE public.students RENAME COLUMN nickname TO student_nick;
ALTER TABLE public.students RENAME COLUMN grade TO student_grade;

-- 3) 리포트(상위 개념) — 상세 월간/기간 테이블과 별도로 student에 매달 수 있음
CREATE TABLE IF NOT EXISTS public.report (
  report_id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  student_id uuid NOT NULL REFERENCES public.students (student_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX IF NOT EXISTS idx_report_student_id ON public.report (student_id);
