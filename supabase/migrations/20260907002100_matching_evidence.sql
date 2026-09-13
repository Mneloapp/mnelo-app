-- Versioned deterministic aliases mirror rules-v1; changes require a new migration/backfill.
create function private.capability_key(value text) returns text
language sql immutable set search_path='' as $$
 select case
    when lower(value) ~ 'electrician|electrical|ელექტრიკოს|ელექტრო' then 'electrical installation'
    when lower(value) ~ 'plumber|plumbing|სანტექნ' then 'plumbing'
    when lower(value) ~ 'cleaner|cleaning|დასუფთავ' then 'cleaning'
    when lower(value) ~ 'mechanic|car repair|ავტომექან' then 'vehicle repair'
    when lower(value) ~ 'moving help|movers|გადაზიდ' then 'moving assistance'
    when lower(value) ~ 'lawyer|legal advice|ადვოკატ|იურისტ' then 'legal services'
    when lower(value) ~ 'accountant|bookkeeping|ბუღალტერ' then 'accounting'
    when lower(value) ~ 'developer|programmer|software|პროგრამისტ' then 'software development'
    when lower(value) ~ 'designer|graphic design|დიზაინერ' then 'design'
    when lower(value) ~ 'tutor|teacher|მასწავლებ' then 'tutoring'
    when lower(value) ~ 'tennis|ჩოგბურთ' then 'tennis'
    when lower(value) ~ 'hiking|hike|ლაშქრობ' then 'hiking'
    when lower(value) ~ 'chess|ჭადრაკ' then 'chess'
    when lower(value) ~ 'running partner|jogging|სირბილ' then 'running'
    when lower(value) ~ 'language exchange|ენის გაცვლა' then 'language exchange'
    when lower(value) ~ 'photograph|ფოტოგრაფ' then 'photography'
    when lower(value) ~ 'translat|თარჯიმან|თარგმან' then 'translation'
    when lower(value) ~ 'cook|chef|მზარეულ' then 'cooking'
    when lower(value) ~ 'musician|guitar|piano|მუსიკოს|გიტარ' then 'music'
    when lower(value) ~ 'volunteer|მოხალის' then 'volunteering'
    when lower(value) ~ 'internship|სტაჟირ' then 'internship'
    when lower(value) ~ 'collaborat|თანამშრომლობ' then 'collaboration'
    when lower(value) ~ 'bicycle|bike|ველოსიპედ' then 'bicycle'
    when lower(value) ~ 'laptop|ლეპტოპ|ნოუთბუქ' then 'laptop'
    when lower(value) ~ 'furniture|ავეჯ' then 'furniture'
    when lower(value) ~ '\ybooks?\y|წიგნ' then 'books'
    else regexp_replace(lower(btrim(value)),'\s+',' ','g') end;
$$;
alter table public.user_capabilities add column match_key text;
alter table public.matching_requests add column match_key text;
update public.user_capabilities set match_key=private.capability_key(normalized_term);
update public.matching_requests set match_key=private.capability_key(capability_term);
alter table public.user_capabilities alter column match_key set not null;
alter table public.matching_requests alter column match_key set not null;
create index user_capabilities_match_idx on public.user_capabilities(match_key,user_id);
create index matching_requests_match_idx on public.matching_requests(match_key,mode,intent_type,user_id) where status='active';
create function private.assign_match_key() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 new.match_key:=private.capability_key(case when tg_table_name='user_capabilities' then to_jsonb(new)->>'normalized_term' else to_jsonb(new)->>'capability_term' end);return new;
end;
$$;
create trigger capability_match_key before insert or update of normalized_term on public.user_capabilities for each row execute function private.assign_match_key();
create trigger request_match_key before insert or update of capability_term on public.matching_requests for each row execute function private.assign_match_key();
alter table public.matching_candidates add column evaluated_at timestamptz not null default now();
alter table public.matching_reasons add column value_count integer check(value_count>=0);
alter table public.matching_reasons add column value_number numeric;
-- Administrative/source changes invalidate derived results, including privacy grants.
create function private.expire_user_matches() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text; person uuid; row_value jsonb;
begin
 foreach field in array tg_argv loop
  foreach row_value in array array[to_jsonb(new),to_jsonb(old)] loop
   person:=(row_value->>field)::uuid;
   if person is not null then
    update public.matching_candidates set expires_at=least(expires_at,now()) where candidate_id=person or request_id in(select id from public.matching_requests where user_id=person);
   end if;
  end loop;
 end loop;
 return null;
end;
$$;
create trigger profile_match_expiry after update or delete on public.profiles for each row execute function private.expire_user_matches('id');
create trigger capability_match_expiry after insert or update or delete on public.user_capabilities for each row execute function private.expire_user_matches('user_id');
create trigger language_match_expiry after insert or update or delete on public.profile_languages for each row execute function private.expire_user_matches('user_id');
create trigger privacy_match_expiry after update or delete on public.privacy_settings for each row execute function private.expire_user_matches('user_id');
create trigger request_match_expiry after insert or update or delete on public.matching_requests for each row execute function private.expire_user_matches('user_id');
create trigger review_match_expiry after insert or update or delete on public.reviews for each row execute function private.expire_user_matches('subject_id');
create trigger block_match_expiry after insert or update or delete on public.blocks for each row execute function private.expire_user_matches('user_id','blocked_user_id');

create function private.intent_compatible(a text,b text) returns boolean
language sql immutable set search_path='' as $$
 select a=b or (a in ('service','professional','capability') and b in ('service','professional','capability'));
$$;
create function private.mutual_connection(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.connections c join public.connections d on (case when c.user_low=a then c.user_high else c.user_low end) in(d.user_low,d.user_high)
 where a in(c.user_low,c.user_high) and b in(d.user_low,d.user_high)
 and not private.has_block(a,case when c.user_low=a then c.user_high else c.user_low end)
 and not private.has_block(b,case when c.user_low=a then c.user_high else c.user_low end));
$$;
create function private.match_sources(request uuid,target uuid default null)
returns table(person_id uuid,signal text,source_id uuid,fact text,weight integer)
language sql stable security definer set search_path='' as $$
 select cap.user_id,'capability',cap.id,cap.description,60 from public.matching_requests r join public.user_capabilities cap on cap.match_key=r.match_key
 where r.id=request and r.mode='need' and r.intent_type not in('opportunity','product') and (target is null or cap.user_id=target)
 union all
 select s.user_id,case when s.mode='offer' then 'offer' else 'need' end,s.id,s.capability_term,65
 from public.matching_requests r join public.matching_requests s on s.match_key=r.match_key and s.mode<>r.mode and s.status='active'
 where r.id=request and private.intent_compatible(r.intent_type,s.intent_type) and (target is null or s.user_id=target)
 and (s.needed_on is null or s.needed_on>=(now() at time zone s.time_zone)::date)
 and (r.needed_on is null or s.needed_on is null or r.needed_on=s.needed_on);
$$;
create function private.match_eligible(request uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.matching_requests r join public.privacy_settings p on p.user_id=target
 where r.id=request and r.user_id=auth.uid() and r.status='active' and target<>r.user_id and p.discoverability<>'nobody'
 and (r.needed_on is null or r.needed_on>=(now() at time zone r.time_zone)::date)
 and not private.has_block(r.user_id,target)
 and (p.request_audience in('everyone','relevant') or private.connected(r.user_id,target) or private.mutual_connection(r.user_id,target))
 and exists(select 1 from private.match_sources(r.id,target)));
$$;
