-- 반기(h_reports): 5대 역량 자연어 서술 + 게이지(최고·최저 역량) 저장

alter table public.h_reports
  add column if not exists score_reading_desc text null,
  add column if not exists score_thinking_desc text null,
  add column if not exists score_discussion_desc text null,
  add column if not exists score_writing_desc text null,
  add column if not exists score_growth_desc text null,
  add column if not exists gauge_high_pillar character varying(16) null,
  add column if not exists gauge_low_pillar character varying(16) null,
  add column if not exists gauge_high_desc text null,
  add column if not exists gauge_low_desc text null;

comment on column public.h_reports.score_reading_desc is '독서 몰입·이해 6개월 평균 — 자연어 서술(숫자 미노출)';
comment on column public.h_reports.score_thinking_desc is '생각의 깊이 6개월 평균 — 자연어 서술';
comment on column public.h_reports.score_discussion_desc is '어휘·대화 6개월 평균 — 자연어 서술';
comment on column public.h_reports.score_writing_desc is '글쓰기·끈기 6개월 평균 — 자연어 서술';
comment on column public.h_reports.score_growth_desc is '참여·학습 의지 6개월 평균 — 자연어 서술';
comment on column public.h_reports.gauge_high_pillar is '게이지 강조 — 6개월 평균 최고 역량 키(reading|thinking|discussion|writing|growth)';
comment on column public.h_reports.gauge_low_pillar is '게이지 강조 — 6개월 평균 최저 역량 키';
comment on column public.h_reports.gauge_high_desc is '최고 역량 게이지용 자연어 설명';
comment on column public.h_reports.gauge_low_desc is '최저 역량 게이지용 자연어 설명';

alter table public.h_reports
  drop constraint if exists h_reports_gauge_high_pillar_check;

alter table public.h_reports
  add constraint h_reports_gauge_high_pillar_check check (
    gauge_high_pillar is null
    or gauge_high_pillar in ('reading', 'thinking', 'discussion', 'writing', 'growth')
  );

alter table public.h_reports
  drop constraint if exists h_reports_gauge_low_pillar_check;

alter table public.h_reports
  add constraint h_reports_gauge_low_pillar_check check (
    gauge_low_pillar is null
    or gauge_low_pillar in ('reading', 'thinking', 'discussion', 'writing', 'growth')
  );

alter table public.h_reports
  drop constraint if exists h_reports_gauge_pillars_distinct_check;

alter table public.h_reports
  add constraint h_reports_gauge_pillars_distinct_check check (
    gauge_high_pillar is null
    or gauge_low_pillar is null
    or gauge_high_pillar <> gauge_low_pillar
  );
