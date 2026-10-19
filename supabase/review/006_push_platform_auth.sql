-- Keep Supabase platform JWT verification enabled, plus the private Cron token.
create or replace function gym_private.dispatch_push() returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from gym_private.push_jobs where due_at<=now() and due_at>now()-interval '2 minutes' and (claimed_at is null or claimed_at<now()-interval '30 seconds')) then
 perform net.http_post(url:='https://vmtgtnjaehlslcdvsxru.supabase.co/functions/v1/gym-rest-push',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='gym_push_project_anon_jwt'),'x-gym-worker',(select decrypted_secret from vault.decrypted_secrets where name='gym_push_worker_token')),body:='{}'::jsonb,timeout_milliseconds:=15000);
 end if;
end;$$;
revoke all on function gym_private.dispatch_push() from public,anon,authenticated;
