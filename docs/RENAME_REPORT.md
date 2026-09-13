# Mnelo rename report

> Historical rename checkpoint before owner confirmation. The subsequent full-build brief authorized native migration to `com.mnelo.app`; that identifier was superseded by the owner-approved `com.mnelo.messenger` on September 11; current state is in [product identity](PRODUCT_IDENTITY.md) and [build log](BUILD_LOG.md). All retained former working-name identities below describe this earlier checkpoint.

Mnelo is the official product name. Connecto is the former working name. This task changes identity and editable copy only; no Phase 1 features, backend projects, domain operations or final artwork were implemented.

**Active branding is renamed and verified. Native identifiers are intentionally retained pending external-registration verification. Native boot is still blocked by Xcode 26.2.**

## 1. Files changed

- `package.json` and `package-lock.json`: package name is `mnelo-app`; dependency versions and lockfile dependency graph are unchanged in this rename.
- Repository folder: renamed to `mnelo-app`; Git history and remote configuration are preserved. The parent workspace directory retains the former working name to avoid breaking the active task's saved location.
- `app.config.ts`: Mnelo display name, `mnelo` slug and scheme, `https://mnelo.com` website metadata; native identifier exception documented in source.
- `src/i18n/en.ts`, `src/i18n/ka.ts`, `tests/launch.test.tsx`: Mnelo brand/recovery copy and editable provisional positioning. Existing launch tests updated; components and design tokens unchanged.
- README and `docs/ARCHITECTURE.md`, `SECURITY.md`, `DATA_MODEL.md`, `RLS_MATRIX.md`, `UX_FLOW.md`, `TESTING.md`, `RELEASE.md`: official name, product-language boundaries, environment labels and current setup references.
- `docs/IPHONE_DEVELOPMENT.md`, `docs/DEPENDENCY_AUDIT.md`: current project/scheme references and registration gate. The existing dependency-risk disposition is unchanged.
- `.env.example`, `supabase/functions/.env.example`, `supabase/README.md`: Mnelo environment labels; variable keys unchanged and no services provisioned.
- `assets/README.md`: existing template assets explicitly marked temporary placeholders; no bitmap or final logo changes.
- `docs/PHASE_0_REPORT.md`, `docs/PHASE_0_1_REPORT.md`, `docs/audits/phase-0.1/README.md`: explicit former working-name historical labels. Original diagnostics, hashes and old commit messages are preserved.
- New `docs/PRODUCT_IDENTITY.md`, this report, and sanitized `docs/audits/rename/` evidence: registration audit, occurrence classification, configuration, bundle-copy and native-build results.
- Ignored `ios/` and `android/`: regenerated together through Expo CNG for the renamed project. Caches/raw logs remain ignored.

## 2. Identifiers changed

| Identity                            | Final value                       |
| ----------------------------------- | --------------------------------- |
| Product / display name              | Mnelo                             |
| Repository folder / package name    | `mnelo-app`                       |
| Expo slug                           | `mnelo`                           |
| URL scheme                          | `mnelo` / `mnelo://`              |
| Development-client scheme           | Generated `exp+mnelo`             |
| Native Xcode project / build scheme | `Mnelo`                           |
| Primary domain / website metadata   | `mnelo.com` / `https://mnelo.com` |

Native configuration was regenerated and inspected on both platforms. No production deep-link feature, universal-link entitlement, Android verified-link association or web hosting was introduced. Navigation remains Chats | Connect | Me; Connect remains the action. The new positioning stays provisional in the dictionaries; the former “More than a messenger” text survives only as labelled historical copy.

## 3. Identifiers intentionally unchanged

Both native identifiers remain **`ge.connecto.app`**, the former working-name identifier. The preferred final value is **`com.mnelo.app`**. This is a deliberate technical exception, not product branding.

The local audit found no linked EAS project or authenticated Expo account, no selected native Apple team, no app-specific provisioning profile for either identifier, and no Android release key. However, one Apple Development identity and two unexpired profiles already exist; the wildcard profile contains the previously inspected physical iPhone. Remote Apple App ID, EAS credential and Google Play records cannot be declared absent from this evidence. The owner's external-registration question remains unanswered at this checkpoint.

