-- 분기(q_reports): 식별자를 quarter_end_ym(YYYY-MM, 분기 마지막 달)으로 통일하고 5대 역량 점수 컬럼 제거

alter table public.q_reports
  add column if not exists quarter_end_ym varchar(7) null;

update public.q_reports
set quarter_end_ym =
  (regexp_match(quarter_year, '^(\d{4})-([1-4])Q$'))[1]
  || '-'
  || lpad((((regexp_match(quarter_year, '^(\d{4})-([1-4])Q$'))[2])::int * 3)::text, 2, '0')
where quarter_end_ym is null
  and quarter_year ~ '^\d{4}-[1-4]Q$';

-- 패턴 불일치 행이 있으면 이후 NOT NULL / UNIQUE에서 실패하므로 여기서 정리
update public.q_reports
set quarter_end_ym = '1970-01'
where quarter_end_ym is null;

alter table public.q_reports
  alter column quarter_end_ym set not null;

alter table public.q_reports
  drop constraint if exists q_reports_student_quarter_unique;

alter table public.q_reports
  add constraint q_reports_student_quarter_end_unique unique (student_id, quarter_end_ym);

alter table public.q_reports
  drop column if exists quarter_year;

alter table public.q_reports drop column if exists score_reading;
alter table public.q_reports drop column if exists score_thinking;
alter table public.q_reports drop column if exists score_discussion;
alter table public.q_reports drop column if exists score_writing;
alter table public.q_reports drop column if exists score_growth;

create index if not exists idx_q_reports_student_quarter_end
  on public.q_reports (student_id, quarter_end_ym desc);

comment on column public.q_reports.quarter_end_ym is '분기 구간의 마지막 달 YYYY-MM (마법사 end_ym과 동일)';
