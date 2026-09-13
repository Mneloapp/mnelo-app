alter table public.call_sessions add column client_id uuid not null default gen_random_uuid();
alter table public.call_sessions add column caller_session_id uuid references auth.sessions(id) on delete set null;
alter table public.call_sessions add column recipient_session_id uuid references auth.sessions(id) on delete set null;
alter table public.call_sessions add column room_ready boolean not null default false;
alter table public.call_sessions add column caller_seen_at timestamptz;
alter table public.call_sessions add column recipient_seen_at timestamptz;
alter table public.call_sessions add constraint call_client_key unique(caller_id,client_id);
revoke select on public.call_sessions from authenticated;
grant select(id,conversation_id,caller_id,recipient_id,media,status,created_at,expires_at,accepted_at,ended_at) on public.call_sessions to authenticated;
create index call_active_idx on public.call_sessions(status,expires_at) where status in('ringing','accepted');
alter table public.messages add column call_session_id uuid unique references public.call_sessions(id) on delete set null;
create table private.call_room_cleanup (
 id uuid primary key default gen_random_uuid(),
 call_id uuid not null unique,
 caller_id uuid,
 recipient_id uuid,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz
);
alter table private.call_room_cleanup enable row level security;
revoke all on private.call_room_cleanup from public,anon,authenticated;
create index call_cleanup_pending on private.call_room_cleanup(created_at) where completed_at is null;
create function private.call_terminal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  insert into private.call_room_cleanup(call_id,caller_id,recipient_id) values(old.id,old.caller_id,old.recipient_id) on conflict(call_id) do update set completed_at=null;
  return old;
 end if;
 if new.status not in('ringing','accepted') and old.status in('ringing','accepted') then
  insert into private.call_room_cleanup(call_id,caller_id,recipient_id) values(new.id,new.caller_id,new.recipient_id) on conflict(call_id) do update set completed_at=null;
  insert into public.messages(conversation_id,sender_id,client_id,kind,body,call_session_id)
  values(new.conversation_id,new.caller_id,gen_random_uuid(),'call',new.media||':'||new.status,new.id) on conflict(call_session_id) do nothing;
 end if;
 return new;
