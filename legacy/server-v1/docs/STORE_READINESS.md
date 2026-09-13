# Mnelo store readiness — owner review required

Status: **NOT READY FOR STORE SUBMISSION**. This is an engineering inventory and checklist, not finalized legal advice, a privacy policy, store declaration or proof of approval. The actual build/test status is in QA_REPORT.md and BUILD_LOG.md. The companion `docs/store/metadata.json` deliberately leaves unknown owner/legal/live URL fields null.

## Shared product metadata

Display/product name Mnelo; bundle/package `com.mnelo.app`; scheme `mnelo`; website `https://mnelo.com`; current version 0.1.0, local native build 1. EAS production increments remotely after project setup. English and Georgian are implemented; native-speaker review remains. The temporary letter M asset must be replaced only with approved final artwork. Editable positioning is “Connect with what you need.” No permanent slogan, false match percentages or verification badges.

Do not assume store name availability, create duplicate App IDs, or change identity to bypass registration. The owner confirmed no former working-name app identity was registered externally. Inspect the authenticated accounts before creating the official records. No store ID, legal entity, support contact, age rating or privacy URL has been invented.

## Permission inventory

| Capability       | Configured purpose / use                                                                   | Acceptance still needed                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Camera           | User-chosen photo and video call; English/Georgian iOS purpose strings                     | Physical iPhone/Android permission denial/recovery and real hardware       |
| Microphone       | User-chosen calls and voice recordings; foreground recording only                          | Audio routing, interruptions, Bluetooth and hardware quality               |
| Photos           | System picker and optional profile/chat image                                              | Limited library/OS version behavior on physical iPhone                     |
| Contacts         | Explicit system contact picker/invitation, no address-book upload                          | Real selected-contact scoped access; native empty picker/cancel was tested |
| Location         | Explicit one-point conversation share; no live/background tracking                         | Physical GPS and approximate consent; synthetic Android point passed       |
| Notifications    | Explicit preference/token registration; Android notification permission supplied by module | Actual APNs/FCM permission, token, receipt and delivery checks             |
| Background audio | Call audio lifecycle; recording/background location disabled                               | Real background/interruption/killed-app call behavior                      |
| Local network    | Development launcher/loopback test services only                                           | Verify final production archive excludes development launcher behavior     |

SecureStore protects sessions without requesting biometric authentication. Phase 29 disables the inherited unused Face ID permission description. Check the final archive's aggregated permissions and privacy manifests, not only app.config.ts. Broad external-storage/write-contacts/overlay permissions are blocked in configuration; inspect the final merged manifest for each build type. Android Bluetooth/audio permissions come from the call SDK; runtime behavior requires hardware QA.

## Data inventory for owner disclosures

| Data                                                 | Actual implementation                                                                            | Disclosure/retention review                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Phone number                                         | Private Supabase Auth; optional connection-only consent path                                     | SMS provider, processor location and Auth retention                                  |
| Name/username/profile image/capability               | User-authored identity, bounded privacy-filtered discovery                                       | Linked user content and profile discoverability                                      |
| Need/offer and raw Connect request                   | Deterministic server interpretation and auditable candidate evidence                             | Raw text may itself contain personal information; no paid AI processor configured    |
| Messages/replies/reactions/groups/files/photos/voice | Authenticated membership, private Storage and authorized URLs                                    | User content is server readable; no E2EE claim; file malware scanning not configured |
| Exact location                                       | Only an explicitly sent conversation point                                                       | It is still collected when shared, even though absent from public profiles/matching  |
| Coarse area/availability/language                    | User-provided matching inputs                                                                    | No inferred live GPS or invented profile facts                                       |
| Call audio/video and call metadata                   | LiveKit media transport, short-lived server token; persistent call history; no recording feature | Review actual hosted LiveKit infrastructure/retention and SDK practices              |
| Device/session/push token                            | Private session-bound rows and generic notification events                                       | Actual Expo/APNs/FCM processing, diagnostics and provider retention                  |
| Reports/blocks/reviews/deletion jobs                 | Restricted records; no reporter enumeration or client verification                               | Operator access, abuse evidence, legal holds/backups and retention schedule          |

