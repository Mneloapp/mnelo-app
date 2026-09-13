alter table public.reports add column client_id uuid;
alter table public.reports add constraint report_client_unique unique(reporter_id,client_id);
create index blocks_owner_cursor_idx on public.blocks(user_id,created_at desc,id desc);
-- A generic own-account refresh signal, with no blocker/reporter identity or private content.
create table public.user_access_state (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
alter table public.user_access_state enable row level security;
revoke all on public.user_access_state from public,anon,authenticated;
grant select on public.user_access_state to authenticated;
grant all on public.user_access_state to service_role;
create policy own_access_state on public.user_access_state for select to authenticated using(user_id=(select auth.uid()));
alter publication supabase_realtime add table public.user_access_state;
create function private.block_access_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare persons uuid[]; person uuid;
begin
 persons:=case when tg_op='DELETE' then array[old.user_id,old.blocked_user_id] else array[new.user_id,new.blocked_user_id] end;
 for person in select distinct p from unnest(persons) p order by p loop
  if exists(select 1 from public.profiles where id=person) then
   insert into public.user_access_state(user_id) values(person) on conflict(user_id) do update set revision=public.user_access_state.revision+1,updated_at=now();
  end if;
 end loop;
 return null;
end;
$$;
create trigger block_access_refresh after insert or delete on public.blocks for each row execute function private.block_access_changed();
create or replace function public.block_user(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 if target is null or target=actor or not exists(select 1 from public.profiles where id=target) then raise exception using errcode='22023',message='INVALID';end if;
 perform private.lock_pair(actor,target);
 if exists(select 1 from public.blocks where user_id=actor and blocked_user_id=target) then return;end if;
 perform private.rate_limit('block',60,3600);
 insert into public.blocks(user_id,blocked_user_id) values(actor,target) on conflict(user_id,blocked_user_id) do nothing;
 update public.connection_requests set status='cancelled',responded_at=now() where status='pending' and ((sender_id=actor and recipient_id=target) or (sender_id=target and recipient_id=actor));
 update public.call_sessions set status='ended',ended_at=now() where status in('ringing','accepted') and ((caller_id=actor and recipient_id=target) or (caller_id=target and recipient_id=actor));
end;
$$;
create function public.unblock_user(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 perform private.lock_pair(actor,target);
 if not exists(select 1 from public.blocks where user_id=actor and blocked_user_id=target) then return;end if;
 perform private.rate_limit('unblock',30,3600);
 delete from public.blocks where user_id=actor and blocked_user_id=target;
 -- Cancelled requests stay cancelled. Existing connections may be accessed again under current policies.
end;
$$;
create function public.list_blocked_profiles(before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,user_id uuid,display_name text,username text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 return query select b.id,p.id,p.display_name,u.username,b.created_at from public.blocks b join public.profiles p on p.id=b.blocked_user_id join public.usernames u on u.user_id=p.id
 where b.user_id=actor and (before_time is null or (b.created_at,b.id)<(before_time,before_id)) order by b.created_at desc,b.id desc limit 20;
end;
$$;
create function private.reportable(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select target<>auth.uid() and exists(select 1 from public.profiles where id=target) and (
 private.can_view_profile(target) or exists(select 1 from public.blocks where user_id=auth.uid() and blocked_user_id=target)
 or exists(select 1 from public.connection_requests r where (r.sender_id=auth.uid() and r.recipient_id=target) or (r.sender_id=target and r.recipient_id=auth.uid()))
 or exists(select 1 from public.conversation_members mine join public.conversation_members peer on peer.conversation_id=mine.conversation_id
 where mine.user_id=auth.uid() and mine.left_at is null and peer.user_id=target and peer.left_at is null and private.can_read_conversation(mine.conversation_id)));
$$;
create function public.submit_report(target uuid,reason text,detail text default '',message uuid default null,client_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); previous public.reports; result uuid; key uuid:=coalesce(client_id,gen_random_uuid());
begin
 if reason is null or reason not in('spam','scam','harassment','fake','unsafe','other') or detail is null or char_length(detail)>2000 or (reason='other' and char_length(btrim(detail))<5) then raise exception using errcode='22023',message='INVALID';end if;
 if not private.reportable(target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':report:'||key::text,0));
 select * into previous from public.reports r where r.reporter_id=actor and r.client_id=key;
 if found then
  if previous.subject_id<>target or previous.reason<>reason or previous.detail<>btrim(detail) or previous.message_id is distinct from message then raise exception using errcode='23505',message='CONFLICT';end if;
  return previous.id;
 end if;
 if message is not null and not exists(select 1 from public.messages m where m.id=message and m.sender_id=target and private.can_read_message(m.id)) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.rate_limit('report_hour',5,3600);
 perform private.rate_limit('report_day',20,86400);
 insert into public.reports(reporter_id,subject_id,reason,detail,message_id,client_id) values(actor,target,reason,btrim(detail),message,key) returning id into result;
 return result;
end;
$$;
-- Service-side moderation boundary. No admin role supplied by a mobile client is trusted.
create function public.resolve_report(report uuid,outcome text,actor_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
 if outcome is null or outcome not in('reviewing','resolved','dismissed') or actor_reference is null or char_length(btrim(actor_reference)) not between 1 and 120 then raise exception using errcode='22023',message='INVALID';end if;
 select status into current_status from public.reports where id=report for update;
 if not found then raise exception using errcode='22023',message='INVALID';end if;
 if current_status=outcome then return;end if;
 update public.reports set status=outcome where id=report;
 insert into private.moderation_actions(report_id,actor_reference,action) values(report,btrim(actor_reference),'report:'||outcome);
end;
$$;
revoke all on function public.resolve_report(uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_report(uuid,text,text) to service_role;
grant execute on function public.unblock_user(uuid),public.list_blocked_profiles(timestamptz,uuid),public.submit_report(uuid,text,text,uuid,uuid) to authenticated;
