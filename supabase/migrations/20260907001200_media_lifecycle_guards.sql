-- Invalid media retry attempts are rate limited too; deleting a message revokes new attachment access and removes exact-location/contact payloads.
create or replace function public.reserve_attachment(conversation uuid, client_id uuid, file_name text, mime_type text, byte_size bigint, duration_seconds numeric default null)
returns public.message_attachments language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user(); result public.message_attachments;
begin
  if not private.can_read_conversation(conversation) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if client_id is null or byte_size is null or byte_size not between 1 and 20971520 or mime_type not in ('image/jpeg','application/pdf','text/plain','application/octet-stream','audio/mp4') or
    file_name is null or char_length(file_name) not between 1 and 160 or file_name ~ '[[:cntrl:]/\\]' then raise exception using errcode='22023',message='INVALID'; end if;
  perform private.rate_limit('upload',20,3600);
  select * into result from public.message_attachments a where a.user_id=actor and a.client_id=reserve_attachment.client_id;
  if found then
    if result.conversation_id<>conversation or result.mime_type<>mime_type or result.file_name<>file_name then raise exception using errcode='23505',message='CONFLICT'; end if;
    return result;
  end if;
  insert into public.message_attachments(user_id,conversation_id,client_id,object_path,file_name,mime_type,byte_size,duration_seconds)
    values(actor,conversation,client_id,actor::text||'/'||conversation::text||'/'||client_id::text,file_name,mime_type,byte_size,duration_seconds) returning * into result;
  return result;
end;
$$;
create or replace function public.delete_own_message(message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_user();
begin
  if not private.can_read_message(message) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  perform private.rate_limit('delete_message',60,60);
  update public.messages set body='',deleted_at=coalesce(deleted_at,now()) where id=message and sender_id=actor;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  update public.message_reactions set active=false where message_id=message;
  delete from public.message_locations where message_id=message;
  delete from public.message_contacts where message_id=message;
  update public.message_attachments set status='rejected' where id=(select attachment_id from public.messages where id=message);
end;
$$;
