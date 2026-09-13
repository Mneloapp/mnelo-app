-- Discovery must use the bounded, rate-limited projections rather than raw table scans.
create policy profile_raw_owner on public.profiles as restrictive for select to authenticated using(id=(select auth.uid()));
create policy username_raw_owner on public.usernames as restrictive for select to authenticated using(user_id=(select auth.uid()));
create policy capability_raw_owner on public.user_capabilities as restrictive for select to authenticated using(user_id=(select auth.uid()));
create policy language_raw_owner on public.profile_languages as restrictive for select to authenticated using(user_id=(select auth.uid()));
revoke select on public.verification_status from authenticated;
create or replace function public.get_profile(target uuid) returns setof public.profile_summary
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_user();
 if target is distinct from auth.uid() then perform private.rate_limit('profile_read',120,60);end if;
 return query select * from private.profile_summaries(array[target]);
end;
$$;
create or replace function public.get_profile_intents(target uuid)
returns table(id uuid,mode text,capability text,coarse_area text,needed_on date)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_user();
 perform private.rate_limit('profile_detail',120,60);
 if not private.can_view_profile(target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return query select r.id,r.mode,r.capability_term,r.coarse_area,r.needed_on from public.matching_requests r
 where r.user_id=target and r.status='active' and (r.needed_on is null or r.needed_on>=(now() at time zone r.time_zone)::date)
 order by r.created_at desc,r.id desc limit 20;
end;
$$;
create or replace function public.profile_reviews(target uuid,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,rating smallint,comment text,created_at timestamptz,interaction_type text,own boolean)
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.require_user();
 perform private.rate_limit('profile_detail',120,60);
 if not private.can_view_profile(target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return query select r.id,r.rating,r.comment,r.created_at,c.interaction_type,r.author_id=auth.uid() from private.published_reviews r join public.connections c on c.id=r.connection_id
 where r.subject_id=target and (before_time is null or (r.created_at,r.id)<(before_time,before_id)) order by r.created_at desc,r.id desc limit 20;
end;
$$;
create or replace function public.profile_verifications(target uuid)
returns table(verification_type text,verified_at timestamptz,expires_at timestamptz)
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.require_user();
 perform private.rate_limit('profile_detail',120,60);
 if not private.can_view_profile(target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return query select v.verification_type,v.verified_at,v.expires_at from public.verification_status v where v.user_id=target and v.verified_at<=now() and (v.expires_at is null or v.expires_at>now()) order by v.verification_type;
end;
$$;
