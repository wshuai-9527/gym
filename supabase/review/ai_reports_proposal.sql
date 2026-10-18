-- REVIEW ONLY. Not executed. No changes to training documents or existing RLS.
-- A scheduled AI task writes only report snapshots through the authorized connector.
create table public.gym_ai_reports (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  source_start date not null,
  source_versions jsonb not null check (jsonb_typeof(source_versions)='object'),
  title text not null check (length(title) between 1 and 200),
  content text not null check (length(content) between 1 and 20000),
  generated_at timestamptz not null default now(),
  primary key (user_id, period_end),
  check (period_end = period_start + 2),
  check (source_start <= period_start)
);
alter table public.gym_ai_reports enable row level security;
revoke all on public.gym_ai_reports from public, anon, authenticated;
grant select on public.gym_ai_reports to authenticated;
create policy "owner reads AI reports" on public.gym_ai_reports
  for select to authenticated using ((select auth.uid())=user_id);
-- No frontend INSERT/UPDATE/DELETE grants or policies. Do not expose service_role.
