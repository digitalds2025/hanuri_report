-- 분기(q_reports): 식별자를 quarter_end_ym(YYYY-MM, 분기 마지막 달)으로 통일하고 5대 역량 점수 컬럼 제거
-- quarter_year가 이미 제거된 DB에서도 재실행 가능(idempotent)

alter table public.q_reports
  add column if not exists quarter_end_ym varchar(7) null;

-- quarter_year가 있을 때만 레거시 값 변환 (이미 제거된 DB에서는 건너뜀)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'q_reports'
      and column_name = 'quarter_year'
  ) then
    execute $sql$
      update public.q_reports
      set quarter_end_ym =
        (regexp_match(quarter_year, '^(\d{4})-([1-4])Q$'))[1]
        || '-'
        || lpad((((regexp_match(quarter_year, '^(\d{4})-([1-4])Q$'))[2])::int * 3)::text, 2, '0')
      where quarter_end_ym is null
        and quarter_year ~ '^\d{4}-[1-4]Q$'
    $sql$;
  end if;
end $$;

-- 패턴 불일치·레거시 컬럼 없음 등으로 비어 있으면 NOT NULL 전에 채움
update public.q_reports
set quarter_end_ym = '1970-01'
where quarter_end_ym is null;

alter table public.q_reports
  alter column quarter_end_ym set not null;

alter table public.q_reports
  drop constraint if exists q_reports_student_quarter_unique;

alter table public.q_reports
  drop constraint if exists q_reports_student_quarter_end_unique;

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
