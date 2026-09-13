# Phase 0.1 — Native toolchain audit and iPhone readiness

> Historical record under **Connecto, the former working name**. **Mnelo is the official product name.** Package hashes, build output, paths, identifiers and Git status below describe the pre-rename audit, not the current checkout. See [product identity](PRODUCT_IDENTITY.md) and [rename report](RENAME_REPORT.md) for current state.

Date: 2026-09-07. Baseline commit: `99fd6fe`. Phase 0 is provisionally accepted; Phase 1 has not started.

**The repository is Expo SDK 57, not SDK 55. Its published supported minimum is Xcode 26.4. The fresh build on installed Xcode 26.2 fails in expo-modules-jsi 57.0.8. The simulator itself started, but Connecto did not install or render. Native boot remains externally blocked.**

## 1. Exact installed stack

Values below were read from installed package files and compared with package-lock.json, rather than inferred from declared ranges. All 41 direct installed package versions agree with the lockfile. The [machine-readable evidence](audits/phase-0.1/evidence.json) includes every direct package, native module and hashes of relevant files.

| Item                                       | Observed value                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Expo SDK identity from resolved app config | 57.0.0 (SDK 57)                                                           |
| expo package                               | 57.0.20                                                                   |
| React Native                               | 0.86.3                                                                    |
| React                                      | 19.2.3                                                                    |
| expo-router                                | 57.0.19                                                                   |
| expo-dev-client                            | 57.0.18                                                                   |
| expo-modules-core                          | 57.0.16                                                                   |
| expo-modules-jsi                           | 57.0.8                                                                    |
| CocoaPods                                  | 1.16.2, confirmed executable and Podfile.lock                             |
| Ruby                                       | System Ruby 2.6.10; CocoaPods needs the documented logger/PATH workaround |
| Node                                       | 24.18.0                                                                   |
| npm                                        | 11.16.0; repository package manager and lockfile owner                    |
| pnpm                                       | 11.19.0 available on PATH; not used for this repository                   |
| Yarn                                       | Not found on PATH; not used                                               |
| Expo Doctor                                | 1.20.4                                                                    |
| TypeScript / ESLint / Jest                 | 6.0.3 / 9.39.5 / 29.7.0                                                   |
| Selected Xcode                             | 26.2, build 17C52                                                         |
| Selected compiler                          | Apple Swift 6.2.3, swiftlang-6.2.3.3.21; clang-1700.6.3.2                 |
| Selected developer directory               | /Applications/Xcode.app/Contents/Developer                                |
| Native app deployment target               | iOS 16.4                                                                  |
| React Native core pods                     | 0.86.3                                                                    |
| Hermes pod                                 | 250829098.0.17, as resolved in Podfile.lock                               |

### Native module inventory

These 33 package entries were detected by Expo's Apple autolinker and React Native autolinking, supplemented by installed package/Podfile.lock verification. They include transitive native packages; installing a package does not mean the launch screen uses its feature. React Native core and Hermes are listed above rather than repeating each React sub-pod. The complete generated dependency graph remains in ignored `ios/Podfile.lock`; its hash is recorded in the evidence file.

