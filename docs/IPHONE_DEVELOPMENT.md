# Mnelo physical iPhone development

## Current two-iPhone testing request — 2026-09-11

Both test devices are iPhones. Apple authentication completed during preparation. Mnelo App Store Connect record 6811153275 now exists, with no TestFlight build. A standalone store-signed build, reachable HTTPS phone identity/WSS signaling, Internet ICE/TURN, two eligible SMS recipients and the protocol release review are still outstanding. The paired original iPhone is available. Read the [current TestFlight checkpoint](TWO_IPHONE_TESTING.md) before using the older development-client instructions below.

Current startup is Welcome → phone number → verified OTP → Chats. Creating a local identity or an earlier name-only setup does not unlock the current application. Existing unverified history is preserved behind the gate. Already verified installations reopen without another SMS. The earlier blank-service/name-first physical boot paragraph below is historical and must not be used as current registration guidance.

## Historical physical boot — owner-approved identifier, 2026-09-11

**Build, signature verification, installation and initial-screen rendering PASS on the physical iPhone.** The owner authorized `com.mnelo.messenger` after reporting the unavailable earlier identifier absent from their Apple list. iOS bundle ID and Android package/namespace/applicationId now use the new value; Mnelo, `mnelo` and `mnelo.com` remain unchanged. The dated blocker entries below are historical.

Apple automatic signing issued **iOS Team Provisioning Profile: com.mnelo.messenger**, expiring 2027-09-11, with development Push Notifications. The actual signed app's embedded profile includes the selected iPhone; signature verification passes. No unrelated app, certificate or existing profile was removed. No EAS or Google Play project was created. Native projects are ignored and regenerated; the same owner-selected team was restored locally after prebuild.

Xcode **26.6 (17F113)** completed the physical Debug build with **zero compiler errors and 2,141 warning lines**. The former ExpoModulesJSI error did not recur. Installed on **iPhone 17 Pro Max / iOS 26.6.1**, launched the development client and inspected an actual Xcode-captured phone screenshot showing the Mnelo Welcome screen. This is physical boot evidence, not complete interactive device acceptance. Sanitized results: [verification](audits/iphone-identity/verification.json).

Current artifact: `artifacts/iphone-20260911-build/Build/Products/Debug-iphoneos/Mnelo.app`. It is a signed **Debug development client**, not a TestFlight IPA or standalone preview; JavaScript comes from Metro. Build/result evidence: `artifacts/messenger-identity-iphone-provisioned.log` and `.xcresult`. Install/runtime evidence and the physical screenshot use the `artifacts/messenger-identity-iphone-*` prefix. The screenshot is `artifacts/messenger-identity-iphone-welcome.png`.

For this first hardware UI session, only the Metro process has relay/phone endpoints blank; `.env.local` is preserved. The development bundle and manifest were reachable over the LAN with HTTP 200. Start the same scoped session with:

```sh
EXPO_PUBLIC_APP_ENV=local EXPO_PUBLIC_RELAY_URL= EXPO_PUBLIC_PHONE_IDENTITY_URL= \
  NODE_OPTIONS=--dns-result-order=ipv4first \
  npm start -- --lan --port 8083 --max-workers 2
```

Keep the Mac and iPhone on the same trusted Wi-Fi for this development session. Open Mnelo; **Create on this device** creates the local identity after entering a name. The phone-registration screen reports the unavailable service; its existing back action returns through Welcome to Chats once an identity exists. This flow is code-inspected guidance, not a claimed physical tap/keyboard test. No OTP was sent or enrollment simulated. Never expose the fictional-number fixture publicly. Real messaging/calls require a securely reachable relay, phone registration requires a working SMS provider, and two-peer hardware QA remains pending.

Runtime observations retained: Expo/native delegate diagnostics for `fetch` and `remote-notification` background modes, Google logging initialization and a dropped React Native scroll-end event. No fatal or unhandled JavaScript error was observed during the initial screen capture. No background entitlement was added merely to silence a warning; push/background delivery is unverified.