Do not select “no data collected” merely because RLS/private buckets exist. SDK/provider collection must also be reviewed. No advertising/tracking/analytics SDK was intentionally integrated, but that is not a completed store tracking declaration. [Apple privacy data categories](https://developer.apple.com/app-store/app-privacy-details/), [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

## Apple checklist

- [ ] Owner authenticates correct Developer/App Store Connect team, completes legal entity/contact/contracts and verifies name/identifier availability.
- [ ] Supported-Xcode/EAS iOS build completes; final archive version/build/signing, capability entitlements and privacy manifests inspected.
- [ ] Physical iPhone acceptance in IPHONE_DEVELOPMENT.md passes, including auth, keyboard, media, calls, push, background and deletion.
- [ ] Public privacy policy, support contact/URL and terms are approved and reachable; add their final in-app access as part of release integration. These are currently placeholders, not live pages.
- [ ] Review App Privacy answers from the actual hosted configuration, including linked content, precise location when shared, identifiers and third-party processing.
- [ ] Owner answers age rating, content rights, export compliance/encryption and regional legal declarations. Do not assume an age rating for a user-to-user messenger/discovery service.
- [ ] Reviewer access uses a dedicated authorized review environment/account and documented OTP access, never production bypasses or committed credentials. Review notes explain Connect consent, calls and deletion.
- [ ] Screenshot set uses the actual accepted iPhone build: Welcome/auth, Chats, conversation, Connect, interpretation/results, requests and privacy. Use consenting development fixtures; no fabricated badges, private content or device-pass screenshots from a browser.
- [ ] User-generated-content operating policy covers filtering objectionable material, report handling, blocking, response ownership and published contact information. Block/report boundaries exist; production filtering/response operations are not yet certified. [Apple UGC review guidance](https://developer.apple.com/app-store/review/guidelines/#user-generated-content).

Me → Account → Delete account is implemented, and local E2E reached backend-confirmed deletion. Production workers/retention still need deployment and review. Apple requires an accessible in-app deletion path, not deactivation alone. [Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

## Google Play checklist

- [ ] Owner configures correct Play Console organization/account, application record and contractual/contact details; app-signing/upload-key ownership and recovery are documented privately.
- [ ] Signed production AAB builds and validates against Play; the local debug-signed APK is not a release upload.
- [ ] Target API 36 and Android permissions checked in the final artifact. Current new-app/update requirement is API 36; recheck at submission. [Google target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB_ALL).
- [ ] Native libraries and packaging support 16-KiB pages and are run on a 16-KiB emulator/device. Existing 25/25 ELF/ZIP alignment inspection does not replace the runtime test. [Android 16-KiB guide](https://developer.android.com/guide/practices/page-sizes).
- [ ] Actual Android hardware/emulator critical flows pass, including permissions, keyboard, network loss, calls, push and background; run Play pre-launch/internal testing with configured services.
- [ ] Owner completes Data safety, privacy policy, ads/target audience/content rating/app access and relevant permission declarations from actual behavior. No form submitted automatically.
- [ ] Public account-deletion request resource works without needing the installed app, with secure identity verification and backend completion. A page that merely says to reinstall is insufficient preparation. The in-app path already exists; the web request resource is pending integration with the existing website. [Google deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
- [ ] Actual Android screenshots, icon/feature graphic and localized descriptions approved; emulator placeholders clearly excluded from final artwork.

## Owner-only completion

No app publication, legal declaration, store contract, billing enrollment or submission is authorized by this checklist. Once operational gates and owner fields are complete, produce a signed preview/TestFlight/internal artifact, capture actual device results, then ask only for the specific submission approval when a reviewable release exists. See RELEASE.md for environment/build steps and WEB_PRESENCE.md for safe domain integration planning.
