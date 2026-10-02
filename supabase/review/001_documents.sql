-- PROPOSAL ONLY. Do not execute before user approval and live schema audit.
-- Adds isolated V49 storage. Does not alter/delete training_days or training_sets.
begin;
create table public.gym_documents (
 user_id uuid not null references auth.users(id) on delete cascade,
 key text not null check (key ~ '^(record:[0-9]{4}-[0-9]{2}-[0-9]{2}|draft:active|settings:main)$'),
 value jsonb,
 version bigint not null default 1 check(version > 0),
 updated_at timestamptz not null default now(),
 primary key(user_id,key)
);
create table public.gym_mutations (
 user_id uuid not null references auth.users(id) on delete cascade,
 mutation uuid not null,
 key text not null,
 value jsonb,
 expected bigint not null,
 receipt jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,mutation)
);
alter table public.gym_documents enable row level security;
alter table public.gym_mutations enable row level security;
create policy documents_read on public.gym_documents for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.gym_documents,public.gym_mutations from anon,authenticated;
grant select on public.gym_documents to authenticated;
-- Definer is deliberate: writes only through validated, authenticated, atomic RPC.
create function public.gym_apply_document(p_owner uuid,p_key text,p_value jsonb,p_expected bigint,p_mutation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); old public.gym_documents; prior public.gym_mutations; result jsonb;
begin
 if u is null or u is distinct from p_owner then raise exception 'authentication required' using errcode='42501'; end if;
 if p_mutation is null or p_expected is null or p_expected<0 or p_key is null or p_key !~ '^(record:[0-9]{4}-[0-9]{2}-[0-9]{2}|draft:active|settings:main)$' then raise exception 'invalid mutation'; end if;
 if pg_catalog.octet_length(p_value::text)>1048576 then raise exception 'document too large'; end if;
 if p_value is not null and jsonb_typeof(p_value)<>'object' then raise exception 'document must be object or SQL null'; end if;
 if p_key like 'record:%' and p_value is not null then
  if p_value->>'date' is distinct from substr(p_key,8) or jsonb_typeof(p_value->'items') is distinct from 'array' or jsonb_array_length(p_value->'items')=0 then raise exception 'invalid record'; end if;
  perform (substr(p_key,8))::date;
 end if;
 if p_key='draft:active' and p_value is not null then
  if p_value->>'module' not in ('Push','Pull','Legs') or p_value->>'module' is null or jsonb_typeof(p_value->'rows') is distinct from 'object' or p_value->>'date' is null then raise exception 'invalid draft'; end if;
  perform (p_value->>'date')::date;
 end if;
 if p_key='settings:main' and p_value is not null then
  if p_value->>'timezone' is distinct from 'Australia/Brisbane' or jsonb_typeof(p_value->'autoRest') is distinct from 'boolean' or p_value->>'enabledFrom' is null then raise exception 'invalid automation settings'; end if;
  perform (p_value->>'enabledFrom')::date;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,49));
 select * into prior from public.gym_mutations where user_id=u and mutation=p_mutation;
 if found then
  if prior.key<>p_key or prior.expected<>p_expected or prior.value is distinct from p_value then raise exception 'mutation reused with different payload';end if;
  return prior.receipt;
 end if;
 select * into old from public.gym_documents where user_id=u and key=p_key for update;
 if coalesce(old.version,0)<>p_expected then
  return jsonb_build_object('conflict',true,'document',jsonb_build_object('key',p_key,'value',old.value,'version',coalesce(old.version,0)));
 end if;
 insert into public.gym_documents(user_id,key,value,version) values(u,p_key,p_value,p_expected+1)
 on conflict(user_id,key) do update set value=excluded.value,version=excluded.version,updated_at=now();
 result:=jsonb_build_object('conflict',false,'document',jsonb_build_object('key',p_key,'value',p_value,'version',p_expected+1));
 insert into public.gym_mutations(user_id,mutation,key,value,expected,receipt) values(u,p_mutation,p_key,p_value,p_expected,result);
 return result;
end $$;
revoke all on function public.gym_apply_document(uuid,text,jsonb,bigint,uuid) from public,anon;
grant execute on function public.gym_apply_document(uuid,text,jsonb,bigint,uuid) to authenticated;
commit;
