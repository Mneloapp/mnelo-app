-- Timestamp ties follow the same total ordering as messaging read cursors.
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
  and exists(select 1 from public.matching_candidates c where c.request_id=r.id and private.match_candidate_current(c.id));
 elsif event.event_type='call' and prefs.calls then
  select c.id into result from public.call_sessions c where c.id=event.entity_id and c.recipient_id=event.user_id and c.status='ringing' and c.expires_at>now() and private.push_conversation_allowed(event.user_id,c.conversation_id);
 end if;
 return result;
end;
$$;
-- Payload contains only an opaque outbox reference. A tap is resolved by the current account.
create function public.resolve_notification(notification uuid) returns table(event_type text,target_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_user(); event private.notification_outbox; target uuid;
begin
 select * into event from private.notification_outbox where id=notification and user_id=actor;
 if not found then return;end if;
 target:=private.push_target(event);
 -- Reading a message suppresses a pending push, but a previously received tap may still open its authorized chat.
 if event.event_type='message' then
  select m.conversation_id into target from public.messages m where m.id=event.entity_id and m.deleted_at is null and private.push_conversation_allowed(actor,m.conversation_id);
 end if;
 if target is not null then return query select event.event_type,target;end if;
end;
$$;
grant execute on function public.resolve_notification(uuid) to authenticated;
-- Resolve delivery -> outbox without exposing privileged delivery rows to clients.
create function public.push_payload(delivery uuid,lease uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select outbox_id from private.push_deliveries where id=delivery and lease_id=lease and lease_until>now();
$$;
revoke all on function public.push_payload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.push_payload(uuid,uuid) to service_role;
