# Mnelo authentication

Phone OTP uses Supabase Auth through `@supabase/supabase-js` 2.115.0. Country metadata normalizes national/trunk/international input to E.164. Input validation never implies that a number has an account. New and existing accounts share the same send contract and generic error presentation. Only Auth verification may issue a session; no mobile OTP bypass exists for configured services.

On restore, the SDK loads and refreshes its persisted session, then the app calls Auth `getUser` before entering authenticated navigation. Invalid/revoked refresh state clears session storage; network failures present a retry state rather than silently claiming a signed-out or authenticated state. Foreground state starts refresh, background state pauses it. Current-session logout must succeed at Auth before the app reports it complete; offline logout UX remains part of Phase 19. Sign-out clears query data and removes channels. The mobile UI state contains no tokens.

## SecureStore

Native session storage uses Expo SecureStore with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` and the configured Android backup exclusion. Each entry holds at most 400 Unicode code points (at most 1600 UTF-8 bytes), below historical 2048-byte platform limits. Two fixed slots and an atomic pointer preserve the prior complete session during interrupted writes. Pending slot counts permit cleanup of interrupted values. Rotation clears superseded chunks; logout removes the pointer first and then both slots. Input/size checks fail without exposing values. This is storage segmentation; OS SecureStore provides encryption. There is no custom cryptography or E2EE claim.

Unit tests inject native-store failures and prove segmentation/atomicity/cleanup behavior. They do not prove actual Keychain/Keystore behavior; that remains native/device QA. Browser layout testing uses ephemeral memory only and does not persist tokens to localStorage or IndexedDB.

## Local test flow

Run `npm run db:start`, then `npm run db:env` to write only the loopback API URL and modern publishable key into ignored `.env.local`. The helper refuses to overwrite a different existing backend and does not write service-role keys. Restart Metro after changing environment configuration.

The local configuration supports these explicitly reserved development accounts:

| Phone        | Development code |
| ------------ | ---------------- |
| +15555550101 | 123456           |
| +15555550102 | 234567           |
| +15555550103 | 345678           |

The CLI requires an enabled provider configuration even for its test-code map. Local config therefore contains deliberately invalid, non-secret Twilio placeholder values and a PostgreSQL no-delivery hook. The hook replaces built-in delivery and always returns `SMS_UNAVAILABLE`; it never sends, stores or logs the supplied OTP/phone. Supabase's built-in test-code path bypasses delivery for the listed identities. The integration test proves an unlisted number is rejected, a reserved code signs in, wrong codes fail, resend is throttled, refresh/restore work, and Auth rejects the revoked refresh token after logout. The local app also rejects nonfixture phone submissions before transport.

Supabase CLI 2.116.0 sets local `GOTRUE_SMS_OTP_EXP=6000`; this differs from the required 300-second cloud OTP configuration. Reserved static test codes are not production OTP security and do not prove real SMS delivery/expiry. Never push local Auth config or test-code maps into a cloud project. Cloud Auth must use a real provider, 6-digit/300-second OTPs, at least a 60-second resend interval, anti-abuse limits and optional provider/CAPTCHA protection before public access. Access JWT lifetime is configured to 900 seconds locally and should remain short with refresh rotation in cloud environments.

`npm run test:auth` contacts only the fixed local API and resets only its reserved integration identities. It uses a server-role client strictly within test setup; the test file cannot enter the mobile bundle. Other development users are preserved. pgTAP fixtures use separate identities and roll back.

## Cloud/device limitations

No cloud Supabase project or production SMS provider is configured. Development phone tests send no real SMS. Native OTP autofill, actual SecureStore behavior, background refresh and physical-device keyboard behavior remain device gates. The local loopback URL is for this Mac/simulator; a physical phone needs an authorized development HTTPS backend. The repository does not relax URL or signing protections to disguise this distinction.

References: [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [phone sign-in](https://supabase.com/docs/guides/auth/phone-login), [SMS hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook), [Expo SecureStore source/docs](https://github.com/expo/expo/blob/main/docs/pages/versions/unversioned/sdk/securestore.mdx), [phone parsing](https://github.com/catamphetamine/libphonenumber-js).
