-- 반기 레포트: 레이더 차트 옆 6개월 종합 서술(2문단 전후)

alter table public.h_reports
  add column if not exists score_overview text null;

comment on column public.h_reports.score_overview is '최근 6개월 역량 종합 서술(레이더 옆 본문)';
