import { parseEnvironment } from '@/lib/env-schema';

const publishable = `sb_publishable_${'a'.repeat(32)}`;
const hosted = { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: publishable };

describe('environment safety boundary', () => {
  it('boots locally without inventing a backend', () => {
    expect(parseEnvironment({})).toEqual({ appEnv: 'local' });
  });
  it('treats the blank example file as an unconfigured local environment', () => {
    expect(
      parseEnvironment({ appEnv: '', supabaseUrl: '', supabasePublishableKey: '' }).appEnv,
    ).toBe('local');
  });
  it.each(['preview', 'production'])('requires backend configuration for %s', (appEnv) => {
    expect(() => parseEnvironment({ appEnv })).toThrow('CONFIG_INVALID');
    expect(parseEnvironment({ appEnv, ...hosted }).appEnv).toBe(appEnv);
  });
  it('rejects unknown environment names', () => {
    expect(() => parseEnvironment({ appEnv: 'prod' })).toThrow('CONFIG_INVALID');
  });
  it.each([
    { supabaseUrl: hosted.supabaseUrl },
    { supabasePublishableKey: publishable },
    { supabaseUrl: 'http://example.supabase.co', supabasePublishableKey: publishable },
    {
      supabaseUrl: 'https://user:password@example.supabase.co',
      supabasePublishableKey: publishable,
    },
    {
      supabaseUrl: 'https://example.supabase.co?secret=private',
      supabasePublishableKey: publishable,
    },
    { supabaseUrl: 'https://example.supabase.co/api', supabasePublishableKey: publishable },
    { livekitUrl: 'https://example.livekit.cloud' },
    { livekitUrl: 'ws://example.livekit.cloud' },
  ])('rejects incomplete or unsafe service settings %#', (input) => {
    expect(() => parseEnvironment(input)).toThrow('CONFIG_INVALID');
  });
  it('allows loopback HTTP only for local development', () => {
    const local = {
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: publishable,
      livekitUrl: 'ws://localhost:7880',
    };
    expect(parseEnvironment(local).appEnv).toBe('local');
    expect(() => parseEnvironment({ ...local, appEnv: 'development' })).toThrow('CONFIG_INVALID');
    expect(() =>
      parseEnvironment({ ...hosted, appEnv: 'production', supabaseUrl: 'https://localhost' }),
    ).toThrow('CONFIG_INVALID');
  });
  it('accepts secure LiveKit URLs without configuring a call client', () => {
    expect(parseEnvironment({ livekitUrl: 'wss://example.livekit.cloud' }).livekitUrl).toBe(
      'wss://example.livekit.cloud',
    );
  });
  it.each(['sb_secret_private_value', 'eyJhbGciOiJub25lIn0.privileged.token'])(
    'rejects non-publishable credentials without echoing them',
    (secret) => {
      try {
        parseEnvironment({ ...hosted, supabasePublishableKey: secret });
        throw new Error('Expected configuration rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('CONFIG_INVALID');
        expect((error as Error).message).not.toContain(secret);
      }
    },
  );
});
