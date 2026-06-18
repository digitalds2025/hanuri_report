-- 문학(1) / 비문학(0) — YES24 등록 시 Gemini로 분류

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS literature smallint;

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_literature_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_literature_check CHECK (literature IS NULL OR literature IN (0, 1));

COMMENT ON COLUMN public.books.literature IS '1=문학, 0=비문학 (Gemini 분류)';