| Native package                        | Installed version | Relationship | Pod(s)                               |
| ------------------------------------- | ----------------- | ------------ | ------------------------------------ |
| @expo/dom-webview                     | 57.0.1            | Transitive   | ExpoDomWebView                       |
| @expo/log-box                         | 57.0.4            | Transitive   | ExpoLogBox                           |
| @expo/ui                              | 57.0.16           | Direct       | ExpoUI                               |
| @react-native-community/netinfo       | 12.0.1            | Direct       | react-native-netinfo                 |
| @react-native-masked-view/masked-view | 0.3.2             | Transitive   | RNCMaskedView                        |
| expo                                  | 57.0.20           | Direct       | Expo                                 |
| expo-asset                            | 57.0.16           | Transitive   | ExpoAsset                            |
| expo-constants                        | 57.0.17           | Direct       | EXConstants                          |
| expo-dev-client                       | 57.0.18           | Direct       | expo-dev-client                      |
| expo-dev-launcher                     | 57.0.19           | Transitive   | expo-dev-launcher                    |
| expo-dev-menu                         | 57.0.18           | Transitive   | expo-dev-menu                        |
| expo-dev-menu-interface               | 57.0.0            | Transitive   | expo-dev-menu-interface              |
| expo-file-system                      | 57.0.6            | Transitive   | ExpoFileSystem                       |
| expo-font                             | 57.0.3            | Transitive   | ExpoFont                             |
| expo-glass-effect                     | 57.0.1            | Transitive   | ExpoGlassEffect                      |
| expo-json-utils                       | 57.0.1            | Transitive   | EXJSONUtils                          |
| expo-keep-awake                       | 57.0.1            | Transitive   | ExpoKeepAwake                        |
| expo-linking                          | 57.0.9            | Direct       | ExpoLinking                          |
| expo-localization                     | 57.0.1            | Direct       | ExpoLocalization                     |
| expo-manifests                        | 57.0.1            | Transitive   | EXManifests                          |
| expo-modules-core                     | 57.0.16           | Transitive   | ExpoModulesCore, ExpoModulesWorklets |
| expo-modules-jsi                      | 57.0.8            | Transitive   | ExpoModulesJSI                       |
| expo-router                           | 57.0.19           | Direct       | ExpoRouter                           |
| expo-secure-store                     | 57.0.3            | Direct       | ExpoSecureStore                      |
| expo-splash-screen                    | 57.0.8            | Direct       | ExpoSplashScreen                     |
| expo-symbols                          | 57.0.2            | Transitive   | ExpoSymbols                          |
| expo-system-ui                        | 57.0.3            | Direct       | ExpoSystemUI                         |
| expo-updates-interface                | 57.0.1            | Transitive   | EXUpdatesInterface                   |
| react-native-gesture-handler          | 2.32.0            | Direct       | RNGestureHandler                     |
| react-native-reanimated               | 4.5.1             | Direct       | RNReanimated                         |
| react-native-safe-area-context        | 5.7.0             | Direct       | react-native-safe-area-context       |
| react-native-screens                  | 4.26.2            | Direct       | RNScreens                            |
| react-native-worklets                 | 0.10.1            | Direct       | RNWorklets                           |

Gesture Handler was initially auto-installed as 3.2.1 through Router's wildcard peer dependency. Expo Doctor accepted the peer relationship, but installed `expo/bundledNativeModules.json` recommends `~2.32.0`. It is now explicitly declared at that range and installed/linked as **2.32.0**. No gesture-dependent product code exists. Expo, React Native, React, Router and development-client versions were not upgraded or downgraded.

## 2. True Xcode requirement and exact evidence

There are distinct sources of requirements. They must not be conflated:

