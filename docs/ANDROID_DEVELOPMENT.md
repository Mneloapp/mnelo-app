# Mnelo Android development

One React Native/Expo SDK 57 codebase; applicationId and namespace com.mnelo.messenger, display name Mnelo, URL scheme mnelo. Generated native files are ignored and recreated by Expo CNG. This phase uses a local development client, never Expo Go.

September 12 background-call update: minimum Android is now **8 / API 26**, declared in Expo build-properties and the native module; merged APK confirms min 26 / target 36. Core-Telecom 1.0.0 and Firebase Messaging 25.0.1 compile successfully. FCM provider configuration and physical delivery remain pending; no Google Play release or additional paid toolchain was created. Set `MNELO_GOOGLE_SERVICES_FILE` to an owner-controlled client configuration for `com.mnelo.messenger` before prebuild. Keep the separate server service-account private key out of the app, repository and build inputs. See [background delivery setup](BACKGROUND_DELIVERY.md).

Signal migration (not yet active in the app): official libsignal 0.102.2 Java artifacts target Java 21. The isolated helper now selects Temurin 21; the old JDK remains untouched. `:mnelo-signal:compileDebugKotlin` passed with Gradle 9.3.1. This is a module compilation check, not a complete APK or Android device call test.

## Isolated Mac toolchain

