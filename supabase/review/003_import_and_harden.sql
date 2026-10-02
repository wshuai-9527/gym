-- Approved V49 rollout: preserve all old rows, copy complete day/set metadata.
begin;
with grouped as (
 select d.user_id,d.training_date,d.id,d.module,d.note,d.updated_at,
 coalesce((select jsonb_agg(jsonb_build_object('name',x.exercise_name,'sets',x.sets) order by x.first_index,x.exercise_name)
 from (
  select s.exercise_name,min(s.set_index) as first_index,
   jsonb_agg(to_jsonb(case when s.seconds>0 then s.seconds::text||'s' when s.weight_kg is not null then s.weight_kg::text||'kg*'||s.reps::text else s.reps::text end) order by s.set_index,s.id) as sets
  from public.training_sets s where s.day_id=d.id group by s.exercise_name
 ) x),case when d.module in ('Rest','Basketball') then jsonb_build_array(jsonb_build_object('name',case d.module when 'Rest' then '休息' else '篮球' end,'sets','[]'::jsonb)) else '[]'::jsonb end) as items,
 coalesce((select jsonb_agg(to_jsonb(s) order by s.set_index,s.id) from public.training_sets s where s.day_id=d.id),'[]'::jsonb) as original_sets
 from public.training_days d
)
insert into public.gym_documents(user_id,key,value)
select user_id,'record:'||training_date::text,jsonb_build_object('date',training_date::text,'module',module,'items',items,'source','legacy-cloud','note',note,'legacy',jsonb_build_object('dayId',id,'updatedAt',updated_at,'sets',original_sets))
from grouped on conflict(user_id,key) do nothing;
-- Default matches old V48 autoRest enabled; starts tomorrow, no historical backfill.
insert into public.gym_documents(user_id,key,value)
select distinct user_id,'settings:main',jsonb_build_object('autoRest',true,'timezone','Australia/Brisbane','enabledFrom',(now() at time zone 'Australia/Brisbane')::date::text)
from public.training_days on conflict(user_id,key) do nothing;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
-- Retain one correct, owner-checked policy per legacy table; remove redundant policies.
drop policy training_days_delete_own on public.training_days;
drop policy training_days_insert_own on public.training_days;
drop policy training_days_select_own on public.training_days;
drop policy training_days_update_own on public.training_days;
alter policy training_days_all_for_owner on public.training_days to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy training_sets_delete_own on public.training_sets;
drop policy training_sets_insert_own on public.training_sets;
drop policy training_sets_select_own on public.training_sets;
drop policy training_sets_update_own on public.training_sets;
alter policy training_sets_all_for_owner on public.training_sets to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create index if not exists idx_training_sets_day on public.training_sets(day_id,set_index);
notify pgrst,'reload schema';
commit;
