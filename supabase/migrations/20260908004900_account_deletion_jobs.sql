-- Durable deletion state is private and survives removal of the Auth/profile row.
create table private.account_deletion_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid unique,
 status text not null default 'queued' check(status in('queued','processing','retry','complete')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz,
 error_code text check(error_code in('RETRY_REQUIRED'))
);
create table private.account_deletion_receipts (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references private.account_deletion_jobs(id) on delete cascade,
 receipt_hash text not null unique check(receipt_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now()
);
create table private.account_deletion_objects (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references private.account_deletion_jobs(id) on delete cascade,
 bucket text not null check(bucket in('avatars','chat-media')),
 object_path text not null check(char_length(object_path) between 1 and 1024),
 removed_at timestamptz,
 unique(job_id,bucket,object_path)
);
alter table private.account_deletion_jobs enable row level security;
alter table private.account_deletion_receipts enable row level security;
alter table private.account_deletion_objects enable row level security;
revoke all on private.account_deletion_jobs,private.account_deletion_receipts,private.account_deletion_objects from public,anon,authenticated;
create index deletion_work_idx on private.account_deletion_jobs(next_attempt_at) where status<>'complete';
create index deletion_objects_pending on private.account_deletion_objects(job_id,id) where removed_at is null;
create function private.account_closing(actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.account_deletion_jobs where user_id=actor and status<>'complete');
$$;
create or replace function private.require_user() returns uuid
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.session_active() then raise exception using errcode='42501',message='UNAUTHORIZED';end if;
 if private.account_closing(auth.uid()) then raise exception using errcode='42501',message='ACCOUNT_DELETING';end if;
 return auth.uid();
end;
$$;
create function public.begin_account_deletion(receipt_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); job uuid;
begin
 -- Repeated deletion requests remain allowed while ordinary application mutations are frozen.
 if not private.session_active() then raise exception using errcode='42501',message='UNAUTHORIZED';end if;
 if receipt_hash is null or receipt_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('delete:'||actor::text,0));
 insert into private.account_deletion_jobs(user_id) values(actor) on conflict(user_id) do update set next_attempt_at=least(private.account_deletion_jobs.next_attempt_at,now()) returning id into job;
 if (select count(*) from private.account_deletion_receipts r where r.job_id=job)>=10 and not exists(select 1 from private.account_deletion_receipts r where r.job_id=job and r.receipt_hash=begin_account_deletion.receipt_hash) then raise exception using errcode='P0001',message='RATE_LIMITED';end if;
 insert into private.account_deletion_receipts(job_id,receipt_hash) values(job,receipt_hash) on conflict(receipt_hash) do nothing;
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
grant execute on function public.begin_account_deletion(text) to authenticated;
create function public.deletion_receipt_status(receipt_hash text) returns text
language sql stable security definer set search_path='' as $$
 select case when j.status='complete' then 'deleted' else 'processing' end from private.account_deletion_receipts r join private.account_deletion_jobs j on j.id=r.job_id where r.receipt_hash=deletion_receipt_status.receipt_hash and r.created_at>now()-interval '30 days';
$$;
create function public.claim_account_deletion() returns table(id uuid,user_id uuid,lease uuid)
language plpgsql security definer set search_path='' as $$
declare item private.account_deletion_jobs; lock_id uuid;
begin
 select * into item from private.account_deletion_jobs where status<>'complete' and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by created_at limit 1 for update skip locked;
 if not found then return;end if;
 lock_id:=gen_random_uuid();
 update private.account_deletion_jobs set status='processing',attempts=attempts+1,lease_id=lock_id,lease_until=now()+interval '2 minutes',updated_at=now() where private.account_deletion_jobs.id=item.id;
 return query select item.id,item.user_id,lock_id;
