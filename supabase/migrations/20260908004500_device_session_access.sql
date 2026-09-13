-- Auth owns session deletion/refresh revocation. Mnelo adds immediate access checks.
create function private.session_active() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()) and not exists(select 1 from public.devices d where d.auth_session_id=s.id and d.revoked_at is not null));
$$;
revoke all on function private.session_active() from public,anon;
grant execute on function private.session_active() to authenticated;
create or replace function private.require_user() returns uuid
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.session_active() then raise exception using errcode='42501',message='UNAUTHORIZED';end if;
 return auth.uid();
end;
$$;
create function public.session_active() returns boolean
language sql stable security definer set search_path='' as $$ select private.session_active(); $$;
grant execute on function public.session_active() to authenticated;
-- Restrictive policies are ANDed with existing ownership/block policies, never replacing them.
do $$ declare item record;begin
 for item in select tablename from pg_tables where schemaname='public' loop
  execute format('create policy live_session_required on public.%I as restrictive for all to authenticated using((select private.session_active())) with check((select private.session_active()))',item.tablename);
 end loop;
end $$;
create policy mnelo_live_session_required on storage.objects as restrictive for all to authenticated
 using(bucket_id not in('chat-media','avatars') or (select private.session_active()))
 with check(bucket_id not in('chat-media','avatars') or (select private.session_active()));
-- No raw session, token or IP access. Optional metadata is client-reported, not attestation.
revoke select on public.devices from authenticated;
create function public.list_devices(before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,label text,platform text,os_version text,created_at timestamptz,last_active_at timestamptz,is_current boolean)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_user(); current_id uuid:=private.current_session();
begin
 return query select s.id,coalesce(d.device_name,''),coalesce(d.platform,''),coalesce(d.os_version,''),s.created_at,coalesce(d.last_active_at,s.updated_at,s.created_at),s.id=current_id
 from auth.sessions s left join public.devices d on d.auth_session_id=s.id
 where s.user_id=actor and (s.not_after is null or s.not_after>now()) and d.revoked_at is null
 and (before_time is null or (s.created_at,s.id)<(before_time,before_id))
 order by s.created_at desc,s.id desc limit 20;
end;
$$;
grant execute on function public.list_devices(timestamptz,uuid) to authenticated;
-- These two earlier definer RPCs used only membership; require a live session as well.
create or replace function public.get_messages(conversation uuid,before_time timestamptz default null,before_id uuid default null) returns setof public.messages
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_user();
 if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return query select m.* from public.messages m where m.conversation_id=conversation and (before_time is null or (m.created_at,m.id)<(before_time,before_id)) order by m.created_at desc,m.id desc limit 40;
end;
$$;

create or replace function public.forward_structured_message(source uuid,destination uuid,client_id uuid) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare m public.messages; point public.message_locations; contact public.message_contacts;
begin
  perform private.require_user();
  if not private.can_read_message(source) then raise exception using errcode='42501',message='FORBIDDEN';end if;
  select * into m from public.messages where id=source and deleted_at is null;
  if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
  if m.kind='text' then return public.send_text_message(destination,m.body,client_id);end if;
  if m.kind='location' then select * into point from public.message_locations where message_id=m.id;return public.send_location_message(destination,client_id,point.latitude,point.longitude,point.label);end if;
  if m.kind='contact' then select * into contact from public.message_contacts where message_id=m.id;return public.send_contact_message(destination,client_id,contact.profile_id);end if;
  raise exception using errcode='22023',message='INVALID';
end;
$$;
