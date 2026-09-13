-- Deny new private-channel joins from a revoked session, not only database events.
create policy mnelo_live_session_required on realtime.messages as restrictive for all to authenticated
 using((select private.session_active())) with check((select private.session_active()));
