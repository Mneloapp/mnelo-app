-- Separate actor-scoped evidence evaluation from the authenticated-client wrapper.
-- The dispatcher has no end-user JWT; it uses only the outbox recipient assigned by database triggers.
create function private.match_eligible_for(actor uuid,request uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.matching_requests r join public.privacy_settings p on p.user_id=target
 where r.id=request and r.user_id=actor and r.status='active' and target<>r.user_id and p.discoverability<>'nobody'
 and (r.needed_on is null or r.needed_on>=(now() at time zone r.time_zone)::date)
 and not private.has_block(r.user_id,target)
 and (p.request_audience in('everyone','relevant') or private.connected(r.user_id,target) or private.mutual_connection(r.user_id,target))
 and exists(select 1 from private.match_sources(r.id,target)));
$$;
create or replace function private.match_eligible(request uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.match_eligible_for(auth.uid(),request,target);
$$;
create function private.match_candidate_current_for(actor uuid,candidate uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.matching_candidates c where c.id=candidate and c.expires_at>now() and private.match_eligible_for(actor,c.request_id,c.candidate_id)
 and exists(select 1 from public.matching_reasons f where f.candidate_id=c.id and f.signal in('capability','offer','need'))
 and not exists(select 1 from public.matching_reasons f where f.candidate_id=c.id and not private.match_reason_current(f.id)));
$$;
create or replace function private.match_candidate_current(candidate uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.match_candidate_current_for(auth.uid(),candidate);
$$;
revoke all on function private.match_eligible_for(uuid,uuid,uuid),private.match_candidate_current_for(uuid,uuid) from public,anon,authenticated,service_role;
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
  select c.id into result from public.call_sessions c where c.id=event.entity_id and c.recipient_id=event.user_id and c.status='ringing' and c.expires_at>now() and private.push_conversation_allowed(event.user_id,c.conversation_id);
 end if;
 return result;
end;
$$;
