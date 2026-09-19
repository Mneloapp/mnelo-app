# Native incoming-call message replies

Build 46 adds a SiriKit Intents service for `INSendMessageIntent`, separate from the existing Share Sheet extension. Apple's documented configuration consists of the app's Siri capability and usage description, an Intents service extension, and a handler that resolves, confirms, and sends messages through the app's own service. This is the supported messaging integration; it does **not** establish that the system will show a Message button on every CallKit screen or iOS version.

Primary references:

- [Creating an Intents app extension](https://developer.apple.com/documentation/sirikit/creating-an-intents-app-extension)
- [Dispatching intents to handlers](https://developer.apple.com/documentation/sirikit/dispatching-intents-to-handlers)
- [INSendMessageIntentHandling](https://developer.apple.com/documentation/intents/insendmessageintenthandling)
- [INSendMessageIntent](https://developer.apple.com/documentation/intents/insendmessageintent)
- [Unspecified outgoing message format](https://developer.apple.com/documentation/intents/inoutgoingmessagetype/unknown)

## Routing and completion

The extension supports text replies to one canonical phone number bound to a recent, authenticated, incoming direct Mnelo call. A display name or push hint cannot authorize a send. Recipient resolution returns a binding containing the current account, verified peer, exact call UUID, phone and direct conversation. Confirmation and send revalidate that binding, enrollment, contact state and call age. Answered, outgoing, group, expired, ambiguous and blocked recipients are refused.

For a cold app, a short-lived app-group selector narrows recovery to the exact caller and call. The selector is not proof: the extension can inspect at most two encrypted delivery pages and decrypt only a matching envelope from an already pinned peer. It validates the authenticated call payload before proceeding. It does not discover new contacts or acknowledge unrelated inbox items.

Replies use the existing encrypted ratchet and durable outbox. A native success response requires both a committed message and accepted upload. Retry uses a stable, secret-keyed identifier; an uncertain upload does not create a second message. There is no carrier SMS fallback, custom quick-reply sheet or duplicate notification.

Each native request has a 12-second deadline. Completion waits for the runtime to interrupt and close its original encrypted database connection. Cancellation-aware SQLite busy/progress handlers also cover contention and opening the database, so the ordinary ten-second contention budget cannot delay cancellation by ten seconds. The notification service now follows the same close-before-host-completion ordering.

## Validation and remaining device checks

The native handler probe exercises Apple's real Intents classes, routing refusals, exact-once timeout completion, close ordering and selector invalidation; the source also passes the iPhone SDK typecheck. Real SQLCipher probes cover transaction rollback, interrupted cursors, busy writers and cancellation during database initialization. Separate encrypted integration tests exercise the JS session with SQLite, Signal and signed HTTP.

CNG prebuild and CocoaPods complete with five app/extension bundles. Intents resources have target-specific Xcode references to avoid sharing the notification extension's privacy-manifest object. Reapplying the target configuration is idempotent.

Actual Message-button visibility, SiriKit's recipient handoff, locked and unlocked incoming-call behavior, declined-call propagation and the reply appearing once on the other phone still require a signed build on physical iPhones. The new app Siri capability and Intents provisioning profile must pass archive/export signing checks. No physical result is claimed by the host or SDK probes.
