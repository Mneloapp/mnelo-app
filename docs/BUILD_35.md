# Build 35: latency fixes with SDK patch alignment

This is the release candidate for the delivery/call/audio/video changes described in [Build 34](BUILD_34.md). Both phones must update to build 35 for physical acceptance.

The build-34 source passed all 662 local tests, but its public CI failed the dependency compatibility check after Expo published new SDK 57 patch requirements. Its native archive attempt also exhausted local build space and did not produce a distributable archive. Build 34 was not uploaded to Apple; its immutable public source tag is retained as an audit record.

Build 35 aligns the seven packages identified by the check: Expo, build properties, image manipulator, image picker, location, notifications and sharing. It retains all release checks and dependency-lock verification. Generated build/module caches were removed to recover space; shipped archives and local histories were preserved. Validation and TestFlight availability are recorded after verification in BUILD_LOG.

With these patches, the complete local check passes all 662 tests, Expo reports all dependencies compatible, and Doctor passes all 21 checks using the configured CocoaPods runtime. Native prebuild and pod installation pass. Physical voice/video startup, speaker routing and both receipt transitions still require acceptance on two updated phones; the HTTP/Signal benchmark is not a substitute for native media measurements.
