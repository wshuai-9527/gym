-- READ ONLY, still provided for user review. Execute before any migration.
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('training_days','training_sets','gym_documents','gym_mutations')
order by table_name,ordinal_position;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in ('training_days','training_sets','gym_documents','gym_mutations');
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
and tablename in ('training_days','training_sets','gym_documents','gym_mutations');
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('training_days','training_sets');
select extname,extversion from pg_extension where extname in ('pg_cron','pgcrypto');
-- Only aggregate counts; no credentials or individual training data.
select count(*) as duplicate_date_groups from
(select user_id,training_date from public.training_days group by user_id,training_date having count(*)>1) d;
select count(*) as orphan_sets from public.training_sets s left join public.training_days d on d.id=s.day_id where d.id is null;
select count(*) as owner_mismatches from public.training_sets s join public.training_days d on d.id=s.day_id where s.user_id is distinct from d.user_id;
