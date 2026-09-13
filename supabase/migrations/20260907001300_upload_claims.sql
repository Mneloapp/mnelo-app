-- Each processing attempt owns a distinct object path; stale workers cannot replace a published file.
alter table public.message_attachments add column processing_token uuid;
alter table public.message_attachments add column processing_started_at timestamptz;
create function public.claim_attachment(actor uuid, attachment uuid) returns public.message_attachments
language plpgsql security definer set search_path = '' as $$
declare result public.message_attachments; claim uuid := gen_random_uuid();
begin
  update public.message_attachments a set processing_token=claim,processing_started_at=now(),
    object_path=actor::text||'/'||a.conversation_id::text||'/'||a.client_id::text||'/'||claim::text
  where a.id=attachment and a.user_id=actor and a.status='pending' and
    (a.processing_token is null or a.processing_started_at<now()-interval '2 minutes') returning * into result;
  if not found then raise exception using errcode='23505',message='CONFLICT'; end if;
  return result;
end;
$$;
drop function public.complete_attachment(uuid,uuid,text,bigint,numeric);
create function public.complete_attachment(actor uuid, attachment uuid, claim uuid, actual_mime text, actual_bytes bigint, actual_duration numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.message_attachments a set status='ready',mime_type=actual_mime,byte_size=actual_bytes,duration_seconds=actual_duration,
    processing_token=null,processing_started_at=null
  where a.id=attachment and a.user_id=actor and a.processing_token=claim and a.status='pending' and
    exists(select 1 from storage.objects o where o.name=a.object_path and o.bucket_id='chat-media');
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
end;
$$;
create function public.release_attachment_claim(actor uuid, attachment uuid, claim uuid) returns void
language sql security definer set search_path = '' as $$
  update public.message_attachments set processing_token=null,processing_started_at=null where id=attachment and user_id=actor and processing_token=claim and status='pending';
$$;
revoke all on function public.claim_attachment(uuid,uuid),public.complete_attachment(uuid,uuid,uuid,text,bigint,numeric),public.release_attachment_claim(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_attachment(uuid,uuid),public.complete_attachment(uuid,uuid,uuid,text,bigint,numeric),public.release_attachment_claim(uuid,uuid,uuid) to service_role;
