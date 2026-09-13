create or replace function private.can_view_profile(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not private.account_closing(target) and auth.uid() is not null and (target=auth.uid() or (not private.has_block(auth.uid(),target) and (
    private.connected(auth.uid(),target) or exists(select 1 from public.connection_requests r where
      r.status='pending' and r.expires_at>now() and ((r.sender_id=target and r.recipient_id=auth.uid()) or (r.sender_id=auth.uid() and r.recipient_id=target))) or
    exists(select 1 from public.privacy_settings p where p.user_id=target and
      (p.discoverability='everyone' or (p.discoverability='relevant' and private.matched(target))))
  )));
$$;
create or replace function public.start_call(conversation uuid,media text,client_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); session uuid:=private.current_session(); target uuid; existing public.call_sessions; person uuid; result uuid;
begin
 if media is null or media not in('voice','video') or client_id is null then raise exception using errcode='22023',message='INVALID';end if;
 if not private.can_read_conversation(conversation) or not exists(select 1 from public.conversations where id=conversation and kind='direct') then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select user_id into target from public.conversation_members where conversation_id=conversation and left_at is null and user_id<>actor;
 if target is null or private.account_closing(target) or not private.connected(actor,target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
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
