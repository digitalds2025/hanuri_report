-- YES24 상세 표지 이미지 URL
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS cover_url text;