Source QA and all **222 automated tests** pass; fresh iOS/Android exports and history/source/export secret scans pass. Fresh Expo Doctor is **20/21**, recommending newer SDK 57 maintenance patches for 25 dependencies; the installed Expo 57.0.21 bundled compatibility ranges match all 36 checked installed dependencies. The lockfile was kept stable during signing/build validation. Patch maintenance remains open; this is not a Doctor 21/21 result. No new Android APK or Android hardware QA is claimed for this identifier.

## Historical identifier blocker after agreement acceptance — 2026-09-11

The owner confirms acceptance of the updated agreement. The next local Debug build explicitly allowed Xcode provisioning updates and exited **65**. The agreement error has disappeared; Xcode and the build log now both report: `Failed Registering Bundle Identifier: The app identifier "com.mnelo.app" cannot be registered to your development team because it is not available.` The fallback wildcard profile still lacks Push Notifications / `aps-environment` and cannot sign this app.

This proves registration is unavailable to the selected team, not who owns or reserved the identifier. No alternate identifier has been selected and no entitlement removed. Before changing the authoritative identity, inspect the selected team's existing [Identifiers](https://developer.apple.com/account/resources/identifiers/list) for `com.mnelo.app`. The agent's browser currently reaches Apple sign-in, so the registry could not yet be inspected. The owner can check in the browser already signed in for the agreement, or authenticate in the prepared Apple tab so the agent can continue read-only inspection. Passwords/2FA must remain in Apple's UI.

If the ID is present, reconcile team/profile access and enabled capabilities. If it is absent/unavailable, choosing a new permanent or separate development identifier requires an explicit owner decision; do not silently mutate `com.mnelo.app` or create speculative duplicate App IDs. No physical-device build, installation or boot is claimed. Evidence: `artifacts/iphone-after-agreement-build.log` and `.xcresult`; direct Xcode Signing & Capabilities inspection confirms the exact same registration failure.

## Earlier agreement signing blocker — 2026-09-11

After the owner selected the existing Giorgi Devdariani team, Xcode's Signing & Capabilities UI confirms that team and **Automatically manage signing** enabled. Both generated build configurations now contain the team selection. The paired iPhone reports Developer Mode enabled, developer disk-image services available and `passcodeRequired: false`. The earlier missing-team/locked-device prerequisites below are resolved.

The next generic iOS Debug build still exited **65**: the selected `iOS Team Provisioning Profile: *` lacks the **Push Notifications** capability and **aps-environment** entitlement. Direct inspection of Xcode reveals why automatic provisioning cannot currently resolve this: **`Unable to process request - PLA Update available`**, followed by an instruction to agree to the latest Program License Agreement in the developer account. No entitlement was removed to conceal the failure.

