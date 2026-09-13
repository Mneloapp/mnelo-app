# Mnelo product identity

**Mnelo is the official product name.** Connecto is the former working name and is used only in explicitly labelled history or a documented temporary identifier exception.

## Active identity

| Setting                           | Value                                |
| --------------------------------- | ------------------------------------ |
| Product and display name          | Mnelo                                |
| Package and repository folder     | `mnelo-app`                          |
| Expo slug                         | `mnelo`                              |
| URL scheme                        | `mnelo`; future links use `mnelo://` |
| Primary domain / website metadata | `mnelo.com` / `https://mnelo.com`    |
| iOS bundle / Android package      | `com.mnelo.messenger`                |

The URL scheme is foundation configuration. No production deep-link routing, universal links, Android verified app links, website hosting, domain purchase or DNS changes are implemented. Changing the website metadata does not establish domain ownership or provisioning. See [Expo app configuration](https://docs.expo.dev/versions/latest/config/app/).

## Product language and positioning

Mnelo is a device-owned messenger for direct chats, private groups and voice/video calls. The owner removed Connect, matching and reputation after the original identity brief.

- **Chats:** direct conversations and private groups.
- **Calls:** local call history and voice/video calling to saved contacts; calls also remain available from conversations.
- **Me:** local identity, phone registration, privacy, backups and settings.

Navigation is **Chats | Calls | Me**. Product copy remains centralized in the English/Georgian dictionaries. Earlier Connect copy and positioning are historical, not active product requirements.

## Visual and environment identity

The current approved visual direction is warm-white, graphite/black and restrained Acid Lime, with Inter and Georgian typography, whitespace and minimal navigation. See [the design system](DESIGN_SYSTEM.md). This supersedes the earlier dark-green foundation direction. Semantic theme tokens contain no former brand names. The selected 04 / Light icon and leaf wordmark have been reconstructed from the approved source board and integrated as reproducible vector/raster assets. See [reference provenance](design/references/README.md) and [asset inventory](../assets/README.md). The former system-letter M placeholder has been removed.

Future environment labels are **Mnelo Development**, **Mnelo Preview** and **Mnelo Production**. EAS profile names and machine environment values remain `development`, `preview` and `production`. The former Supabase-backed implementation is retained as historical evidence and is disconnected from active mobile routes; current signaling and phone enrollment have separate boundaries documented in ARCHITECTURE and PHONE_IDENTITY.

## Native identity audit

The owner explicitly confirmed that nothing was registered externally under the former working-name identity with Apple Developer/App Store Connect, Expo/EAS or Google Play, and authorized migration to **`com.mnelo.app`**. This is owner-confirmed account state, not an inference from missing local files.

Before migration, the local inspection found one valid Apple Development certificate and two profiles, including a wildcard profile containing the physical iPhone. These existing general credentials and device provisioning are preserved. No app-specific profile, EAS project link or release Android key was configured for this product. [Historical local inspection](audits/rename/local-identity-before.json) contains sanitized evidence only.

### Owner-approved replacement — 2026-09-11

Apple refused to register `com.mnelo.app` for the selected team after the updated agreement was accepted. The owner checked Identifiers, reported that it was absent, and explicitly authorized the proposed **`com.mnelo.messenger`** replacement for iOS and Android. The error does not establish who owns the earlier identifier.

Both platforms now use `com.mnelo.messenger`, generated from `app.config.ts`. Product name Mnelo, slug/scheme `mnelo` and website remain unchanged. Expo regenerated both native projects for the changed package; the previously selected Apple team and automatic signing were restored only in the ignored generated iOS project. No old certificate/profile was revoked. External availability and actual build/device results are recorded in IPHONE_DEVELOPMENT and BUILD_LOG, not inferred from successful prebuild.

Existing simulator/emulator installs and historical artifacts under `com.mnelo.app` remain separate app sandboxes. Their private data is not copied, erased or reassigned automatically. Device-owned history migration uses the user's existing explicit backup/restore flow; this identity change is not an implicit data migration. No EAS project or Google Play application has been created as part of this change.

The earlier [rename report](RENAME_REPORT.md) and `docs/audits/rename/` are explicitly historical snapshots taken before owner confirmation. Their former working-name identifiers remain as evidence and do not describe current configuration. Current native findings are recorded in [BUILD_LOG.md](BUILD_LOG.md).

## Repository and historical references

The repository folder is now `mnelo-app`. The parent workspace directory still has the former working name, Connecto, because moving the task's saved workspace location would risk breaking its binding. Use repository-relative paths and `cd /path/to/mnelo-app` in setup instructions. No Git remote is configured, so no remote repository was renamed.

Old Git history and commit messages remain unchanged. Phase 0 / 0.1 reports and their original build evidence are explicitly historical. The [occurrence inventory](audits/rename/stale-name-inventory.json) records every original match in reviewable text; generated caches and outputs are classified separately. See [rename results](RENAME_REPORT.md) for current verification and remaining exceptions.
