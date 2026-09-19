# Native build environment

Build 39 bundled without the public phone-service and relay configuration. An
otherwise valid signed archive could therefore open the unavailable-service
screen. Build 40 restored those values through a local Xcode environment file.
The native-build-environment plugin now preserves the selected Expo prebuild
environment automatically and rejects incomplete Release bundles.

Use the same explicit environment for Expo prebuild and the native build. The
TestFlight values are defined in `eas.json` under `build.testflight.env`. For a
manual Xcode archive, select `EAS_BUILD_PROFILE=testflight` and supply those
public values during prebuild. Generated native files must be regenerated when
the selected environment changes.

The plugin writes only the four approved public variables, the selected build
profile and build-control flags into a managed section of `ios/.xcode.env`.
This also configures the Expo Constants build phase. The share and notification
engines are bundled in that same prebuild process. It does not copy arbitrary
environment variables or credentials. `.xcode.env.local` may still configure
the Node executable; it is no longer needed to hold service configuration.

Immediately before the app's JavaScript bundle is generated, a separate guard
checks the saved prebuild configuration against any Xcode-local overrides.
It restores missing values, disables dotenv fallback, and stops the archive
if endpoints or the reliable-delivery switch are missing, the EAS profile
disagrees, local overrides are stale, or bundling/public-variable inlining was
disabled. A missing environment no longer silently produces a local-mode
Release archive. Existing protocol-review gates remain in force.

An intentional embedded local Release diagnostic can opt in at prebuild with
`MNELO_LOCAL_RELEASE_DIAGNOSTIC=1`. It must also explicitly set
`EXPO_PUBLIC_APP_ENV=local`, supply loopback relay and phone-service URLs, and
omit `EAS_BUILD_PROFILE`. This is a local probe, not a TestFlight configuration.
Ordinary Debug development remains supported.

`tests/native-build-environment.test.ts` executes the real guard through a shell
bundle phase. It verifies endpoint restoration without a local Xcode env file,
rejection before bundling on a stale override, configuration/profile failures,
and repeatable native generation. The final archived app and both extensions
still require artifact inspection, and physical cold launch remains a separate
device check.
