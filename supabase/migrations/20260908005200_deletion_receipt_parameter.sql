-- Resolve argument/unique-index ambiguity detected by database lint.
create or replace function public.begin_account_deletion(receipt_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); job uuid;
begin
 -- Repeated deletion requests remain allowed while ordinary application mutations are frozen.
 if not private.session_active() then raise exception using errcode='42501',message='UNAUTHORIZED';end if;
 if receipt_hash is null or receipt_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('delete:'||actor::text,0));
 insert into private.account_deletion_jobs(user_id) values(actor) on conflict(user_id) do update set next_attempt_at=least(private.account_deletion_jobs.next_attempt_at,now()) returning id into job;
 if (select count(*) from private.account_deletion_receipts r where r.job_id=job)>=10 and not exists(select 1 from private.account_deletion_receipts r where r.job_id=job and r.receipt_hash=begin_account_deletion.receipt_hash) then raise exception using errcode='P0001',message='RATE_LIMITED';end if;
 insert into private.account_deletion_receipts(job_id,receipt_hash) values(job,begin_account_deletion.receipt_hash) on conflict on constraint account_deletion_receipts_receipt_hash_key do nothing;
 if not exists(select 1 from private.account_deletion_receipts r where r.job_id=job and r.receipt_hash=begin_account_deletion.receipt_hash) then raise exception using errcode='23505',message='CONFLICT';end if;
 insert into public.account_deletion_requests(user_id,status) values(actor,'processing') on conflict(user_id) do update set status='processing',error_code=null,updated_at=now();
 update public.privacy_settings set discoverability='nobody',phone_visibility='nobody',updated_at=now() where user_id=actor;
 update public.matching_requests set status='paused',updated_at=now() where user_id=actor and status='active';
 update public.connection_requests set status='cancelled' where status='pending' and actor in(sender_id,recipient_id);
 update public.push_tokens set disabled_at=now(),updated_at=now() where user_id=actor;
 -- Queue room eviction before any foreign key can null the participants' identities.
 update public.call_sessions set status='ended',ended_at=now() where status in('ringing','accepted') and actor in(caller_id,recipient_id);
 return job;
end;
$$;
