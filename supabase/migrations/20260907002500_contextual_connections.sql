alter table public.connection_requests add column client_id uuid;
alter table public.connection_requests add constraint request_client_unique unique(sender_id,client_id);
create index connection_requests_sender_cursor_idx on public.connection_requests(sender_id,created_at desc,id desc);
create or replace function private.can_request(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select target<>auth.uid() and private.can_view_profile(target) and not private.has_block(auth.uid(),target) and exists(
 select 1 from public.privacy_settings p where p.user_id=target and (p.request_audience='everyone' or private.connected(auth.uid(),target)
 or (p.request_audience='relevant' and private.matched(target)) or (p.request_audience='mutual' and private.mutual_connection(auth.uid(),target))));
$$;
create function private.connection_context(request uuid) returns text
language sql stable security definer set search_path='' as $$
 select concat_ws(E'\n',r.capability_term,nullif(r.coarse_area,''),r.needed_on::text,
 case when btrim(r.detail_text)<>btrim(r.raw_text) then nullif(left(r.detail_text,600),'') else null end)
 from public.matching_requests r where r.id=request and r.user_id=auth.uid();
$$;
create function public.connection_state(target uuid,matching_request uuid default null)
returns table(connected boolean,conversation_id uuid,pending_request_id uuid,incoming boolean,can_request boolean,context text)
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); link uuid; pending public.connection_requests; allowed boolean; reason text;
begin
 if target=actor or not private.can_view_profile(target) or private.has_block(actor,target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if matching_request is not null then
  if not private.owns_matching_request(matching_request) then raise exception using errcode='42501',message='FORBIDDEN';end if;
  reason:=private.connection_context(matching_request);
 end if;
 select id into link from public.connections where user_low=least(actor,target) and user_high=greatest(actor,target);
 select * into pending from public.connection_requests r where r.status='pending' and r.expires_at>now() and ((r.sender_id=actor and r.recipient_id=target) or (r.sender_id=target and r.recipient_id=actor)) order by r.created_at,r.id limit 1;
 allowed:=link is null and pending.id is null and private.can_request(target)
 and not exists(select 1 from public.connection_requests r where r.sender_id=actor and r.recipient_id=target and r.status='declined' and r.responded_at>now()-interval '1 day')
 and (matching_request is null or exists(select 1 from public.matching_candidates c where c.request_id=matching_request and c.candidate_id=target and private.match_candidate_current(c.id)));
 return query select link is not null,(select v.id from public.conversations v where v.connection_id=link),pending.id,coalesce(pending.recipient_id=actor,false),coalesce(allowed,false),reason;
end;
$$;
drop function public.send_connection_request(uuid,text,text,uuid);
create function public.send_connection_request(target uuid,context text,message text default '',matching_request uuid default null,client_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); existing public.connection_requests; result uuid; key uuid:=coalesce(client_id,gen_random_uuid()); canonical text;
begin
 if target is null or target=actor or context is null or char_length(btrim(context)) not between 1 and 1000 or message is null or char_length(message)>1000 then raise exception using errcode='22023',message='INVALID';end if;
 perform private.lock_pair(actor,target);
 if private.has_block(actor,target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select * into existing from public.connection_requests r where r.sender_id=actor and r.client_id=key;
 if found then
  if existing.recipient_id<>target or existing.context<>context or existing.message<>message or existing.matching_request_id is distinct from matching_request then raise exception using errcode='23505',message='CONFLICT';end if;
  return existing.id;
 end if;
 if not private.can_request(target) or private.connected(actor,target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if matching_request is not null then
  if not private.owns_matching_request(matching_request) or not exists(select 1 from public.matching_candidates c where c.request_id=matching_request and c.candidate_id=target and private.match_candidate_current(c.id)) then raise exception using errcode='42501',message='FORBIDDEN';end if;
  canonical:=private.connection_context(matching_request);
  if context<>canonical then raise exception using errcode='23505',message='CONFLICT';end if;
 end if;
 update public.connection_requests r set status='expired',responded_at=now() where r.status='pending' and r.expires_at<=now() and ((r.sender_id=actor and r.recipient_id=target) or (r.sender_id=target and r.recipient_id=actor));
 select * into existing from public.connection_requests r where r.status='pending' and ((r.sender_id=actor and r.recipient_id=target) or (r.sender_id=target and r.recipient_id=actor)) order by r.created_at,r.id limit 1;
 if found then
  if existing.sender_id=actor and existing.context=context and existing.message=message and existing.matching_request_id is not distinct from matching_request then return existing.id;end if;
  raise exception using errcode='23505',message='CONFLICT';
 end if;
 if exists(select 1 from public.connection_requests r where r.sender_id=actor and r.recipient_id=target and r.status='declined' and r.responded_at>now()-interval '1 day') then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.rate_limit('request',20,3600);
 insert into public.connection_requests(sender_id,recipient_id,client_id,context,message,matching_request_id) values(actor,target,key,context,message,matching_request) returning id into result;
 return result;
end;
$$;
create or replace function public.respond_connection_request(request uuid,action text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); r public.connection_requests; link uuid; conversation uuid; interaction text;
begin
 select * into r from public.connection_requests where id=request;
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.lock_pair(r.sender_id,r.recipient_id);
 select * into r from public.connection_requests where id=request for update;
 if not found or private.has_block(r.sender_id,r.recipient_id) or action is null or action not in('accept','decline','cancel') or
 (action='cancel' and actor<>r.sender_id) or (action in('accept','decline') and actor<>r.recipient_id) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if r.status='accepted' and action='accept' then
  select v.id into conversation from public.conversations v join public.connections c on c.id=v.connection_id where c.user_low=least(r.sender_id,r.recipient_id) and c.user_high=greatest(r.sender_id,r.recipient_id);return conversation;
 end if;
 if (r.status='cancelled' and action='cancel') or (r.status='declined' and action='decline') then return null;end if;
 if r.status<>'pending' or r.expires_at<=now() then raise exception using errcode='22023',message='EXPIRED';end if;
 perform private.rate_limit('request_response',60,3600);
 update public.connection_requests set status=case action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end,responded_at=now() where id=r.id;
 if action<>'accept' then return null;end if;
 select case when m.intent_type in('service','professional') then 'service' when m.intent_type in('product','opportunity') then 'business' else 'social' end into interaction from public.matching_requests m where m.id=r.matching_request_id;
 insert into public.connections(user_low,user_high,request_id,context,interaction_type) values(least(r.sender_id,r.recipient_id),greatest(r.sender_id,r.recipient_id),r.id,r.context,coalesce(interaction,'social')) on conflict(user_low,user_high) do nothing;
 select id into link from public.connections where user_low=least(r.sender_id,r.recipient_id) and user_high=greatest(r.sender_id,r.recipient_id);
 insert into public.conversations(kind,connection_id,created_by) values('direct',link,actor) on conflict(connection_id) do update set updated_at=now() returning id into conversation;
 insert into public.conversation_members(conversation_id,user_id) values(conversation,r.sender_id),(conversation,r.recipient_id) on conflict(conversation_id,user_id) do update set left_at=null;
 if r.message<>'' then insert into public.messages(conversation_id,sender_id,client_id,kind,body) values(conversation,r.sender_id,gen_random_uuid(),'text',r.message);end if;
 update public.connection_requests other set status='cancelled',responded_at=now() where other.id<>r.id and other.status='pending' and ((other.sender_id=r.sender_id and other.recipient_id=r.recipient_id) or (other.sender_id=r.recipient_id and other.recipient_id=r.sender_id));
 return conversation;
end;
$$;
create function public.list_connection_requests(before_time timestamptz default null,before_id uuid default null)
returns setof public.connection_requests language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 update public.connection_requests set status='expired',responded_at=now() where status='pending' and expires_at<=now() and actor in(sender_id,recipient_id);
 return query select r.* from public.connection_requests r where actor in(r.sender_id,r.recipient_id) and not private.has_block(r.sender_id,r.recipient_id)
 and (before_time is null or (r.created_at,r.id)<(before_time,before_id)) order by r.created_at desc,r.id desc limit 30;
end;
$$;
create function public.direct_conversation(target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); link uuid; conversation uuid;
begin
 perform private.lock_pair(actor,target);
 if target=actor or private.has_block(actor,target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select id into link from public.connections where user_low=least(actor,target) and user_high=greatest(actor,target);
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 insert into public.conversations(kind,connection_id,created_by) values('direct',link,actor) on conflict(connection_id) do nothing;
 select id into conversation from public.conversations where connection_id=link;
 insert into public.conversation_members(conversation_id,user_id) values(conversation,actor),(conversation,target) on conflict(conversation_id,user_id) do update set left_at=null;
 return conversation;
end;
$$;
grant execute on function public.connection_state(uuid,uuid),public.send_connection_request(uuid,text,text,uuid,uuid),public.list_connection_requests(timestamptz,uuid),public.direct_conversation(uuid) to authenticated;
