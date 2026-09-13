# Phone registration and exact-number lookup

> September 12 reviewer update: two owner-authorized, expiring Apple review accounts use separate access keys, with server-enforced isolation from the real SMS tester cohort. The hosted identity and transient relay share the current registration policy; no message/history queue was added. See [review access and verified boundaries](APPLE_REVIEW_ACCESS.md). Ordinary registration still uses SMS.

> Current hosted development status (2026-09-12): HTTPS service deployed with admitted testers, a loopback proxy trust boundary and persistent aggregate SMS reservations. Infobip pay-as-you-go is enabled with $20 balance; exactly two owner-selected testers are admitted. The owner received SMS and completed verification on the first physical iPhone; one hosted identity and one send reservation corroborate it. The second phone is pending. [Exact hosting state](DEVELOPMENT_HOSTING.md). Earlier loopback-only/no-deployment observations below are historical.

Owner request: 2026-09-10, following the local-only registration explanation. This supersedes the former prohibition on a phone directory, narrowly for registration and finding known numbers. It does not authorize storing private messages, attachments, calls/history, address books, group membership, private identity keys or backup keys.

## Implemented

Launch presents the approved Mnelo Welcome mark, then automatically opens a minimal phone form with a large centered Mnelo wordmark. Continue sends the code explicitly; no extra introductory step is required. Number discovery is on by default for registration, with no checkbox in enrollment. The owner can disable it in Me > Privacy; replacement numbers keep the existing visibility choice. A small Privacy link explains these defaults and the minimal registration data without crowding the form. The country code is the leading selectable part of the same field as the national number. Sending creates a local signing identity only if none exists, without requiring a name. Successful OTP stores a device-local enrollment receipt and unlocks Chats, Calls and Me. Creating keys, entering a number, requesting SMS, a wrong/expired code or a legacy display cache cannot unlock features or peer transport. Existing unverified histories and keys are preserved behind this gate. Me offers Change phone number, while Me > Privacy manages discovery and unlink. A failed/cancelled number change leaves the previous enrollment intact. Unlink retains history but returns the app to verification.

The identity HTTP service is loopback-only, on port 8086, and isolated from the transient relay. Endpoints accept bounded, strict JSON, one-use device-signed challenges and no arbitrary database operations. Response caching, CORS and proxy-header trust are disabled. SMS requests are limited by number, key, source and a global budget. Verification has at most five local checks per attempt, a ten-minute expiry and a sixty-second resend cooldown; providers may enforce stricter limits (Vonage documents three code attempts). Exact lookup has 30 requests per verified device/hour and 60/source/hour. These are development defaults, not proof of Internet-scale abuse resistance.

The server stores four fields: keyed phone index, public identity, discoverability and verification time. It receives raw numbers transiently and the SMS provider necessarily receives its destination. HMAC indexing is pseudonymization, not anonymity, and does not hide submitted numbers from the service operator. No general “Mnelo stores no information” promise is valid with this requested model. Conversation-content promises remain unchanged.

Phone verification authenticates control of a number; it does not authenticate an encryption key independently of the directory operator. The result UI therefore still requires comparing the full Mnelo public code with the person through a trusted channel before pinning. Both people must add each other. Silent phone-to-key trust or automatic message acceptance is deliberately not implemented; reviewed key transparency/private contact discovery is separate work.

SMS alone cannot overwrite an existing bound identity. Restore the user's own backup/key, or unlink the number using the old device first. Recycled-number reclamation, lost-all-keys recovery, multi-device enrollment and identity transfer need a reviewed ownership/notification design before release. Existing conversations/keys are never recovered from the SMS service. Local phone display state is omitted from backup so a restored cache cannot pretend to be current server verification.

## Country and national-number entry — 2026-09-11

Registration and Me > Change phone number share an integrated PhoneNumberField. Georgia (+995) is the initial selection; its inline code button opens a country modal localized in English/Georgian, searchable by country name, ISO code or calling code. Valid international paste splits into code and national number. Country changes preserve and revalidate the number. The input uses native text metrics, accessible country names, adaptive height and keyboard insets. This does not imply provider coverage for every selectable country.

