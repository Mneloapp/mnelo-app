export type CallOutcome = 'ended' | 'failed' | 'missed' | 'declined' | 'unanswered';
export type CallDirection = 'incoming' | 'outgoing' | 'unknown';
export const callOutcomeCopy = {
  ended: 'messenger.callEnded',
  failed: 'messenger.callFailed',
  missed: 'messenger.callMissed',
  declined: 'messenger.callDeclined',
  unanswered: 'messenger.callUnanswered',
} as const;

// Local-only call records share the encrypted message journal and its backup format.
// Historical media:outcome records remain readable; never invent their direction.
export function readCallRecord(body: string): {
  media: 'voice' | 'video';
  status: CallOutcome;
  direction: CallDirection;
} {
  const parts = body.split(':');
  const outcome = parts.at(-1);
  return {
    media: parts[0] === 'video' ? 'video' : 'voice',
    status: outcome && Object.hasOwn(callOutcomeCopy, outcome) ? (outcome as CallOutcome) : 'ended',
    direction:
      parts.length === 3 && (parts[1] === 'incoming' || parts[1] === 'outgoing')
        ? parts[1]
        : 'unknown',
  };
}
export function callOutcome(
  call: { incoming: boolean; status: string },
  failed: boolean,
  reason: 'local' | 'remote' | 'decline' | 'timeout',
): CallOutcome {
  if (call.status === 'incoming') return reason === 'local' && !failed ? 'declined' : 'missed';
  if (reason === 'decline') return 'declined';
  if (call.status === 'ringing' && (reason === 'timeout' || reason === 'remote' || !failed))
    return 'unanswered';
  return failed ? 'failed' : 'ended';
}
