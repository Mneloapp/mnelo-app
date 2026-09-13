# Device-local attention and alerts

> September 12 owner-required correction: both platforms must support background/closed-app notifications and native incoming calls. See [BACKGROUND_DELIVERY](BACKGROUND_DELIVERY.md) for the new routing/privacy boundary, locked-device migration, lifecycle requirements and remaining delivery limits. Earlier no-push-registry/foreground-only notes are historical implementation checkpoints, not the accepted target. Build 2 is not ready under this acceptance requirement.

Mnelo keeps participant-owned history. Direct APNs/FCM token registration and hashed, revocable wake capabilities are now the minimal persistent routing exception. There is no server-side message/media/history queue. The historical Supabase dispatcher and Expo Push Service are not used. See [BACKGROUND_DELIVERY](BACKGROUND_DELIVERY.md) for the complete lifecycle, storage and provider boundary.

## Counts and acknowledgement

- **Chats:** sum of unread inbound non-call messages across the entire local database, including groups. It is not just a count of unread conversations or the currently loaded page. Own messages, duplicate/replayed message IDs and rejected blocked senders do not increase it.
- **Calls:** unseen incoming missed calls. Explicit rejection, outgoing unanswered calls, failed accepted calls and completed calls have separate outcomes. Historical records with no direction stay unknown; no old missed count is invented.
- Counts use the encrypted local journal. Visible badges show `99+` above 99; the tab accessibility label retains the exact number.
- Opening a conversation acknowledges only the displayed sequence snapshot while that screen is focused and the app is active. Mounting a background chat does not read anything. Opening Calls acknowledges calls through the loaded newest sequence; it never marks messages read. Later arrivals remain pending.
- Local deletion/clear changes only this device. Existing backup format carries call outcome/direction and read state. Additive wake-capability/revocation tables preserve existing history; installation-specific routing capabilities are excluded from backups.

Call journal bodies extend the pre-existing local `media:outcome` format with `media:direction:outcome`. This is a typed local record, not a network message: the inbound message protocol still does not accept the `call` message kind. Outcomes: ended, failed, missed, declined, unanswered. An invite withdrawn or timed out before answering becomes missed; deliberate decline does not.

## Presentation

Foreground messages outside the currently open conversation show a dismissible generic in-app banner. Tap opens that local conversation. Foreground incoming calls retain the call screen with Accept/Decline; the same invite no longer pushes/rejects itself repeatedly.

Me → Notifications requests OS alert/sound/badge permission only after the user taps Enable. If already denied, the user can open system settings. Counts remain available without OS permission. Supported native local notifications use the installed Expo Notifications module; web previews explicitly report unavailability.

Local OS alerts are scheduled only for events actually received by this running device. They contain Mnelo, generic localized event text and a fixed event kind. They do not contain message bodies, contact names, phone numbers, device identity keys, locations, media, arbitrary URLs or chat identifiers. Opaque notification identifiers live only in the OS on this device. Reading/deleting acknowledged entries dismisses their delivered local alerts; ringing alerts are dismissed when the ring ends. Alert taps select an allowed Chats/Calls destination and only open an incoming call if it is still incoming. Permission and scheduling errors do not change message storage or pretend delivery occurred.

## Open limitations / release gates

Local scheduling alone cannot wake a terminated runtime. The new native paths handle generic visible remote alerts and system incoming calls before the React UI is mounted. They require provider credentials, permissions and OS delivery. Actual content still needs the sender's reachable runtime; there is no offline server queue. A generic push whose authenticated invitation never reaches the device cannot produce a named local missed-call record. Authenticated incoming-call timeout is recorded as missed, separately from deliberate rejection. Actual two-phone background delivery is not yet verified.

Native compilation and mocked provider/lifecycle tests pass; real locked-screen, cold-start, interruption and notification-denial checks remain mandatory. Android Force stop is explicitly different from dismissing Recents. Neither an OS delivery guarantee nor independent protocol certification is claimed.

Official API reference: [Expo Notifications SDK documentation](https://docs.expo.dev/versions/latest/sdk/notifications/). Used for permission, device-token, local alert and interaction APIs alongside the native module.

The [former server-backed notification document](../legacy/server-v1/docs/NOTIFICATIONS.md) is retained only for migration history. The [device-owned privacy contract](PRIVACY_ARCHITECTURE.md) remains authoritative.
