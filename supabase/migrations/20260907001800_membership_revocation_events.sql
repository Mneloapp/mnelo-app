-- An own membership tombstone must remain visible so Realtime can deliver revocation.
-- It contains only the user's own role/read cursor, never another group's roster.
drop policy membership_visible on public.conversation_members;
create policy membership_visible on public.conversation_members for select to authenticated
using(user_id=(select auth.uid()) or private.can_read_conversation(conversation_id));
