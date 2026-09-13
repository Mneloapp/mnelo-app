alter table public.matching_requests add column client_id uuid;
alter table public.matching_requests add column request_fingerprint text;
alter table public.matching_requests add column detail_text text not null default '' check(char_length(detail_text)<=2000);
alter table public.matching_requests add column time_zone text not null default 'UTC' check(char_length(time_zone)<=80);
alter table public.matching_requests add constraint matching_request_client_unique unique(user_id,client_id);
create function public.consume_connect_attempt() returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_user();
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.rate_limit('connect_interpret',40,3600);
end;
$$;
create function public.publish_matching_request(actor uuid, client_id uuid, fingerprint text, mode text, raw_text text, intent_type text, capability_term text, coarse_area text, needed_on date, detail_text text, time_zone text)
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
 insert into public.matching_requests(user_id,client_id,request_fingerprint,mode,raw_text,intent_type,capability_term,coarse_area,needed_on,detail_text,time_zone,interpreter_version)
 values(actor,client_id,fingerprint,mode,raw_text,intent_type,capability_term,coarse_area,needed_on,detail_text,time_zone,'rules-v1') returning * into result;
 if mode='need' then insert into public.user_needs(user_id,matching_request_id,description) values(actor,result.id,raw_text);
 else insert into public.user_offers(user_id,matching_request_id,description) values(actor,result.id,raw_text);end if;
 return result;
end;
$$;
revoke all on function public.publish_matching_request(uuid,uuid,text,text,text,text,text,text,date,text,text) from public,anon,authenticated;
grant execute on function public.publish_matching_request(uuid,uuid,text,text,text,text,text,text,date,text,text) to service_role;
grant execute on function public.consume_connect_attempt() to authenticated;
create function public.list_my_needs(before_time timestamptz default null,before_id uuid default null)
returns setof public.matching_requests language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 return query select r.* from public.matching_requests r where r.user_id=actor and (before_time is null or (r.created_at,r.id)<(before_time,before_id)) order by r.created_at desc,r.id desc limit 30;
end;
$$;
create function public.set_need_status(request uuid,status text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 if status is null or status not in ('active','paused','completed') then raise exception using errcode='22023',message='INVALID';end if;
 perform 1 from public.matching_requests where id=request and user_id=actor for update;
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.rate_limit('need_status',60,3600);
 if status='active' and (select count(*) from public.matching_requests where user_id=actor and public.matching_requests.status='active' and id<>request)>=20 then raise exception using errcode='P0001',message='RATE_LIMITED';end if;
 update public.matching_requests set status=set_need_status.status,updated_at=now() where id=request;
 -- Results and their fact grants expire when a request is paused/closed.
 if status<>'active' then update public.matching_candidates set expires_at=now() where request_id=request;end if;
end;
$$;
grant execute on function public.list_my_needs(timestamptz,uuid),public.set_need_status(uuid,text) to authenticated;
