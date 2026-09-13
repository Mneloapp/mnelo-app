# Device-owned profile cards and invitations — September 12, 2026

The requested update adds optional profile photos, headline, about text, email and website; QR contact discovery; a more restrained card-based Me screen; consistent avatars; and fixed-size navigation selection. Chats | Calls | Me remains the full primary navigation. It adds no Connect/discovery marketplace or cloud profile store.

## Ownership and trust

- Own profile columns live in the existing SQLCipher identity row. `contact_profiles` stores only cards received from locally trusted, unblocked public identities; its key references the local contacts table. No server database migration.
- First/last name and username remain optional. Username is a local label, not a globally reserved directory identity. Phone registration and phone lookup behavior are unchanged.
- Photos are explicitly chosen from the system picker, resized to a maximum 320-pixel edge and compressed to a bounded JPEG. Input accepts at most 48,000 base64 characters and checks JPEG dimensions at most 384 pixels. Remote avatar URLs/SVGs are rejected. Native working images are released; generated resized images and only recognized app-owned ImagePicker cache copies are removed, never photo-library originals.
- Email and HTTPS website are optional, validated, and opened only on user action. No remote website/preview/avatar is automatically fetched. A selected photo is a draft until Save.
- Cards are sent over the authenticated peer connection to existing contacts through optional ordered channel `mnelo-profile-v1`, with bounded frames, queue, reassembly and update rate. The authenticated channel peer determines the author. A card never changes the recipient's locally saved contact name or trust key.
- Build 5 ignores the optional channel and retains its existing message/call protocol. Both contacts should update for reliable card exchange. If an older peer initiates, it may not open the new channel. Removing details/photographs sends empty fields when peers next connect; an offline or independently saved copy cannot be remotely erased.
- Old backup and database versions receive empty defaults. Profile backups remain user-owned encrypted archives. Enrollment receipts are still excluded from backup and restore must re-enroll.

## Invitation path

Canonical link: `https://mnelo.com/invite#v1:<64-hex-public-key>:<hex-UTF8-name>`; fallback `mnelo://contact/v1:...`. The public invitation has only name and public identity, never phone/email/photo/private keys. Anyone holding it can read/share those two fields.

The input boundary rejects over 600 characters before decoding and accepts only the exact domain/path/scheme, version, bounded lowercase hex and valid non-control Unicode. External query strings and arbitrary routes remain rejected. The native-intent hook stores a validated invitation in memory and returns the constant `/contact-invite`; it never passes external text into Router query decoding. Invalid input still resolves to `/`.

Unauthenticated users may preview the public name and enter registration. Adding a contact still requires registration, explicit verification/confirmation, non-self identity and a fresh block check. A subsequent different invitation resets confirmation. Scanning does not automatically trust or open arbitrary URLs. Camera permission is requested on Open camera; the camera unmounts after scan, on loss of focus and while backgrounded. Paste/manual entry are alternatives.

The website presents Open in Mnelo plus accurate private TestFlight steps. A new install must reopen the invitation afterward; no server-side deferred-link/profile record is created. Both participants add one another. No public App Store download or automatic TestFlight admission is claimed.

## Native and release boundaries

App identity stays `com.mnelo.messenger`, scheme `mnelo`, Apple team `CS6GJ2BMS9`. Build number 6 is reserved for these changes. Expo camera and SVG require a new development/distribution binary. Build 5 awaiting Apple review is unchanged and does not contain this update.

The website serves Apple's association file for `/invite` with application/json and HTTP 200 on both mnelo.com and www.mnelo.com. App config includes both domains. Signed physical-iPhone universal-link QA remains required after installing the new binary. Android's package/scheme and route filter remain compatible; verified HTTPS App Links require the actual release signing certificate fingerprint. The custom-scheme fallback is prepared; no fabricated certificate or Android QA claim.

The website is in the separate repository `Mnelo` (separate website repository); the former estimation app is archived there. Website publication does not change the identity/relay/SMS services or admit additional testers. The no-server offline message queue behavior remains as accepted by the owner.

## Checks and manual acceptance

Automated coverage includes valid/hostile links, installed native-intent hooks, unauthenticated previews, confirmation reset, block checks, profile validation, old backups, avatar bounds, picker cleanup, transport chunking/flooding, and decoding the actual generated SVG geometry back into the contact, including a 60-character Georgian name. Native UI and exact final counts are recorded in QA_REPORT.md.

Physical follow-up: install the next binary on two phones; choose/remove an actual photo, exchange cards both ways, verify only trusted contacts receive them, scan both cards, test universal links from Camera/Mail, test no-camera permission, and confirm independent copies after one party deletes/edits. Simulator tests do not certify physical camera or two-phone delivery.
