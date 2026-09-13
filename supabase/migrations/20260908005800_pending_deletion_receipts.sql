-- A delayed cleanup must not turn an accepted request into an apparent non-submission.
create or replace function public.deletion_receipt_status(receipt_hash text) returns text
language sql stable security definer set search_path='' as $$
 select case when j.status='complete' then 'deleted' else 'processing' end
 from private.account_deletion_receipts r join private.account_deletion_jobs j on j.id=r.job_id
 where r.receipt_hash=deletion_receipt_status.receipt_hash
 and (j.status<>'complete' or j.completed_at>now()-interval '30 days');
$$;
