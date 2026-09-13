# Mnelo

**Privacy direction changed on 2026-09-09:** the owner requires device-owned private data, a relay with no persistent communication copies (including ciphertext), and optional device-encrypted backups in the user's own Drive/iCloud. The current Supabase implementation does not meet this requirement. See the [authoritative privacy decision and migration gates](docs/PRIVACY_ARCHITECTURE.md). E2EE and user-cloud backup are not implemented; older phase passes do not establish compliance.

Mnelo is the official product name. **Connect with what you need.** is editable positioning. The application has exactly three primary tabs: **Chats | Connect | Me**. Product identity is `com.mnelo.app` on both platforms, Expo slug/scheme `mnelo`, and website `https://mnelo.com`.

The V1 implementation includes local Supabase phone authentication, profiles, private direct/group messaging, photos/files/voice/location/contact sharing, deterministic Need/Offer matching, contextual requests, reviews, privacy, moderation, notifications, LiveKit calls, devices, account deletion, offline text retry, and English/Georgian. These are implemented services, with real local-backend tests; this is **not yet a production release**. Push delivery, cloud deployment and physical hardware acceptance remain open. Xcode 26.6 now builds the iOS Development Client successfully; an iPhone 17 Pro Simulator on iOS 26.5 rendered Mnelo and completed real local OTP, session restoration and Connect checks. See [release status](docs/RELEASE_REPORT.md), [execution](docs/EXECUTION.md), [actual QA](docs/QA_REPORT.md) and [release gates](docs/RELEASE.md).

The current visual direction is **Light + Acid Lime**, replacing the earlier dark-green palette. See the [design system](docs/DESIGN_SYSTEM.md) and [design QA](docs/DESIGN_QA.md). The approved 04 Selected / Light artwork is now reconstructed as canonical vectors and integrated into the launcher, splash, Welcome and header. [Reference boards and provenance](docs/design/references/README.md) and [reproducible assets](assets/README.md). Physical iPhone QA remains deferred at the owner’s request.

## Development setup

Use Node **24.18.0**, npm **11.16.0**, and the committed lockfile. The current app uses Expo SDK **57**, React Native **0.86.3**, and React **19.2.3**. Do not use Expo Go.

```sh
npm ci
cp .env.example .env.local
npm run check
npm run doctor
npx expo install --check
```

Do not overwrite an existing `.env.local`. Blank local configuration enables explicitly labelled in-memory UI fixtures. Real local services require the following setup; preview/production builds require their own secure backend configuration. Only Supabase publishable keys belong in the mobile environment. Never place service-role, SMS or LiveKit signing credentials there.

## Local backend and calls

Follow [local backend setup](docs/LOCAL_BACKEND.md), including its container runtime prerequisites. These commands target the isolated `mnelo-local` project, never cloud. `db:reset` deletes the local database; preserve local work first.

```sh
npm run db:start
npm run db:reset
npm run db:env
npm run calls:start
npm run functions:serve
```

Keep Edge Functions running. Separate terminals run `npm run calls:worker` and `npm run account:worker` for local call eviction and account deletion. For repeatable UI fixtures, run `npm run db:seed -- --reset-demo-users` only after reading its explicit reset scope in [E2E QA](docs/END_TO_END_QA.md). Reserved local OTP numbers send no real SMS; see [Auth](docs/AUTH.md). Do not deploy local Auth configuration or test OTPs to cloud.

## iOS development build

The installed SDK 57 requires **Xcode 26.4+**. This Mac now selects **Xcode 26.6 (17F113)**. Local builds use Xcode and the installed Expo CLI; **an Expo account and EAS cloud build are optional for this workflow**. The earlier Xcode 26.2 clean build failed with ExpoModulesJSI errors and exit 65; that historical result is not a claim about 26.6. SDK 55's Xcode table does not describe this repository. [Evidence and exact failure](docs/PHASE_0_1_REPORT.md), [build log](docs/BUILD_LOG.md), and [iPhone prerequisites](docs/IPHONE_DEVELOPMENT.md) distinguish compilation, simulator boot and physical QA.

After supported Xcode first-launch setup, an iOS runtime, Node and maintained Ruby/CocoaPods are ready:

```sh
npm run ios
# Connected, trusted iPhone with Developer Mode and signing configured:
npm run ios:device
```

