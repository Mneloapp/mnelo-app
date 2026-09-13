-- Completed call events participate in the conversation inbox cursor.
create or replace function private.call_terminal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  insert into private.call_room_cleanup(call_id,caller_id,recipient_id) values(old.id,old.caller_id,old.recipient_id) on conflict(call_id) do update set completed_at=null;
  return old;
 end if;
 if new.status not in('ringing','accepted') and old.status in('ringing','accepted') then
  insert into private.call_room_cleanup(call_id,caller_id,recipient_id) values(new.id,new.caller_id,new.recipient_id) on conflict(call_id) do update set completed_at=null;
  insert into public.messages(conversation_id,sender_id,client_id,kind,body,call_session_id)
  values(new.conversation_id,new.caller_id,gen_random_uuid(),'call',new.media||':'||new.status,new.id) on conflict(call_session_id) do nothing;
  update public.conversations set updated_at=greatest(updated_at,now()) where id=new.conversation_id;
 end if;
 return new;
end;
$$;
