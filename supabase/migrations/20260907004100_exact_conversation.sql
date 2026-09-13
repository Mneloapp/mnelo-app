-- Opening an older direct conversation must not depend on the first inbox page.
create function public.get_conversation(conversation uuid)
returns table(id uuid,kind text,title text,member_ids uuid[],preview text,updated_at timestamptz,unread_count bigint,last_message_kind text)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  return query select c.id,c.kind,
    case when c.kind='group' then c.title else coalesce((select p.display_name from public.conversation_members peer join public.profiles p on p.id=peer.user_id where peer.conversation_id=c.id and peer.user_id<>actor and peer.left_at is null limit 1),'') end,
    array(select m.user_id from public.conversation_members m where m.conversation_id=c.id and m.left_at is null order by m.user_id),
    coalesce((select case when m.deleted_at is null then left(m.body,160) else '' end from public.messages m where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1),''),c.updated_at,
    (select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>actor and m.deleted_at is null and
      (m.created_at,m.id)>(self.last_read_at,coalesce(self.last_read_message_id,'00000000-0000-0000-0000-000000000000'::uuid))),
    (select case when m.deleted_at is not null then 'deleted' else m.kind end from public.messages m where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1)
  from public.conversations c join public.conversation_members self on self.conversation_id=c.id and self.user_id=actor and self.left_at is null
  where private.can_read_conversation(c.id) and c.id=conversation
  order by c.updated_at desc,c.id desc limit 1;
end;
$$;
revoke all on function public.get_conversation(uuid) from public,anon;
grant execute on function public.get_conversation(uuid) to authenticated;
