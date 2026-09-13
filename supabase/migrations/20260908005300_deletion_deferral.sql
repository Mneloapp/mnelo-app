create function public.defer_account_deletion(job uuid,lease uuid) returns void
language sql security definer set search_path='' as $$
 update private.account_deletion_jobs set status='queued',lease_id=null,lease_until=null,error_code=null,next_attempt_at=now()+interval '20 seconds',updated_at=now() where id=job and lease_id=lease and lease_until>now();
$$;
revoke all on function public.defer_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.defer_account_deletion(uuid,uuid) to service_role;
