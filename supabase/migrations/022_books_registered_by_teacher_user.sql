-- 도서 등록자(digitalds) 추적 + teacher 계정 + 카탈로그 소유자 조회 RPC

INSERT INTO public."user" (login_id, password)
VALUES ('teacher', '7895462')
ON CONFLICT (login_id) DO UPDATE SET password = EXCLUDED.password;

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS registered_by_user_id uuid REFERENCES public."user" (user_id) ON DELETE SET NULL;

UPDATE public.books AS b
SET registered_by_user_id = u.user_id
FROM public."user" AS u
WHERE u.login_id = 'digitalds'
  AND b.registered_by_user_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_catalog_owner_user_id ()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public."user"
  WHERE login_id = 'digitalds'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_catalog_owner_user_id () FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_catalog_owner_user_id () TO anon, authenticated;
