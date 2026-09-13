-- Enqueue only after setup. Otherwise a concurrent push worker could consume an unready event.
drop trigger call_push on public.call_sessions;
create trigger call_push after insert or update of room_ready on public.call_sessions for each row when(new.room_ready) execute function private.notification_event();
