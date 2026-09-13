# Private groups

Groups use the same conversations, membership, messages, media and Realtime model as direct chats. They are private and have no public discovery, channels or group calls. Creation requires two to 31 existing connections plus the creator (32 total), a name, and a stable client UUID. Repeating creation with that UUID returns the original authorized group.

Only an active admin can rename the group, publish/remove its photo, add a connection, remove another member or change another member's admin role. Additions must be the acting admin's connections and cannot contain a blocked pair. Adding a person shares available group history; the UI explains this before creation/addition. No direct connection is created between other group members.

Leaving always remains possible, including when a block suspends the group. If the last admin leaves, the longest-standing remaining member becomes admin (UUID breaks timestamp ties). A membership tombstone prevents an admin from forcing someone who left or was removed back into that same group. V1 has no rejoin invitation flow. A group can become empty.

All mutations lock the conversation and derive the caller from Auth. Relationship locks serialize additions against blocks. Former members lose message/roster/media access, even if they created the group. Their own membership tombstone remains visible so RLS-filtered Realtime can deliver revocation; it does not reveal another user's membership. Explicit leave clears local message/group/attachment queries, and active subscriptions refetch on membership changes. Already downloaded data cannot be recalled; short-lived signed URLs can remain valid for up to 60 seconds.

A group photo is a server-processed private JPEG upload in the same conversation. Publishing it requires admin role, ownership, ready status and no existing message linkage. It gets purpose `group_avatar`, preventing reuse as a deletable message attachment. Only the current group photo is shared with members; replacement rejects the previous attachment. Physical native image-picker acceptance remains pending supported tooling.

`get_group` exposes only member ID, display name, username, role and joined time to authorized members. It does not grant access to another member's private phone, exact location, full profile or unrelated conversations. Shared-group blocks conservatively suspend access for the affected pair while both remain active; other members keep access.

Connections are searched server-side, bounded to 50 results with a refine-search notice. The group roster is bounded to 32. Messaging remains cursor-paginated. Cloud deployment, native device acceptance, final cache/security stress tests and lifecycle orphan cleanup remain later acceptance gates.

Verification: `npm run test:groups` exercises five actual local Auth users, authorized creation/retry, unknown-user denial, private roster, text, roles, private avatar, removal events, revoked access, blocked sends and admin succession. Local test setup is guarded and never targets production.
