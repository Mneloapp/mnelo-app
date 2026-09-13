# Build 25: incoming sharing and message composition

Includes the features and verification described in [BUILD_24.md](BUILD_24.md). Build 24 was not uploaded: its signed archive caught the share extension privacy manifest being copied into the main app. Its public source tag remains immutable.

The native generation now creates the share extension's own Resources phase before adding its privacy manifest, fixes the virtual resource group path, and repairs existing generated projects. Repeated generation keeps exactly one manifest in each target. The final signed archive and exported application are checked independently before upload.

Release provenance and TestFlight status are recorded in BUILD_LOG after verification.
