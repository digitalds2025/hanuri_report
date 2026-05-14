-- books: 컬럼 정리 (yes24_url→url, description→introduce, 메타·AI 필드 추가, difficulty_grade 제거)
-- ai_keywords 는 기존 JSONB 유지 (요청의 ai_keywors 오타는 컬럼명으로 사용하지 않음)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'yes24_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'url'
  ) THEN
    ALTER TABLE public.books RENAME COLUMN yes24_url TO url;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'description'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'introduce'
  ) THEN
    ALTER TABLE public.books RENAME COLUMN description TO introduce;
  END IF;
END $$;

ALTER TABLE public.books ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS introduce text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS author_cmt text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS pub_cmt text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS ai_category text;

-- 001 에서 introduce 가 아직 없고 description 만 rename 된 경우를 제외하고, 둘 다 없을 때를 대비해 introduce 만 추가됐을 수 있음
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS url text;

ALTER TABLE public.books DROP COLUMN IF EXISTS difficulty_grade;
