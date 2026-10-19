-- Authorized PPL-cycle reports and owner-bound background rest notifications.
alter table public.gym_ai_reports drop constraint gym_ai_reports_check;
alter table public.gym_ai_reports add constraint gym_ai_reports_period_order check(period_end>=period_start);
alter table public.gym_ai_reports add column cycle_id text;
create extension if not exists pg_net with schema extensions;
create table public.gym_push_devices (
 user_id uuid not null references auth.users(id) on delete cascade,
 device_id uuid not null, subscription jsonb not null,
 updated_at timestamptz not null default now(), last_status integer,
 primary key(user_id,device_id)
);
alter table public.gym_push_devices enable row level security;
revoke all on public.gym_push_devices from public,anon,authenticated;
grant select on public.gym_push_devices to authenticated;
create policy "owner reads own notification devices" on public.gym_push_devices for select to authenticated using((select auth.uid())=user_id);
create table gym_private.push_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,device_id uuid not null,
 token uuid not null default gen_random_uuid(), due_at timestamptz not null,
 claimed_at timestamptz,attempts integer not null default 0,
 unique(user_id,device_id),foreign key(user_id,device_id) references public.gym_push_devices(user_id,device_id) on delete cascade
);
create index push_jobs_due on gym_private.push_jobs(due_at);
revoke all on gym_private.push_jobs from public,anon,authenticated;
create function public.gym_push_public_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('publicKey',decrypted_secret) from vault.decrypted_secrets where name='gym_push_vapid_public';
$$;
create function public.gym_push_worker_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_object_agg(name,decrypted_secret) from vault.decrypted_secrets where name in ('gym_push_vapid_public','gym_push_vapid_private','gym_push_worker_token');
$$;
revoke all on function public.gym_push_public_config() from public,anon;
grant execute on function public.gym_push_public_config() to authenticated;
revoke all on function public.gym_push_worker_config() from public,anon,authenticated;
grant execute on function public.gym_push_worker_config() to service_role;
create function public.gym_push_enroll(p_device uuid,p_subscription jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();begin
 if u is null then raise exception 'authentication required';end if;
 if p_device is null or octet_length(p_subscription::text)>10000 or coalesce(p_subscription->>'endpoint','') !~ '^https://(web[.]push[.]apple[.]com|fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|[a-z0-9.-]+[.]notify[.]windows[.]com)/' or length(coalesce(p_subscription#>>'{keys,p256dh}',''))<40 or length(coalesce(p_subscription#>>'{keys,auth}',''))<10 then raise exception 'invalid push subscription';end if;
 insert into public.gym_push_devices(user_id,device_id,subscription) values(u,p_device,p_subscription)
 on conflict(user_id,device_id) do update set subscription=excluded.subscription,updated_at=now();return true;
end;$$;
create function public.gym_push_schedule(p_device uuid,p_due timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();t uuid;begin
 if u is null then raise exception 'authentication required';end if;
 if p_due is null then delete from gym_private.push_jobs where user_id=u and device_id=p_device;return jsonb_build_object('cancelled',true);end if;
 if p_due<now() or p_due>now()+interval '30 minutes' then raise exception 'deadline outside rest timer range';end if;
 if not exists(select 1 from public.gym_push_devices where user_id=u and device_id=p_device) then raise exception 'enable notifications on this device first';end if;
 insert into gym_private.push_jobs(user_id,device_id,due_at) values(u,p_device,p_due)
 on conflict(user_id,device_id) do update set due_at=excluded.due_at,token=gen_random_uuid(),claimed_at=null,attempts=0 returning token into t;
 return jsonb_build_object('scheduled',true,'token',t,'due_at',p_due);
end;$$;
revoke all on function public.gym_push_enroll(uuid,jsonb), public.gym_push_schedule(uuid,timestamptz) from public,anon;
grant execute on function public.gym_push_enroll(uuid,jsonb), public.gym_push_schedule(uuid,timestamptz) to authenticated;
create function public.gym_claim_push_jobs() returns jsonb language plpgsql security definer set search_path='' as $$
declare outbox jsonb;begin
 delete from gym_private.push_jobs where due_at<now()-interval '2 minutes';
 with due as(select id from gym_private.push_jobs where due_at<=now() and (claimed_at is null or claimed_at<now()-interval '30 seconds') and attempts<3 order by due_at limit 20 for update skip locked),
 claimed as(update gym_private.push_jobs j set claimed_at=now(),attempts=attempts+1 from due where j.id=due.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'token',j.token,'user_id',j.user_id,'device_id',j.device_id,'subscription',d.subscription)),'[]'::jsonb) into outbox from claimed j join public.gym_push_devices d using(user_id,device_id);return outbox;
end;$$;
create function public.gym_push_job_current(p_id uuid,p_token uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from gym_private.push_jobs where id=p_id and token=p_token and due_at<=now());$$;
create function public.gym_finish_push_job(p_id uuid,p_token uuid,p_status integer) returns void language plpgsql security definer set search_path='' as $$
declare j gym_private.push_jobs;begin
 select * into j from gym_private.push_jobs where id=p_id and token=p_token;if not found then return;end if;
 update public.gym_push_devices set last_status=p_status where user_id=j.user_id and device_id=j.device_id;
 if p_status in (404,410) then delete from public.gym_push_devices where user_id=j.user_id and device_id=j.device_id;
 elsif p_status between 200 and 299 or j.attempts>=3 then delete from gym_private.push_jobs where id=p_id and token=p_token;end if;
end;$$;
revoke all on function public.gym_claim_push_jobs(),public.gym_push_job_current(uuid,uuid),public.gym_finish_push_job(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.gym_claim_push_jobs(),public.gym_push_job_current(uuid,uuid),public.gym_finish_push_job(uuid,uuid,integer) to service_role;
create function gym_private.dispatch_push() returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from gym_private.push_jobs where due_at<=now() and due_at>now()-interval '2 minutes' and (claimed_at is null or claimed_at<now()-interval '30 seconds')) then
 perform net.http_post(url:='https://vmtgtnjaehlslcdvsxru.supabase.co/functions/v1/gym-rest-push',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='gym_push_worker_token')),body:='{}'::jsonb,timeout_milliseconds:=15000);
 end if;
end;$$;
revoke all on function gym_private.dispatch_push() from public,anon,authenticated;
select cron.schedule('gym-rest-push-dispatch','10 seconds','select gym_private.dispatch_push();');
