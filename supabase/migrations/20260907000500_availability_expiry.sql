-- An explicit availability fact expires; it must never silently carry over to future days.
alter table public.profiles add column available_until timestamptz;
create or replace function public.update_profile_preferences(languages text[], available_today boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  perform private.rate_limit('profile_preferences',30,3600);
  if languages is null or cardinality(languages) not between 1 and 8 or exists(select 1 from unnest(languages) l where l is null or l !~ '^[a-z]{2,3}$') or available_today is null then
    raise exception using errcode='22023',message='INVALID'; end if;
  update public.profiles p set available_today=update_profile_preferences.available_today,
    available_until=case when update_profile_preferences.available_today then date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' + interval '1 day' else null end,
    updated_at=now() where p.id=actor;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  delete from public.profile_languages where user_id=actor;
  insert into public.profile_languages(user_id,language_code) select actor,l from unnest(languages) l on conflict do nothing;
end;
$$;
create or replace function private.profile_summaries(targets uuid[]) returns setof public.profile_summary
language sql stable security definer set search_path = '' as $$
  select p.id,p.display_name,u.username,p.bio,p.coarse_area,p.avatar_path,
    (p.available_today and coalesce(p.available_until>now(),false)),
    array(select c.description from public.user_capabilities c where c.user_id=p.id order by c.normalized_term),
    array(select l.language_code from public.profile_languages l where l.user_id=p.id order by l.language_code),
    exists(select 1 from public.verification_status v where v.user_id=p.id and (v.expires_at is null or v.expires_at>now())),
    (select count(*) from public.reviews r where r.subject_id=p.id),
    (select round(avg(r.rating),1) from public.reviews r where r.subject_id=p.id)
  from public.profiles p join public.usernames u on u.user_id=p.id
  where p.id=any(targets) and private.can_view_profile(p.id);
$$;
