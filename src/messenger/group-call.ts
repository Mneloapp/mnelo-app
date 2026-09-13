import type { GroupCall } from './model';
import type { DeviceMessenger } from './engine';
export { MAX_CALL_PARTICIPANTS, groupCallSchema, type GroupCall } from './model';
export function sameGroupCall(left: GroupCall, right: GroupCall) {
  return (
    left.chat === right.chat &&
    left.host === right.host &&
    left.participants.length === right.participants.length &&
    left.participants.every((peer) => right.participants.includes(peer))
  );
}

export async function acceptsGroupCall(engine: DeviceMessenger, group: GroupCall) {
  const own = engine.currentIdentity();
  if (!own || !group.participants.includes(own.key)) return false;
  const chat = await engine.chat(group.chat);
  if (chat?.kind !== 'group' || chat.left_group) return false;
  const members = new Set((await engine.members(group.chat)).map((member) => member.key));
  return (
    group.participants.every((key) => members.has(key)) &&
    (
      await Promise.all(
        group.participants.filter((key) => key !== own.key).map((key) => engine.acceptsPeer(key)),
      )
    ).every(Boolean)
  );
}
