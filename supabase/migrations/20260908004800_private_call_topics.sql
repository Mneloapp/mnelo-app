-- Multiple local subscribers use unique topics; every topic is bound to its actor.
create policy own_call_topic on realtime.messages for select to authenticated using(
 realtime.topic() ~ '^calls:[0-9a-f-]{36}:[0-9a-f-]{36}$' and split_part(realtime.topic(),':',2)=(select auth.uid())::text
);