| Evidence                                                                                                    | What it establishes                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Versioned Expo SDK 55 table](https://docs.expo.dev/versions/v55.0.0/#support-for-android-and-ios-versions) | SDK 55 supports Xcode 26.2+. The user's table reading is correct.                                                                                                                         |
| [Versioned Expo SDK 57 table](https://docs.expo.dev/versions/v57.0.0/#support-for-android-and-ios-versions) | SDK 57's published supported minimum is Xcode 26.4+. This is the table applicable to this repository.                                                                                     |
| `package.json`, lockfile, installed `expo/package.json`, resolved app config                                | All identify SDK 57 / expo 57.0.20, not SDK 55.                                                                                                                                           |
| Installed dependency declarations                                                                           | expo 57.0.20 → expo-modules-core `~57.0.16` → expo-modules-jsi `~57.0.8`; locked and installed versions are 57.0.16 and 57.0.8.                                                           |
| `expo-modules-jsi/apple/Package.swift:1`                                                                    | Declares Swift tools 6.2. This alone does **not** prove Xcode 26.4 is needed: installed Xcode 26.2 already has Swift 6.2.3.                                                               |
| `expo-modules-jsi/apple/ExpoModulesJSI.podspec:13–18`                                                       | Declares minimum iOS 16.4 and Swift language mode 6.0. These are not Xcode version requirements.                                                                                          |
| `expo-modules-jsi/.../RuntimeScheduler.h:53,61,90`                                                          | Constructors use `SWIFT_RETURNS_RETAINED`; the class's `SWIFT_SHARED_REFERENCE` annotation appears at the closing brace. The selected compiler rejects the constructor annotation.        |
| Fresh actual build                                                                                          | Fails at header line 61 while building ExpoModulesJSI xcframework, with Xcode exit 65. This happens after bypassing our own npm preflight, so the guard is not the source of the failure. |
| `react-native/scripts/cocoapods/helpers.rb:83–89`                                                           | React Native's generic checks say iOS 15.1 and Xcode 16.1; that lower check is insufficient for all installed Expo native modules.                                                        |
| Generated Podfile / Xcode project                                                                           | App deployment target 16.4; no generated numeric Xcode 26.4 requirement. Prebuild did not silently switch SDK families.                                                                   |
| Expo Doctor                                                                                                 | 21/21 passes; it did not report the SDK 57 Xcode minimum or reproduce compilation.                                                                                                        |

**Conclusion:** Xcode **26.4+ is the published support floor** for this unchanged SDK 57 dependency family, and **26.2 is empirically failing** for the installed JSI dependency. There is no successful Xcode 26.4 build on this Mac, so the audit does not claim an empirically demonstrated first-working compiler version or guarantee that updating resolves every future build issue. It establishes the supported next toolchain and the current blocking error.

## 3. Origin of the prior statement

The initial template commit `5eded94` already declared expo `~57.0.20`, React Native 0.86.3 and React 19.2.3. Phase 0 selected the current stable SDK permitted by the master brief rather than its SDK 55 example. There was no hidden SDK 55→57 upgrade during this audit, and no secondary dependency unexpectedly raised an otherwise SDK 55 application.

The 26.4 statement came from Expo's compatibility table for **SDK 57**, then became an explicit local preflight after the native failure. It was not copied from the SDK 55 row, not inferred from iOS 16.4, and not reported by Expo Doctor. The initial report should have made the version-pinned evidence and distinction between a published minimum and an actually tested compiler clearer. README/release documentation and the guard now point to this audit and the versioned SDK 57 source. The guard also refuses to reuse its SDK 57 assumption if the installed Expo major changes.

## 4. iOS simulator result

Regenerated the iOS project from current app configuration, successfully installed CocoaPods, and ran:

`PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH" RUBYOPT=-rlogger npx expo run:ios --device A3B98926-95F4-408B-87D4-C95BACFD9FA1 --no-bundler`

The target is the local iPhone 17 Pro simulator on iOS 26.2. Expo booted that simulator and invoked the native compiler. The result was **one reported compiler error, one build-script warning, exit 65**. The exact diagnostic and warning are preserved in [ios-build-failure.txt](audits/phase-0.1/ios-build-failure.txt). The failure is in `expo-modules-jsi`, not application TypeScript, phone signing, a missing backend, or the local preflight script.

The warning concerns the generated Expo Dev Launcher “Strip Local Network Keys for Release” script having ambiguous build dependencies; it is not the fatal error and no generated-project workaround was committed. `simctl get_app_container` confirmed Connecto was not installed. No app screenshot, visual QA, runtime-warning result, or successful launch is claimed. The simulator was shut down after the diagnostic attempt. No Expo native source was patched to bypass the compiler failure.

## 5. Physical iPhone readiness

Apple's device tools report a paired, available **iPhone 17 Pro Max, iOS 26.6**, with **Developer Mode enabled**, connected over the local network. The keychain has **one valid Apple Development identity**. Identifiers, certificate details and signing credentials are not included in audit evidence.

The repository's bundle is `ge.connecto.app`, URL scheme is `connecto`, Xcode scheme is `Connecto`, and development client / physical EAS development profile are configured correctly. No team is selected in the generated project and bundle/device provisioning has not been verified. A valid signing identity is not proof of provisioning readiness. No new Apple authentication was needed to inspect the device; no device app build was attempted while the same native compile blocker remains.

**Next user action:** update Xcode to a supported stable version (26.4+), finish Apple's installation/account prompts, then run the documented simulator command. For the phone, select the development team in Xcode Signing & Capabilities and run `npm run ios:device` with the CocoaPods environment workaround. If Xcode requests authentication, the interaction point is **Xcode → Settings → Accounts → Add Apple Account**. The complete ordered commands, EAS alternative and credential boundaries are in [IPHONE_DEVELOPMENT.md](IPHONE_DEVELOPMENT.md).

## 6. Dependency audit disposition

[DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md) enumerates all 14 entries with package/version, advisory, direct/transitive relationship, execution context, reachability, fix availability, breaking risk and disposition.

- Eleven entries inherit the UUID advisory in the build-tool chain. The inspected consumer uses unaffected v4 without a caller-supplied buffer; the affected npm UUID package is not in mobile bundles. Accepted as internal tooling residuals, subject to re-audit when usage changes.
- Three entries inherit one decoder advisory. Both platform bundles contain it; the installed parser exceeded a bounded local probe deadline on malformed input. Native exploitation was not tested. Retained for controlled internal foundation testing only; **not accepted for public release**.
- Non-breaking audit dry run: zero package changes proposed. No safe advisory fix exists within the current ranges; no force remediation was run. The Gesture Handler alignment addresses a separate native compatibility finding and does not reduce the 14-entry count.

## Android prerequisites

No Android toolchain was installed. The Java stub reports no runtime, Android SDK directory/adb are absent, and no Android build/boot is claimed. Both iOS and Android JavaScript bundles still export successfully after native version alignment.

| Requirement           | Exact source / action for later                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JDK                   | **17**, requested by installed React Native Gradle plugin `jvmToolchain(17)` and JavaVersion.VERSION_17 configuration. Use JDK 17 explicitly, even if Android Studio bundles a different JDK. |
| Android Studio        | Install a stable Android Studio compatible with **Android Gradle Plugin 8.12.0** and its SDK Manager; no particular Studio marketing version is encoded in this repository.                   |
| SDK platform / target | **API 36**; installed RN version catalog sets compileSdk=36 and targetSdk=36.                                                                                                                 |
| Minimum device API    | **24** (Android 7). Use an API 36 target for initial emulator QA.                                                                                                                             |
| SDK Build Tools       | **36.0.0**, from installed RN version catalog.                                                                                                                                                |
| NDK                   | **27.1.12297006**, from the same catalog; required for native modules.                                                                                                                        |
| Gradle                | Generated wrapper selects **9.3.1**; use the wrapper, not a separately guessed Gradle version.                                                                                                |
| Kotlin                | Installed RN version catalog selects **2.1.20**.                                                                                                                                              |
| Runtime target        | Android Studio Device Manager: an ARM64 API 36 emulator on this Apple Silicon Mac, or physical device with USB debugging and RSA trust enabled.                                               |
| Environment           | Set ANDROID_HOME to installed SDK; add platform-tools/emulator to PATH; select JDK 17 with JAVA_HOME. Verify `adb devices` and `java -version`, then `npm run android`.                       |

These are source-level prerequisites, not a successful Gradle resolution/build. Runtime SDK settings are derived through Expo's Gradle plugin from the installed version catalog. No iOS-only product code was introduced.

## 7. Files changed

- `package.json`, `package-lock.json`: explicit Expo-compatible Gesture Handler 2.32.0 alignment; core stack unchanged.
- `scripts/check-ios-toolchain.mjs`: source citation, actual installed Expo version in diagnostics, and prevention of applying SDK 57 policy to an unreviewed different SDK.
- `README.md`, `docs/RELEASE.md`: version-pinned Xcode explanation, audit link, explicit Android JDK/prerequisites.
- `docs/PHASE_0_REPORT.md`, `docs/SECURITY.md`: historical status and links to the current detailed findings.
- New: this report, `docs/IPHONE_DEVELOPMENT.md`, `docs/DEPENDENCY_AUDIT.md`, and sanitized `docs/audits/phase-0.1/` evidence.
- Ignored only: native regeneration, Pods, logs, raw device diagnostics, audit JSON and source maps under `artifacts/phase-0.1/`. No product screens/services, Supabase schema, LiveKit features or Android toolchain added.

## 8. Checks and actual results

| Check                                                                         | Result                                                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Initial strict TypeScript, lint, formatting, tests, source/environment guards | PASS; 4 suites / 27 tests                                                                                       |
| Installed package/lock comparison                                             | PASS; 41 direct packages match after alignment                                                                  |
| Expo Doctor 1.20.4, verbose, CocoaPods PATH/logger workaround                 | PASS; 21/21. Does not establish successful compilation.                                                         |
| Expo dependency compatibility                                                 | PASS; packages match SDK recommendations after Gesture Handler alignment                                        |
| Native autolinking / iOS prebuild / CocoaPods                                 | PASS; actual installed native package graph captured                                                            |
| Native simulator compilation                                                  | FAIL; JSI constructor annotation, exit 65; app not installed                                                    |
| iOS preflight                                                                 | EXPECTED BLOCK; installed SDK 57 / Xcode 26.2 accurately reported                                               |
| iOS + Android Metro release export with source maps                           | PASS; used to inspect actual bundled dependency paths                                                           |
| npm audit                                                                     | 14 moderate, 0 high, 0 critical; not a clean audit                                                              |
| Safe audit remediation dry run                                                | Zero changes; all findings remain                                                                               |
| Decoder local diagnostic                                                      | Ordinary query completes; malformed query hits 1.5-second timeout and is killed                                 |
| Physical device inspection                                                    | Paired/available, Developer Mode enabled, one valid development identity; no provisioning or device launch pass |
| Android native build / UI / iPhone UI                                         | NOT RUN in this audit; toolchain/compile blockers remain                                                        |

Final post-change verification also passed: `npm run check` exited 0 (TypeScript, lint with zero warnings, formatting, 4 suites / 27 tests, source guard and environment validation); `npx expo-doctor --verbose` exited 0 with 21/21; `npx expo install --check` exited 0 with “Dependencies are up to date.” The updated native preflight exited 1 as expected, identifying installed expo 57.0.20 and Xcode 26.2. All nine recorded source hashes were rechecked and still match. Raw logs are local, ignored, and distinct from the sanitized evidence.

[Resolved native build settings](audits/phase-0.1/ios-build-settings.json) were obtained successfully with `xcodebuild -showBuildSettings -json`. They confirm `ge.connecto.app`, deployment target 16.4, selected simulator SDK 26.2, and no selected signing team. The app target's Swift language mode 5.0 is separate from ExpoModulesJSI's language/tool requirements and from the selected Swift compiler version.

## 9–10. Git status and commit

HEAD remains **`99fd6fe8527ffd710484ee963f303deb47e00c00`** on `main` (`chore: initialize Connecto mobile foundation`). The successful-boot condition for the requested `chore: validate native ios development environment` commit has **not** been met. No new commit has been created. Phase 0.1 audit changes are retained, unstaged, for review; no claim of a clean accepted native build is implied by the previous commit. No Phase 1 work has begun.

Final working-tree disposition: seven modified tracked files and six new report/evidence files, none staged. Generated native projects, Pods, raw device data and logs remain ignored. The reviewable files are:

```text
 M README.md
 M docs/PHASE_0_REPORT.md
 M docs/RELEASE.md
 M docs/SECURITY.md
 M package-lock.json
 M package.json
 M scripts/check-ios-toolchain.mjs
?? docs/DEPENDENCY_AUDIT.md
?? docs/IPHONE_DEVELOPMENT.md
?? docs/PHASE_0_1_REPORT.md
?? docs/audits/phase-0.1/evidence.json
?? docs/audits/phase-0.1/ios-build-failure.txt
?? docs/audits/phase-0.1/ios-build-settings.json
```
