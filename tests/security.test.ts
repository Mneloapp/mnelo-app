import { mobileSourceViolations } from '../scripts/security-rules';

test.each(['TWILIO_AUTH_TOKEN', 'VONAGE_API_SECRET', 'VONAGE_API_KEY', 'INFOBIP_API_KEY'])(
  'registration provider credential %s cannot enter mobile source',
  (name) => {
    expect(mobileSourceViolations(`process.env.${name}`)).toContain('server-secret-reference');
    expect(mobileSourceViolations(`process.env.EXPO_PUBLIC_${name}`)).toContain(
      'server-secret-reference',
    );
  },
);

it('detects privileged key references, raw logs, and plaintext persistence', () => {
  expect(mobileSourceViolations('process.env.LIVEKIT_API_SECRET')).toContain(
    'server-secret-reference',
  );
  expect(mobileSourceViolations('sb_secret_example')).toContain('secret-literal');
  expect(mobileSourceViolations('console.error(error)')).toContain('unreviewed-logging');
  expect(mobileSourceViolations('AsyncStorage.setItem(key, value)')).toContain(
    'unreviewed-persistence',
  );
  expect(mobileSourceViolations('process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')).toEqual([]);
});
