-- Call history is visible in chat, but does not produce a second message push.
create or replace function private.notification_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if tg_table_name='messages' then
  if new.deleted_at is null and new.kind<>'call' then
   for recipient in select m.user_id from public.conversation_members m where m.conversation_id=new.conversation_id and m.left_at is null and m.user_id<>new.sender_id loop
    perform private.enqueue_notification(recipient,'message',new.id,now()+interval '1 day');
   end loop;
  end if;
 elsif tg_table_name='connection_requests' then
  if tg_op='INSERT' and new.status='pending' then perform private.enqueue_notification(new.recipient_id,'request',new.id,least(new.expires_at,now()+interval '1 day'));
  elsif tg_op='UPDATE' and new.status='accepted' and old.status<>new.status then perform private.enqueue_notification(new.sender_id,'accepted',new.id,now()+interval '1 day');end if;
 elsif tg_table_name='matching_candidates' then
  select user_id into recipient from public.matching_requests where id=new.request_id;
  perform private.enqueue_notification(recipient,'match',new.request_id,new.expires_at);
 elsif tg_table_name='call_sessions' and new.status='ringing' then
  perform private.enqueue_notification(new.recipient_id,'call',new.id,new.expires_at);
 end if;
 return new;
end;
$$;
