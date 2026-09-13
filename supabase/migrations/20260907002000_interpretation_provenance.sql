alter table public.matching_requests add column confirmed_capability text check(char_length(confirmed_capability) between 1 and 240);
alter table public.matching_requests add column confirmed_area text check(char_length(confirmed_area) between 1 and 120);
drop function public.publish_matching_request(uuid,uuid,text,text,text,text,text,text,date,text,text);
create function public.publish_matching_request(actor uuid, client_id uuid, fingerprint text, mode text, raw_text text, intent_type text, capability_term text, coarse_area text, needed_on date, detail_text text, time_zone text, confirmed_capability text default null, confirmed_area text default null)
returns public.matching_requests language plpgsql security definer set search_path='' as $$
declare result public.matching_requests;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor) or client_id is null or fingerprint is null or fingerprint !~ '^[0-9a-f]{64}$' or char_length(btrim(capability_term)) not between 1 and 240 then raise exception using errcode='22023',message='INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||client_id::text,0));
 select * into result from public.matching_requests r where r.user_id=actor and r.client_id=publish_matching_request.client_id;
 if found then
  if result.request_fingerprint<>fingerprint then raise exception using errcode='23505',message='CONFLICT';end if;
  return result;
 end if;
 if (select count(*) from public.matching_requests where user_id=actor and status='active')>=20 then raise exception using errcode='P0001',message='RATE_LIMITED';end if;
 insert into public.matching_requests(user_id,client_id,request_fingerprint,mode,raw_text,intent_type,capability_term,coarse_area,needed_on,detail_text,time_zone,confirmed_capability,confirmed_area,interpreter_version)
 values(actor,client_id,fingerprint,mode,raw_text,intent_type,capability_term,coarse_area,needed_on,detail_text,time_zone,confirmed_capability,confirmed_area,'rules-v1') returning * into result;
 if mode='need' then insert into public.user_needs(user_id,matching_request_id,description) values(actor,result.id,raw_text);
 else insert into public.user_offers(user_id,matching_request_id,description) values(actor,result.id,raw_text);end if;
 return result;
end;
$$;
revoke all on function public.publish_matching_request(uuid,uuid,text,text,text,text,text,text,date,text,text,text,text) from public,anon,authenticated;
grant execute on function public.publish_matching_request(uuid,uuid,text,text,text,text,text,text,date,text,text,text,text) to service_role;
