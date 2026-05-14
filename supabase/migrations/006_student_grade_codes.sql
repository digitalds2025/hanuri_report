-- student_grade: E1~E6(초), M1~M3(중), H1~H3(고) 문자열
-- 기존 smallint 1~12 → 초1~6=1~6, 중1~3=7~9, 고1~3=10~12 로 매핑

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_grade_check;

ALTER TABLE public.students
  ALTER COLUMN student_grade DROP DEFAULT;

ALTER TABLE public.students
  ALTER COLUMN student_grade TYPE text USING (
    CASE
      WHEN student_grade::integer BETWEEN 1 AND 6 THEN 'E' || student_grade::integer::text
      WHEN student_grade::integer BETWEEN 7 AND 9 THEN 'M' || (student_grade::integer - 6)::text
      WHEN student_grade::integer BETWEEN 10 AND 12 THEN 'H' || (student_grade::integer - 9)::text
      ELSE 'E1'
    END
  );

ALTER TABLE public.students
  ALTER COLUMN student_grade SET DEFAULT 'E1';

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_grade_code_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_student_grade_code_check CHECK (
    student_grade IN (
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
      'M1',
      'M2',
      'M3',
      'H1',
      'H2',
      'H3'
    )
  );
