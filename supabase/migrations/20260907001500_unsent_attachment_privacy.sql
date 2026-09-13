-- Private drafts include filenames/metadata, not only object bytes.
drop policy attachment_member on public.message_attachments;
create policy attachment_member on public.message_attachments for select to authenticated using(
 private.can_read_conversation(conversation_id) and (user_id=auth.uid() or (status='ready' and exists(
  select 1 from public.messages m where m.attachment_id=message_attachments.id and m.deleted_at is null))));
