-- 앱은 Supabase Auth 대신 커스텀 user 테이블 + anon 키로 접속합니다.
-- 이 경우 JWT에 auth.uid()가 없으므로, 행 단위 제한은 앱에서 user_id 필터로 처리합니다.
-- 운영 전: Supabase Auth 전환 후 auth.uid() = user_id 매핑 등으로 정책을 좁히는 것을 권장합니다.

-- ----- students -----
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS students_anon_all ON public.students;
CREATE POLICY students_anon_all ON public.students FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS students_authenticated_all ON public.students;
CREATE POLICY students_authenticated_all ON public.students FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- monthly_reports -----
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monthly_reports_anon_all ON public.monthly_reports;
CREATE POLICY monthly_reports_anon_all ON public.monthly_reports FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS monthly_reports_authenticated_all ON public.monthly_reports;
CREATE POLICY monthly_reports_authenticated_all ON public.monthly_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- period_reports -----
ALTER TABLE public.period_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS period_reports_anon_all ON public.period_reports;
CREATE POLICY period_reports_anon_all ON public.period_reports FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS period_reports_authenticated_all ON public.period_reports;
CREATE POLICY period_reports_authenticated_all ON public.period_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- books -----
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS books_anon_all ON public.books;
CREATE POLICY books_anon_all ON public.books FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS books_authenticated_all ON public.books;
CREATE POLICY books_authenticated_all ON public.books FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----- report (004에서 생성된 경우에만) -----
DO $$
BEGIN
  IF to_regclass('public.report') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE public.report ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS report_anon_all ON public.report;
  CREATE POLICY report_anon_all ON public.report FOR ALL TO anon USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS report_authenticated_all ON public.report;
  CREATE POLICY report_authenticated_all ON public.report FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $$;
