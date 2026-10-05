# Public registration policy — 27 September 2026

## Owner decision

The owner explicitly chose availability in every country/region where the app can officially be distributed without applicable restrictions. SMS expenditure scales with actual registrations; there is **no owner-imposed total SMS volume or monthly monetary ceiling**. These decisions replace the unanswered territory/budget questions in the 21 September launch preparation. They do not remove abuse controls or substitute for provider coverage, sender registrations, encryption-export declarations or store eligibility.

## Implemented public mode

`MNELO_HOSTED_IDENTITY=public` selects the public registration guard, separately from the existing admitted-tester development mode. It requires combined authenticated relay routing and an explicit, owner-only account-coverage policy file. Empty, unknown, duplicate or unconfigured countries fail closed; no default worldwide country list is invented. Exact phone-number countries are distinguished, including countries sharing a calling code. Explicit prefix exclusions support account-level sub-country restrictions. The example file intentionally has no enabled countries and is not ready to install.

The public policy requires `smsBudget: "uncapped"`. The former shared development budgets of 10 SMS/hour and 15/day, and the in-memory 100/hour global ceiling, do not apply to public registrations. Capacity/concurrency protections still bound work in flight; they are not a monthly budget or a cap on the number of users.

Per-subject safeguards remain: one request/minute, five/hour and ten/day per phone number; five/hour per signed device key; and 100/hour per trusted source network. The source budget accommodates more shared-network users than the former ten/hour development default. IPv6 interface rotation within a /64 and IPv4-mapped aliases cannot reset that counter. These limits are independent of aggregate business growth and may be tuned from measured legitimate demand and abuse evidence.

Reservations are atomic in SQLite, persist across service restarts and multiple connections, and occur before contacting the SMS provider. Provider errors/timeouts consume the reservation, with no automatic refund or duplicate send. Only HMAC digests and short-lived counters are stored, never raw phone numbers, device keys, IP addresses or OTPs. Counters expire within 24 hours and are pruned on requests and the one-minute maintenance timer. A persistent clock watermark prevents clock rollback from resetting a spent limit. Review credentials stay separate from real users and never cause an SMS send; unverified devices cannot use the public relay or directory.

The new policy and guard do **not** change encryption identity recovery: SMS verification alone cannot replace an existing pinned key.

## Coverage verification and activation

Infobip distinguishes general SMS coverage from account-specific sender eligibility and country registration requirements. Its public self-sign-up documentation lists exceptions; those are not a complete certification of this Mnelo account. Check the actual account and registered sender before completing `allowedCountries` / `blockedPrefixes`. Store distribution territory eligibility is a separate decision; a phone calling code does not establish a user's physical location or legal eligibility. Review restrictions and store encryption declarations before applying the owner's all-eligible-territories choice.

- [Infobip account coverage and sender setup](https://www.infobip.com/docs/sms/get-started)
- [Infobip country coverage reference](https://www.infobip.com/docs/essentials/getting-started/sms-coverage-and-connectivity)
- [Google Play distribution locations](https://support.google.com/googleplay/android-developer/answer/10532353)
- [Apple encryption export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)

No live public admission was enabled by this work. The existing tester service and its records remain unchanged while account coverage is verified. The owner completed provider login in the in-app browser; there is no new request to choose a budget or a narrower business territory. Final production configuration, review, signed store binaries, physical acceptance and store account completion still apply.

### Provider account verification

The authenticated account currently shows no registered alphanumeric senders. A draft request for `Mnelo` in Georgia has the approved public support contact and a fictional verification-message example, but it has not been submitted. Infobip requires the operator's legal company/sole-trader name and tax identifier. Owner input is pending; neither a legal entity nor an identifier may be guessed from another service's profile. The initial form quotes a EUR 5 request fee and subsequently warns of possible destination/network setup or recurring fees. Those details need resolution before a paid request is submitted. No fee was paid and no new sender was registered.

An existing-provider configuration check passed without sending an SMS. That confirms the configured application/template is accessible; it does not establish real-carrier delivery or worldwide sender approval. Private account identifiers are retained outside the repository.

## Validation

Focused tests exercise configuration rejection, shared-country-code handling, prefix restrictions, durable restart/multiple-connection limits, clock rollback, expiration without further sends, privacy of stored counters, per-number/day/device/network controls, atomic rollback, provider-failure reservations, and review isolation. A signed service test performs 120 synthetic registrations across two shared networks in one hour, beyond both legacy global ceilings, without contacting any provider or sending real SMS.

Validation passed: **943 tests** (696 Jest in 119 suites, 244 device/protocol integrations, 3 server utilities), strict typecheck, lint, formatting, security/environment/localization/brand checks. The focused registration, phone, hosted-admission and review set passed 36 tests. These are automated engineering checks, not real carrier receipt or an independent protocol audit. Evidence: ignored `artifacts/public-registration-tests.log`, `public-registration-typecheck.log`, `public-registration-lint.log`, and `public-registration-full-check.log`.

Hosting bundles built successfully from clean source commit `0104e33`. Gitleaks 8.30.1 reported zero findings in Git history, current source, the existing mobile export artifacts and the newly built hosting bundles. These are not new signed mobile binaries. The hosting bundle has not been deployed.

A read-only live server check passed: runtime `ccf140f2e7d02f17baae70f486e9c7602d5abcb6`, combined identity/relay service active, standalone relay intentionally inactive, four identities preserved and no mutation. Evidence: ignored `artifacts/public-registration-hosting-build.log`, `public-registration-secrets.log`, `public-registration-hosting-secrets.json`, `public-registration-infobip-check.log` and `public-registration-server-check.log`.
