# Public App Store preparation — September 12, 2026

Status: **NOT READY for public submission**. This is an engineering readiness result, not an Apple rejection. The owner explicitly requested public App Store distribution; the earlier TestFlight-only publication scope is superseded. Existing security and functional failures must still be resolved rather than disabled.

## Verified now

- Source at audit start: `91bb0d7544f4723f121d44031d02c6bece0ca0c0`, branch `refactor/device-owned-messenger`, initially clean.
- Full `npm run check`: PASS. 54 Jest suites / 288 tests, 3 server utility tests, 98 device/protocol tests = **389 passed**. TypeScript, lint, formatting, security, environment, localization and brand checks pass. These are automated tests, not two physical iPhone results.
- Expo Doctor **21/21** and dependency alignment PASS. Required CocoaPods PATH / Ruby logger environment supplied.
- Gitleaks source/history/bundles: **0 findings**.
- Fresh npm audit: **16 moderate, 0 high, 0 critical**, the same two advisory families documented in DEPENDENCY_AUDIT. The runtime decoder exposure remains a public-release concern; no force fix or suppression was applied.
- Hosted WSS verifies TLS and rejects forged signatures and correctly signed but unregistered identities. No SMS, account enrollment, push, calls or message content was sent by this probe.
- App Store Connect confirms **0.1.0 (9)** processing **Complete**, build ID `fb94f20f-7e9d-43dc-b5bb-dba7236363ce`, existing Mnelo Development assignment, external status Ready to Submit. Build 5 remains Waiting for Review. No duplicate upload was needed; successful archive/export/upload and exact IPA checksum are already in BUILD_LOG.
- Public distribution page is **Version 1.0 / Prepare for Submission**. Description, promotional copy, keywords and working marketing/support URLs were saved as draft. No build selected or review submitted, no legal declaration accepted, no public availability claimed.

## Concrete blockers

1. **Public registration:** current service admits the two owner-approved phone numbers plus isolated reviewer accounts, not general users. Published beta endpoints and provider limits are development-scoped. A public cohort requires reviewed production admission, persistent abuse controls, capacity/budget configuration, and number/key recovery policy. Do not remove the allowlist to make a store checkbox pass.
2. **Production environment and protocol:** `privacyRelease.reviewed=false`; production preflight exits nonzero with `MESSENGER_SECURITY_REVIEW_REQUIRED`. Dedicated production HTTPS/WSS configuration is absent. The preflight now excludes local dotenv fallback for production and explicitly rejects the known development service origins even when injected into the shell. A TestFlight preview is not a production artifact.
3. **Physical acceptance:** second iPhone enrollment is owner-confirmed and both phone bindings are verified, but two-way messages/media/voice/video are untested. Locked-screen/background alert and CallKit answer/audio paths, cellular/Wi-Fi traversal, rejection, reconnect and in-place update retention need actual device results.
4. **Known dependency risk:** malicious external query decoding has a documented runtime availability concern. A compatible remediation or reviewed, measured boundary is required before public security claims; see DEPENDENCY_AUDIT and native intent evidence.
5. **Store package:** the public version draft is 1.0, uploaded beta is 0.1.0. It has no screenshots, selected public build, copyright or public App Review sign-in/contact details. Privacy declarations, age rating, territories, release terms and legally required owner details still need completion. The previous France exclusion concerned the private test and is not a new global distribution declaration.

Apple's current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) distinguish complete public submissions (2.1) from beta testing (2.2). Post-release bug fixes cannot substitute for working public registration or required security/communication acceptance.

## Immediate physical testing route

The owner chose to connect the second iPhone by USB while Apple processes the external beta review. Use the same `com.mnelo.messenger` identity and Apple team; preserve any existing app/vault. Mac must detect the new device after Unlock / Trust. Register/provision that specific device through Xcode's normal automatic signing, then install a standalone Release build with embedded JavaScript and the existing scoped preview endpoints. A simulator app or App Store IPA cannot be assumed directly installable on an unprovisioned device.

Build 9's original archive has a one-device development profile and was preserved. At approximately 22:18 Tbilisi a fresh Release build with Xcode automatic signing successfully installed and launched on the newly connected iPhone Air. Its new profile covers both registered phones; actual registration-screen rendering was verified. The app includes hosted-preview JavaScript and uses development/sandbox APNs. No manual entitlement change or App Store IPA installation was used. The first phone's existing build 9 was not changed. Second-phone registration is now owner-confirmed and independently reflected in the registry; functional acceptance remains pending; see TWO_IPHONE_TESTING.

After installation, follow BETA_TEST_PLAN_KA and TWO_IPHONE_TESTING. Enter SMS codes on each phone only. First prove bidirectional messaging and calls with both devices online; then test locked-screen/background, Wi-Fi/cellular, reject/end, media, reconnect and update retention. Preserve the documented limitation: the service does not retain a conversation-content queue when devices are not simultaneously reachable.

Evidence: ignored `artifacts/public-release-*.log` and `public-release-audit.json`. Native build evidence from build 9 is reused only for the unchanged application source. The only code change in this audit is the local release-preflight script; it does not alter the installed mobile binary.
