-- A permission refresh with the same token must not invalidate pending deliveries.
create or replace function public.register_push_token(device uuid,push_token text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); session uuid:=private.current_session(); old public.push_tokens;
begin
 if push_token is null or push_token !~ '^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{20,200}\]$' then raise exception using errcode='22023',message='INVALID';end if;
 if not exists(select 1 from public.devices d where d.id=device and d.user_id=actor and d.auth_session_id=session and d.revoked_at is null and d.platform in('ios','android')) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.rate_limit('push_register',20,3600);
 perform pg_advisory_xact_lock(hashtextextended(push_token,0));
 select * into old from public.push_tokens p where p.token=push_token for update;
 if found and old.device_id<>device then
  if old.user_id<>actor and old.disabled_at is null and exists(select 1 from public.devices d join auth.sessions s on s.id=d.auth_session_id where d.id=old.device_id and d.revoked_at is null and (s.not_after is null or s.not_after>now())) then raise exception using errcode='23505',message='CONFLICT';end if;
  delete from public.push_tokens where id=old.id;
 end if;
 insert into public.push_tokens(user_id,device_id,token) values(actor,device,push_token)
 on conflict(device_id) do update set token=excluded.token,disabled_at=null,updated_at=now()
 where public.push_tokens.token<>excluded.token or public.push_tokens.disabled_at is not null;
end;
$$;
-- Check again immediately before transport. Revocation cannot recall an already submitted push.
create or replace function public.push_payload(delivery uuid,lease uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select d.outbox_id from private.push_deliveries d join private.notification_outbox o on o.id=d.outbox_id
 join public.push_tokens p on p.id=d.token_id join public.devices v on v.id=p.device_id join auth.sessions s on s.id=v.auth_session_id
 where d.id=delivery and d.lease_id=lease and d.lease_until>now() and d.state='pending'
 and p.disabled_at is null and p.updated_at=d.token_version and v.revoked_at is null and (s.not_after is null or s.not_after>now()) and private.push_target(o) is not null;
$$;
