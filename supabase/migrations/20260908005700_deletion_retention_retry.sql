-- Never purge the locator for an orphan whose cleanup is still failing.
create or replace function public.deletion_retention_objects() returns table(job_id uuid,bucket text,object_path text)
language sql stable security definer set search_path='' as $$
 select j.id,o.bucket_id,o.name from private.account_deletion_jobs j join storage.objects o on o.bucket_id in('avatars','chat-media') and (o.owner_id=j.user_id::text or o.name like j.user_id::text||'/%')
 where j.status='complete' and j.user_id is not null order by j.completed_at,o.bucket_id,o.name limit 100;
$$;
create or replace function public.purge_deletion_receipts() returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Purge identifying cleanup metadata after the post-deletion late-upload sweep window.
 delete from private.account_deletion_objects o using private.account_deletion_jobs j where o.job_id=j.id and j.status='complete' and j.completed_at<now()-interval '7 days' and not exists(select 1 from storage.objects s where s.bucket_id in('avatars','chat-media') and (s.owner_id=j.user_id::text or s.name like j.user_id::text||'/%'));
 update private.account_deletion_jobs set user_id=null where status='complete' and completed_at<now()-interval '7 days' and user_id is not null and not exists(select 1 from storage.objects s where s.bucket_id in('avatars','chat-media') and (s.owner_id=private.account_deletion_jobs.user_id::text or s.name like private.account_deletion_jobs.user_id::text||'/%'));
 delete from private.account_deletion_jobs where status='complete' and completed_at<now()-interval '30 days' and user_id is null;
end;
$$;

alter table private.account_deletion_jobs drop column audited_at;
