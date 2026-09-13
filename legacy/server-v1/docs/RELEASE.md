# Mnelo environments, builds and release

**Release gate added 2026-09-09:** do not roll out real-user private communication on the existing server-persistence path. The owner's [device-owned data, no-retention relay and optional encrypted backup requirements](PRIVACY_ARCHITECTURE.md) must be implemented and verified before release. Current E2EE/backup/non-retention acceptance is pending; configuring cloud accounts alone will not satisfy it. This is an acceptance gate, not a newly implemented build guard.

Mnelo is the official product name. Native identity is `com.mnelo.app` on both platforms, URL scheme `mnelo`, domain `https://mnelo.com`. See PRODUCT_IDENTITY.md. The icon/splash uses the selected Light identity; editable vector sources and reproducible platform exports are in `assets/brand/`.

## Actual status

The V1 application and local Supabase/LiveKit implementation exist, with automated and Android/browser end-to-end evidence in QA_REPORT.md and END_TO_END_QA.md. A real ARM64 Android Development Client APK built and booted. This is not a production release: no cloud Supabase/LiveKit project, EAS project, app-specific signing credential, store record, SMS/APNs/FCM service or TestFlight build was created. No store submission or domain change occurred.

Installed Expo SDK 57 requires supported Xcode 26.4+. Xcode 26.2 historically failed clean compilation in ExpoModulesJSI with exit 65; the owner has now installed 26.6. Local development/archive workflows can use Xcode and Expo CLI without Expo/EAS authentication. Matching iOS 26.5 platform components are now installed. The Development Client compiles with normal simulator ad-hoc signing and boots; real local OTP, SecureStore restoration and Connect interpretation/results were observed on the iPhone 17 Pro Simulator. Physical iPhone signing and acceptance remain open. Doctor alone does not prove native compilation. `npm run preios` checks the local compiler; BUILD_LOG.md retains exact evidence. Use supported Xcode or an EAS SDK-compatible build image after authentication. No Expo Go, native compiler hack or SDK downgrade substitutes for a development build. [Expo compatibility table](https://docs.expo.dev/versions/v57.0.0/).

## Environment boundary

| EAS profile           | EAS environment / label         | Artifact and behavior                                                             |
| --------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| development           | development / Mnelo Development | Development Client; internal iPhone build / Android APK                           |
| development-simulator | development / Mnelo Development | Inherits development; iOS simulator app                                           |
| preview               | preview / Mnelo Preview         | Internal standalone app, no development launcher; iPhone ad hoc / Android APK     |
| production            | production / Mnelo Production   | Store distribution; remotely incremented build numbers; iOS archive / Android AAB |

Local execution uses `EXPO_PUBLIC_APP_ENV=local` with loopback services and guarded reserved test identities. Hosted environments require HTTPS/WSS and client-safe publishable keys; preview/production require a configured Supabase backend. Build profile and app environment must agree. The same native identifier deliberately replaces other environment builds on a device; backend isolation does not imply side-by-side installation.

`config/release-environments.json` is a **public, reviewed project registry**, currently all null because cloud projects are not authorized/configured. Register each actual Supabase HTTPS origin and EAS project UUID after account setup. Never put credentials in this file. Every configured environment requires its matching origin and EAS UUID; duplicate backend origins across environments are rejected. One Expo app/project may be used for all three profiles. An unconfigured Development Client can still be built before backend authorization. A release with an unregistered environment fails closed with `RELEASE_ENVIRONMENT_NOT_REGISTERED`; a mismatched endpoint/project fails with `RELEASE_PROJECT_MISMATCH`.

The app config and `npm run check:env` enforce this registry. Current null entries are a deliberate release gate, not invented infrastructure. A reviewed registry cannot prove cloud-side Auth/SMS/Storage/worker configuration; those require separate validation. EAS `environment` selects its variable set; `EXPO_PUBLIC_*` values are visible in the compiled app even if a dashboard labels them secret. Privileged LiveKit, SMS, Supabase service-role and Expo dispatcher credentials belong only in server secret storage. [EAS environments](https://docs.expo.dev/eas/environment-variables/), [build profiles](https://docs.expo.dev/build/eas-json/).

## Exact cloud preparation sequence

For the optional EAS cloud path, authenticate with:

```sh
npx eas-cli@23.2.0 login
```

Authenticate directly in the terminal/browser; never paste credentials or two-factor codes in chat. Then inspect existing team-owned projects before linking/creating one with `npx eas-cli@23.2.0 init`. Reuse any matching project; no duplicate App ID. Put the actual UUID in `EAS_PROJECT_ID` and the public registry. Use `eas env:create --environment development` (and separately preview/production) interactively for the corresponding client-safe values; do not copy local `.env.local` to EAS. No paid build, project creation or legal contract is silently approved by this document.

Create/authorize **Mnelo Development** backend first. Keep preview and production in separate backend projects. Deploy migrations and Edge Functions after their environment-specific server settings are ready. Do not push the local Supabase config: it contains reserved test OTPs and loopback redirects. Do not run the local seed against cloud. See LOCAL_BACKEND.md, AUTH.md, NOTIFICATIONS.md, CALLS.md and ACCOUNT_LIFECYCLE.md for server setup boundaries.

For the selected environment, privately configure production-capable SMS, Auth limits/CAPTCHA, HTTPS origins, private Storage, LiveKit server credentials/room policy, protected push dispatch, worker Vault authorization and monitoring. Enable the existing inactive cleanup/dispatch jobs only after actual permission/eviction/deletion tests. Migrations alone do not configure these services. Production needs separately reviewed backup/log/legal retention and operating ownership.

## Build commands after prerequisites

```sh
npm run check
npm run check:env
npx eas-cli@23.2.0 build --platform ios --profile development-simulator
npx eas-cli@23.2.0 build --platform ios --profile development
npx eas-cli@23.2.0 build --platform android --profile development
npx eas-cli@23.2.0 build --platform all --profile preview
npx eas-cli@23.2.0 build --platform all --profile production
```

Commands are preparation, not completed build claims. EAS requires a committed working tree. SDK-compatible images are selected by EAS; verify the build's actual Xcode/JDK/native versions and logs. Device registration/signing requires the owner's Apple team where prompted; IPHONE_DEVELOPMENT.md has the exact local/device flow. Android development tooling and actual APK evidence are in ANDROID_DEVELOPMENT.md. Internal preview and store builds require their registered hosted backend configurations; a local debug-signed diagnostic APK is not a cloud preview/store artifact.

Native module/config changes require CNG prebuild and a new development client. SDK 57 prebuild defaults to clean regeneration; use `--no-clean` for intentional incremental generation. Keep changes in authoritative config/plugins, not permanent edits to ignored native folders. Production marketing version is currently 0.1.0; choose final release version only with a reviewed release. OTA updates/channels are unconfigured; do not enable them without runtime compatibility and rollback planning.

## Release gates

- Supported iOS compilation, simulator boot, signed physical iPhone acceptance and real hardware audio/video/background behavior.
- Authenticated cloud projects with isolated settings, working SMS, APNs/FCM delivery/receipts, server call authorization/eviction and account-deletion workers.
- Complete physical Android/iPhone flows, incoming/killed-app calls, native VoiceOver/TalkBack and 16-KiB runtime QA. Emulator/video-frame evidence is supplementary.
- Runtime decoder advisory disposition and full cold/warm native-link validation in DEPENDENCY_AUDIT.md; current 16 moderate npm findings are understood, not a zero-audit claim.
- Final native artifacts with intended signing, secret scans, backend negative tests, production environment checks and operator monitoring.
- Owner-reviewed final assets, legal/privacy/retention/store declarations and an actual mobile support/deletion web presence. The current mnelo.com website serves a separate estimation/procurement product and must not be overwritten.

Never publish, submit contracts or make privacy/age-rating declarations without owner action. TLS, authenticated access, private storage and RLS are not end-to-end encryption.

The concrete Apple/Google checklist and data inventory are in [STORE_READINESS.md](STORE_READINESS.md), with unknown owner fields explicitly null in docs/store/metadata.json. These are engineering preparation, not submitted declarations.

## Latest external account check

Phase 30 EAS CLI 23.2.0 still reports Not logged in. Supabase CLI can list three pre-existing projects in the Mnelo organization; none is Mnelo Development. The existing Mnelo project is inactive and is not reused for mobile. An authenticated Management API organization-plan read returned HTTP 403, and the dashboard required sign-in, so cost-free isolated project creation could not be verified. No project, billing setting, existing backend or cloud credential was changed. The later Supabase prerequisite is owner access to the organization's plan/project-creation page, followed by an explicitly isolated Mnelo Development project with no unapproved billing change. Do not describe the CLI as entirely unauthenticated.

## Current design gate

The approved presentation is Light + Acid Lime; see [the design system](DESIGN_SYSTEM.md). The approved image boards and full brief have now been reviewed; vector symbols, wordmarks, launcher/adaptive/notification and splash assets are implemented. The former M placeholder is removed. Complete the [remaining visual matrix](DESIGN_QA.md), retain bundled dependency notices with distributions, and regenerate standalone distribution artifacts before store screenshots or physical acceptance. The latest simulator Development Client and Android development APK contain the approved identity; earlier standalone diagnostic archives remain dated snapshots. The owner has deferred physical iPhone testing while the design is refined.
