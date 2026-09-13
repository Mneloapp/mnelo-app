-- Helpers are not exposed by PostgREST. All actor identity comes from verified JWT claims.
create function private.has_block(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.blocks where (user_id=a and blocked_user_id=b) or (user_id=b and blocked_user_id=a));
$$;
create function private.connected(a uuid,b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.connections where user_low=least(a,b) and user_high=greatest(a,b));
$$;
create function private.matched(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.matching_candidates c join public.matching_requests r on r.id=c.request_id
  where r.user_id=auth.uid() and r.status='active' and c.candidate_id=target and c.expires_at>now());
$$;
create function private.can_view_profile(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (target=auth.uid() or (
    not private.has_block(auth.uid(),target) and (
      private.connected(auth.uid(),target) or exists(select 1 from public.privacy_settings p where p.user_id=target and
        (p.discoverability='everyone' or (p.discoverability='relevant' and private.matched(target))))
    )));
$$;
create function private.can_read_conversation(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.conversation_members m where m.conversation_id=target and m.user_id=auth.uid() and m.left_at is null)
  and not exists(select 1 from public.conversation_members m where m.conversation_id=target and m.left_at is null and private.has_block(auth.uid(),m.user_id));
$$;
comment on function private.can_read_conversation is 'Conservative shared-group policy: a block suspends the conversation for both affected users while they share active membership. No presence exception.';
create function private.can_read_message(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.messages m where m.id=target and private.can_read_conversation(m.conversation_id));
$$;
create function private.owns_matching_request(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.matching_requests where id=target and user_id=auth.uid());
$$;
create function private.can_read_candidate(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.matching_candidates where id=target and private.owns_matching_request(request_id) and not private.has_block(auth.uid(),candidate_id));
$$;
create function private.owns_connection(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.connections where id=target and auth.uid() in (user_low,user_high) and not private.has_block(user_low,user_high));
$$;
create function private.can_request(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select target<>auth.uid() and private.can_view_profile(target) and not private.has_block(auth.uid(),target) and exists(
    select 1 from public.privacy_settings p where p.user_id=target and (
      p.request_audience='everyone' or private.connected(auth.uid(),target) or
      (p.request_audience='relevant' and private.matched(target)) or
      (p.request_audience='mutual' and exists(
        select 1 from public.connections c join public.connections d
          on (case when c.user_low=auth.uid() then c.user_high else c.user_low end) in (d.user_low,d.user_high)
        where auth.uid() in (c.user_low,c.user_high) and target in (d.user_low,d.user_high)
      ))
    ));
$$;
create function private.lock_pair(a uuid,b uuid) returns void
language sql volatile set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(least(a,b)::text || ':' || greatest(a,b)::text,0));
$$;
create function private.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception using errcode='42501',message='UNAUTHORIZED'; end if;
  return actor;
end;
$$;
create function private.rate_limit(action_name text, max_attempts integer, seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); bucket timestamptz; used integer;
begin
  bucket := to_timestamp(floor(extract(epoch from now()) / seconds) * seconds);
  insert into private.rate_limits(user_id,action,window_start) values(actor,action_name,bucket)
    on conflict(user_id,action,window_start) do update set attempts=private.rate_limits.attempts+1 returning attempts into used;
  if used>max_attempts then raise exception using errcode='P0001',message='RATE_LIMITED'; end if;
end;
$$;

-- Explicit deny by default, including tables containing server-managed records.
do $$ declare item record; begin
  for item in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', item.tablename);
    execute format('revoke all on public.%I from public, anon, authenticated', item.tablename);
    execute format('grant select on public.%I to authenticated', item.tablename);
    execute format('grant all on public.%I to service_role', item.tablename);
  end loop;
  for item in select tablename from pg_tables where schemaname='private' loop
    execute format('alter table private.%I enable row level security', item.tablename);
    execute format('revoke all on private.%I from public, anon, authenticated', item.tablename);
  end loop;
end $$;

create policy profile_visible on public.profiles for select to authenticated using(private.can_view_profile(id));
create policy username_visible on public.usernames for select to authenticated using(private.can_view_profile(user_id));
create policy language_visible on public.profile_languages for select to authenticated using(private.can_view_profile(user_id));
create policy capability_visible on public.user_capabilities for select to authenticated using(private.can_view_profile(user_id));
create policy privacy_own on public.privacy_settings for select to authenticated using(user_id=(select auth.uid()));
create policy blocks_own on public.blocks for select to authenticated using(user_id=(select auth.uid()));
create policy matching_request_own on public.matching_requests for select to authenticated using(user_id=(select auth.uid()));
create policy needs_own on public.user_needs for select to authenticated using(user_id=(select auth.uid()));
create policy offers_own on public.user_offers for select to authenticated using(user_id=(select auth.uid()));
create policy matching_candidate_own on public.matching_candidates for select to authenticated using(private.owns_matching_request(request_id) and not private.has_block(auth.uid(),candidate_id));
create policy matching_reason_own on public.matching_reasons for select to authenticated using(private.can_read_candidate(candidate_id));
create policy request_participant on public.connection_requests for select to authenticated using(auth.uid() in (sender_id,recipient_id) and not private.has_block(sender_id,recipient_id));
create policy connection_participant on public.connections for select to authenticated using(auth.uid() in (user_low,user_high) and not private.has_block(user_low,user_high));
create policy completion_participant on public.connection_completions for select to authenticated using(private.owns_connection(connection_id));
create policy conversation_member on public.conversations for select to authenticated using(private.can_read_conversation(id));
create policy membership_visible on public.conversation_members for select to authenticated using(private.can_read_conversation(conversation_id));
create policy message_member on public.messages for select to authenticated using(private.can_read_conversation(conversation_id));
create policy location_member on public.message_locations for select to authenticated using(private.can_read_message(message_id));
create policy contact_member on public.message_contacts for select to authenticated using(private.can_read_message(message_id) and private.can_view_profile(profile_id));
create policy attachment_member on public.message_attachments for select to authenticated using(private.can_read_conversation(conversation_id) and (status='ready' or user_id=auth.uid()));
create policy reaction_member on public.message_reactions for select to authenticated using(private.can_read_message(message_id));
create policy device_own on public.devices for select to authenticated using(user_id=(select auth.uid()));
create policy push_token_own on public.push_tokens for select to authenticated using(user_id=(select auth.uid()));
create policy notification_own on public.notification_preferences for select to authenticated using(user_id=(select auth.uid()));
create policy call_member on public.call_sessions for select to authenticated using(private.can_read_conversation(conversation_id));
create policy review_visible on public.reviews for select to authenticated using(private.can_view_profile(subject_id));
create policy verification_visible on public.verification_status for select to authenticated using(private.can_view_profile(user_id));
create policy report_own on public.reports for select to authenticated using(reporter_id=(select auth.uid()));
create policy deletion_own on public.account_deletion_requests for select to authenticated using(user_id=(select auth.uid()));
-- reserved_usernames and all private tables intentionally have no client policy.

revoke all on all functions in schema private from public, anon, authenticated;

-- Policy helpers can be evaluated by PostgreSQL, but private is absent from exposed API schemas.
grant usage on schema private to authenticated;
grant execute on function private.has_block(uuid,uuid), private.can_view_profile(uuid), private.can_read_conversation(uuid), private.can_read_message(uuid), private.owns_matching_request(uuid), private.can_read_candidate(uuid), private.owns_connection(uuid) to authenticated;

-- Foundation mutations. Narrow RPC grants prevent writes to server-owned columns.
create function public.save_profile(display_name text, username text, bio text default '', coarse_area text default '', capabilities text[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); requested text := lower(btrim(username));
begin
  perform private.rate_limit('profile',30,3600);
  if requested !~ '^[a-z][a-z0-9_]{2,23}$' or exists(select 1 from public.reserved_usernames r where r.username=requested)
    or cardinality(capabilities)>12 or char_length(coarse_area)>120 then raise exception using errcode='22023',message='INVALID'; end if;
  insert into public.profiles(id,display_name,bio,coarse_area) values(actor,btrim(display_name),bio,btrim(coarse_area))
    on conflict(id) do update set display_name=excluded.display_name,bio=excluded.bio,coarse_area=excluded.coarse_area,updated_at=now();
  insert into public.usernames(user_id,username) values(actor,requested) on conflict(user_id) do update set username=excluded.username;
  insert into public.privacy_settings(user_id) values(actor) on conflict(user_id) do nothing;
  insert into public.notification_preferences(user_id) values(actor) on conflict(user_id) do nothing;
  insert into public.profile_languages(user_id,language_code) values(actor,'en') on conflict do nothing;
  delete from public.user_capabilities where user_id=actor;
  insert into public.user_capabilities(user_id,description,normalized_term)
    select actor,btrim(c),lower(btrim(c)) from unnest(capabilities) c where btrim(c)<>'' on conflict do nothing;
  return actor;
end;
$$;
create function public.update_privacy(discoverability text, phone_visibility text, request_audience text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  update public.privacy_settings p set discoverability=update_privacy.discoverability,phone_visibility=update_privacy.phone_visibility,
    request_audience=update_privacy.request_audience,updated_at=now() where p.user_id=actor;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
end;
$$;
create function public.block_user(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  perform private.rate_limit('block',60,3600);
  perform private.lock_pair(actor,target);
  if target=actor then raise exception using errcode='22023',message='INVALID'; end if;
  insert into public.blocks(user_id,blocked_user_id) values(actor,target) on conflict do nothing;
  update public.connection_requests set status='cancelled',responded_at=now() where status='pending' and
    ((sender_id=actor and recipient_id=target) or (sender_id=target and recipient_id=actor));
end;
$$;
create function public.send_connection_request(target uuid, context text, message text default '', matching_request uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); result uuid;
begin
  perform private.rate_limit('request',20,3600);
  perform private.lock_pair(actor,target);
  if not private.can_request(target) or private.connected(actor,target) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if matching_request is not null and not private.owns_matching_request(matching_request) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  insert into public.connection_requests(sender_id,recipient_id,context,message,matching_request_id)
    values(actor,target,context,message,matching_request) returning id into result;
  return result;
end;
$$;
create function public.respond_connection_request(request uuid, action text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); r public.connection_requests; connection uuid; conversation uuid;
begin
  select * into r from public.connection_requests where id=request;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  perform private.lock_pair(r.sender_id,r.recipient_id);
  select * into r from public.connection_requests where id=request for update;
  if not found or private.has_block(r.sender_id,r.recipient_id) or
    (action='cancel' and actor<>r.sender_id) or (action in ('accept','decline') and actor<>r.recipient_id) or
    action is null or action not in ('accept','decline','cancel') then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if r.status='accepted' and action='accept' then
    select v.id into conversation from public.conversations v join public.connections c on c.id=v.connection_id where c.request_id=r.id;
    return conversation;
  end if;
  if r.status<>'pending' or r.expires_at<=now() then raise exception using errcode='22023',message='EXPIRED'; end if;
  update public.connection_requests set status=case action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end,responded_at=now() where id=r.id;
  if action<>'accept' then return null; end if;
  insert into public.connections(user_low,user_high,request_id,context)
    values(least(r.sender_id,r.recipient_id),greatest(r.sender_id,r.recipient_id),r.id,r.context)
    on conflict(user_low,user_high) do update set request_id=excluded.request_id returning id into connection;
  insert into public.conversations(kind,connection_id,created_by) values('direct',connection,actor)
    on conflict(connection_id) do update set updated_at=now() returning id into conversation;
  insert into public.conversation_members(conversation_id,user_id) values(conversation,r.sender_id),(conversation,r.recipient_id)
    on conflict(conversation_id,user_id) do update set left_at=null;
  return conversation;
end;
$$;

revoke all on function public.save_profile(text,text,text,text,text[]), public.update_privacy(text,text,text), public.block_user(uuid), public.send_connection_request(uuid,text,text,uuid), public.respond_connection_request(uuid,text) from public, anon;
grant execute on function public.save_profile(text,text,text,text,text[]), public.update_privacy(text,text,text), public.block_user(uuid), public.send_connection_request(uuid,text,text,uuid), public.respond_connection_request(uuid,text) to authenticated;

-- Private authenticated Storage. Actual upload reservation/finalization arrives with media.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('chat-media','chat-media',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','audio/mp4','audio/m4a','audio/aac','audio/mpeg','application/octet-stream']),
 ('avatars','avatars',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy chat_object_read on storage.objects for select to authenticated using(bucket_id='chat-media' and exists(
  select 1 from public.message_attachments a where a.object_path=name and a.status='ready' and private.can_read_conversation(a.conversation_id)));
create policy avatar_object_read on storage.objects for select to authenticated using(bucket_id='avatars' and exists(
  select 1 from public.profiles p where p.avatar_path=name and private.can_view_profile(p.id)));
-- No upload policy yet: unreserved client objects are denied, never public by default.
create policy conversation_topic_read on realtime.messages for select to authenticated using(
  realtime.topic() ~ '^conversation:[0-9a-f-]{36}$' and
  private.can_read_conversation(case when realtime.topic() ~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then substring(realtime.topic() from 14)::uuid else null end));
-- Clients never receive a broadcast/presence write policy. Messages use persisted row changes with RLS.
alter publication supabase_realtime add table public.messages,public.message_reactions,public.conversation_members,public.connection_requests,public.call_sessions;
