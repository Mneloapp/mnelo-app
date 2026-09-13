-- Expire the explicit today fact at the next midnight in the submitted valid IANA zone.
drop function public.update_profile_preferences(text[],boolean);
create function public.update_profile_preferences(languages text[], available_today boolean,time_zone text default 'UTC') returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  if time_zone is null or char_length(time_zone)>100 or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=time_zone) then raise exception using errcode='22023',message='INVALID';end if;
  perform private.rate_limit('profile_preferences',30,3600);
  if languages is null or cardinality(languages) not between 1 and 8 or exists(select 1 from unnest(languages) l where l is null or l !~ '^[a-z]{2,3}$') or available_today is null then
    raise exception using errcode='22023',message='INVALID'; end if;
  update public.profiles p set available_today=update_profile_preferences.available_today,
    available_until=case when update_profile_preferences.available_today then (date_trunc('day',now() at time zone time_zone) + interval '1 day') at time zone time_zone else null end,
    updated_at=now() where p.id=actor;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  delete from public.profile_languages where user_id=actor;
  insert into public.profile_languages(user_id,language_code) select actor,l from unnest(languages) l on conflict do nothing;
end;
$$;
revoke all on function public.update_profile_preferences(text[],boolean,text) from public,anon;
grant execute on function public.update_profile_preferences(text[],boolean,text) to authenticated;
