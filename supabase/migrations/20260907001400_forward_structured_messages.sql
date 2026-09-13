create function public.forward_structured_message(source uuid,destination uuid,client_id uuid) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare m public.messages; point public.message_locations; contact public.message_contacts;
begin
  if not private.can_read_message(source) then raise exception using errcode='42501',message='FORBIDDEN';end if;
  select * into m from public.messages where id=source and deleted_at is null;
  if not found then raise exception using errcode='42501',message='FORBIDDEN';end if;
  if m.kind='text' then return public.send_text_message(destination,m.body,client_id);end if;
  if m.kind='location' then select * into point from public.message_locations where message_id=m.id;return public.send_location_message(destination,client_id,point.latitude,point.longitude,point.label);end if;
  if m.kind='contact' then select * into contact from public.message_contacts where message_id=m.id;return public.send_contact_message(destination,client_id,contact.profile_id);end if;
  raise exception using errcode='22023',message='INVALID';
end;
$$;
grant execute on function public.forward_structured_message(uuid,uuid,uuid) to authenticated;
