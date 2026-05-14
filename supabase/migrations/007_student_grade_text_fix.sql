-- student_grade 가 아직 smallint 인 DB용 복구 마이그레이션
-- (006 미적용·실패 시 "invalid input syntax for type smallint: E3" 등이 납니다.)
-- 이미 text 이면 타입 변환은 건너뛰고, 코드 CHECK 만 맞춥니다.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'students'
      AND column_name = 'student_grade'
      AND (data_type = 'smallint' OR udt_name = 'int2')
  ) THEN
    ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_grade_check;
    ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_grade_check;
    ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_grade_code_check;

    ALTER TABLE public.students ALTER COLUMN student_grade DROP DEFAULT;

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
  END IF;
END $$;

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
