-- Session-bound registration; no client can enumerate even its own bearer push tokens.
revoke select on public.push_tokens from authenticated;
create function private.current_session() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_user(); result uuid;
begin
 select s.id into result from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=actor and (s.not_after is null or s.not_after>now());
 if result is null then raise exception using errcode='42501',message='UNAUTHORIZED';end if;
 return result;
end;
$$;
create function public.register_device(device_name text,platform text,os_version text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); session uuid:=private.current_session(); result uuid;
begin
 if device_name is null or char_length(btrim(device_name)) not between 1 and 100 or platform is null or platform not in('ios','android','web') or os_version is null or char_length(os_version)>80 then raise exception using errcode='22023',message='INVALID';end if;
 perform private.rate_limit('device_register',60,3600);
 if exists(select 1 from public.devices d where d.auth_session_id=session and d.revoked_at is not null) then raise exception using errcode='42501',message='UNAUTHORIZED';end if;
 insert into public.devices(user_id,auth_session_id,device_name,platform,os_version) values(actor,session,btrim(device_name),platform,os_version)
 on conflict(auth_session_id) do update set device_name=excluded.device_name,os_version=excluded.os_version,last_active_at=now() returning id into result;
 return result;
end;
$$;
create function public.register_push_token(device uuid,push_token text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); session uuid:=private.current_session(); old public.push_tokens;
begin
 if push_token is null or push_token !~ '^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{20,200}\]$' then raise exception using errcode='22023',message='INVALID';end if;
 if not exists(select 1 from public.devices d where d.id=device and d.user_id=actor and d.auth_session_id=session and d.revoked_at is null and d.platform in('ios','android')) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.rate_limit('push_register',20,3600);
 perform pg_advisory_xact_lock(hashtextextended(push_token,0));
 select * into old from public.push_tokens p where p.token=push_token for update;
 if found and old.device_id<>device then
  -- A token is not proof of ownership. Never steal another live account's token.
  if old.user_id<>actor and old.disabled_at is null and exists(select 1 from public.devices d join auth.sessions s on s.id=d.auth_session_id where d.id=old.device_id and d.revoked_at is null and (s.not_after is null or s.not_after>now())) then raise exception using errcode='23505',message='CONFLICT';end if;
  delete from public.push_tokens where id=old.id;
 end if;
 insert into public.push_tokens(user_id,device_id,token) values(actor,device,push_token)
 on conflict(device_id) do update set token=excluded.token,disabled_at=null,updated_at=now();
end;
$$;
create function public.disable_current_push() returns void
language plpgsql security definer set search_path='' as $$
declare session uuid:=private.current_session();
begin
 update public.push_tokens p set disabled_at=now(),updated_at=now() from public.devices d where d.id=p.device_id and d.auth_session_id=session;
