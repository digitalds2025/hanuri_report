-- 테스트 전용: 평문 비밀번호는 운영에서 사용 금지. Supabase Auth 권장.
-- 다른 테이블과 연결할 때는 user_id(uuid)를 FK로 사용하세요.
CREATE TABLE IF NOT EXISTS public.demo_user (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  login_id text NOT NULL UNIQUE,
  password text NOT NULL
);

INSERT INTO public.demo_user (login_id, password)
VALUES ('digitalds', '7895462')
ON CONFLICT (login_id) DO UPDATE SET password = EXCLUDED.password;

-- 예: 다른 테이블에서 참조
-- some_table.demo_user_id uuid NOT NULL REFERENCES public.demo_user (user_id) ON DELETE CASCADE
