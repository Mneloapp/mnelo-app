-- Deployment activates this job only after server secrets and real delivery tests are configured.
create extension if not exists pg_net;
create extension if not exists pg_cron;
create function private.invoke_account_worker() returns bigint
language plpgsql security definer set search_path='' as $$
declare project_url text; dispatch_credential text; request_id bigint;
begin
 if not exists(select 1 from private.account_deletion_jobs) then return null;end if;
 select decrypted_secret into project_url from vault.decrypted_secrets where name='mnelo_account_project_url';
 select decrypted_secret into dispatch_credential from vault.decrypted_secrets where name='mnelo_account_dispatch_authorization';
 if project_url is null or dispatch_credential is null then return null;end if;
 -- Never forward privileged credentials to an arbitrary URL supplied by a client or migration.
 if project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' or char_length(dispatch_credential) not between 32 and 4096 then raise exception using errcode='22023',message='ACCOUNT_CONFIGURATION_REQUIRED';end if;
 select net.http_post(url:=project_url||'/functions/v1/account-cleanup',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||dispatch_credential),body:='{}'::jsonb,timeout_milliseconds:=110000) into request_id;
 return request_id;
end;
$$;
revoke all on function private.invoke_account_worker() from public,anon,authenticated,service_role;
select cron.schedule('mnelo-account-cleanup','* * * * *','select private.invoke_account_worker()');
select cron.alter_job((select jobid from cron.job where jobname='mnelo-account-cleanup'),active:=false);