end;
$$;
create trigger call_terminal after update of status on public.call_sessions for each row execute function private.call_terminal();
create trigger call_deleted before delete on public.call_sessions for each row execute function private.call_terminal();
create function public.start_call(conversation uuid,media text,client_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); session uuid:=private.current_session(); target uuid; existing public.call_sessions; person uuid; result uuid;
begin
 if media is null or media not in('voice','video') or client_id is null then raise exception using errcode='22023',message='INVALID';end if;
 if not private.can_read_conversation(conversation) or not exists(select 1 from public.conversations where id=conversation and kind='direct') then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select user_id into target from public.conversation_members where conversation_id=conversation and left_at is null and user_id<>actor;
 if target is null or not private.connected(actor,target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.lock_pair(actor,target);
 for person in select x from unnest(array[actor,target]) x order by x loop perform pg_advisory_xact_lock(hashtextextended('call:'||person::text,0));end loop;
 if private.has_block(actor,target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select * into existing from public.call_sessions c where c.caller_id=actor and c.client_id=start_call.client_id;
 if found then
  if existing.conversation_id<>conversation or existing.media<>media or existing.caller_session_id<>session then raise exception using errcode='23505',message='CONFLICT';end if;
  return existing.id;
 end if;
 update public.call_sessions c set status='missed',ended_at=now() where c.status='ringing' and c.expires_at<=now() and (actor in(c.caller_id,c.recipient_id) or target in(c.caller_id,c.recipient_id));
 if exists(select 1 from public.call_sessions c where c.status in('ringing','accepted') and (actor in(c.caller_id,c.recipient_id) or target in(c.caller_id,c.recipient_id))) then raise exception using errcode='23505',message='CONFLICT';end if;
 perform private.rate_limit('call_short',3,60);perform private.rate_limit('call',20,3600);
 insert into public.call_sessions(conversation_id,caller_id,recipient_id,caller_session_id,client_id,media,caller_seen_at)
 values(conversation,actor,target,session,client_id,media,now()) returning id into result;
 return result;
end;
$$;
create function public.respond_call(call uuid,action text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); session uuid:=private.current_session(); item public.call_sessions;
begin
 select * into item from public.call_sessions where id=call for update;
 if not found or actor not in(item.caller_id,item.recipient_id) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if action is null or action not in('accept','decline','end','failed') then raise exception using errcode='22023',message='INVALID';end if;
 if item.status not in('ringing','accepted') then return;end if;
 if action='accept' then
  if actor<>item.recipient_id or not private.can_read_conversation(item.conversation_id) or not item.room_ready then raise exception using errcode='42501',message='FORBIDDEN';end if;
  if item.status='accepted' then
   if item.recipient_session_id<>session then raise exception using errcode='23505',message='CONFLICT';end if;return;
  end if;
  if item.expires_at<=now() then raise exception using errcode='22023',message='EXPIRED';end if;
  update public.call_sessions set status='accepted',accepted_at=now(),recipient_session_id=session,recipient_seen_at=now(),caller_seen_at=now() where id=call;
 elsif action='decline' then
  if actor<>item.recipient_id or item.status<>'ringing' then raise exception using errcode='42501',message='FORBIDDEN';end if;
  update public.call_sessions set status='declined',ended_at=now() where id=call;
 else
  if (actor=item.caller_id and item.caller_session_id<>session) or (actor=item.recipient_id and item.recipient_session_id is distinct from session) then raise exception using errcode='42501',message='FORBIDDEN';end if;
  update public.call_sessions set status=case when action='failed' then 'failed' else 'ended' end,ended_at=now() where id=call;
 end if;
end;
$$;
create function public.get_call(call uuid) returns table(id uuid,conversation_id uuid,peer_id uuid,peer_name text,media text,status text,incoming boolean,can_join boolean,created_at timestamptz,expires_at timestamptz,accepted_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_user(); session uuid:=private.current_session();
begin
 return query select c.id,c.conversation_id,p.id,p.display_name,c.media,c.status,c.recipient_id=actor,
 c.status='accepted' and c.room_ready and ((actor=c.caller_id and c.caller_session_id=session) or (actor=c.recipient_id and c.recipient_session_id=session)),c.created_at,c.expires_at,c.accepted_at
 from public.call_sessions c join public.profiles p on p.id=case when c.caller_id=actor then c.recipient_id else c.caller_id end
 where c.id=call and actor in(c.caller_id,c.recipient_id) and private.can_read_conversation(c.conversation_id);
end;
$$;
create function public.incoming_call() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 return (select c.id from public.call_sessions c where c.recipient_id=actor and c.status='ringing' and c.room_ready and c.expires_at>now() and private.can_read_conversation(c.conversation_id) order by c.created_at desc limit 1);
end;
$$;
create function public.call_token_context(call uuid) returns table(id uuid,actor_id uuid,media text)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); session uuid:=private.current_session(); item public.call_sessions;
begin
 select * into item from public.call_sessions where public.call_sessions.id=call for update;
 if not found or item.status<>'accepted' or not item.room_ready or not private.can_read_conversation(item.conversation_id) or item.accepted_at<now()-interval '2 hours'
 or not ((actor=item.caller_id and item.caller_session_id=session) or (actor=item.recipient_id and item.recipient_session_id=session)) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.rate_limit('call_token',180,3600);
 update public.call_sessions set caller_seen_at=case when actor=item.caller_id then now() else caller_seen_at end,recipient_seen_at=case when actor=item.recipient_id then now() else recipient_seen_at end where public.call_sessions.id=call;
 return query select item.id,actor,item.media;
end;
$$;
create function public.mark_call_room_ready(call uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.call_sessions set room_ready=true where id=call and status='ringing' and expires_at>now();return found;
end;
$$;
create function public.claim_call_cleanup() returns table(id uuid,call_id uuid,caller_id uuid,recipient_id uuid,lease uuid)
language plpgsql security definer set search_path='' as $$
declare item private.call_room_cleanup; lock_id uuid;
begin
 update public.call_sessions c set status=case when status='ringing' then 'missed' else 'ended' end,ended_at=now()
 where c.status in('ringing','accepted') and ((c.status='ringing' and c.expires_at<=now()) or (c.status='accepted' and (c.accepted_at<now()-interval '2 hours' or c.caller_seen_at<now()-interval '90 seconds' or c.recipient_seen_at<now()-interval '90 seconds')))
 or c.status in('ringing','accepted') and (c.caller_session_id is null or not exists(select 1 from auth.sessions s where s.id=c.caller_session_id and (s.not_after is null or s.not_after>now())) or (c.status='accepted' and (c.recipient_session_id is null or not exists(select 1 from auth.sessions s where s.id=c.recipient_session_id and (s.not_after is null or s.not_after>now())))));
 for item in select * from private.call_room_cleanup q where q.completed_at is null and (q.lease_until is null or q.lease_until<now()) order by q.created_at limit 50 for update skip locked loop
  lock_id:=gen_random_uuid();update private.call_room_cleanup q set lease_id=lock_id,lease_until=now()+interval '2 minutes',attempts=attempts+1 where q.id=item.id;
  return query select item.id,item.call_id,item.caller_id,item.recipient_id,lock_id;
 end loop;
end;
$$;
create function public.finish_call_cleanup(work uuid,lease uuid) returns void
language sql security definer set search_path='' as $$
 update private.call_room_cleanup set completed_at=now(),lease_id=null,lease_until=null where id=work and lease_id=lease and lease_until>now();
$$;
grant execute on function public.start_call(uuid,text,uuid),public.respond_call(uuid,text),public.get_call(uuid),public.incoming_call(),public.call_token_context(uuid) to authenticated;
revoke all on function public.mark_call_room_ready(uuid),public.claim_call_cleanup(),public.finish_call_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mark_call_room_ready(uuid),public.claim_call_cleanup(),public.finish_call_cleanup(uuid,uuid) to service_role;