end;
$$;
create function public.prepare_account_deletion(job uuid,lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid; changed integer; group_id uuid; successor uuid;
begin
 select user_id into actor from private.account_deletion_jobs where id=job and lease_id=lease and lease_until>now() for update;
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 -- Bounded tombstoning: keep conversation ordering while removing authored payloads.
 with selected as (select id from public.messages where sender_id=actor and deleted_at is null order by id limit 1000 for update)
 update public.messages set body='',deleted_at=now(),attachment_id=null from selected where public.messages.id=selected.id;
 get diagnostics changed=row_count;
 delete from public.message_locations l using public.messages m where l.message_id=m.id and m.sender_id=actor;
 delete from public.message_contacts c using public.messages m where c.message_id=m.id and m.sender_id=actor;
 delete from public.message_reactions where user_id=actor;
 -- Ownership is captured while rows still exist, including unfinished/replaced uploads.
 insert into private.account_deletion_objects(job_id,bucket,object_path)
 select job,o.bucket_id,o.name from storage.objects o where o.bucket_id in('avatars','chat-media') and (o.owner_id=actor::text or o.name like actor::text||'/%')
 on conflict(job_id,bucket,object_path) do update set removed_at=null;
 insert into private.account_deletion_objects(job_id,bucket,object_path)
 select job,'chat-media',a.object_path from public.message_attachments a where a.user_id=actor
 on conflict(job_id,bucket,object_path) do nothing;
 insert into private.account_deletion_objects(job_id,bucket,object_path)
 select job,'avatars',actor::text||'/'||a.id::text||'.jpg' from public.avatar_uploads a where a.user_id=actor
 on conflict(job_id,bucket,object_path) do nothing;
 -- Preserve functioning groups after the last administrator leaves.
 for group_id in select c.id from public.conversations c join public.conversation_members m on m.conversation_id=c.id where c.kind='group' and m.user_id=actor and m.left_at is null order by c.id for update of c loop
  update public.conversation_members set left_at=now() where conversation_id=group_id and user_id=actor;
  if not exists(select 1 from public.conversation_members where conversation_id=group_id and left_at is null and role='admin') then
   select user_id into successor from public.conversation_members where conversation_id=group_id and left_at is null and not private.account_closing(user_id) order by joined_at,user_id limit 1;
   update public.conversation_members set role='admin' where conversation_id=group_id and user_id=successor;
  end if;
  update public.conversations set updated_at=now() where id=group_id;
 end loop;
 return changed<1000;
end;
$$;
create function public.deletion_objects(job uuid,lease uuid) returns table(id uuid,bucket text,object_path text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from private.account_deletion_jobs where private.account_deletion_jobs.id=job and lease_id=lease and lease_until>now()) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return query select o.id,o.bucket,o.object_path from private.account_deletion_objects o where o.job_id=job and removed_at is null order by o.id limit 100;
end;
$$;
create function public.mark_deletion_objects(job uuid,lease uuid,objects uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.account_deletion_jobs where id=job and lease_id=lease and lease_until>now()) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 update private.account_deletion_objects set removed_at=now() where job_id=job and id=any(objects);
end;
$$;
create function public.finish_account_deletion(job uuid,lease uuid,completed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 select user_id into actor from private.account_deletion_jobs where id=job and lease_id=lease and lease_until>now() for update;
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if completed and (exists(select 1 from auth.users where id=actor) or exists(select 1 from private.account_deletion_objects where job_id=job and removed_at is null)) then raise exception using errcode='42501',message='NOT_COMPLETE';end if;
 update private.account_deletion_jobs set status=case when completed then 'complete' else 'retry' end,completed_at=case when completed then now() else null end,error_code=case when completed then null else 'RETRY_REQUIRED' end,lease_id=null,lease_until=null,next_attempt_at=now()+interval '20 seconds',updated_at=now() where id=job;
 if not completed then update public.account_deletion_requests set status='failed',error_code='RETRY_REQUIRED',updated_at=now() where user_id=actor;end if;
end;
$$;
revoke all on function public.deletion_receipt_status(text),public.claim_account_deletion(),public.prepare_account_deletion(uuid,uuid),public.deletion_objects(uuid,uuid),public.mark_deletion_objects(uuid,uuid,uuid[]),public.finish_account_deletion(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.deletion_receipt_status(text),public.claim_account_deletion(),public.prepare_account_deletion(uuid,uuid),public.deletion_objects(uuid,uuid),public.mark_deletion_objects(uuid,uuid,uuid[]),public.finish_account_deletion(uuid,uuid,boolean) to service_role;
