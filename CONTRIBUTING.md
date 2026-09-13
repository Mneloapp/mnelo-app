# Contributing to Mnelo

Mnelo aims to be a simple, secure messenger, with Chats, Calls and Me. No AI,
discovery feed, matching layer, advertising or engagement mechanics are planned.
The owner supports open development and a possible future voluntary-donation
model. There is no donation payment integration or published payment address yet.

Use issues for reproducible non-sensitive bugs and small, focused pull requests.
Use only fictional accounts, messages and keys in tests. Never point development
fixtures at the hosted service or upload an address book. See SECURITY.md for
private vulnerability reporting instead of a public issue.

Read README.md and docs/DELIVERY_ROLLOUT.md before running the app. The current
protocol migration is development software, not a production security promise.
Use `npm ci`, then `npm run check`. Native changes require actual platform builds
and device verification appropriate to the change; keep failed results visible.
Do not remove tests, weaken identity checks or introduce custom cryptography.

Contributions are submitted under the project's AGPL-3.0-only license. Retain
third-party notices and add provenance for any new dependency or asset. You must
have the right to contribute your work. No copyright assignment is requested.
Reviewing a contribution does not promise a response time or vendor support.
