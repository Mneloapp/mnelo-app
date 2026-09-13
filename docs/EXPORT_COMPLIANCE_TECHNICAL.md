# Build 11 — current encryption inventory

The September 13 TestFlight candidate adds official libsignal 0.102.2 to the earlier inventory below. It is not accurate to say the cryptographic implementation is unchanged from build 9. The pinned native library uses the Signal session/prekey APIs, including elliptic-curve and Kyber prekeys, for asynchronous end-to-end encryption. Private media uses AES-256-GCM; keys travel within Signal-encrypted content. SQLCipher, Ed25519 authentication, HTTPS/WSS and WebRTC DTLS/SRTP remain. No custom cipher or key escrow is introduced.

The owner's France exclusion remains in force. The earlier selection of third-party standard encryption in addition to the operating system is recorded below; any new Apple question or requested documentation must be assessed against this actual expanded inventory. No Info.plist claim of no encryption or blanket exemption is added. Apple's classification/acceptance is separate from technical QA and open-source licensing.

Build 11 execution: selected standard encryption instead of/in addition to Apple's operating system and France No in the build-specific questionnaire, within the owner's existing authorization. Missing Compliance cleared and the build became Ready to Submit, then Waiting for Review after external submission. No additional document was requested/uploaded, no territory decision changed and no Info.plist exemption was invented. The UI's generic follow-up text described no encryption despite the selected standard-encryption option; that wording is not adopted as a technical claim about Mnelo.

Historical build-specific inventory follows.

# Encryption inventory for the account owner

Target: Mnelo 0.1.0 (4), com.mnelo.messenger, App Store Connect 6811153275. Build 4 repairs a missing native permission description; the cryptographic implementations remain those of the background-capable build 3.

This is an engineering inventory for completing Apple's export-compliance questionnaire. It is not a legal classification, exemption claim, finalized declaration or authorization to submit one. `ITSAppUsesNonExemptEncryption` is intentionally unspecified until the owner completes that determination.

| Use                                          | Implementation in this build                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Device database                              | SQLCipher via expo-sqlite, AES-256 encrypted local database                                                             |
| Device identity and signaling authentication | Ed25519 signatures using noble curves; SHA-256 hashing; application-specific domain-separated request/signaling framing |
| User-controlled backup                       | Noble AES-256-GCM with a random recovery key and nonce; no platform key escrow                                          |
| Chat/file transport                          | Native WebRTC DTLS data channels, with signed SHA-256 certificate fingerprints                                          |
| Voice/video transport                        | Native WebRTC DTLS/SRTP between participants, through coturn forwarding                                                 |
| Service connections                          | HTTPS/WSS TLS to phone identity and signaling services                                                                  |
| Local key protection                         | iOS Keychain via expo-secure-store, AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY for background delivery; no keychain cloud sync |

The background-capable version reuses the original vault key and permits access after the device's first unlock following reboot. Database file protection follows completeUntilFirstUserAuthentication. Before first unlock the protected data remains unavailable. Minimal APNs routing metadata is handled separately by the identity service; message content is not put into push payloads. See [background delivery](BACKGROUND_DELIVERY.md) for the precise privacy boundary and remaining device acceptance checks.

The application includes third-party cryptographic implementations; describing it as only using Apple's operating-system encryption would omit SQLCipher, noble and WebRTC. There are no newly invented cipher algorithms, but the application-specific identity/signaling integration has not been independently audited or legally classified. The TURN REST shared-secret issuer runs on the server and is not embedded in the app.

The owner must determine applicable documentation and territorial requirements. Do not choose “no encryption,” declare exemption, exclude a territory, accept contracts or submit legal forms merely to make the beta available. Apple's questionnaire and any follow-up documentation govern the next step.

References: [Apple export compliance overview](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance), [beta export compliance](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-export-compliance-information-for-beta-builds/).

## Owner-authorized questionnaire update

The owner subsequently explicitly asked the agent to fill the questionnaire because they were away from the computer. The agent entered the factual app purpose and selected standard encryption implemented in addition to the operating system. The owner separately confirmed that France is excluded at this stage. Selected No for France and saved the three-step App Encryption Documentation questionnaire in App Store Connect. No document was fabricated/uploaded, no non-exemption Info.plist claim was added, and no build-level compliance approval or public distribution is inferred from the modal closing. Reassess France before expanding distribution there.

Build 4 update: reused the owner's exact prior answers in the build-specific questionnaire: standard encryption in addition to Apple's operating-system encryption, France No. App Store Connect subsequently changed build 4 from **Missing Compliance** to **Ready to Submit**, expiring in 90 days. No assertion that the app has no encryption was made, and ITSAppUsesNonExemptEncryption remains unspecified in source. Apple beta-review/distribution approval is separate from this saved questionnaire.

Build 6 update: cryptographic algorithms unchanged by local profile/QR and notification-enrollment features. Reused the same owner-authorized standard-encryption / France No answers. Missing Compliance cleared; no new declaration of no encryption or Info.plist exemption flag. One-build-per-version Beta App Review restriction remains independent of compliance.
