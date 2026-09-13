-- Message transport persists before Realtime. Stable (created_at,id) cursors and client UUID idempotency.
create function public.list_conversations(before_time timestamptz default null, before_id uuid default null)
returns table(id uuid,kind text,title text,member_ids uuid[],preview text,updated_at timestamptz,unread_count bigint)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  return query select c.id,c.kind,
    case when c.kind='group' then c.title else coalesce((select p.display_name from public.conversation_members peer join public.profiles p on p.id=peer.user_id where peer.conversation_id=c.id and peer.user_id<>actor and peer.left_at is null limit 1),'') end,
    array(select m.user_id from public.conversation_members m where m.conversation_id=c.id and m.left_at is null order by m.user_id),
    coalesce((select case when m.deleted_at is null and m.kind='text' then left(m.body,160) else '' end from public.messages m where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1),''),c.updated_at,
    (select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>actor and m.deleted_at is null and m.created_at>self.last_read_at)
  from public.conversations c join public.conversation_members self on self.conversation_id=c.id and self.user_id=actor and self.left_at is null
  where private.can_read_conversation(c.id) and (before_time is null or (c.updated_at,c.id)<(before_time,before_id))
  order by c.updated_at desc,c.id desc limit 30;
end;
$$;
create function public.get_messages(conversation uuid, before_time timestamptz default null, before_id uuid default null)
returns setof public.messages language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  return query select m.* from public.messages m where m.conversation_id=conversation and
    (before_time is null or (m.created_at,m.id)<(before_time,before_id)) order by m.created_at desc,m.id desc limit 40;
end;
$$;
create function public.send_text_message(conversation uuid, text_body text, client_id uuid, reply_to uuid default null)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); result public.messages; peer uuid;
begin
  -- Serialize conversation writes and block pairs in stable order. Recheck permission after locks.
  perform 1 from public.conversations c where c.id=conversation for update;
  for peer in select m.user_id from public.conversation_members m where m.conversation_id=conversation and m.left_at is null and m.user_id<>actor order by m.user_id loop
    perform private.lock_pair(actor,peer);
  end loop;
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if client_id is null or text_body is null or char_length(btrim(text_body)) not between 1 and 8000 then raise exception using errcode='22023',message='INVALID'; end if;
  select * into result from public.messages m where m.sender_id=actor and m.client_id=send_text_message.client_id;
  if found then
    if result.conversation_id<>conversation or result.body<>btrim(text_body) or result.reply_to is distinct from reply_to then raise exception using errcode='23505',message='CONFLICT'; end if;
    return result;
  end if;
  perform private.rate_limit('message',60,60);
  if reply_to is not null and not exists(select 1 from public.messages m where m.id=reply_to and m.conversation_id=conversation and m.deleted_at is null) then raise exception using errcode='22023',message='INVALID'; end if;
  insert into public.messages(conversation_id,sender_id,client_id,kind,body,reply_to)
    values(conversation,actor,client_id,'text',btrim(text_body),reply_to) returning * into result;
  update public.conversations c set updated_at=result.created_at where c.id=conversation;
  return result;
end;
$$;
create function public.mark_conversation_read(conversation uuid, through_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); seen timestamptz;
begin
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select created_at into seen from public.messages where id=through_message and conversation_id=conversation;
  if seen is null then raise exception using errcode='22023',message='INVALID'; end if;
  update public.conversation_members set last_read_at=greatest(last_read_at,seen) where conversation_id=conversation and user_id=actor and left_at is null;
end;
$$;
create function public.toggle_message_reaction(message uuid, emoji text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  if not private.can_read_message(message) or not exists(select 1 from public.messages where id=message and deleted_at is null) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if emoji is null or emoji not in ('👍','❤️','😂','😮','😢','🙏') then raise exception using errcode='22023',message='INVALID'; end if;
  perform private.rate_limit('reaction',60,60);
  perform pg_advisory_xact_lock(hashtextextended(actor::text||message::text||emoji,0));
  delete from public.message_reactions r where r.message_id=message and r.user_id=actor and r.emoji=toggle_message_reaction.emoji;
  if not found then insert into public.message_reactions(message_id,user_id,emoji) values(message,actor,emoji); end if;
end;
$$;
create function public.delete_own_message(message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  if not private.can_read_message(message) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  perform private.rate_limit('delete_message',60,60);
  update public.messages set body='',deleted_at=coalesce(deleted_at,now()) where id=message and sender_id=actor;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  delete from public.message_reactions where message_id=message;
end;
$$;
grant execute on function public.list_conversations(timestamptz,uuid),public.get_messages(uuid,timestamptz,uuid),public.send_text_message(uuid,text,uuid,uuid),public.mark_conversation_read(uuid,uuid),public.toggle_message_reaction(uuid,text),public.delete_own_message(uuid) to authenticated;
-- Read receipts are recipient-authored cursors. Realtime rechecks SELECT RLS for each row change.
alter publication supabase_realtime add table public.conversations;
