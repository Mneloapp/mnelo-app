create function public.active_call_rooms() returns table(id uuid,caller_id uuid,recipient_id uuid)
language sql stable security definer set search_path='' as $$
 select id,caller_id,recipient_id from public.call_sessions where status='accepted' and room_ready order by coalesce(caller_seen_at,created_at),id limit 100;
$$;
create function public.observe_call_participants(call uuid,identities uuid[]) returns void
language sql security definer set search_path='' as $$
 update public.call_sessions set caller_seen_at=case when caller_id=any(identities) then now() else caller_seen_at end,recipient_seen_at=case when recipient_id=any(identities) then now() else recipient_seen_at end where id=call and status='accepted';
$$;
revoke all on function public.active_call_rooms(),public.observe_call_participants(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.active_call_rooms(),public.observe_call_participants(uuid,uuid[]) to service_role;
-- Incoming notification must not precede successful room setup.
create or replace function private.push_target(event private.notification_outbox) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare prefs public.notification_preferences; result uuid;
begin
 if event.expires_at<=now() then return null;end if;
 select * into prefs from public.notification_preferences where user_id=event.user_id;
 if event.event_type='message' and prefs.messages then
  select m.conversation_id into result from public.messages m join public.conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=event.user_id
  where m.id=event.entity_id and m.deleted_at is null and m.sender_id<>event.user_id and private.push_conversation_allowed(event.user_id,m.conversation_id)
  and (m.created_at,m.id)>(cm.last_read_at,coalesce(cm.last_read_message_id,'00000000-0000-0000-0000-000000000000'::uuid));
 elsif event.event_type in('request','accepted') and prefs.requests then
  select r.id into result from public.connection_requests r where r.id=event.entity_id and not private.has_block(r.sender_id,r.recipient_id)
  and ((event.event_type='request' and r.recipient_id=event.user_id and r.status='pending' and r.expires_at>now()) or (event.event_type='accepted' and r.sender_id=event.user_id and r.status='accepted'));
 elsif event.event_type='match' and prefs.matches then
  select r.id into result from public.matching_requests r where r.id=event.entity_id and r.user_id=event.user_id and r.status='active'
  and exists(select 1 from public.matching_candidates c where c.request_id=r.id and private.match_candidate_current_for(event.user_id,c.id));
 elsif event.event_type='call' and prefs.calls then
  select c.id into result from public.call_sessions c where c.id=event.entity_id and c.recipient_id=event.user_id and c.status='ringing' and c.room_ready and c.expires_at>now() and private.push_conversation_allowed(event.user_id,c.conversation_id);
 end if;
 return result;
end;
$$;