The exact remaining owner action is to open [Apple Developer Account](https://developer.apple.com/account/) as the team's **Account Holder**, review the updated **Apple Developer Program License Agreement**, and personally accept it if they agree. Apple documents that outstanding agreements can pause Xcode automatic signing and Certificates, Identifiers & Profiles access: [resolving access issues](https://developer.apple.com/help/account/access/resolving-access-issues). If the signed-in user is an Admin rather than Account Holder, the Account Holder must perform this action. The agent must not accept legal terms on the owner's behalf.

After that action, retry Xcode signing/profile resolution for `com.mnelo.app`, then the development build/install. No physical-device app build, installation or boot has succeeded in this checkpoint. Logs: `artifacts/iphone-20260911-team-build.log` and `.xcresult`. Account/profile errors were observed in Xcode; no credential export, duplicate App ID, profile deletion, purchase or legal acceptance was performed by the agent.

## Earlier physical-device preflight — 2026-09-11

The device-owned messenger has superseded the September 9 Supabase/Connect flow described below. Active navigation is Chats | Calls | Me; phone enrollment has a development-only fictional-number fixture. No external SMS provider is needed for local UI testing.

Read-only Apple tooling now sees the paired iPhone 17 Pro Max, iOS 26.6.1. Developer Mode is enabled. The current lock-state query reports `passcodeRequired: true`; developer disk-image services were not yet available in the details snapshot. Unlock the phone and keep it connected for installation.

A local Debug build for `generic/platform=iOS` exited **65** with the exact error: `Signing for "Mnelo" requires a development team. Select a development team in the Signing & Capabilities editor.` This is a signing prerequisite, not evidence that the former ExpoModulesJSI compiler failure has returned. No provisioning update or remote device/App ID registration was requested. A preceding lookup using the CoreDevice identifier was interrupted without a build result; it is not native compilation evidence.

Next owner signing action: open `ios/Mnelo.xcworkspace`, select **Mnelo target → Signing & Capabilities → Automatically manage signing → Team**, and choose the existing Apple Developer team for `com.mnelo.app`. If Apple requests authentication, complete it in Xcode's account UI. No password or two-factor code belongs in chat. The current generated project does not select a team; certificate availability alone does not establish app/device provisioning.

After signing succeeds, create/install a physical-device development build locally. Expo/EAS login is not required for this local route. Start with boot, identity creation, Chats/Calls/Me, keyboard, local persistence and permission UI. Messages and calls require a reachable signaling service and a second test peer; a local UI boot is not a messaging/call PASS.

The fixture and relay presently bind to the Mac's loopback only. On an iPhone, `127.0.0.1` refers to the phone, not this Mac; a USB connection alone does not forward these services. The fixture numbers `+12025550101`/`+12025550102` and code `864209` work only after the test service is securely reachable. Do not promise fixture OTP, Internet calling, SMS autofill or push on the physical device before configuring and testing the relevant transport. Keep fictional-code access out of public deployments. A signed build with embedded JavaScript can support offline UI inspection independently of Metro; no such physical-device artifact has been produced in this preflight.

Evidence remains under ignored artifacts: `iphone-preflight-20260911.json`, `iphone-20260911-generic-signing.log` and its `.xcresult`. No install, successful physical build or device-flow PASS is claimed.

## Earlier local route — 2026-09-09

The owner installed Xcode 26.6 and confirms an existing Apple Developer account with a published app. Read-only checks confirm selected Xcode 26.6 (17F113), Swift 6.3.3, and a passing first-launch/toolchain check. Xcode shows one existing Developer Team with Admin and Certificates/Identifiers/Profiles access. Its provisioned-device lookup currently fails, including one retry; team visibility is not proof of Mnelo-specific provisioning. No credential or other app was changed. The paired iPhone has Developer Mode enabled and currently reports disconnected.

**Expo SDK/CLI and the Development Client remain part of this app; an Expo account or EAS cloud build is not required to compile locally.** Use the existing Apple team for this distinct com.mnelo.app identity when signing can be verified. See [official Expo local development](https://docs.expo.dev/guides/local-app-development/).

The current notification adapter uses Expo Push Service and deliberately returns `buildRequired` until a real Expo project ID is configured. That later registration and APNs credential requirement is separate from local app compilation. EAS Build itself remains optional; direct APNs/FCM is also supported by expo-notifications, but this repository has not replaced its selected Expo Push transport. The hosted release registry additionally requires reviewed Supabase-origin and Expo-project registration before a configured hosted release can build. Local builds do not bypass the hosted environment guard. See [official notification setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).

Xcode 26.6 ships the iOS 26.5 SDK here. The official 8.52-GB platform download completed. A duplicate CoreSimulator registration initially prevented resource compilation and boot; the unusable registration was removed with the downloaded asset retained, then the runtime was remounted. The full app now builds and boots on an iPhone 17 Pro Simulator / iOS 26.5. The original ExpoModulesJSI 57.0.8 framework also compiles under 26.6, independently of the maintenance update.

The first diagnostic build disabled signing and therefore lacked the simulator's generated application entitlement: SecureStore failed with Keychain code -34018. Rebuilding with normal simulator ad-hoc signing (`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`) fixed this without changing SecureStore or generated source. The signed build passed in 44.56 seconds after the initial 837.79-second compilation; it retains 519 upstream warnings and zero build errors. This simulator signature does not establish physical-device provisioning. The signed client rendered Welcome, rejected an invalid local OTP, accepted the reserved local test code, restored Auth after process restart, and displayed Chats/Connect/Me, real local profile data and explainable Connect results. These are simulator checks, not physical-iPhone acceptance.

Doctor newly recommended the September 8 SDK 57 maintenance versions. Applied expo 57.0.21, @expo/ui 57.0.17 and expo-router 57.0.20 after reviewing their official changelogs. This also selects expo-modules-core 57.0.17 and its required expo-modules-jsi 57.1.0. React Native 0.86.3, React 19.2.3 and Development Client 57.0.18 remain unchanged. The old JSI 57.0.8 package was independently verified against its historical lockfile integrity; its failing RuntimeScheduler.h is byte-identical to the current package. Swift 6.3.3 successfully typechecked an isolated import/constructor call against the original header, with two annotation warnings and no suppressed diagnostics. The isolated probe and complete original-framework result are recorded separately from the successful app build: [compiler comparison](audits/ios-26.6/header-probe.json), [native result](audits/ios-26.6/native-result.json).

The observations below are the earlier September 7–8 inventory and original workflow. Their Xcode 26.2/EAS blocker entries are historical, superseded by this local route.

Initial signing inventory checked on 2026-09-07; host/device/auth rechecked in Phase 23 on 2026-09-08, without printing or exporting signing certificates, private keys, team identifiers, or provisioning profiles.

## Earlier observed readiness

| Item                         | Result                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Connected device             | iPhone 17 Pro Max previously paired on iOS 26.6; Phase 23 devicectl reports unavailable                           |
| Developer Mode               | Enabled, reported by Apple's `devicectl`                                                                          |
| Signing identities           | One valid Apple Development identity in the local keychain; zero Apple Distribution identities                    |
| Bundle identifier            | `com.mnelo.app` in app config and generated Xcode project                                                         |
| URL scheme                   | `mnelo` in app config and generated Info.plist                                                                    |
| Xcode project / build scheme | `Mnelo` (distinct from the lowercase URL scheme)                                                                  |
| Development client           | `expo-dev-client` 57.0.18 installed and autolinked; start command includes `--dev-client`                         |
| EAS development profile      | Development client, internal distribution, development environment; physical-device profile has no simulator flag |
| EAS simulator profile        | Separately inherits development and sets `ios.simulator: true`                                                    |
| Apple team / provisioning    | No team selected in the generated Xcode project; provisioning for this bundle/device has not been verified        |
| Current blocker              | Xcode 26.2 cannot compile the installed SDK 57 native dependency; minimum supported Xcode is 26.4                 |

Mnelo is the official product name. The [native identity audit](PRODUCT_IDENTITY.md#native-identity-audit) records the local profiles and owner-confirmed native migration.

Developer Mode and pairing were satisfied at the initial inventory; current physical availability is not satisfied. A valid development identity alone does not prove that its team has valid provisioning for this bundle and device. No new Apple login, credential creation, EAS login, cloud build, or remote account change was attempted.

## Local signing and device flow

The owner explicitly approved `com.mnelo.messenger` after Apple rejected the previously requested `com.mnelo.app` identifier and the owner reported it absent from their list. Both regenerated native projects now use `com.mnelo.messenger`; use this identifier for future signing or EAS setup. Apple has issued its development provisioning profile with Push Notifications. Simulator builds do not require physical-device provisioning.

1. Select supported Xcode (26.4+ for this SDK) and install its requested iOS platform support under Xcode → Settings → Components. The owner has already installed Xcode 26.6. Changing the app's deployment target does not install missing platform components.
2. Open Xcode and complete first-launch components/license prompts. If the App Store or Xcode asks for an Apple Account, authenticate directly in Apple's UI. Never paste the password or two-factor code into this task.
3. Select and verify the installed Xcode:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
xcodebuild -version
cd /path/to/mnelo-app
npm run ios
```

On this Mac, apply the existing CocoaPods environment workaround if needed:

```sh
PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH" RUBYOPT=-rlogger npm run ios
```

For simulator-only sessions, Metro can be deliberately restricted to this Mac. Node's default localhost resolution initially bound only `::1`, while Expo's manifest advertised `127.0.0.1`; the latter refused the connection. A scoped Node option fixes the listener without exposing it to the LAN:

```sh
NODE_OPTIONS=--dns-result-order=ipv4first npm start -- --localhost --port 8083
```

Both localhost and 127.0.0.1 then returned a healthy Metro status; the actual advertised iOS development bundle downloaded with HTTP 200. This is a server connectivity check, separate from native rendering. It does not make the Mac's loopback-only Supabase/LiveKit endpoints reachable from a physical iPhone. Full physical-device service QA still needs an authorized, secure development backend accessible to that phone.

Verify the current messenger interface: Mnelo Welcome, local identity creation and Chats | Calls | Me. Positioning copy remains editable. Capture the actual native screen and inspect runtime logs; an Expo Go or browser launch does not establish development-client acceptance.

4. For the physical phone, connect USB for the first build, unlock it, and confirm Trust if requested. Open the generated workspace:

```sh
open ios/Mnelo.xcworkspace
```

Select target **Mnelo → Signing & Capabilities → Automatically manage signing**, then select the user's Apple development team. If Xcode requires account authentication, stop for the user at **Xcode → Settings → Accounts → Add Apple Account**. No team is guessed or embedded in repository configuration. A free Personal Team may support local device testing; account restrictions/provisioning must be validated by Xcode. Paid membership is needed for the EAS ad hoc distribution path.

5. Build using the physical device picker:

```sh
PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH" RUBYOPT=-rlogger npm run ios:device
```

Select the paired iPhone. If iOS asks to trust the developer, complete that action on the phone. The development server and phone should be on the same network; grant the development app local-network access if prompted. After installing a matching development client, later JavaScript-only sessions use `npm start`.

Native project files are generated and ignored. A local team selection can be lost after clean prebuild; configure deliberate build-time signing later rather than committing credentials.

## Optional EAS cloud route, not required for local builds

The repository already has `development` and `development-simulator` profiles. No linked cloud project ID is currently configured. The first interaction is:

```sh
npx eas-cli@23.2.0 login
```

After the user authenticates, deliberately select/create the team-owned Expo project with `npx eas-cli@23.2.0 init`, supply its actual `EAS_PROJECT_ID`, register the device with `npx eas-cli@23.2.0 device:create`, and configure Apple provisioning. Physical internal distribution needs Apple Developer Program membership. Then run `npx eas-cli@23.2.0 build --platform ios --profile development`. This local signing pass has not authenticated to Expo/EAS or started a cloud build. The Apple development profile described above is separate from EAS registration.

References: [Expo local development builds](https://docs.expo.dev/develop/development-builds/introduction/), [Expo iOS device builds](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/), [Apple Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device), [Apple Xcode system requirements](https://developer.apple.com/xcode/system-requirements/).

## Physical acceptance — initial boot verified; interactive flows pending

The development client now installs and renders Welcome on the physical phone. Still verify the home-screen icon, local identity/registration interactions, keyboard and OTP autofill; camera, photo, microphone, contacts, location and notification consent/denial; two-user messaging/reconnect; files/photo/voice recording/playback/location/contact; voice/video accept/reject/end/permissions; foreground/background interruptions; airplane-mode outbox and rejoin; backups/restore and local deletion; English/Georgian and VoiceOver/Dynamic Type. Capture actual device evidence and fatal/error logs without secrets. Local browser/synthetic media evidence does not satisfy these checks.

Historical September 8 Phase 23 checkpoint: EAS CLI 23.2.0 reported Not logged in. No linked project or cloud build. The first exact cloud owner action is `npx eas-cli@23.2.0 login`; the local prerequisite is updating Xcode via Apple's UI to stable 26.4+ and completing first launch. No user passwords/2FA belong in chat. All independently executable phases continue before requesting a final owner action.

Historical September 9 next action: connect the paired iPhone by USB, unlock it and accept Trust if prompted. Xcode 26.6 and simulator compilation are already verified; EAS login is not required for this next local step. If Apple provisioning lookup still requires authentication, the exact follow-up is Xcode → Settings → Accounts → the existing Apple account, completing Apple’s sign-in prompt there. No password or two-factor code belongs in chat.

The standalone local iOS Simulator diagnostic also builds/boots with embedded JavaScript and passes cold/warm malformed native-input tests with Metro stopped. Archive paths/hashes and retained runtime warnings are in [native evidence](audits/ios-26.6/native-result.json). Those archives are Simulator-only and cannot be installed on the physical iPhone. During final cleanup an additional CLI-created IPv6 Metro listener was stopped; the restored development server uses only the explicit localhost command above.
