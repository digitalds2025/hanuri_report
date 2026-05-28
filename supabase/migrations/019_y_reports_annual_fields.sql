-- 연간 레포트: 타임라인·도서·로드맵·선생님 한마디·수료증 필드
ALTER TABLE public.y_reports
  ADD COLUMN IF NOT EXISTS outlook_comment text,
  ADD COLUMN IF NOT EXISTS roadmap_text text,
  ADD COLUMN IF NOT EXISTS teacher_comment text,
  ADD COLUMN IF NOT EXISTS cert_text text,
  ADD COLUMN IF NOT EXISTS cert_grade_label text,
  ADD COLUMN IF NOT EXISTS book_lit_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS book_non_lit_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.y_reports.annual_timeline IS '월별 한줄 요약 JSON: { "months": { "1".."12": "..." }, "outlook"?: "..." }';
COMMENT ON COLUMN public.y_reports.outlook_comment IS '연간 타임라인 하단 전망 코멘트';
COMMENT ON COLUMN public.y_reports.roadmap_text IS '미래 로드맵(다음 학년 교육과정·한우리 비전)';
COMMENT ON COLUMN public.y_reports.teacher_comment IS '선생님의 따뜻한 한마디(AI 확장본)';
COMMENT ON COLUMN public.y_reports.cert_text IS '수료 인증서 축하 문구';
COMMENT ON COLUMN public.y_reports.cert_grade_label IS '수료증에 표시할 학년(예: 초4)';
