-- Private groups share the existing member-authorized conversation/message model.
alter table public.conversations add column client_id uuid;
alter table public.conversations add constraint conversation_client_unique unique(created_by,client_id);
alter table public.conversations add column avatar_attachment_id uuid references public.message_attachments(id) on delete set null;
alter table public.message_attachments add column purpose text not null default 'message' check(purpose in ('message','group_avatar'));

create function private.group_admin(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.can_read_conversation(target) and exists(select 1 from public.conversations c join public.conversation_members m on m.conversation_id=c.id where c.id=target and c.kind='group' and m.user_id=auth.uid() and m.role='admin' and m.left_at is null);
$$;
create function public.list_connections(query text default '') returns setof public.profile_summary
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); needle text:=lower(btrim(query));
begin
 if needle is null or char_length(needle)>120 then raise exception using errcode='22023',message='INVALID';end if;
 perform private.rate_limit('connection_search',120,60);
 return query select summary.* from public.profiles p join public.usernames u on u.user_id=p.id
 cross join lateral public.get_profile(p.id) summary
 where private.connected(actor,p.id) and not private.has_block(actor,p.id)
 and (needle='' or position(needle in lower(p.display_name))>0 or position(replace(needle,'@','') in u.username)>0)
 order by lower(p.display_name),p.id limit 50;
end;
$$;
create function public.create_group(name text,members uuid[],client_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); result uuid; member uuid; peer uuid; ids uuid[];
begin
 if name is null or char_length(btrim(name)) not between 1 and 80 or members is null or client_id is null or cardinality(members) not between 2 and 31 or array_position(members,null) is not null or actor=any(members) then raise exception using errcode='22023',message='INVALID';end if;
 select array_agg(distinct x order by x) into ids from unnest(members||actor) x;
 if cardinality(ids)<>cardinality(members)+1 then raise exception using errcode='22023',message='INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||client_id::text,0));
 select c.id into result from public.conversations c where c.created_by=actor and c.client_id=create_group.client_id;
 if found then
  if not private.can_read_conversation(result) then raise exception using errcode='42501',message='FORBIDDEN';end if;
  return result;
 end if;
 -- Stable relationship locking serializes concurrent blocks; reject any blocked pair.
 foreach member in array ids loop
  foreach peer in array ids loop
   if member<peer then perform private.lock_pair(member,peer);
    if private.has_block(member,peer) then raise exception using errcode='42501',message='FORBIDDEN';end if;
   end if;
  end loop;
  if member<>actor and not private.connected(actor,member) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 end loop;
 perform private.rate_limit('group_create',5,3600);
 insert into public.conversations(kind,title,created_by,client_id) values('group',btrim(name),actor,client_id) returning id into result;
 insert into public.conversation_members(conversation_id,user_id,role)
 select result,x,case when x=actor then 'admin' else 'member' end from unnest(ids) x;
 return result;
