# Typography and icon package notices

Mnelo's original code uses [AGPL-3.0-only](../../LICENSE). Third-party copyright
and license texts below are retained, not relicensed. See [NOTICE](../../NOTICE)
and [publication scope](../OPEN_SOURCE.md).

- [Expo template — original MIT notice](Expo-Template-MIT.txt).
- [Installed npm license texts](Npm-notices.txt) and [lockfile inventory](npm-inventory.json).
  Regenerate with `node scripts/license-inventory.mjs` after `npm ci`. The inventory
  identifies direct/transitive and development-only declarations. Optional packages
  absent on the current operating system have no locally extracted notice; validate
  those and any bundled subcomponents before distributing their binaries. An absent
  or declared license is not a compatibility finding or legal approval.
- [Installed iOS dependency notices](Native-iOS-notices.txt), extracted from
  CocoaPods acknowledgments, excluding our own modules.
- [libsignal 0.102.2 Rust dependency notices](Libsignal-Rust-notices.txt), extracted
  from the vendor's iOS acknowledgments. Android packaging must also be
  checked against the exact artifact; these are not blanket Android certification.
- [DM Sans OFL](../../assets/fonts/DMSans-OFL.txt) and
  [FiraGO OFL](../../assets/fonts/FiraGO-OFL.txt); [font provenance](../TYPOGRAPHY.md).

The earlier visual-system dependencies also retain their notices:

- [Inter — SIL Open Font License](Inter-OFL.txt), from `@expo-google-fonts/inter@0.4.2/LICENSE_FONT`.
- [Noto Sans Georgian — SIL Open Font License](Noto-Sans-Georgian-OFL.txt), from `@expo-google-fonts/noto-sans-georgian@0.4.3/LICENSE_FONT`.
- [Expo Vector Icons — MIT license](Expo-Vector-Icons-MIT.txt), from `@expo/vector-icons@15.1.1/LICENSE`.

Retain notices with redistributed assets and release distributions. The font
packages do not license the Mnelo brand. Current mark provenance is documented
in [assets](../../assets/README.md); historical design references are not evidence
of a currently shipping product feature.

Extracted notice wording and copyright lines are retained; generated collection headings, line endings and trailing whitespace are normalized. The root AGPL text and locally bundled copy remain byte-for-byte identical to the pinned vendor license.
