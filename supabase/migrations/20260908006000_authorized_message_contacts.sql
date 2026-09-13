-- Embedded raw-profile joins no longer reveal another identity. Keep contact rendering scoped
-- to an authorized message, with the contact's current profile/privacy policy rechecked.
create function public.get_message_contacts(message_ids uuid[])
returns table(message_id uuid,display_name text,username text)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_user();
 if message_ids is null or cardinality(message_ids)>40 then raise exception using errcode='22023',message='INVALID';end if;
 return query select c.message_id,p.display_name,u.username
 from public.message_contacts c join public.messages m on m.id=c.message_id
 join public.profiles p on p.id=c.profile_id join public.usernames u on u.user_id=p.id
 where c.message_id=any(message_ids) and m.deleted_at is null
 and private.can_read_message(c.message_id) and private.can_view_profile(c.profile_id);
end;
$$;
grant execute on function public.get_message_contacts(uuid[]) to authenticated;
