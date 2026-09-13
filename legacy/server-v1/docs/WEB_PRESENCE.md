# Mnelo mobile web presence — integration plan

No website deployment or domain change was made. Mobile remains the priority. This plan does not overwrite an existing product or present draft legal pages as live resources.

## Existing website audit

The separate `Mnelo` (separate website repository) repository is an estimation/procurement SaaS using Next.js, React and Supabase. It was clean at commit `846458d` during the read-only audit and remained clean at the final recheck. Its code, environment files and services were not changed. Public `mnelo.com` redirects to `www.mnelo.com`, which serves that estimation/procurement product. That is not a working mobile download/support destination. No assumption is made about migrating its customers, backend, login or data.

Mobile invitation text currently uses the authoritative brand domain. Before public distribution, the owner must choose an approved integration of the mobile identity with this existing website. Do not replace the root page, deploy this mobile repository over the website, alter DNS or reuse the SaaS's Supabase project without that decision. No new Supabase website project is needed for this architecture.

## Minimal proposed surface

| Proposed route           | Content / implementation boundary                                                       |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `/mobile`                | Mnelo, editable positioning, actual app screenshots, verified store/download links only |
| `/mobile/privacy`        | Owner-approved mobile privacy policy, processors/data categories, retention and contact |
| `/mobile/terms`          | Owner-approved terms and acceptable-use information                                     |
| `/mobile/support`        | Published support/contact resource and operating response ownership                     |
| `/mobile/delete-account` | Secure account/data-deletion request pathway available without the installed app        |

These routes are proposals, not registered/deployed URLs. A root-level mobile landing page can replace this proposal only after the existing product's migration is explicitly approved. Metadata URLs remain null until real pages are deployed and reviewed. There are no invented App Store/Play IDs or download links.

A small static/Next.js integration in the existing website is sufficient for the landing and approved documents. Keep app copy in an editable content file. Do not add a social feed, web messenger, tracking/advertising, paid AI or separate mobile backend. Never embed a service-role key in a static page.

## Account deletion from the web

The mobile backend already provides authenticated deletion request/status operations and a service-only cleanup worker. A web request implementation should authenticate the same mobile account using the production SMS flow, invoke the existing authenticated deletion endpoint, preserve its opaque receipt privately, and show Processing until server-confirmed completion. Apply CSRF/origin protections where cookie sessions are used, the same bounded request/rate-limit rules, redacted errors and accessible confirmation. Do not offer a publicly callable service-role deletion endpoint, accept a raw user ID as authority, or disclose account existence from a phone lookup.

The final web Auth configuration must belong to the isolated mobile project, not the existing procurement SaaS Auth. If the owner chooses a support-mediated request alternative, establish secure identity verification and a real response/deletion process; a static page that only instructs users to reinstall is not a completed web request flow. Google requires a web request resource in addition to the in-app deletion path. [Google account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

## Deployment acceptance

After owner approval of the website integration: use its existing CI/hosting workflow, preserve other routes and environments, deploy reviewed content, verify HTTPS/redirects/404 behavior, real download links, mobile layouts, accessibility and no leaked environment variables. Test the web deletion flow against the authorized mobile development project with a dedicated test account before production. Record deployed commit/URLs and update the mobile release metadata/configuration. Legal wording, domain change, production deployment and store declarations are owner-controlled actions, not inferred from this plan.
