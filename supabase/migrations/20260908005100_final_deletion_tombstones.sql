create index messages_sender_deletion_idx on public.messages(sender_id,id) where sender_id is not null;
-- Final row-locked deletion also catches writes committed after an earlier cleanup batch.
create function private.before_profile_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.call_sessions set status='ended',ended_at=now() where status in('ringing','accepted') and old.id in(caller_id,recipient_id);
 update public.messages set body='',deleted_at=coalesce(deleted_at,now()),attachment_id=null where sender_id=old.id;
 delete from public.message_locations l using public.messages m where l.message_id=m.id and m.sender_id=old.id;
 delete from public.message_contacts c using public.messages m where c.message_id=m.id and m.sender_id=old.id;
 return old;
end;
$$;
create trigger erase_profile_payloads before delete on public.profiles for each row execute function private.before_profile_deletion();