scripts/setup-android.mjs installs official checksum-verified Temurin 21.0.12.1+1 and Google command tools build 15859902 / version 22.0 under ~/.local/share/mnelo-toolchain/android. It changes neither global Java nor shell startup files. The pinned Java release comes from [Adoptium](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.12.1%2B1); command tools and their SHA-256 are published by [Android](https://developer.android.com/studio#command-tools). Android Studio is optional for this command-line build; its Device Manager is an alternative for later interactive development. The current command tools warn that sdkmanager is deprecated in favor of Android CLI; this audited sdkmanager runs under Java 21.

Installed repository requirements are authoritative: node_modules/react-native/gradle/libs.versions.toml specifies compile/target API 36, build tools 36.0.0 and NDK 27.1.12297006; the generated wrapper selects Gradle 9.3.1. CMake 3.22.1 supports native dependencies. The NDK's Darwin tools may use Rosetta; an x86_64 execution probe passed on this host.

```sh
npm run android:setup
MNELO_ANDROID_ROOT="$HOME/.local/share/mnelo-toolchain/android"
JAVA_HOME="$MNELO_ANDROID_ROOT/jdk-21.0.12.1+1/Contents/Home" \
  "$MNELO_ANDROID_ROOT/sdk/cmdline-tools/22.0/bin/sdkmanager" \
  --sdk_root="$MNELO_ANDROID_ROOT/sdk" \
  'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' \
  'ndk;27.1.12297006' 'cmake;3.22.1'
```

Review SDK licensing prompts when setting up another machine. This creates no Google Play application/account or production signing credential. Downloads, SDK, Gradle caches and emulator data consume substantial disk space; the build helper checks a five-GiB cold / two-GiB incremental free-space floor before starting. That floor is a guard, not a guarantee for a fresh complete download/build.

## Development build and local backend

```sh
npx expo prebuild --platform android --no-install --no-clean
npm run android:build
npm run android:devices
npm start -- --localhost --port 8083
npm run android:install -- DEVICE_SERIAL
```

The helper uses two Gradle workers, a two-GiB heap and only arm64-v8a for this local debug APK. Completed output is copied to artifacts/android/mnelo-development-arm64.apk only after Gradle exits successfully. It uses generated debug signing and is not a Play artifact. Production EAS AAB configuration must use owner-managed production credentials and intended architectures; no Android source fork is created.

Install selects an explicit device serial and configures adb reverse for 8083 (Metro) and 8084 (local signaling). The active app uses device-owned storage and direct peer transport; legacy Supabase/LiveKit services are not required. Hosted identity/signaling use HTTPS/WSS independently of these local tunnels. A physical Android needs USB debugging and trust on the device. An emulator needs a compatible ARM64 API 36 system image and hardware virtualization; install it only when sufficient disk/memory remains.

## Acceptance

A successful Gradle task proves compilation only. Actual APK installation and rendering, two-user Auth/messaging/read/reconnect, photo/file/voice/location/contact, microphone/camera/notification denial, video/voice controls, foreground/background, offline queue, logout/deletion, English/Georgian and TalkBack/large-font behavior must be recorded separately. An emulator does not prove physical push delivery, hardware audio routing, camera quality or OEM battery/background behavior. CallKit-equivalent Android telecom/foreground ringing and killed-app delivery remain device/release gates.

Current results are recorded in BUILD_LOG.md and QA_REPORT.md. Do not infer a completed build from the existence of this guide or a JavaScript export.

## Audited emulator

The current AVD is `mnelo_api36_google`: Emulator 37.1.11, Google Play API 36 ARM64 image revision 7, Pixel 7 profile, 1080×2400. Google Play services support the installed Expo Location provider. No Google account was signed in. To reproduce after installing the base SDK:

```sh
MNELO_ANDROID_ROOT="$HOME/.local/share/mnelo-toolchain/android"
export JAVA_HOME="$MNELO_ANDROID_ROOT/jdk-21.0.12.1+1/Contents/Home"
export ANDROID_HOME="$MNELO_ANDROID_ROOT/sdk"
export ANDROID_AVD_HOME="$MNELO_ANDROID_ROOT/avd"
"$ANDROID_HOME/cmdline-tools/22.0/bin/sdkmanager" --sdk_root="$ANDROID_HOME" \
  'emulator' 'system-images;android-36;google_apis_playstore;arm64-v8a'
"$ANDROID_HOME/cmdline-tools/22.0/bin/avdmanager" create avd \
  --name mnelo_api36_google --package 'system-images;android-36;google_apis_playstore;arm64-v8a' --device pixel_7
```

Before first boot, set `disk.dataPartition.size=6442450944` in that AVD's config.ini (six GiB); the default ten-GiB partition needs substantially more free disk. Preserve any existing AVD instead of recreating it blindly. Launch:

```sh
"$ANDROID_HOME/emulator/emulator" -avd mnelo_api36_google -no-snapshot \
  -gpu swiftshader -memory 2048 -cores 2 -camera-back emulated -camera-front emulated
```

The audit used additional `-no-window -no-audio -no-boot-anim` flags for headless automated UI checks. This does not verify audible sound or physical microphones. Emulator raises requested RAM to 2,560 MB and requires roughly 7.4 GB available for first boot of this data partition. Initial disk preflights failed; only task-generated caches/obsolete AVD data were removed while preserving source, lockfiles, backend data and APKs. Do not remove another project's data to free space.

npm run android delegates to Expo run:android with the same isolated environment; npm run android:build produces the bounded ARM64 debug artifact. Do not use Expo SDK 57 prebuild without --no-clean for an incremental build: this installed CLI cleans generated native directories by default. Use a deliberate clean regeneration only when needed and preserve artifacts first.

Phase 27 replaces the disposable AOSP AVD with `mnelo_api36_google` using `system-images;android-36;google_apis_playstore;arm64-v8a` revision 7. Google Play services are required by the installed Expo Location fused provider; the AOSP image could not acquire a position. Use the new AVD name for subsequent emulator commands. No Google account is required for these local tests. See BUILD_LOG for SDK license/install and emulator disk-space diagnostics. Previous AOSP QA evidence remains valid historical evidence, but that AVD was deleted to recover task-generated disk space.

## Final standalone diagnostic path

With local services configured, `npm run android:diagnostic` builds an ARM64 standalone APK with embedded JavaScript, debug signing and an explicit local test-account notice. Non-local environments are rejected. Artifact: `artifacts/android/mnelo-local-diagnostic-arm64.apk`. This is not a distributable EAS preview/Play release and needs explicit adb reverse tunnels to the local API/LiveKit ports. No Metro tunnel is needed. The local Android network-security resource allows cleartext only to 127.0.0.1/localhost; hosted release config does not use that resource. EAS preview/production remain guarded by the public cloud-project registry.

Phase 30 rebuilt the development APK from current native config and produced the standalone diagnostic APK; final sizes/hashes and checks are in BUILD_LOG/RELEASE_REPORT. Generated Gradle/C++ outputs and ios/Pods were later cleared to recover task-generated disk space; rebuild/pod install regenerates them from lockfiles. APKs, native logs and source are preserved. The final Google AVD explicitly uses a six-GiB userdata partition (6442450944 bytes), two cores, requested 2,048-MB RAM; emulator raises RAM to 2,560 MB. Default AVDmanager userdata was unnecessarily larger and failed its free-space check.

September 9 maintenance validation: both current-lock APKs rebuild with the existing toolchain, pass signature/ZIP/24-library ELF alignment checks, install and render authenticated Chats. The initial concurrent emulator boot had system-service ANRs before Mnelo launch; after compilation and a preserved-data reboot alone, no new ANR/crash event appeared. Current cold/warm URI dispatch/rendering checks passed without a Metro tunnel; post-link tap/full interactive regressions remain dated to September 8. The Development Client was restored and rendered with the explicit Metro tunnel. Updated hashes, source/QA and limitations are in [native results](audits/ios-26.6/native-result.json) and BUILD_LOG. Old binaries are retained under artifacts/android/2026-09-08. No new Android toolchain, store credential or cloud artifact was created.
