import type { RealtimeChannel } from '@supabase/supabase-js';
export async function waitForPostgres(channel: RealtimeChannel): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let joined = false,
      registered = false;
    const ready = () => {
      if (joined && registered) {
        clearTimeout(timeout);
        resolve();
      }
    };
    const timeout = setTimeout(() => reject(new Error('REALTIME_DATABASE_TIMEOUT')), 12000);
    channel
      .on('system', {}, (payload) => {
        if (payload.extension === 'postgres_changes' && payload.status === 'ok') {
          registered = true;
          ready();
        } else if (payload.extension === 'postgres_changes' && payload.status === 'error') {
          clearTimeout(timeout);
          reject(new Error('REALTIME_DATABASE_ERROR'));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          joined = true;
          ready();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error('REALTIME_CHANNEL_ERROR'));
        }
      });
  });
}
