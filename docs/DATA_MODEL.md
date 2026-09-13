> **Current September 13 state:** the development ciphertext delivery service is deployed and enabled, while both physical phones remain on build 9. [Current rollout, data boundaries, evidence and open release gates](DELIVERY_ROLLOUT.md) supersede historical no-queue/undeployed statements below. Native iOS/Android Signal probes and separate TURN voice/video checks passed; physical migration, key lifecycle/recovery and distribution licensing remain unresolved.

# Mnelo local data model

> September 12 schema version 4: identity gains headline/about/email/website/avatar with empty defaults; normalized contact_profiles references contacts(public_key) and stores authenticated peer cards. Old backup imports are migrated transactionally and still omit enrollment receipts. No hosted schema migration. [Schema/ownership details](PROFILE_CARDS_QR.md).

The conversation data model is in `src/messenger/model.ts`, schema version 3. It runs only in each participant's SQLCipher database. The owner's later phone-registration request adds a separate minimal identity registry described below; it never contains conversation data.

| Local table        | Purpose                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| identity           | Device keys, display name, local username and optional first/last names; one row                                         |
| phone_registration | Local display cache of own verified number; never accepted as server authorization and deliberately excluded from backup |
| contacts           | Pinned public keys, local names and local blocks                                                                         |
| chats / members    | Direct/group identity, owner, revision, leave state and membership                                                       |
| messages           | UUID deduplication, cursor sequence, sender, text/type, reply, timestamps and local read state                           |
| media              | Private authenticated attachment bytes in encrypted local storage                                                        |
| deliveries         | Per-recipient ACK/read state and restored outbox hold                                                                    |
| reactions          | Participant reaction per message                                                                                         |
| group_deliveries   | Owner snapshot acknowledgment per recipient                                                                              |
| forgotten_messages | Local tombstones to prevent deleted-history resurrection                                                                 |

Foreign keys, uniqueness and checks enforce local integrity. Transactions serialize mutations. Message pagination is 40 rows with a sequence cursor. UI message/file inputs are bounded; larger backup streaming and storage-pressure UX remain release work. One backup currently permits 10,000 rows per table and 75 MB of UTF-8 archive data.

Deleting a message removes its media/delivery/reaction rows locally. Clear history keeps deduplication tombstones. Erase device removes the entire local identity/contacts/history set. A backup is an independent user-controlled copy, never silently invalidated. The [former server schema](../legacy/server-v1/docs/DATA_MODEL.md) remains historical only.

`identity/registry.ts` defines the separate version-1 `phone_identities` schema: `phone_index` primary key (HMAC-SHA256 with a server-held index key), unique `public_key`, `discoverable` boolean/check and `verified_at` timestamp. There are no messages, names, contacts, call history, private keys, bearer tokens or plaintext phone columns. Keyed indexing limits disclosure from a database-only leak; the operator can still compute indices and sees submitted numbers transiently. It is not anonymous or private-contact-discovery cryptography. Each fixture/live-provider local directory is isolated. The current server remains loopback-only; no hosted deployment or new Supabase project has been created.

Local schema version 3 adds validated username/first_name/last_name columns without changing device keys. Original names are retained as first_name without guessing name boundaries. Known original four-column identity backup rows are upgraded explicitly; unknown/partial columns still fail. `phone_enrollment` references the local phone cache and stores service origin, fixture flag and verification time. Both phone tables are excluded from recovery archives. Restoring requires an empty identity and never restores an unlocked enrollment. Profile fields remain in encrypted user-controlled archives; there is no global username directory.
