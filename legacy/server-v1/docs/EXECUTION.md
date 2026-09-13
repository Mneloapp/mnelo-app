# Mnelo V1 execution ledger

**Latest owner direction, 2026-09-09:** [private data on devices, a relay without persistent copies, and opt-in encrypted Drive/iCloud recovery](PRIVACY_ARCHITECTURE.md) supersede the old server-storage plan. Record this as a required architecture migration, not a completed product phase. Previous checked phases describe the existing implementation only; release remains NOT READY. No calls section is being added.

The owner authorizes continuous execution of all phases, with QA, fixes and commits after each implemented phase. Do not pause for routine approval. Do not fabricate native, backend or cloud checks; continue independent work while external checks are pending. Only request a single exact owner action when no meaningful independent work remains. Full product scope is the owner’s V1 brief; no feeds, channels, extra tabs or paid-AI requirement.

Native migration: `ff14c30`, complete. The owner upgraded Xcode to 26.6. The iOS Development Client now compiles and boots on iOS 26.5 Simulator with actual local Auth/Connect checks. EAS authentication is optional for local compilation. Product development remains authorized; physical/cloud acceptance stays explicit.

- [x] Phase 1: product interface implemented and preview checked; native acceptance pending
- [x] Phase 2: local Supabase backend and RLS; 52 database tests pass
- [x] Phase 3: secure local Supabase authentication; production SMS/native acceptance pending
- [x] Phase 4: real profiles/search/private avatars; native acceptance pending
- [x] Phase 5: real direct text messaging and authorized Realtime
- [x] Phase 6: private media and voice-message implementation; native acceptance pending
- [x] Phase 7: private groups, membership/admin controls and private group photos
- [x] Phase 8: deterministic Connect interpretation and real Need/Offer publication
- [x] Phase 9: real explainable matching with live evidence/privacy checks
- [x] Phase 10: contextual connection requests, real acceptance and authorized conversation lookup
- [x] Phase 11: mutually confirmed completion, eligible reviews and scoped verification
- [x] Phase 12: enforced privacy defaults, connection-only phone consent and coarse-area controls
- [x] Phase 13: backend blocking, private reports, safe access refresh and blocked-person management
- [x] Phase 14: private push queue, session-bound registration and preferences; actual delivery pending
- [x] Phase 15: authorized LiveKit calls, actual local signaling/media and durable eviction; native/cloud acceptance pending
- [x] Phase 16: real device/session listing, official logout scopes and immediate session authorization
- [x] Phase 17: actual Auth/Storage account deletion, durable confirmation and retry; native/cloud acceptance pending
- [x] Phase 18: authorization/secret/abuse hardening and negative tests; cloud/perimeter/device acceptance pending
- [x] Phase 19: bounded SecureStore text outbox, session isolation and actual reconnect/idempotency checks
- [x] Phase 20: measured bounded message reads, render/network/audio/outbox optimization; native profiling pending
- [x] Phase 21: shared semantics/focus/contrast/motion, actual browser keyboard/axe QA; native assistive QA pending
- [x] Phase 22: complete English/Georgian copy, durable locale, private localized push and local-day availability; native QA pending
- [ ] Phase 23: physical iPhone acceptance — Xcode 26.6 and simulator build/boot/Auth/Connect pass; paired phone is disconnected, app-specific signing and physical flows remain unverified
- [x] Phase 24: native ARM64 APK build/boot and core emulator flows; physical push/audio/background and final E2E acceptance pending
- [x] Phase 25: all 16 entries audited; native input mitigation; explicit runtime release gate retained
- [x] Phase 26: full local automated suite and clean migrations; native/cloud release gates explicit
- [x] Phase 27: real local/Android/browser E2E, media/permission/GPS fixes; physical/cloud acceptance pending
- [x] Phase 28: isolated release configuration and fail-closed project registry; cloud registration pending
- [x] Phase 29: store checklists and draft metadata; legal, operational and submission gates explicit
- [ ] Phase 30: Android artifacts and iOS Development Client built/booted; hosted preview/production artifacts and physical acceptance remain external gates

Keep QA_REPORT, BUILD_LOG and architecture/security/data/RLS/UX/testing/release/audit docs current. Phase commit hashes are recorded at the next checkpoint to avoid self-referential hashes. Final report must be truthful: READY FOR INTERNAL TESTING / READY FOR TESTFLIGHT / READY FOR STORE SUBMISSION / NOT READY.

Final local implementation and Android artifact work is preserved. See RELEASE_REPORT.md for exact tests/hashes and external service status. Current recommendation: NOT READY. The smallest pending owner action is connecting/unlocking the paired iPhone over USB and accepting Trust if prompted. Expo/EAS login is optional for the local Xcode route; the earlier mandatory-login handoff is superseded. Supabase CLI can list projects, but isolated mobile project/plan authorization is still unresolved; no existing project was reused.

Final local implementation/artifact commit: `964bf8f6c537b28d6ecf315dfe2bccb1fe1ba5a1`. The phase ledger and release report record its verified scope; unfinished external gates remain unchecked.

Post-branding native visual QA: corrections and actual coverage are recorded in [DESIGN_QA](DESIGN_QA.md), with the containing commit `fix: resolve native visual qa regressions`. Tests: 173 Jest / 34 suites and 3 server checks; Doctor 21/21; fresh native Debug builds and mobile exports. Physical and full interactive Android/assistive acceptance remains open. No product phase or external registration was silently marked complete by this design pass.
