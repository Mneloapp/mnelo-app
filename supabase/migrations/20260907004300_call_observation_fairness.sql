-- Reconcile the oldest observation first; an unobserved room is not evidence of absence.
alter table public.call_sessions add column observed_at timestamptz;
create index call_observation_idx on public.call_sessions(observed_at nulls first,id) where status='accepted' and room_ready;
create or replace function public.active_call_rooms() returns table(id uuid,caller_id uuid,recipient_id uuid)
language sql stable security definer set search_path='' as $$
 select id,caller_id,recipient_id from public.call_sessions where status='accepted' and room_ready order by observed_at nulls first,id limit 100;
$$;
create or replace function public.observe_call_participants(call uuid,identities uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.call_sessions set observed_at=now(),caller_seen_at=case when caller_id=any(identities) then now() else caller_seen_at end,recipient_seen_at=case when recipient_id=any(identities) then now() else recipient_seen_at end where id=call and status='accepted';
 update public.call_sessions set status='ended',ended_at=now() where id=call and status='accepted' and (caller_seen_at<now()-interval '90 seconds' or recipient_seen_at<now()-interval '90 seconds');
end;
$$;
create or replace function public.claim_call_cleanup() returns table(id uuid,call_id uuid,caller_id uuid,recipient_id uuid,lease uuid)
language plpgsql security definer set search_path='' as $$
declare item private.call_room_cleanup; lock_id uuid;
begin
 update public.call_sessions c set status=case when status='ringing' then 'missed' else 'ended' end,ended_at=now()
 where c.status in('ringing','accepted') and ((c.status='ringing' and c.expires_at<=now()) or (c.status='accepted' and (c.accepted_at<now()-interval '2 hours')))
 or c.status in('ringing','accepted') and (c.caller_session_id is null or not exists(select 1 from auth.sessions s where s.id=c.caller_session_id and (s.not_after is null or s.not_after>now())) or (c.status='accepted' and (c.recipient_session_id is null or not exists(select 1 from auth.sessions s where s.id=c.recipient_session_id and (s.not_after is null or s.not_after>now())))));
 for item in select * from private.call_room_cleanup q where q.completed_at is null and (q.lease_until is null or q.lease_until<now()) order by q.created_at limit 50 for update skip locked loop
  lock_id:=gen_random_uuid();update private.call_room_cleanup q set lease_id=lock_id,lease_until=now()+interval '2 minutes',attempts=attempts+1 where q.id=item.id;
  return query select item.id,item.call_id,item.caller_id,item.recipient_id,lock_id;
 end loop;
end;
$$;