The send action stays explicit and uses the normalized number. The selected country is not uploaded as another profile field or stored in the directory. This picker is not a claim that every country/number is enabled on the provider's trial; the existing Infobip verified-recipient restriction still applies. OTP, ownership, cooldowns, resend destination and privacy rules are unchanged.

## Registration-only SMS decision — 2026-09-11

The owner initially selected Twilio Verify, then requested another trial platform after Twilio signup rejected the Magti number with `[0x07]`. The owner subsequently authenticated with Infobip, which is now the configured development provider; Vonage Verify V2 and Twilio remain available by explicit selection. Keep all providers behind `SmsVerification`: neither the account identity nor the conversation protocol may depend on a provider verification ID. Trial expiry or replacement of the SMS supplier must not expire an already registered Mnelo identity.

SMS is used only for explicit enrollment on a device, verification of a changed number, and controlled resends. A valid stored enrollment reopens offline without SMS or an online status request. Enrollment is bound to the configured identity-service origin; changing the SMS adapter behind that origin does not invalidate it. Restoring an archive preserves keys/history/profile but requires verification on the restored installation. A newly generated key is not the old identity merely because it verifies the same number.

The existing “Use another number” action is enrollment of a new number, requiring proof of that number; it is not a periodic reauthentication prompt. It must never be triggered automatically. No SMS-only account/key recovery, passkey recovery or remote multi-device transfer is implemented. Losing every copy of the private key/archive cannot be repaired by an SMS code. These restrictions preserve participant-owned histories.

All adapters send only an SMS verification request and check its result. They have no automatic voice/WhatsApp fallback or resend loop. Provider downtime must leave existing device conversations and signed registration operations independent of SMS availability. Sending quotas and resend cooldowns remain enforced; a registration can consume more than one SMS if the person requests retries. A free trial is a testing entitlement, not a production cost or availability guarantee.

## Run the local fixture

```sh
npm run identity:local
```

Mobile public configuration: `EXPO_PUBLIC_PHONE_IDENTITY_URL=http://127.0.0.1:8086` with `EXPO_PUBLIC_APP_ENV=local`. Restart Metro after changing the endpoint. Android uses `adb reverse tcp:8086 tcp:8086`, like the existing Metro/relay loopback tunnels.

Only reserved fictional numbers `+12025550101` and `+12025550102` are accepted. Fixture code: `864209`. Nothing is sent to a subscriber. The UI explicitly marks this mode. The service uses ignored `.local/phone-fixture/` files, directory mode 0700 and file creation mask 0077; its index key never appears in output. Losing an existing index key fails closed instead of generating a replacement over the database.

The real provider mode uses a separate `.local/phone-sms/` database. Mobile receipts record service origin and fixture status; fixture receipts are accepted only in the local app environment and cannot unlock preview/production. Keep real and fixture services on distinct origins when switching during QA; never replace a live registry with a fixture at the same origin. Do not expose the loopback fixture through a tunnel or deploy it publicly.

## Infobip development integration — 2026-09-11

The owner authenticated in the Infobip portal and completed its number verification. The account displayed **60 trial days remaining and 15/15 free SMS**; the authenticated 2FA guide explicitly supports OTP testing to the account's verified recipient. No payment, balance top-up, branded sender registration or production upgrade was performed. The portal's template example uses `ServiceSMS`, which is retained as the test sender; the message itself identifies Mnelo. This is not a registered Mnelo sender or proven carrier delivery.

Created exactly one **Mnelo Development** 2FA application and one SMS template after listing and confirming no existing applications/templates. Settings: enabled; numeric six-digit PIN; ten-minute validity; five check attempts; single-use verification; provider check rate `1/3s`; application sending limit `15/1d`; recipient limit `3/1d`. These provider limits supplement the local quotas above and do not reset when the local process restarts. They are development limits, not the total free-trial quota or a production capacity claim. The editable template is: `Your Mnelo verification code is {{pin}}. Do not share this code.`

