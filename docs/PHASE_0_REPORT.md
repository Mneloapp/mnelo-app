# Phase 0 delivery report

> Historical record under **Connecto, the former working name**. **Mnelo is the official product name.** Package hashes, build output, paths, identifiers and Git status below describe the pre-rename audit, not the current checkout. See [product identity](PRODUCT_IDENTITY.md) and [rename report](RENAME_REPORT.md) for current state.

Date: 2026-09-07. Scope: repository and mobile foundation only.

Historical report. The user subsequently accepted Phase 0 provisionally. See [Phase 0.1](PHASE_0_1_REPORT.md) for installed-version evidence, a fresh native build, physical-iPhone readiness, the complete dependency audit, and remaining gates. No Phase 1 implementation has started.

**Implementation is ready for review; native boot acceptance is blocked by host tooling. Phase 0 is not fully accepted and Phase 1 has not started.** No rendered-device screenshot or native boot pass is claimed.

## 1. Implemented

- Created `connecto-app/` in the verified empty workspace and initialized Git on `main` (the Expo generator created the initial template commit).
- Expo SDK 57.0.20 / React Native 0.86.3 / React 19.2.3 with Expo Router, strict TypeScript, native development-client scripts, correct Connecto identity and CNG native projects.
- Minimal launch and route-recovery surfaces; shared semantic design tokens, text/button/safe-area primitives, English default and typed Georgian localization foundation.
- TanStack Query provider with bounded retries, native focus/connectivity observations and no persisted cache; small in-memory Zustand locale preference. React Hook Form/Zod installed for later forms.
- Build/runtime environment validation, client-safe configuration allow-list, server secret example isolation, SecureStore native configuration (no session implementation), safe error-code boundary and source security regression checks.
- ESLint, Prettier, Jest/React Native Testing Library, pinned runtime/lockfile, quality commands, a CI workflow, native toolchain preflight and documented EAS development/preview/production profiles plus a development-simulator variant.
- Directory boundaries and all eight required architecture/security/testing/release documents.

## 2. Files changed