No new App ID, provisioning profile, signing credential, EAS project or Play app was created. No existing external record was changed. The exact local evidence and safe migration decision are in [product identity](PRODUCT_IDENTITY.md#native-identity-audit). Once app-specific external identity status is confirmed, migrate both native identifiers together if clear, or review existing records before choosing a migration path.

The iOS generated URL scheme list also retains the bundle identifier as Expo's generated technical alias. The former custom `connecto://` scheme is removed. EAS profile/environment keys remain `development`, `preview`, `production` because these are machine configuration keys. Conceptual labels are Mnelo Development, Mnelo Preview and Mnelo Production.

## 4. Remaining former-name references

The [occurrence inventory](audits/rename/stale-name-inventory.json) records **52 original occurrences** with file/line, category and final disposition. Every active product reference was renamed. The former working name is intentionally present only in:

1. Technical native identifier exceptions in app configuration and setup/identity documentation.
2. Explicitly labelled historical Phase 0 / 0.1 reports, exact diagnostics, old Git messages and migration audit inventories.
3. The parent workspace directory, retained to preserve the active task binding; the repository itself is `mnelo-app`.
4. Ignored generated/cache artifacts and historical exports; dependencies and Git internals are excluded from active-brand checks.

No active user-facing former-brand copy remains in source or in either exported mobile dictionary. Theme tokens have no brand-specific names and were not redesigned.

## 5–6. Checks and actual results

| Check                                                                  | Actual result                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Repository-wide former-name search and classification                  | Active product references renamed; only documented history/technical exceptions remain.                                                |
| `npm run check`                                                        | PASS, exit 0: strict TypeScript, lint with zero warnings, formatting, 4 suites / 27 tests, source guard and environment validation.    |
| `expo-doctor --verbose` with existing CocoaPods PATH/logger workaround | PASS, 21/21, exit 0.                                                                                                                   |
| `npx expo install --check`                                             | PASS, dependencies up to date, exit 0.                                                                                                 |
| iOS and Android release export with source maps                        | PASS, exit 0. Both platforms contain Mnelo in both dictionaries, current provisional positioning, and no former-brand dictionary text. |
| `CI=1 npx expo prebuild --clean --no-install`                          | PASS, both platforms generated, package.json unchanged by prebuild.                                                                    |
| CocoaPods during local iOS development build                           | PASS, native dependencies installed.                                                                                                   |
| Generated native identity inspection                                   | PASS: both display names Mnelo, custom scheme mnelo, retained native identifiers as documented.                                        |
| Fresh `expo run:ios --device … --no-bundler`                           | FAIL at the existing ExpoModulesJSI RuntimeScheduler header line 61; Xcode exit 65, one error and one generated-script warning.        |
| Native app render / physical installation                              | No successful launch or visual QA is claimed. No physical build or new signing was attempted.                                          |
| Android native build                                                   | Not run: JDK/Android SDK remain unavailable. No large toolchain was installed.                                                         |

The fresh compiler failure is preserved in [ios-build-failure.txt](audits/rename/ios-build-failure.txt). It is the same Xcode 26.2 failure established before the rename. Both native projects were regenerated in the renamed folder; no native dependency was patched. The simulator was shut down after the attempt. [Native configuration](audits/rename/native-config.json) and [bundled copy evidence](audits/rename/bundle-copy.json) are separately reviewable.

## 7–8. Git and readiness

The previously completed Phase 0.1 audit was saved separately as **`c71c634`**, `chore: record phase 0.1 native toolchain audit`, so the rename commit contains identity changes only. That audit commit does not claim successful native boot.

The dedicated rename commit uses the requested message **`chore: rename product from connecto to mnelo`** (the former working name is required historical migration wording). Its final hash and working-tree status are reported in the task handoff; retrieve it locally with `git log -1 --format='%H %s'`. No old commit was amended, rewritten or renamed. No Git remote is configured and no push was performed.

**Phase 1 is not started.** Branding and copy verification passed. The native identifier decision still needs owner confirmation or authenticated registration inspection, and native boot still needs a supported Xcode version and a successful build/render check. This rename commit must not be interpreted as clearing those outstanding gates.
