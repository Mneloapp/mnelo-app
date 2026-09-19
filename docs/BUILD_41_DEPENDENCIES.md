# Build 41 dependency review

Reviewed September 19, 2026, before installing the recommended patches. This
records the review and validation plan, not completed installation or device QA.

Expo Doctor found 13 patch-version mismatches against SDK 57's current supported
set. Align these packages together; do not upgrade the SDK, React Native,
React, LiveKit or WebRTC. The existing CI runs both Expo Doctor and
`expo install --check`, so retaining the mismatches would leave those checks
failing. Do not hide them with dependency exclusions.

| Package                  | Installed at review | Selected patch | Official changelog assessment                                                                                                                                                      |
| ------------------------ | ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo`                   | 57.0.23             | 57.0.24        | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo/CHANGELOG.md); updates CLI, asset and constants dependencies.                                      |
| `@expo/ui`               | 57.0.18             | 57.0.19        | [Adds optional SwiftUI NavigationSplitView](https://github.com/expo/expo/blob/sdk-57/packages/expo-ui/CHANGELOG.md).                                                               |
| `expo-asset`             | 57.0.17             | 57.0.18        | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-asset/CHANGELOG.md); constants dependency update.                                                  |
| `expo-build-properties`  | 57.0.19             | 57.0.21        | [57.0.20 fixes opt-in scene-lifecycle plugin insertion; 57.0.21 has no user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-build-properties/CHANGELOG.md). |
| `expo-calendar`          | 57.0.3              | 57.0.4         | [Fixes selected calendar APIs with write-only access](https://github.com/expo/expo/blob/sdk-57/packages/expo-calendar/CHANGELOG.md).                                               |
| `expo-constants`         | 57.0.18             | 57.0.19        | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-constants/CHANGELOG.md).                                                                           |
| `expo-contacts`          | 57.0.5              | 57.0.6         | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-contacts/CHANGELOG.md).                                                                            |
| `expo-image-manipulator` | 57.0.18             | 57.0.19        | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-image-manipulator/CHANGELOG.md).                                                                   |
| `expo-image-picker`      | 57.0.18             | 57.0.19        | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-image-picker/CHANGELOG.md).                                                                        |
| `expo-location`          | 57.0.18             | 57.0.19        | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-location/CHANGELOG.md).                                                                            |
| `expo-notifications`     | 57.0.19             | 57.0.20        | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-notifications/CHANGELOG.md); constants dependency update.                                          |
| `expo-router`            | 57.0.21             | 57.0.22        | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-router/CHANGELOG.md); UI and Metro runtime dependency updates.                                     |
| `expo-sharing`           | 57.0.20             | 57.0.21        | [No user-facing changes](https://github.com/expo/expo/blob/sdk-57/packages/expo-sharing/CHANGELOG.md).                                                                             |

The official [Expo 57.0.24 package metadata](https://registry.npmjs.org/expo/57.0.24)
and its packaged `bundledNativeModules.json` retain React 19.2.3, React Native
0.86.3, Reanimated 4.5.1, Worklets 0.10.1, Expo Modules Core `~57.0.18` and Expo
Camera `~57.0.5`. Related [CLI 57.0.26](https://github.com/expo/expo/blob/sdk-57/packages/@expo/cli/CHANGELOG.md)
and [Metro runtime 57.0.16](https://github.com/expo/expo/blob/sdk-57/packages/@expo/metro-runtime/CHANGELOG.md)
also list no user-facing changes. The reviewed patches were published September
16–18, after the earlier builds' dependency selection.

These patches do not establish a fix for call, video or message-delivery latency.
Those fixes require their own code review, timing tests and two-phone evidence.
Native updates still carry integration risk despite the small version changes.
Keep `usePrecompiledModules: false` and the existing pinned LibSignal source
dependencies to preserve the build 39/40 crash correction.

After alignment, inspect the dependency/lockfile diff for unrelated changes, run
Doctor and version checks again, rerun the automated application/protocol suite,
and regenerate the native projects with the explicit TestFlight environment.
Archive and inspect app/extension versions, service configuration, signing,
permissions and all embedded libraries for unavailable Testing-framework links.
Finally verify in-place cold launch, notification routing, voice/video startup
and sharing on the two phones. Record actual results separately in the build
report; package compatibility checks alone do not prove runtime acceptance.

## Executed validation — September 19, 2026

The 13 selected patches were installed and the lockfile aligned. The direct
dependency diff retains the reviewed SDK 57 platform and the existing
LiveKit/WebRTC versions. Third-party notices were regenerated for the resulting
inventory. Expo Doctor now passes **21/21**, and the dependency compatibility
check passes. Evidence: `artifacts/build41-dependency-alignment.log`,
`build41-lock-alignment.log` and `build41-doctor-final.log`.

The full post-alignment source check passes **529 Jest tests in 99 suites,
3 server checks and 166 device/protocol tests**, plus types, lint, formatting,
source security/environment/localization and brand checks. Evidence:
`artifacts/build41-check.log`. Dependency audit records **16 moderate findings
and no high or critical findings** in `artifacts/build41-audit-final.log`;
the dependency graph is not reported as free of vulnerabilities.

iOS/Android JavaScript exports also passed; source, history and exported-bundle
Gitleaks scans reported zero findings (`artifacts/build41-export.log` and
`build41-secret-scan.log`).

Clean TestFlight prebuild and CocoaPods installation completed; native archive
compilation is underway at this checkpoint. Signed artifact inspection, Apple
processing and physical-device acceptance remain pending and are tracked in
[BUILD_41](BUILD_41.md). The measured protocol improvements come from the
application/server changes, not an asserted latency fix in these Expo patches.
