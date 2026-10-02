-- Approved and applied 2026-10-02. Historical review snapshot; do not rerun.
-- Requires pg_cron extension already enabled. Fixed Asia/Brisbane-equivalent zone:
-- Australia/Brisbane. Never guesses current travel timezone.
begin;
create extension if not exists pg_cron;
create function gym_private.auto_rest()
returns integer language plpgsql security definer set search_path='' as $$
declare u uuid; cfg jsonb; draft jsonb; y date; wrote integer:=0; local_time timestamp;
begin
 local_time:=now() at time zone 'Australia/Brisbane';
 if extract(hour from local_time)<2 then return 0; end if;
 y:=local_time::date-1;
 for u in select user_id from public.gym_documents where key='settings:main' and value->>'autoRest'='true' loop
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,49));
  select value into cfg from public.gym_documents where user_id=u and key='settings:main';
  if cfg->>'autoRest' is distinct from 'true' or cfg->>'timezone' is distinct from 'Australia/Brisbane' or (cfg->>'enabledFrom')::date>y then continue; end if;
  select value into draft from public.gym_documents where user_id=u and key='draft:active';
  if exists(select 1 from jsonb_each(coalesce(draft->'rows','{}'::jsonb)) r where r.value->>'done'='true' or r.value->>'edited'='true') then continue; end if;
  -- Once yesterday has any document, including a deletion tombstone, never recreate it.
  if exists(select 1 from public.gym_documents where user_id=u and key='record:'||y::text) then continue; end if;
  insert into public.gym_documents(user_id,key,value) values(u,'record:'||y::text,jsonb_build_object('date',y::text,'module','Rest','source','auto-rest','items',jsonb_build_array(jsonb_build_object('name','休息','sets','[]'::jsonb)))) on conflict do nothing;
  if found then wrote:=wrote+1;end if;
 end loop;
 return wrote;
end $$;
revoke all on function gym_private.auto_rest() from public,anon,authenticated;
-- Run shortly after 02:00 Brisbane (16:05 UTC on previous UTC date), once daily.
select cron.schedule('gym-v49-auto-rest','5 16 * * *','select gym_private.auto_rest();');
commit;
