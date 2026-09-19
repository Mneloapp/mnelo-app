# iOS 0.1.0 (38): cold notification routing and incoming-call controls

## Notification routing

Notification responses are now captured once at the native runtime boundary and replayed briefly to consumers that register during cold launch. A message response carries its opaque message ID through authentication, root navigation and inbox hydration, then opens the verified sender conversation. A call response is kept separate, so tapping a notification cannot accidentally navigate to a chat or consume a call reply action.

The notification extension and foreground presentation continue to keep message text and contact names out of push payloads. The service extension still owns the closed-app badge; local verified history remains the source of the conversation destination.

## Incoming calls

CallKit now receives a locally cached contact alias when one is available. The server sends only a SHA-256 hint of the authenticated sender; the device resolves that hint from its own contact/chat data. Existing aliases are warmed when the device network starts, and the first authenticated call also updates the cache. If no local alias exists yet, the safe fallback remains “Mnelo”.

When the app is closed, iOS also receives a private notification with a text-input Reply action for the incoming voice/video call. The reply is persisted as a normal encrypted message and then declines the call, including when the response is delivered before JavaScript finishes starting. CallKit decline now emits an explicit `decline` event and sends the hang-up control to the caller, so the remote side leaves “Ringing” promptly. Native call-reply and call-response notifications are removed when the call ends.

These changes preserve the existing CallKit ownership, PushKit reporting, expiry, blocked-peer and single-live-call guards. The lock-screen reply is implemented through the supported iOS notification action; CallKit’s full-screen sheet itself does not expose custom application buttons.

## Validation and release status

The full Jest suite passes (515 tests), the device/protocol suite passes (160 tests), and the existing server integration checks pass. TypeScript, lint, Prettier and `git diff --check` pass. Xcode 26.6 successfully built the Debug arm64 simulator target and a signed Release archive for `com.mnelo.messenger`, version 0.1.0 (38), with all app extensions validated.

Xcode Organizer uploaded the archive to App Store Connect on September 16, 2026 at 12:58 Asia/Tbilisi. Upload completed with six non-blocking vendor-symbol warnings (ExpoImageManipulator, React, ReactNativeDependencies, SDWebImage, WebRTC and hermesvm); the application archive itself validated and was accepted by Apple. Processing and group assignment still need the App Store Connect session to be refreshed before the 38 build can be selected in the tester groups.

The native simulator build used a local copy of Expo Camera’s shipped `ExpoCameraBarcodeScanning.xcframework` because the legacy Ruby 2.6 CocoaPods precompiled-module hook omitted that companion pod directory. No source dependency or generated native file was changed for this workaround. The source changes in this build are limited to notification response routing, caller-name caching, call-reply handling and explicit decline propagation.
