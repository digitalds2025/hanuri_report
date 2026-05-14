-- 분기(q_reports) 초안·AI 결과용 컬럼 — 마법사 단계별 자동 저장 및 레포트 생성기 결과 매핑

alter table public.q_reports
  add column if not exists mindmap_book jsonb null,
  add column if not exists mindmap_cmt text null,
  add column if not exists growth_keywords jsonb not null default '[]'::jsonb,
  add column if not exists growth_cmt text null,
  add column if not exists best_writing_cmt text null,
  add column if not exists teacher_ai_comment text null;

comment on column public.q_reports.mindmap_book is '분기 마인드맵 참고 도서 스냅샷(JSON 배열 등)';
comment on column public.q_reports.mindmap_cmt is '지식·수업 타당성 코멘트(평문)';
comment on column public.q_reports.growth_keywords is '성장 인사이트 핵심 태도 키워드(JSON 배열, insight_tags와 동기화 가능)';
comment on column public.q_reports.growth_cmt is '성장 인사이트 본문(긍정 행동 패턴 등)';
comment on column public.q_reports.best_writing_cmt is 'Best 글쓰기 짧은 소개 코멘트(AI/수정본)';
comment on column public.q_reports.teacher_ai_comment is '선생님 한마디 확장본(AI)';
