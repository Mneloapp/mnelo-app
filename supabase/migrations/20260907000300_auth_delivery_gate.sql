-- Fail-closed transport for local Auth. Supabase test OTP values bypass delivery.
-- This function never sends, stores or logs the supplied phone or OTP. Cloud Auth must configure
-- a real provider separately and must never enable the local test-code map.
create function private.reject_unconfigured_sms(event jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select '{"error":{"http_code":400,"message":"SMS_UNAVAILABLE"}}'::jsonb;
$$;
revoke all on function private.reject_unconfigured_sms(jsonb) from public,anon,authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.reject_unconfigured_sms(jsonb) to supabase_auth_admin;
