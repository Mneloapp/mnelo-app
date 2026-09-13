# Open-source decision — September 13, 2026

The owner explicitly authorized public source distribution and reuse/forks.
Mnelo's goal is a simple, secure messenger without AI, with potential voluntary
donations in the future. No donation provider, payment account or recurring
charge is configured by this decision. Open-source publication is not an App
Store release or a claim that current security and physical QA gates passed.

## License and scope

Original Mnelo code and documentation are AGPL-3.0-only; see [LICENSE](../LICENSE)
and [NOTICE](../NOTICE). Preserve all pre-existing third-party notices, including
the Expo template's MIT notice. The repository's `private: true` package fields
prevent accidental npm publication; they do not make the source proprietary.
Native modules now declare the same AGPL license as the application.

Official libsignal 0.102.2 is pinned. Its Rust-backed Swift/Java implementation
uses AGPL-3.0-only, and its upstream README explicitly says external consumers
are unsupported. This project provides neither a commercial license exception
nor an assertion of Signal/WhatsApp affiliation or protocol compatibility with
WhatsApp. The owner accepts source reuse; no new proprietary crypto is needed.

Code visibility grants no access to private user data or service credentials.
Phone registry records, private keys, vaults, backups, signing credentials,
provider tokens and local build/test artifacts are not corresponding source and
are excluded from publication. Identity/routing metadata still exists on the
server; this license decision does not change the documented privacy model.

The software license does not grant trademark rights. The official name, domain
and marks remain identifiers of Mnelo; forks must not imply official endorsement.
Brand asset copyright permission supplied with this source does not imply a
registered trademark. Fonts retain OFL; third-party code retains its own terms.

## Public source publication

Repository: https://github.com/Mneloapp/mnelo-app

Published September 13, 2026. Initial public commit `0d97fc563d74e018a98a2fea4e8cdd2bd36b54d1` has exactly the same Git tree as local source `c6140fe1ac7354b64c1bb702905d31a6a65e86af` (`a1f578af5ce7a7c1f883a5d00f9559303cb4b2b8`). GitHub reports PUBLIC and AGPL-3.0. Private vulnerability reporting is enabled. No prior website repository was changed.

Publish an audited source snapshot as the initial public commit, with the exact
local source revision recorded in its commit message. Local development history
is preserved without rewriting or changing old commits. It contains historical
private design-discussion links and workstation paths that are irrelevant to
building the program; the current source removes these references. Future public
updates form normal commits on the public repository. The older `Mneloapp/Mnelo`
website repository is a separate project and must not be overwritten.

Only Git-tracked source enters a publication snapshot. Never copy `.git`, `.local`,
`artifacts`, generated `ios`/`android`, environment files, dependency directories,
phone data or signing material. Review source/history secret scans, known tester
identifier scans and tracked image provenance before publication. Test fixtures
must stay fictional; a scanner's clean result is not proof of no possible secret.

Source builds need the lockfile, native module source, CNG plugins, vendored font
and brand sources, build scripts, documented toolchain and upstream dependencies.
Generate native projects using Expo prebuild; do not substitute a compiled probe
for the product. For a fork use your own bundle ID, signing, SMS, push and server
configuration. Do not use Mnelo's hosted endpoints for unsolicited tests.

## Binary distribution remains a separate check

- Provide the exact corresponding source for every distributed app/server
  revision, including build scripts and modifications; retain each offered
  revision and its required notices. A moving default branch alone is insufficient.
- The app now exposes a source/license screen with the full AGPL text locally,
  copyright/warranty notice and links to source and third-party notices.
- Recheck native and JavaScript third-party notices for the actual artifact.
  The committed native notices record the currently installed iOS dependency
  state, including upstream libsignal's Rust acknowledgments. They do not certify
  that every future Android artifact has been covered.
- Verify Apple's distribution terms and any required permissions/exceptions with
  a qualified licensing reviewer before new App Store/TestFlight distribution.
  Making source public alone does not establish compatibility with store terms.
- For covered modified network software, satisfy the AGPL section 13 source-offer
  obligation. Mnelo server code is voluntarily included even where independent
  service code would not automatically inherit a linked mobile library's license.

Recovery, safe key lifecycle and physical-device acceptance remain engineering
release gates in [DELIVERY_ROLLOUT](DELIVERY_ROLLOUT.md). No latest phone migration,
store upload, payment integration or legal/store declaration is implied here.

Sources: [pinned vendor license](https://github.com/signalapp/libsignal/blob/v0.102.2/LICENSE),
[upstream support limits](https://github.com/signalapp/libsignal/tree/v0.102.2),
[Apple standard app license](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/).
