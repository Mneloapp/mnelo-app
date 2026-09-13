-- Reputation evidence uses only published, mutually completed service/business reviews.
create or replace function private.profile_summaries(targets uuid[]) returns setof public.profile_summary
language sql stable security definer set search_path = '' as $$
  select p.id,p.display_name,u.username,p.bio,p.coarse_area,p.avatar_path,
    (p.available_today and coalesce(p.available_until>now(),false)),
    array(select c.description from public.user_capabilities c where c.user_id=p.id order by c.normalized_term),
    array(select l.language_code from public.profile_languages l where l.user_id=p.id order by l.language_code),
    exists(select 1 from public.verification_status v where v.user_id=p.id and v.verified_at<=now() and (v.expires_at is null or v.expires_at>now())),
    (select count(*) from private.published_reviews r where r.subject_id=p.id),
    (select round(avg(r.rating),1) from private.published_reviews r where r.subject_id=p.id)
  from public.profiles p join public.usernames u on u.user_id=p.id
  where p.id=any(targets) and private.can_view_profile(p.id);
$$;

create or replace function private.match_reason_current(reason uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select case f.signal
 when 'capability' then exists(select 1 from private.match_sources(r.id,c.candidate_id) s where s.signal='capability' and s.source_id=f.source_id and s.fact=f.fact)
 when 'offer' then exists(select 1 from private.match_sources(r.id,c.candidate_id) s where s.signal='offer' and s.source_id=f.source_id and s.fact=f.fact)
 when 'need' then exists(select 1 from private.match_sources(r.id,c.candidate_id) s where s.signal='need' and s.source_id=f.source_id and s.fact=f.fact)
 when 'area' then p.coarse_area=f.fact and p.coarse_area<>'' and private.area_key(p.coarse_area)=private.area_key(r.coarse_area)
 when 'availability' then p.available_today and coalesce(p.available_until>now(),false) and (r.needed_on is null or r.needed_on=(now() at time zone r.time_zone)::date)
 when 'language' then exists(select 1 from public.profile_languages l where l.id=f.source_id and l.user_id=c.candidate_id and l.language_code=f.fact and exists(select 1 from public.profile_languages own where own.user_id=r.user_id and own.language_code=l.language_code))
 when 'connection' then exists(select 1 from public.connections link where link.id=f.source_id and link.user_low=least(r.user_id,c.candidate_id) and link.user_high=greatest(r.user_id,c.candidate_id))
 when 'review' then f.value_count=(select count(*) from private.published_reviews rev where rev.subject_id=c.candidate_id) and f.value_number=(select round(avg(rev.rating),1) from private.published_reviews rev where rev.subject_id=c.candidate_id)
 else false end
 from public.matching_reasons f join public.matching_candidates c on c.id=f.candidate_id join public.matching_requests r on r.id=c.request_id join public.profiles p on p.id=c.candidate_id where f.id=reason),false);
$$;