| Group              | Main files                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build and identity | `package.json`, `package-lock.json`, `app.config.ts`, `eas.json`, `tsconfig.json`, `.nvmrc`, `.npmrc`                                                                     |
| Tooling            | `eslint.config.js`, `jest.config.js`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.github/workflows/ci.yml`, `scripts/`                                      |
| Application        | `app/_layout.tsx`, `app/index.tsx`, `app/+not-found.tsx`, `src/components/`, `src/lib/`, `src/theme/`, `src/i18n/`, `src/stores/`                                         |
| Verification       | `tests/env.test.ts`, `tests/errors.test.ts`, `tests/launch.test.tsx`, `tests/security.test.ts`, `tests/setup.ts`                                                          |
| Documentation      | `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DATA_MODEL.md`, `docs/RLS_MATRIX.md`, `docs/UX_FLOW.md`, `docs/TESTING.md`, `docs/RELEASE.md`, this report |
| Boundaries         | Empty feature/service directories, `supabase/README.md`, `supabase/migrations/`, two names-only `.env.example` files, `.gitignore`                                        |

Removed the template `App.tsx`, `index.ts` and `app.json` in favor of Router and dynamic configuration. Generated `ios/`, `android/`, `.expo/` and export artifacts are ignored. The starter assets are unused and documented as non-final branding.

## 3. Database changes

None. No Supabase project, tables, migrations, policies, seed data, backend client or fake service was created. The data model and RLS matrix are explicitly planned contracts. No RLS test result is claimed.

## 4. Security implications

The launch app contains no privileged credentials or service integrations. Unsafe configuration is rejected without echoing values. Secrets/signing material are ignored, public variables are explicitly read, error telemetry is allow-listed, and no sensitive content is persisted. SecureStore is available but authentication/session lifecycle remains Phase 2.

The audit reports 14 moderate affected-package entries from two root advisories, with zero high/critical findings. Compatible automatic fixes were applied; forced SDK/Router downgrades were not. Details and upstream links are in SECURITY.md. These advisories are unresolved and require review before release. Source/bundle pattern checks are limited checks, not a comprehensive independent security audit.

## 5–6. Checks run and results

| Check                                                            | Observed result                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Directory / parent instruction / Git inspection                  | Empty workspace, no enclosing Git repository or applicable AGENTS.md; safe initialization                                                                                                        |
| Strict TypeScript                                                | PASS: no errors                                                                                                                                                                                  |
| ESLint                                                           | PASS: no warnings or errors                                                                                                                                                                      |
| Prettier                                                         | PASS                                                                                                                                                                                             |
| Jest                                                             | PASS: 4 suites, 27 tests; environment safety, error/retry boundaries, source guard, English/Georgian launch and button behavior                                                                  |
| Source security and environment checks                           | PASS: no flagged mobile references or tracked secret files; local config accepted without service values                                                                                         |
| Expo dependency alignment                                        | PASS: `npx expo install --check`                                                                                                                                                                 |
| Expo Doctor with existing CocoaPods on PATH and logger preloaded | PASS: 21/21 checks. Plain invocation initially failed CocoaPods detection. Doctor does not prove the installed Xcode meets SDK 57's minimum                                                      |
| iOS / Android Metro export                                       | PASS: both platform Hermes bundles generated                                                                                                                                                     |
| Development server                                               | PASS: `npm start -- --localhost --port 8081`; `/status` returned `packager-status:running`. Server stopped after verification                                                                    |
| iOS native project generation / CocoaPods                        | Generated; CocoaPods installation succeeded using the documented host workaround                                                                                                                 |
| Actual iOS native compile and boot                               | FAIL / BLOCKED: Xcode 26.2 compilation exited 65 in ExpoModulesJSI `RuntimeScheduler.h` with two `SWIFT_RETURNS_RETAINED` errors. SDK 57 requires Xcode 26.4+. App was not installed or rendered |
| iOS preflight guard                                              | Verified rejection of installed Xcode with `IOS_TOOLCHAIN_UNSUPPORTED`                                                                                                                           |
| Android project generation                                       | Generated with `ge.connecto.app`; light-mode native module added after the prebuild warning                                                                                                      |
| Actual Android native build and boot attempt                     | BLOCKED: SDK default location absent, `adb ENOENT`, no Java runtime/device/emulator. No APK compiled or app rendered                                                                             |
| Dependency audit                                                 | `npm audit --audit-level=high` exits 0, with 14 moderate entries still reported; this is not a clean audit                                                                                       |
| Built-bundle privileged-key-name scan                            | No matches for tested server-key names/private-key marker; not a complete secret scan                                                                                                            |
| Git whitespace and ignore checks                                 | PASS; environment/signing/generated artifacts ignored                                                                                                                                            |

The final clean `npm ci` succeeded without forced peer-dependency bypass. Both native projects were regenerated after adding Android light-mode support; the final prebuild completed without that warning. CNG regeneration means native dependencies must be installed again before the next native build. Routine checks and both mobile exports were rerun successfully after the clean install.

Commands for all routine checks are in README.md. Actual iOS attempt used:

```sh
PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH" RUBYOPT=-rlogger npx expo run:ios --device A3B98926-95F4-408B-87D4-C95BACFD9FA1 --no-bundler
```

The device identifier above is the local **iPhone 17 Pro simulator**, not a physical phone. See [Expo's minimum toolchain table](https://docs.expo.dev/versions/latest/) and [the corresponding upstream compiler issue](https://github.com/expo/expo/issues/49426). The existing SDK configuration was retained; no unreviewed native dependency patches were applied.

## 7. Known limitations

Native acceptance requires Xcode 26.4+ and an Android SDK/JDK plus target. Real iPhone QA, EAS cloud linking/signing/builds, store release assets, device accessibility, and product flows are not verified. The current Mac had approximately 11 GB available after build attempts, so no multi-gigabyte system-toolchain installation was performed. No backend credentials or SMS provider are needed for this phase. LiveKit native integration and its compatibility checks are deferred to Phase 7.

The UI is a foundation boot screen only. No welcome action, auth screen, tab shell, fake data, database, chat, matching, moderation, push or calling was added. Error/timeout/offline behavior for those future features remains future work; the foundations do not substitute for their required tests.

## 8. Manual QA performed

Inspected the source, public app configuration, native project identity, generation/build logs, environment handling and development-server response. The iPhone simulator was booted by Expo, but compilation failed before the app could be installed. That simulator was shut down after the attempt. No visual app QA, screenshots, physical iPhone QA, Android visual QA, VoiceOver/TalkBack or two-account tests were performed.

## 9. Exact next phase

First resolve and rerun the outstanding **Phase 0 native boot gates**, then review Phase 0. **Only after approval: Phase 1 — Static UX Shell**, implementing the brief's specified screens with fixture repositories and full navigation/layout QA. Stop here; no Phase 1 work is authorized yet.