end;
$$;
create function public.update_notification_preferences(messages boolean,requests boolean,matches boolean,calls boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 if messages is null or requests is null or matches is null or calls is null then raise exception using errcode='22023',message='INVALID';end if;
 perform private.rate_limit('notification_preferences',60,3600);
 update public.notification_preferences p set messages=update_notification_preferences.messages,requests=update_notification_preferences.requests,matches=update_notification_preferences.matches,calls=update_notification_preferences.calls,previews=false,updated_at=now() where p.user_id=actor;
end;
$$;
grant execute on function public.register_device(text,text,text),public.register_push_token(uuid,text),public.disable_current_push(),public.update_notification_preferences(boolean,boolean,boolean,boolean) to authenticated;

alter table private.notification_outbox add column expires_at timestamptz not null default now()+interval '1 day';
create table private.push_deliveries (
 id uuid primary key default gen_random_uuid(),
 outbox_id uuid not null references private.notification_outbox(id) on delete cascade,
 token_id uuid not null references public.push_tokens(id) on delete cascade,
 token_version timestamptz not null,
 state text not null default 'pending' check(state in('pending','ticket','provider_received','suppressed','failed')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease_id uuid,
 lease_until timestamptz,
 ticket_id text check(char_length(ticket_id)<=200),
 ticket_at timestamptz,
 error_code text check(error_code in('UNREGISTERED','RETRY','PROVIDER','NO_RECEIPT')),
 unique(outbox_id,token_id)
);
alter table private.push_deliveries enable row level security;
revoke all on private.push_deliveries from public,anon,authenticated;
create index push_deliveries_due_idx on private.push_deliveries(next_attempt_at) where state in('pending','ticket');

create function private.enqueue_notification(recipient uuid,event text,entity uuid,expiry timestamptz) returns void
language sql security definer set search_path='' as $$
 insert into private.notification_outbox(user_id,event_type,entity_id,expires_at) values(recipient,event,entity,expiry) on conflict(user_id,event_type,entity_id) do nothing;
$$;
create function private.notification_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if tg_table_name='messages' then
  if new.deleted_at is null then
   for recipient in select m.user_id from public.conversation_members m where m.conversation_id=new.conversation_id and m.left_at is null and m.user_id<>new.sender_id loop
    perform private.enqueue_notification(recipient,'message',new.id,now()+interval '1 day');
   end loop;
  end if;
 elsif tg_table_name='connection_requests' then
  if tg_op='INSERT' and new.status='pending' then perform private.enqueue_notification(new.recipient_id,'request',new.id,least(new.expires_at,now()+interval '1 day'));
  elsif tg_op='UPDATE' and new.status='accepted' and old.status<>new.status then perform private.enqueue_notification(new.sender_id,'accepted',new.id,now()+interval '1 day');end if;
 elsif tg_table_name='matching_candidates' then
  select user_id into recipient from public.matching_requests where id=new.request_id;
  perform private.enqueue_notification(recipient,'match',new.request_id,new.expires_at);
 elsif tg_table_name='call_sessions' and new.status='ringing' then
  perform private.enqueue_notification(new.recipient_id,'call',new.id,new.expires_at);
 end if;
 return new;
end;
$$;
create trigger message_push after insert on public.messages for each row execute function private.notification_event();
create trigger request_push after insert or update of status on public.connection_requests for each row execute function private.notification_event();
create trigger match_push after insert on public.matching_candidates for each row execute function private.notification_event();
create trigger call_push after insert on public.call_sessions for each row execute function private.notification_event();

-- Service dispatch evaluates current access, not authorization from the enqueue time.
create function private.push_conversation_allowed(actor uuid,conversation uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conversation_members where conversation_id=conversation and user_id=actor and left_at is null)
 and not exists(select 1 from public.conversation_members m where m.conversation_id=conversation and m.left_at is null and private.has_block(actor,m.user_id));
$$;
create function private.push_target(event private.notification_outbox) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare prefs public.notification_preferences; result uuid;
begin
 if event.expires_at<=now() then return null;end if;
 select * into prefs from public.notification_preferences where user_id=event.user_id;
 if event.event_type='message' and prefs.messages then
  select m.conversation_id into result from public.messages m join public.conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=event.user_id
  where m.id=event.entity_id and m.deleted_at is null and m.sender_id<>event.user_id and private.push_conversation_allowed(event.user_id,m.conversation_id)
  and (cm.last_read_at is null or m.created_at>cm.last_read_at);
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
create function public.claim_push_work() returns table(delivery_id uuid,lease uuid,token text,event_type text,target_id uuid,ticket_id text,ttl integer)
language plpgsql security definer set search_path='' as $$
declare event private.notification_outbox; delivery private.push_deliveries; push public.push_tokens; destination uuid; lock_id uuid;
begin
 for event in select * from private.notification_outbox where processed_at is null order by created_at,id limit 100 for update skip locked loop
  if private.push_target(event) is not null then
   insert into private.push_deliveries(outbox_id,token_id,token_version)
   select event.id,p.id,p.updated_at from public.push_tokens p join public.devices d on d.id=p.device_id join auth.sessions s on s.id=d.auth_session_id
   where p.user_id=event.user_id and p.disabled_at is null and d.revoked_at is null and (s.not_after is null or s.not_after>now()) on conflict do nothing;
  end if;
  update private.notification_outbox set processed_at=now() where id=event.id;
 end loop;
 for delivery in select * from private.push_deliveries d where d.state in('pending','ticket') and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<now()) order by d.next_attempt_at,d.id limit 50 for update skip locked loop
  select * into event from private.notification_outbox where id=delivery.outbox_id;
  select p.* into push from public.push_tokens p join public.devices d on d.id=p.device_id join auth.sessions s on s.id=d.auth_session_id where p.id=delivery.token_id and p.disabled_at is null and p.updated_at=delivery.token_version and d.revoked_at is null and (s.not_after is null or s.not_after>now());
  destination:=private.push_target(event);
  if delivery.state='pending' and (push.id is null or destination is null) then
   update private.push_deliveries set state='suppressed' where id=delivery.id;continue;
  end if;
  if delivery.attempts>=8 or (delivery.ticket_at is not null and delivery.ticket_at<now()-interval '23 hours') then
   update private.push_deliveries set state='failed',error_code=case when delivery.state='ticket' then 'NO_RECEIPT' else 'RETRY' end where id=delivery.id;continue;
  end if;
  lock_id:=gen_random_uuid();
  update private.push_deliveries set lease_id=lock_id,lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=delivery.id;
  return query select delivery.id,lock_id,case when delivery.state='pending' then push.token else '' end,event.event_type,destination,delivery.ticket_id,greatest(0,extract(epoch from event.expires_at-now())::integer);
 end loop;
end;
$$;
create function public.finish_push_work(delivery uuid,lease uuid,outcome text,ticket text default null) returns void
language plpgsql security definer set search_path='' as $$
declare item private.push_deliveries;
begin
 if outcome is null or outcome not in('ticket','provider_received','UNREGISTERED','RETRY','PROVIDER','NO_RECEIPT') or (outcome='ticket' and (ticket is null or char_length(ticket) not between 1 and 200)) then raise exception using errcode='22023',message='INVALID';end if;
 select * into item from private.push_deliveries where id=delivery and lease_id=lease and lease_until>now() for update;
 if not found then return;end if;
 if (item.state='pending' and outcome in('provider_received','NO_RECEIPT')) or (item.state='ticket' and outcome='ticket') then raise exception using errcode='22023',message='INVALID';end if;
 if outcome='UNREGISTERED' then update public.push_tokens set disabled_at=now() where id=item.token_id and updated_at=item.token_version;end if;
 update private.push_deliveries set lease_id=null,lease_until=null,
 state=case when outcome='ticket' then 'ticket' when outcome='provider_received' then 'provider_received' when outcome in('UNREGISTERED','PROVIDER') then 'failed' else item.state end,
 ticket_id=case when outcome='ticket' then ticket else item.ticket_id end,
 ticket_at=case when outcome='ticket' then now() else item.ticket_at end,
 attempts=case when outcome='ticket' then 0 else attempts end,
 error_code=case when outcome in('UNREGISTERED','RETRY','PROVIDER','NO_RECEIPT') then outcome else null end,
 next_attempt_at=now()+case when outcome='ticket' or item.state='ticket' then interval '15 minutes' else make_interval(secs=>least(3600,30*power(2,least(item.attempts,7))::integer)) end
 where id=delivery;
end;
$$;
revoke all on function public.claim_push_work(),public.finish_push_work(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_push_work(),public.finish_push_work(uuid,uuid,text,text) to service_role;