-- Resolve the output-variable conflict without relaxing PL/pgSQL validation.
create or replace function public.find_matches(request uuid)
returns table(candidate_id uuid,rank_label text,profile public.profile_summary,signal text,fact text,value_count integer,value_number numeric)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); r public.matching_requests; item record; candidate uuid; basis record; lang record; link uuid; score_value integer;
begin
 select * into r from public.matching_requests where id=request and user_id=actor for update;
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if r.status<>'active' or (r.needed_on is not null and r.needed_on<(now() at time zone r.time_zone)::date) then return;end if;
 perform private.rate_limit('matching',60,3600);
 update public.matching_candidates set expires_at=least(expires_at,now()) where request_id=request;
 -- Only indexed matching-key evidence enters the scoring cohort; never download a user table.
 for item in
  with evidence as (select s.person_id,max(s.weight)::integer as base,count(distinct s.signal) as kinds from private.match_sources(request) s group by s.person_id)
  select p.id,p.coarse_area,p.updated_at,e.base,
   (case when e.kinds>1 then 5 else 0 end)::integer as extra,
   (r.coarse_area<>'' and p.coarse_area<>'' and private.area_key(p.coarse_area)=private.area_key(r.coarse_area)) as same_area,
   (p.available_today and coalesce(p.available_until>now(),false) and (r.needed_on is null or r.needed_on=(now() at time zone r.time_zone)::date)) as available,
   exists(select 1 from public.profile_languages l join public.profile_languages mine on mine.language_code=l.language_code and mine.user_id=actor where l.user_id=p.id) as common_language,
   private.connected(actor,p.id) as connected,
   (select count(*) from private.published_reviews v where v.subject_id=p.id) as reviews,
   (select round(avg(v.rating),1) from private.published_reviews v where v.subject_id=p.id) as rating
  from evidence e join public.profiles p on p.id=e.person_id
  where private.match_eligible(request,p.id)
  order by e.base+(case when e.kinds>1 then 5 else 0 end)
   +(case when r.coarse_area<>'' and private.area_key(p.coarse_area)=private.area_key(r.coarse_area) then 20 else 0 end)
   +(case when p.available_today and coalesce(p.available_until>now(),false) and (r.needed_on is null or r.needed_on=(now() at time zone r.time_zone)::date) then 10 else 0 end)
   +(case when exists(select 1 from public.profile_languages l join public.profile_languages mine on mine.language_code=l.language_code and mine.user_id=actor where l.user_id=p.id) then 5 else 0 end)
   +(case when private.connected(actor,p.id) then 5 else 0 end)
   +(case when r.intent_type in('service','professional','product','opportunity') and (select count(*) from private.published_reviews v where v.subject_id=p.id)>=2 and (select round(avg(v.rating),1) from private.published_reviews v where v.subject_id=p.id)>=4 then 5 else 0 end) desc,p.id
  limit 3
 loop
  perform private.lock_pair(actor,item.id);
  if not private.match_eligible(request,item.id) then continue;end if;
  score_value:=item.base+item.extra+(case when item.same_area then 20 else 0 end)+(case when item.available then 10 else 0 end)+(case when item.common_language then 5 else 0 end)+(case when item.connected then 5 else 0 end)+(case when r.intent_type in('service','professional','product','opportunity') and item.reviews>=2 and item.rating>=4 then 5 else 0 end);
  insert into public.matching_candidates(request_id,candidate_id,score,rank_label,matcher_version,evaluated_at,expires_at)
  values(request,item.id,score_value,case when score_value>=90 then 'strong' when score_value>=75 then 'good' else 'possible' end,'rules-v1',now(),now()+interval '15 minutes')
  on conflict on constraint matching_candidates_request_id_candidate_id_key do update set score=excluded.score,rank_label=excluded.rank_label,matcher_version=excluded.matcher_version,evaluated_at=excluded.evaluated_at,expires_at=excluded.expires_at returning id into candidate;
  delete from public.matching_reasons where matching_reasons.candidate_id=candidate;
  for basis in select distinct on(s.signal) s.signal,s.source_id,s.fact from private.match_sources(request,item.id) s order by s.signal,s.source_id loop
   insert into public.matching_reasons(candidate_id,signal,fact,source_id) values(candidate,basis.signal,basis.fact,basis.source_id);
  end loop;
  if item.same_area then insert into public.matching_reasons(candidate_id,signal,fact,source_id) values(candidate,'area',item.coarse_area,item.id);end if;
  if item.available then insert into public.matching_reasons(candidate_id,signal,fact,source_id) values(candidate,'availability','currently_available',item.id);end if;
  if item.common_language then
   select l.id,l.language_code into lang from public.profile_languages l join public.profile_languages mine on mine.language_code=l.language_code and mine.user_id=actor where l.user_id=item.id order by l.language_code limit 1;
   insert into public.matching_reasons(candidate_id,signal,fact,source_id) values(candidate,'language',lang.language_code,lang.id);
  end if;
  if item.connected then
   select id into link from public.connections where user_low=least(actor,item.id) and user_high=greatest(actor,item.id);
   insert into public.matching_reasons(candidate_id,signal,fact,source_id) values(candidate,'connection','existing_connection',link);
  end if;
  if r.intent_type in('service','professional','product','opportunity') and item.reviews>=2 and item.rating>=4 then
   insert into public.matching_reasons(candidate_id,signal,fact,value_count,value_number) values(candidate,'review','reviews',item.reviews,item.rating);
  end if;
  -- Derive the final rank from the recorded evidence, including any concurrent source change.
  select coalesce(max(case when f.signal='capability' then 60 when f.signal in('need','offer') then 65 else 0 end),0)
   +(case when count(distinct f.signal) filter(where f.signal in('capability','need','offer'))>1 then 5 else 0 end)
   +coalesce(sum(case when f.signal='area' then 20 when f.signal='availability' then 10 when f.signal in('language','connection','review') then 5 else 0 end),0)
  into score_value from public.matching_reasons f where f.candidate_id=candidate;
  update public.matching_candidates c set score=score_value,rank_label=case when score_value>=90 then 'strong' when score_value>=75 then 'good' else 'possible' end where c.id=candidate;
 end loop;
 return query select c.candidate_id,c.rank_label,p,f.signal,f.fact,f.value_count,f.value_number
 from public.matching_candidates c cross join lateral private.profile_summaries(array[c.candidate_id]) p
 join public.matching_reasons f on f.candidate_id=c.id
 where c.request_id=request and private.match_candidate_current(c.id) order by c.score desc,c.candidate_id,f.signal;
end;
$$;
