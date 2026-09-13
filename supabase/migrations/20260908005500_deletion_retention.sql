alter table private.account_deletion_jobs add column audited_at timestamptz;
create function public.deletion_retention_objects() returns table(job_id uuid,bucket text,object_path text)
language sql stable security definer set search_path='' as $$
 select j.id,o.bucket_id,o.name from private.account_deletion_jobs j join storage.objects o on o.bucket_id in('avatars','chat-media') and (o.owner_id=j.user_id::text or o.name like j.user_id::text||'/%')
 where j.status='complete' and j.completed_at>now()-interval '7 days' order by j.completed_at,o.bucket_id,o.name limit 100;
$$;
create function public.purge_deletion_receipts() returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Purge identifying cleanup metadata after the post-deletion late-upload sweep window.
 delete from private.account_deletion_objects o using private.account_deletion_jobs j where o.job_id=j.id and j.status='complete' and j.completed_at<now()-interval '7 days';
 update private.account_deletion_jobs set user_id=null where status='complete' and completed_at<now()-interval '7 days' and user_id is not null;
 delete from private.account_deletion_jobs where status='complete' and completed_at<now()-interval '30 days';
end;
$$;
revoke all on function public.deletion_retention_objects(),public.purge_deletion_receipts() from public,anon,authenticated;
grant execute on function public.deletion_retention_objects(),public.purge_deletion_receipts() to service_role;
