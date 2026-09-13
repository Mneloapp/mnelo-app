export type PushWork = {
  delivery_id: string;
  lease: string;
  token: string;
  event_type: string;
  target_id: string | null;
  ticket_id: string | null;
  ttl: number;
  locale?: string;
};
export type PushOutcome = {
  outcome: 'ticket' | 'provider_received' | 'UNREGISTERED' | 'RETRY' | 'PROVIDER' | 'NO_RECEIPT';
  ticket?: string;
};
export interface PushProvider {
  send(
    token: string,
    notificationId: string,
    event: string,
    ttl: number,
    locale?: string,
  ): Promise<PushOutcome>;
  receipt(ticket: string): Promise<PushOutcome>;
}
export interface PushQueue {
  claim(): Promise<PushWork[]>;
  payload(delivery: string, lease: string): Promise<string | null>;
  finish(work: PushWork, outcome: PushOutcome): Promise<void>;
}
// Bounded batches, no background promise after the Edge response. Queue leases tolerate worker death.
export async function dispatchPush(queue: PushQueue, provider: PushProvider) {
  const work = await queue.claim();
  let completed = 0;
  // At most five concurrent HTTP requests; 50 rows and 10s/request remain within the lease.
  for (let offset = 0; offset < work.length; offset += 5) {
    await Promise.all(
      work.slice(offset, offset + 5).map(async (item) => {
        let outcome: PushOutcome;
        try {
          if (item.ticket_id) outcome = await provider.receipt(item.ticket_id);
          else {
            const id = await queue.payload(item.delivery_id, item.lease);
            if (!id) return;
            outcome = await provider.send(item.token, id, item.event_type, item.ttl, item.locale);
          }
        } catch {
          outcome = { outcome: 'RETRY' };
        }
        await queue.finish(item, outcome);
        completed++;
      }),
    );
  }
  return { processed: completed };
}
const english: Record<string, string> = {
  message: 'New message',
  request: 'New connection request',
  accepted: 'Connection request accepted',
  match: 'Relevant matches are available',
  call: 'Incoming call',
};
const georgian: Record<string, string> = {
  message: 'ახალი შეტყობინება',
  request: 'კავშირის ახალი მოთხოვნა',
  accepted: 'კავშირის მოთხოვნა მიღებულია',
  match: 'შესაბამისი ადამიანები გამოჩნდნენ',
  call: 'შემომავალი ზარი',
};
type Result = { status?: string; id?: string; details?: { error?: string } };
function result(value: Result | undefined, receipt: boolean): PushOutcome {
  if (!value) return { outcome: receipt ? 'NO_RECEIPT' : 'RETRY' };
  if (value.status === 'ok') {
    if (receipt) return { outcome: 'provider_received' };
    if (typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200)
      return { outcome: 'ticket', ticket: value.id };
    return { outcome: 'RETRY' };
  }
  return {
    outcome:
      value.details?.error === 'DeviceNotRegistered'
        ? 'UNREGISTERED'
        : value.details?.error === 'MessageRateExceeded'
          ? 'RETRY'
          : 'PROVIDER',
  };
}
export function expoPushProvider(
  accessToken: string,
  transport: typeof fetch = fetch,
): PushProvider {
  if (!accessToken.trim()) throw new Error('PUSH_CONFIGURATION_REQUIRED');
  async function request(path: 'send' | 'getReceipts', body: unknown) {
    const response = await transport('https://exp.host/--/api/v2/push/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 429 || response.status >= 500) throw new Error('PUSH_RETRY');
    if (!response.ok) return { data: undefined, fatal: true };
    const text = await response.text();
    if (text.length > 16000) throw new Error('PUSH_INVALID_RESPONSE');
    return JSON.parse(text) as { data?: Result | Record<string, Result>; fatal?: boolean };
  }
  return {
    async send(token, notificationId, event, ttl, locale) {
      const copy = locale === 'ka' ? georgian : english;
      if (!Object.hasOwn(copy, event)) return { outcome: 'PROVIDER' };
      const response = await request('send', {
        to: token,
        title: 'Mnelo',
        body: copy[event],
        sound: 'default',
        data: { notificationId },
        channelId: 'mnelo-updates',
        ttl: Math.min(ttl, 86400),
        priority: event === 'call' ? 'high' : 'default',
      });
      return response.fatal
        ? { outcome: 'PROVIDER' }
        : result(response.data as Result | undefined, false);
    },
    async receipt(ticket) {
      const response = await request('getReceipts', { ids: [ticket] });
      return response.fatal
        ? { outcome: 'PROVIDER' }
        : result((response.data as Record<string, Result> | undefined)?.[ticket], true);
    },
  };
}
