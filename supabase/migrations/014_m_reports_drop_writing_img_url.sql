-- m_reports: 단일 writing_img_url 제거 (writing_img_url1·2만 사용)
UPDATE public.m_reports
SET writing_img_url1 = writing_img_url
WHERE writing_img_url IS NOT NULL
  AND btrim(writing_img_url) <> ''
  AND (writing_img_url1 IS NULL OR btrim(writing_img_url1) = '');

ALTER TABLE public.m_reports DROP COLUMN IF EXISTS writing_img_url;
