-- 월간 성장 모먼트: 1·2단 키워드 + 3단 교사 메모 구조 저장 (AI 생성문은 growth_moment 텍스트)
ALTER TABLE public.m_reports
  ADD COLUMN IF NOT EXISTS growth_meta jsonb NOT NULL DEFAULT '{}'::jsonb;