The dedicated **Mnelo Development OTP** key has only `2fa:manage` and expires **2026-11-10**. The official configuration-read endpoints require that scope; it includes management rights and is broader than send-only. No account, billing, contacts or other channel scope was granted. Before production, review separate configuration/runtime credentials and stable egress restrictions. Do not broaden permissions to resolve an unrelated error. The key and resource identifiers are stored only in ignored `.local/phone-sms/infobip.env` (0600; directory 0700), loaded solely into the identity-service child process. Never source this file into a Metro shell, paste it into chat, or prefix a provider credential with `EXPO_PUBLIC_`. `identity/.env.example` contains empty placeholders only.

For this configured Mac:

```sh
# Read-only: checks real API access and remote application/template safety; sends no SMS.
npm run identity:check:infobip
# Start the real provider on Mac loopback, after stopping any fixture on port 8086.
npm run identity:sms
```

`identity:sms:infobip` is an explicit alias. On a new checkout, provide the four variables from `identity/.env.example` through a private server environment or the ignored 0600 file. Missing configuration fails closed before registry creation. The real providers share `.local/phone-sms/`; never delete its index key or run two services against that database. `identity:local` stays in a distinct fictional-number directory.

The adapter reads the remote application and template before each send, rejecting disabled, reusable, non-six-digit, wrong-application or excessive-attempt configurations. Both reads plus the send share a ten-second deadline. The official `POST /2fa/2/pin?ncNeeded=false` uses SMS only, omits Number Lookup, sets `trackDelivery: false` and has no retry, voice fallback, callback or contact upload. `MESSAGE_SENT` means provider acceptance, not receipt or identity approval. Registration requires a boolean `verified: true` for the exact PIN ID from `POST /2fa/2/pin/{pinId}/verify`, plus the existing signed local attempt. Errors are redacted; malformed responses, redirects and unexpected hosts cannot expose credentials or approve registration. An ambiguous send timeout must not be retried automatically.

On 2026-09-11 the authenticated application listing returned HTTP 200, and application/template creation both completed successfully. Subsequent live read-only validation passed against both actual resources. Automated provider tests use fictional numbers and mocked HTTP, never the account's free SMS. A real receipt/verification test requires the owner to deliberately enroll the **same number already verified in Infobip**, then enter the received code in Mnelo. The portal exposes that recipient; do not copy it into source, logs or this document. Do not delete an existing device identity to repeat registration. SMS cannot recover conversation history or replace a previously bound key.

For iOS Simulator, start Metro with only public configuration `EXPO_PUBLIC_APP_ENV=local EXPO_PUBLIC_PHONE_IDENTITY_URL=http://127.0.0.1:8086`. The server key must not be in that process environment. The physical iPhone cannot reach the Mac's loopback address; it still needs a reviewed HTTPS service reachable from the phone. No insecure LAN exception, public fixture tunnel or unreviewed hosting was introduced. Physical OTP/autofill and Magti delivery remain pending actual testing.

Infobip necessarily receives the destination, OTP and request metadata. `trackDelivery: false` is not a deletion or zero-retention guarantee. Review provider retention, regional processing, sender requirements and pricing before production; no conversation data, private identity keys or backups are sent to it. Current official docs disagree about whether a trial supports one or five verified recipients; the live account's verified-recipient list controls testing, and no extra recipient allowance is promised.