end;
$$;
create function public.get_group(conversation uuid)
returns table(id uuid,title text,avatar_attachment_id uuid,member_id uuid,display_name text,username text,role text,joined_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_user();
 if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 -- Only the minimum member identity; this does not make full profiles discoverable.
 return query select c.id,c.title,c.avatar_attachment_id,m.user_id,p.display_name,u.username,m.role,m.joined_at
 from public.conversations c join public.conversation_members m on m.conversation_id=c.id
 join public.profiles p on p.id=m.user_id join public.usernames u on u.user_id=m.user_id
 where c.id=conversation and c.kind='group' and m.left_at is null order by m.joined_at,m.user_id limit 32;
end;
$$;
create function public.rename_group(conversation uuid,name text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_user();
 perform 1 from public.conversations where id=conversation for update;
 if not private.group_admin(conversation) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if name is null or char_length(btrim(name)) not between 1 and 80 then raise exception using errcode='22023',message='INVALID';end if;
 perform private.rate_limit('group_manage',60,3600);
 update public.conversations set title=btrim(name),updated_at=now() where id=conversation;
end;
$$;
create function public.add_group_member(conversation uuid,target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); peer uuid;
begin
 perform 1 from public.conversations where id=conversation for update;
 if target is null or target=actor or not private.group_admin(conversation) or not private.connected(actor,target) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 for peer in select user_id from public.conversation_members where conversation_id=conversation and left_at is null order by user_id loop
  perform private.lock_pair(target,peer);
  if private.has_block(target,peer) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 end loop;
 if exists(select 1 from public.conversation_members where conversation_id=conversation and user_id=target and left_at is null) then return;end if;
 -- Respect leaving/removal: admins cannot force somebody back into a group.
 if exists(select 1 from public.conversation_members where conversation_id=conversation and user_id=target)
 or (select count(*) from public.conversation_members where conversation_id=conversation and left_at is null)>=32 then raise exception using errcode='23505',message='CONFLICT';end if;
 perform private.rate_limit('group_manage',60,3600);
 insert into public.conversation_members(conversation_id,user_id) values(conversation,target);
 update public.conversations set updated_at=now() where id=conversation;
end;
$$;
create function public.manage_group_member(conversation uuid,target uuid,action text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user();
begin
 perform 1 from public.conversations where id=conversation for update;
 if target is null or target=actor or not private.group_admin(conversation) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if action is null or action not in ('remove','promote','demote') then raise exception using errcode='22023',message='INVALID';end if;
 perform private.rate_limit('group_manage',60,3600);
 if action='remove' then update public.conversation_members set left_at=now() where conversation_id=conversation and user_id=target and left_at is null;
 else update public.conversation_members set role=case when action='promote' then 'admin' else 'member' end where conversation_id=conversation and user_id=target and left_at is null;end if;
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 update public.conversations set updated_at=now() where id=conversation;
end;
$$;
create function public.leave_group(conversation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); successor uuid;
begin
 perform 1 from public.conversations where id=conversation and kind='group' for update;
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 -- Leaving remains possible even when a block suspends shared conversation access.
 update public.conversation_members set left_at=now() where conversation_id=conversation and user_id=actor and left_at is null;
 if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if not exists(select 1 from public.conversation_members where conversation_id=conversation and left_at is null and role='admin') then
  select user_id into successor from public.conversation_members where conversation_id=conversation and left_at is null order by joined_at,user_id limit 1;
  update public.conversation_members set role='admin' where conversation_id=conversation and user_id=successor;
 end if;
 update public.conversations set updated_at=now() where id=conversation;
end;
$$;
create function public.set_group_avatar(conversation uuid,attachment uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_user(); old_avatar uuid;
begin
 select avatar_attachment_id into old_avatar from public.conversations where id=conversation for update;
 if not private.group_admin(conversation) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if attachment=old_avatar then return;end if;
 if attachment is not null and not exists(select 1 from public.message_attachments a where a.id=attachment and a.conversation_id=conversation and a.user_id=actor and a.status='ready' and a.mime_type='image/jpeg' and not exists(select 1 from public.messages m where m.attachment_id=a.id)) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform private.rate_limit('group_manage',60,3600);
 update public.message_attachments set purpose='group_avatar' where id=attachment;
 update public.conversations set avatar_attachment_id=attachment,updated_at=now() where id=conversation;
 update public.message_attachments set status='rejected' where id=old_avatar;
end;
$$;
create function private.message_attachment_purpose() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.attachment_id is not null and exists(select 1 from public.message_attachments where id=new.attachment_id and purpose<>'message') then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return new;
end;
$$;
create trigger message_attachment_purpose before insert or update of attachment_id on public.messages for each row execute function private.message_attachment_purpose();
drop policy attachment_member on public.message_attachments;
create policy attachment_member on public.message_attachments for select to authenticated using(
 private.can_read_conversation(conversation_id) and (user_id=auth.uid() or (status='ready' and (
 exists(select 1 from public.messages m where m.attachment_id=message_attachments.id and m.deleted_at is null)
 or exists(select 1 from public.conversations c where c.id=message_attachments.conversation_id and c.avatar_attachment_id=message_attachments.id)))));
drop policy chat_object_read on storage.objects;
create policy chat_object_read on storage.objects for select to authenticated using(bucket_id='chat-media' and exists(
 select 1 from public.message_attachments a where a.object_path=name and a.status='ready' and private.can_read_conversation(a.conversation_id) and
 (a.user_id=auth.uid() or exists(select 1 from public.messages m where m.attachment_id=a.id and m.deleted_at is null)
 or exists(select 1 from public.conversations c where c.id=a.conversation_id and c.avatar_attachment_id=a.id))));
grant execute on function public.list_connections(text),public.create_group(text,uuid[],uuid),public.get_group(uuid),public.rename_group(uuid,text),public.add_group_member(uuid,uuid),public.manage_group_member(uuid,uuid,text),public.leave_group(uuid),public.set_group_avatar(uuid,uuid) to authenticated;
