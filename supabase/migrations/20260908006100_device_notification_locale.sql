-- Per-device presentation preference only; no new private-data projection.
alter table public.devices add column locale text not null default 'en' check(locale in('en','ka'));
drop function public.register_device(text,text,text);
create function public.register_device(device_name text,platform text,os_version text,locale text default 'en') returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); session uuid:=private.current_session(); result uuid;
begin
 if locale is null or locale not in('en','ka') or device_name is null or char_length(btrim(device_name)) not between 1 and 100 or platform is null or platform not in('ios','android','web') or os_version is null or char_length(os_version)>80 then raise exception using errcode='22023',message='INVALID';end if;
 perform private.rate_limit('device_register',60,3600);
 if exists(select 1 from public.devices d where d.auth_session_id=session and d.revoked_at is not null) then raise exception using errcode='42501',message='UNAUTHORIZED';end if;
 insert into public.devices(user_id,auth_session_id,device_name,platform,os_version,locale) values(actor,session,btrim(device_name),platform,os_version,locale)
 on conflict(auth_session_id) do update set device_name=excluded.device_name,os_version=excluded.os_version,locale=excluded.locale,last_active_at=now() returning id into result;
 return result;
end;
$$;
revoke all on function public.register_device(text,text,text,text) from public,anon;
grant execute on function public.register_device(text,text,text,text) to authenticated;
drop function public.claim_push_work();
create function public.claim_push_work() returns table(delivery_id uuid,lease uuid,token text,event_type text,target_id uuid,ticket_id text,ttl integer,locale text)
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
  return query select delivery.id,lock_id,case when delivery.state='pending' then push.token else '' end,event.event_type,destination,delivery.ticket_id,greatest(0,extract(epoch from event.expires_at-now())::integer),coalesce((select d.locale from public.devices d where d.id=push.device_id),'en');
 end loop;
end;
$$;
revoke all on function public.claim_push_work() from public,anon,authenticated;
grant execute on function public.claim_push_work() to service_role;
