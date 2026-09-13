alter table public.conversation_members add column last_read_message_id uuid references public.messages(id) on delete set null;
create or replace function public.mark_conversation_read(conversation uuid, through_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); seen timestamptz;
begin
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select created_at into seen from public.messages where id=through_message and conversation_id=conversation;
  if seen is null then raise exception using errcode='22023',message='INVALID'; end if;
  update public.conversation_members set last_read_at=seen,last_read_message_id=through_message
    where conversation_id=conversation and user_id=actor and left_at is null and
    (last_read_at,coalesce(last_read_message_id,'00000000-0000-0000-0000-000000000000'::uuid))<(seen,through_message);
end;
$$;
create or replace function public.list_conversations(before_time timestamptz default null, before_id uuid default null)
returns table(id uuid,kind text,title text,member_ids uuid[],preview text,updated_at timestamptz,unread_count bigint)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  return query select c.id,c.kind,
    case when c.kind='group' then c.title else coalesce((select p.display_name from public.conversation_members peer join public.profiles p on p.id=peer.user_id where peer.conversation_id=c.id and peer.user_id<>actor and peer.left_at is null limit 1),'') end,
    array(select m.user_id from public.conversation_members m where m.conversation_id=c.id and m.left_at is null order by m.user_id),
    coalesce((select case when m.deleted_at is null and m.kind='text' then left(m.body,160) else '' end from public.messages m where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1),''),c.updated_at,
    (select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>actor and m.deleted_at is null and
      (m.created_at,m.id)>(self.last_read_at,coalesce(self.last_read_message_id,'00000000-0000-0000-0000-000000000000'::uuid)))
  from public.conversations c join public.conversation_members self on self.conversation_id=c.id and self.user_id=actor and self.left_at is null
  where private.can_read_conversation(c.id) and (before_time is null or (c.updated_at,c.id)<(before_time,before_id))
  order by c.updated_at desc,c.id desc limit 30;
end;
$$;