Both commands enforce the supported Xcode preflight. Later JavaScript changes reuse the development client with `npm start`. The original host's legacy CocoaPods installation needs session-scoped `PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH" RUBYOPT=-rlogger`; use maintained Ruby for a new setup. Install Xcode's matching iOS platform components when requested (`xcodebuild -downloadPlatform iOS`). EAS profiles remain available as an optional cloud path; their login is not a prerequisite for local compilation. Current native results are in [iPhone development](docs/IPHONE_DEVELOPMENT.md) and [the build log](docs/BUILD_LOG.md). The successful simulator artifact is `artifacts/ios-26.6-derived/Build/Products/Debug-iphonesimulator/Mnelo.app`; it is not an IPA or a physical-phone build.

## Android development build

An isolated JDK 17 / API 36 ARM64 toolchain and a real development APK were built on this Mac. The emulator boots Mnelo and has exercised real OTP, messaging, private media, voice/video transport, explicit location, Connect, blocking, keyboard, reconnect, SecureStore outbox restoration and Georgian layouts. [Exact versions, commands, artifact and remaining hardware checks](docs/ANDROID_DEVELOPMENT.md).

```sh
npm run android:setup
npx expo prebuild --platform android --no-install --no-clean
npm run android:build
npm run android:devices
npm start -- --localhost --port 8083
# In another terminal, with the emulator running:
npm run android:install -- emulator-5554
```

`npm run android:diagnostic` also produces a local-only, debug-signed standalone APK with embedded JavaScript for cold-launch checks without Metro. It is not the hosted preview profile or a store artifact.

The helper uses a project-specific toolchain without changing shell profiles. Ports are explicitly reversed to loopback. This debug-signed development APK is not a Play release or evidence of physical audio, push or OEM background behavior.

## Verification

| Command                                       | Scope                                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run check`                               | Strict TypeScript, lint, formatting, unit tests, source/env/localization guards, server-stream tests |
| `npm run db:lint` / `npm run db:test`         | Local database functions and positive/negative authorization tests                                   |
| `npm run check:db-types`                      | Generated database type drift against the actual local schema                                        |
| `npm run check:edge`                          | All nine server function entrypoints                                                                 |
| `npm run test:integration`                    | All 19 real local-backend suites; requires Edge Functions and local LiveKit                          |
| `npm run doctor` / `npx expo install --check` | Expo configuration/dependency compatibility                                                          |
| `npm run export:mobile`                       | iOS and Android JavaScript bundles; not native compilation                                           |
| `npm run scan:secrets`                        | Git history, source and exported bundles                                                             |
| `npm audit` / `npm run audit:server`          | Separate npm and server Deno advisory trees                                                          |

[Testing](docs/TESTING.md), [security matrix](docs/SECURITY_TEST_MATRIX.md), [dependency dispositions](docs/DEPENDENCY_AUDIT.md) and [QA report](docs/QA_REPORT.md) contain actual results and limitations. CI is prepared; a local run does not claim remote CI execution.

## Supplementary browser QA

```sh
MNELO_UI_PREVIEW=1 npm start -- --web --port 8082
```

This local-only mobile-layout preview uses the real local backend when configured. Otherwise it explicitly shows sample data. It is not the public Mnelo website and must not be publicly deployed. Browser checks do not replace native or physical-device acceptance.

## Architecture and release

- [Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [RLS matrix](docs/RLS_MATRIX.md)
- [Security](docs/SECURITY.md), [UX](docs/UX_FLOW.md), [localization](docs/LOCALIZATION.md)
- [Environment, signing and release preparation](docs/RELEASE.md)
- [Store readiness](docs/STORE_READINESS.md), [safe website integration plan](docs/WEB_PRESENCE.md)
- [Product identity and historical migration](docs/PRODUCT_IDENTITY.md)

`ios/` and `android/` are ignored Continuous Native Generation outputs. Preserve native changes in authoritative Expo configuration/plugins. SDK 57 prebuild defaults to cleaning generated folders; use `--no-clean` for deliberate incremental regeneration. Application artwork uses the selected Mnelo Light identity; canonical vector paths and platform exports are committed under `assets/brand/`. Git history and old commit messages remain intact. The original template license is retained; it is not a decision to publish Mnelo under that license.
