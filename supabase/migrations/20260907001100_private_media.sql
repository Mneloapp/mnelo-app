-- Reserve metadata through an authorized caller; only the processing function writes Storage.
alter table public.message_attachments add column client_id uuid;
alter table public.message_attachments add constraint attachment_client_id unique(user_id,client_id);
create function public.reserve_attachment(conversation uuid, client_id uuid, file_name text, mime_type text, byte_size bigint, duration_seconds numeric default null)
returns public.message_attachments language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); result public.message_attachments;
begin
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if client_id is null or byte_size is null or byte_size not between 1 and 20971520 or mime_type not in ('image/jpeg','application/pdf','text/plain','application/octet-stream','audio/mp4') or
    file_name is null or char_length(file_name) not between 1 and 160 or file_name ~ '[[:cntrl:]/\\]' then raise exception using errcode='22023',message='INVALID'; end if;
  select * into result from public.message_attachments a where a.user_id=actor and a.client_id=reserve_attachment.client_id;
  if found then
    if result.conversation_id<>conversation or result.mime_type<>mime_type or result.file_name<>file_name then raise exception using errcode='23505',message='CONFLICT'; end if;
    return result;
  end if;
  perform private.rate_limit('upload',20,3600);
  insert into public.message_attachments(user_id,conversation_id,client_id,object_path,file_name,mime_type,byte_size,duration_seconds)
    values(actor,conversation,client_id,actor::text||'/'||conversation::text||'/'||client_id::text,file_name,mime_type,byte_size,duration_seconds) returning * into result;
  return result;
end;
$$;
create function public.complete_attachment(actor uuid, attachment uuid, actual_mime text, actual_bytes bigint, actual_duration numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.message_attachments a join storage.objects o on o.name=a.object_path and o.bucket_id='chat-media'
    where a.id=attachment and a.user_id=actor and a.status='pending' and a.created_at>now()-interval '1 hour') then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  update public.message_attachments set status='ready',mime_type=actual_mime,byte_size=actual_bytes,duration_seconds=actual_duration where id=attachment and user_id=actor;
end;
$$;
create function public.send_attachment_message(attachment uuid, caption text, client_id uuid) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); a public.message_attachments; result public.messages; peer uuid;
begin
  select * into a from public.message_attachments where id=attachment;
  if not found or a.user_id<>actor or a.status<>'ready' then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  perform 1 from public.conversations where id=a.conversation_id for update;
  for peer in select user_id from public.conversation_members where conversation_id=a.conversation_id and left_at is null and user_id<>actor order by user_id loop perform private.lock_pair(actor,peer);end loop;
  if not private.can_read_conversation(a.conversation_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if client_id is null or caption is null or char_length(caption)>1000 then raise exception using errcode='22023',message='INVALID'; end if;
  select * into result from public.messages m where m.sender_id=actor and m.client_id=send_attachment_message.client_id;
  if found then
    if result.attachment_id<>attachment or result.body<>caption then raise exception using errcode='23505',message='CONFLICT';end if;return result;
  end if;
  perform private.rate_limit('message',60,60);
  insert into public.messages(conversation_id,sender_id,client_id,kind,body,attachment_id)
    values(a.conversation_id,actor,client_id,case when a.mime_type='image/jpeg' then 'image' when a.mime_type='audio/mp4' then 'voice' else 'file' end,caption,attachment) returning * into result;
  update public.conversations set updated_at=result.created_at where id=a.conversation_id;
  return result;
end;
$$;
create function public.send_location_message(conversation uuid, client_id uuid, latitude numeric, longitude numeric, label text) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); result public.messages; peer uuid;
begin
  perform 1 from public.conversations where id=conversation for update;
  for peer in select user_id from public.conversation_members where conversation_id=conversation and left_at is null and user_id<>actor order by user_id loop perform private.lock_pair(actor,peer);end loop;
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if client_id is null or latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180 or label is null or char_length(label)>240 then raise exception using errcode='22023',message='INVALID';end if;
  select * into result from public.messages m where m.sender_id=actor and m.client_id=send_location_message.client_id;
  if found then
    if result.conversation_id<>conversation or result.kind<>'location' then raise exception using errcode='23505',message='CONFLICT';end if;return result;
  end if;
  perform private.rate_limit('message',60,60);
  insert into public.messages(conversation_id,sender_id,client_id,kind) values(conversation,actor,client_id,'location') returning * into result;
  insert into public.message_locations(message_id,latitude,longitude,label) values(result.id,latitude,longitude,label);
  update public.conversations set updated_at=result.created_at where id=conversation;
  return result;
end;
$$;
create function public.send_contact_message(conversation uuid, client_id uuid, contact uuid) returns public.messages
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); result public.messages; peer uuid;
begin
  perform 1 from public.conversations where id=conversation for update;
  for peer in select user_id from public.conversation_members where conversation_id=conversation and left_at is null and user_id<>actor order by user_id loop perform private.lock_pair(actor,peer);end loop;
  if not private.can_read_conversation(conversation) or not private.can_view_profile(contact) then raise exception using errcode='42501',message='FORBIDDEN';end if;
  if client_id is null then raise exception using errcode='22023',message='INVALID';end if;
  select * into result from public.messages m where m.sender_id=actor and m.client_id=send_contact_message.client_id;
  if found then
    if result.conversation_id<>conversation or result.kind<>'contact' then raise exception using errcode='23505',message='CONFLICT';end if;return result;
  end if;
  perform private.rate_limit('message',60,60);
  insert into public.messages(conversation_id,sender_id,client_id,kind) values(conversation,actor,client_id,'contact') returning * into result;
  insert into public.message_contacts(message_id,profile_id) values(result.id,contact);
  update public.conversations set updated_at=result.created_at where id=conversation;
  return result;
end;
$$;
grant execute on function public.reserve_attachment(uuid,uuid,text,text,bigint,numeric),public.send_attachment_message(uuid,text,uuid),public.send_location_message(uuid,uuid,numeric,numeric,text),public.send_contact_message(uuid,uuid,uuid) to authenticated;
revoke all on function public.complete_attachment(uuid,uuid,text,bigint,numeric) from public,anon,authenticated;
grant execute on function public.complete_attachment(uuid,uuid,text,bigint,numeric) to service_role;
-- Ready private uploads can be read by the uploader before send, or by current members once sent.
drop policy chat_object_read on storage.objects;
create policy chat_object_read on storage.objects for select to authenticated using(bucket_id='chat-media' and exists(
  select 1 from public.message_attachments a where a.object_path=name and a.status='ready' and private.can_read_conversation(a.conversation_id) and
  (a.user_id=auth.uid() or exists(select 1 from public.messages m where m.attachment_id=a.id and m.deleted_at is null))));
