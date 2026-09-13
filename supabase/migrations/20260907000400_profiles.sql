-- Bounded, privacy-filtered profile transport. No phone, precise location or role fields.
create or replace function private.can_view_profile(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (target=auth.uid() or (not private.has_block(auth.uid(),target) and (
    private.connected(auth.uid(),target) or exists(select 1 from public.connection_requests r where
      r.status='pending' and r.expires_at>now() and ((r.sender_id=target and r.recipient_id=auth.uid()) or (r.sender_id=auth.uid() and r.recipient_id=target))) or
    exists(select 1 from public.privacy_settings p where p.user_id=target and
      (p.discoverability='everyone' or (p.discoverability='relevant' and private.matched(target))))
  )));
$$;
create type public.profile_summary as (
  id uuid, display_name text, username text, bio text, coarse_area text, avatar_path text,
  available_today boolean, capabilities text[], languages text[], verified boolean,
  review_count bigint, average_rating numeric
);
create function private.profile_summaries(targets uuid[]) returns setof public.profile_summary
language sql stable security definer set search_path = '' as $$
  select p.id,p.display_name,u.username,p.bio,p.coarse_area,p.avatar_path,p.available_today,
    array(select c.description from public.user_capabilities c where c.user_id=p.id order by c.normalized_term),
    array(select l.language_code from public.profile_languages l where l.user_id=p.id order by l.language_code),
    exists(select 1 from public.verification_status v where v.user_id=p.id and (v.expires_at is null or v.expires_at>now())),
    (select count(*) from public.reviews r where r.subject_id=p.id),
    (select round(avg(r.rating),1) from public.reviews r where r.subject_id=p.id)
  from public.profiles p join public.usernames u on u.user_id=p.id
  where p.id=any(targets) and private.can_view_profile(p.id);
$$;
create function public.get_profile(target uuid) returns setof public.profile_summary
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  return query select * from private.profile_summaries(array[target]);
end;
$$;
create index usernames_prefix_idx on public.usernames(username text_pattern_ops);
create index profiles_name_prefix_idx on public.profiles(lower(display_name) text_pattern_ops);
create function public.search_profiles(query text) returns setof public.profile_summary
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); term text := lower(btrim(query)); targets uuid[];
begin
  perform private.rate_limit('profile_search',60,60);
  term := regexp_replace(term,'^@','');
  if char_length(term)<2 or char_length(term)>60 then return; end if;
  -- Escape pattern metacharacters; search never accepts arbitrary SQL/filter syntax.
  term := replace(replace(replace(term,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');
  select array_agg(s.id) into targets from (
    select p.id from public.profiles p join public.usernames u on u.user_id=p.id
    where p.id<>actor and private.can_view_profile(p.id) and (u.username like term||'%' or lower(p.display_name) like term||'%')
    order by u.username limit 20
  ) s;
  return query select * from private.profile_summaries(targets) order by username;
end;
$$;
create function public.update_profile_preferences(languages text[], available_today boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  perform private.rate_limit('profile_preferences',30,3600);
  if languages is null or cardinality(languages) not between 1 and 8 or exists(select 1 from unnest(languages) l where l is null or l !~ '^[a-z]{2,3}$') or available_today is null then
    raise exception using errcode='22023',message='INVALID'; end if;
  update public.profiles p set available_today=update_profile_preferences.available_today,updated_at=now() where p.id=actor;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  delete from public.profile_languages where user_id=actor;
  insert into public.profile_languages(user_id,language_code) select actor,l from unnest(languages) l on conflict do nothing;
end;
$$;
revoke all on function private.profile_summaries(uuid[]) from public,anon,authenticated;
grant execute on function public.get_profile(uuid),public.search_profiles(text),public.update_profile_preferences(text[],boolean) to authenticated;

-- Client may reserve an upload, but only the authenticated image-processing endpoint writes objects.
create table public.avatar_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index avatar_uploads_owner_idx on public.avatar_uploads(user_id,created_at);
alter table public.avatar_uploads enable row level security;
revoke all on public.avatar_uploads from public,anon,authenticated;
grant select on public.avatar_uploads to authenticated;
grant all on public.avatar_uploads to service_role;
create policy avatar_upload_own on public.avatar_uploads for select to authenticated using(user_id=(select auth.uid()));
create function public.reserve_avatar() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); result uuid;
begin
  perform private.rate_limit('avatar',10,3600);
  insert into public.avatar_uploads(user_id) values(actor) returning id into result;
  return result;
end;
$$;
create function public.complete_avatar(actor uuid, reservation uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare old_path text; new_path text := actor::text||'/'||reservation::text||'.jpg';
begin
  select avatar_path into old_path from public.profiles where id=actor for update;
  if not found or not exists(select 1 from public.avatar_uploads where id=reservation and user_id=actor and completed_at is null and created_at>now()-interval '10 minutes') or
    not exists(select 1 from storage.objects where bucket_id='avatars' and name=new_path) then
    raise exception using errcode='42501',message='FORBIDDEN'; end if;
  update public.profiles set avatar_path=new_path,updated_at=now() where id=actor;
  update public.avatar_uploads set completed_at=now() where id=reservation;
  return old_path;
end;
$$;
grant execute on function public.reserve_avatar() to authenticated;
revoke all on function public.complete_avatar(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_avatar(uuid,uuid) to service_role;
