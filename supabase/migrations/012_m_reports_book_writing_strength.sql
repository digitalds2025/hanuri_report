-- 월간 리포트: 도서 FK(최대 2권), 글쓰기 이미지 URL(최대 2장), 강점·보완점 영역·교사 코멘트
ALTER TABLE public.m_reports
  ADD COLUMN IF NOT EXISTS book_id1 uuid REFERENCES public.books (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS book_id2 uuid REFERENCES public.books (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS writing_img_url1 character varying(2048),
  ADD COLUMN IF NOT EXISTS writing_img_url2 character varying(2048),
  ADD COLUMN IF NOT EXISTS strength_point text,
  ADD COLUMN IF NOT EXISTS weakness_point text,
  ADD COLUMN IF NOT EXISTS strength_cmt text,
  ADD COLUMN IF NOT EXISTS weakness_cmt text;

-- 기존 단일 writing_img_url → 첫 번째 칸으로 이관
UPDATE public.m_reports
SET writing_img_url1 = writing_img_url
WHERE writing_img_url IS NOT NULL
  AND btrim(writing_img_url) <> ''
  AND (writing_img_url1 IS NULL OR btrim(writing_img_url1) = '');
