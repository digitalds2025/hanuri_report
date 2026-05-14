-- 앱 전용 로그인: login_id / password는 RPC로만 검증 (직접 SELECT 금지)
-- verify_app_user 는 SECURITY DEFINER 로 테이블을 읽고, 클라이언트는 anon 키로 RPC만 호출합니다.

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;

-- 직접 테이블 접근 차단 (함수는 소유자 권한으로 RLS 우회)
CREATE POLICY user_block_anon_authenticated
  ON public."user"
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.verify_app_user (p_login_id text, p_password text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.user_id
  FROM public."user" AS u
  WHERE u.login_id = p_login_id
    AND u.password = p_password
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_app_user (text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_app_user (text, text) TO anon, authenticated;