Sources checked: [trial restrictions](https://www.infobip.com/docs/essentials/getting-started/free-trial), [SMS/2FA trial workflow](https://www.infobip.com/docs/sms/get-started), [create application](https://www.infobip.com/docs/api/platform/2fa/2fa-configuration/manage-applications/create-2fa-application), [template](https://www.infobip.com/docs/api/platform/2fa/2fa-configuration/manage-message-templates/create-2fa-message-template), [send PIN](https://www.infobip.com/docs/api/platform/2fa/pin-sending-and-verification/send-pin-over-sms/send-2fa-pin-code-over-sms), [verify PIN](https://www.infobip.com/docs/api/platform/2fa/pin-sending-and-verification/verify-pin/verify-2fa-phone-number).

## Earlier Vonage trial preparation — 2026-09-11

Owner-reported blocker: Twilio's own signup refused the owner's Magti number with `[0x07]`. Its cause was not established; this is not evidence that all Magti or Georgian numbers are unsupported, nor an error from Mnelo's OTP endpoint. No account restriction is bypassed, no disposable number is used and no paid service is purchased.

First owner action: [sign up for a Vonage API trial](https://dashboard.nexmo.com/sign-up) and verify the owner's email and actual Magti number. The official [trial guide](https://api.support.vonage.com/hc/en-us/articles/204014853-How-do-I-add-test-numbers-during-my-Vonage-API-trial) advertises €2 test credit and verified recipient restrictions; [payment method setup is optional for trial](https://developer.vonage.com/en/dashboard/getting-started). The [Verify dashboard guide](https://developer.vonage.com/en/dashboard/build/verify/verify-a-user) describes a real-code test against the registered number using account credit. Georgia has [documented SMS support/restrictions](https://api.support.vonage.com/hc/en-us/articles/360012526691-Georgia-SMS-Features-and-Restrictions); this does not prove Magti delivery or signup acceptance. Inspect actual trial credit and Verify V2 availability in the authenticated account before initiating a test. Do not add paid balance or automatic replenishment without the owner's billing authorization.

The server implements [Verify V2](https://developer.vonage.com/en/api/verify.v2), not sunset V1. Setup needs only `VONAGE_API_KEY` and `VONAGE_API_SECRET`, supplied privately to the server process environment. Never place them in chat, `EXPO_PUBLIC_*`, the mobile bundle or committed files. No keys were created or obtained by the agent. [Basic authentication](https://developer.vonage.com/en/verify/concepts/authentication) is officially supported for this loopback trial; a Vonage Application and public webhook are not required. Production should migrate the server adapter to short-lived, scoped JWT authentication and reviewed callback handling as recommended by Vonage; this is not claimed implemented.

Run `npm run identity:sms:vonage` after the private Vonage environment is available. The default `identity:sms` now selects Infobip. `npm run identity:sms:twilio` selects the preserved Twilio adapter. `npm run identity:local` still uses only fictional numbers. Conflicting/unknown flags fail before local state creation. All real providers share `.local/phone-sms/`, preserving the number registry/index key across a deliberate provider switch; the fixture remains isolated. Restarting clears pending OTP attempts, not registered identities. Never run two identity processes against the same registry/port.

Vonage requests a single SMS workflow with the Mnelo brand, a six-digit code and a 600-second channel timeout. Credentials are sent only in the HTTPS Authorization header. Completion must name the exact provider request ID and have status `completed`; delivery/acceptance is not verification. Invalid codes, expiry, concurrency rejection and throttling map to redacted app errors. A network error or malformed response fails closed with no automatic retry, provider fallback, logging of raw responses or downgrade to the fixture. Fraud protection is not disabled by the request; verify account anti-fraud settings and geographic permissions before real sends.

Vonage may refuse a new request while an earlier one for the same number is active. Mnelo preserves the earlier local attempt if a resend is rejected, so the person can still enter that code; a successful replacement invalidates it. Concurrent sends for the same device and checks during a pending replacement are rejected. No cancellation API is called automatically. An ambiguous network timeout cannot guarantee remote provider state: no blind retry is attempted, and expiry/provider review may be required. Provider checks may expire earlier than the app's local maximum and are authoritative.

The provider necessarily receives the destination number and handles OTP/operational records. Do not apply Twilio's retention statements to Vonage: review Vonage's contractual retention, deletion and regional processing before production. The provider does not receive chat contents, participant private keys or backups. Real Magti SMS receipt, OTP submission, iPhone autofill and hosted deployment remain unverified.

## Earlier provider research — 2026-09-11

The owner subsequently reports that Vonage email verification completed but dashboard login returns `Issue With Your Account — We are unable to sign you in as there is an issue with your account.` Its cause has not been established; do not classify this as a Magti delivery failure. No usable Vonage account or live SMS entitlement has been verified.

The next researched candidate is [Infobip](https://www.infobip.com/signup). Its official [signup guide](https://www.infobip.com/docs/essentials/getting-started/create-an-account) supports Google/GitHub signup, requires number verification, does not require a card at signup and describes a 60-day trial. The current [SMS guide](https://www.infobip.com/docs/sms/get-started) specifies 15 free SMS messages and five verified recipients, includes a 2FA-with-SMS flow, and states worldwide self-signup coverage except listed countries; Georgia is not among those exceptions. This does not prove the owner's signup acceptance, Magti delivery, exact successful-OTP quota or production pricing. Confirm actual account entitlement and receipt before selecting it for live Mnelo registration.

Telnyx was also checked. Its [August 2026 pretrial guide](https://support.telnyx.com/en/articles/14327893-telnyx-pretrial-accounts) requires a LinkedIn/GitHub verification upgrade before AI-only pretrial credit becomes $5 general-product trial credit. Older signup documentation says no free-credit promotion, and account-tier restrictions also apply. It is not presented as an immediately usable free OTP account for this owner.

At that earlier research checkpoint Infobip had not been configured. This is superseded by the authenticated Infobip development integration above; Vonage/Twilio are retained alternatives. The fictional-number fixture remains available independently of provider accounts. Physical-iPhone service reachability is a separate prerequisite; see [IPHONE_DEVELOPMENT](IPHONE_DEVELOPMENT.md).

## Twilio preparation (retained alternative)

The server-side `SmsVerification` adapter can be replaced without touching the conversation protocol. A Twilio Verify adapter is implemented against the official [start verification](https://www.twilio.com/docs/verify/api/verification) and [verification check](https://www.twilio.com/docs/verify/api/verification-check) endpoints. Only an `approved` check is accepted; provider timeout/error fails closed. Its HTTP contract is tested with a fake fetch response, not a billed SMS.

Official conditions checked 2026-09-11: the [Twilio trial](https://www.twilio.com/docs/usage/trials) expires 30 days after signup, needs no credit card, includes Georgia in its supported-country list and restricts trial recipients/geography. The [Verify API prerequisites](https://www.twilio.com/docs/verify/api/verification) explicitly require pre-verifying trial recipient numbers and also specify the 30-day expiry. Trial access is limited, not 30 days of unlimited OTP traffic. The general trial's 100 Messaging SMS units are **not evidence of 100 free Verify approvals**: confirm the actual Verify entitlement and usage in the owner's Console before any real request. Do not upgrade, add paid balance or enable automatic replenishment as part of the trial preparation. No entitlement, account approval or carrier delivery has been inspected in an authenticated account yet.

First owner action: [create the Twilio trial account](https://www.twilio.com/try-twilio) and verify the owner's email and Georgian test number. Then inspect Verify access/remaining trial units and create the service below. Additional test recipients must first be verified in the Console. A production upgrade is an explicit owner billing action; the same provider adapter can remain in use afterward. Keep automated UI/protocol tests on the local fixture so they consume no trial SMS.

Owner action: create an SMS-enabled Verify Service in the [Twilio Verify console](https://console.twilio.com/us1/develop/verify/services). Configure its code length to 6, keep fraud protections on and enable only the countries required for the test. Provision the following in the server process's private environment, never in `EXPO_PUBLIC_*`, chat, committed files or the mobile bundle:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Then run `npm run identity:sms:twilio`. This still binds only to loopback for an owner-controlled test; no hosting or billing action has been performed by the agent. A real SMS end-to-end result cannot be claimed until this prerequisite and a recipient's deliberate verification are available.

The provider's own retention differs from Mnelo's conversation storage policy: Twilio marks the destination field in its [verification check resource](https://www.twilio.com/docs/verify/api/verification-check) as PII with a 30-day maximum time to live. Review provider contractual/operational retention rather than promising that no third party holds a number.

## Release limits

No hosted identity endpoint, actual SMS delivery, physical-device OTP autofill or automatic address-book matching has been verified. A public service needs TLS, reviewed deployment and retention rules, restart-resistant rate limiting and anti-enumeration controls, distributed nonce handling if scaled, ownership/recycled-number recovery policy, provider regional configuration/billing and independent security review. In-memory rate limits reset when this development process restarts. Existing public-release gates remain closed. The old Supabase persistence stack remains disconnected.
