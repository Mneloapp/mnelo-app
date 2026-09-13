import { z } from 'zod';
import { relayAddress } from './signaling';
import { phoneServiceAddress } from './phone-protocol';

// A code-reviewed release gate, never a public environment switch claiming an audit.
export const privacyRelease = { reviewed: false, protocol: 'mnelo-dtls-v1' } as const;
// Owner-authorized functional beta, scoped to the admitted development cohort.
// Engineering evidence: docs/BETA_SECURITY_REVIEW.md. This is not an independent
// protocol audit and cannot enable public production distribution.
export function reviewedFunctionalBeta(input: {
  appEnv?: string | undefined;
  relayUrl?: string | undefined;
  phoneIdentityUrl?: string | undefined;
}) {
  return (
    input.appEnv === 'preview' &&
    input.relayUrl === 'wss://relay-dev.mnelo.com/' &&
    input.phoneIdentityUrl === 'https://identity-dev.mnelo.com'
  );
}
export function messengerEnvironment(input: {
  appEnv?: string | undefined;
  relayUrl?: string | undefined;
  phoneIdentityUrl?: string | undefined;
}) {
  const appEnv = z
    .enum(['local', 'development', 'preview', 'production'])
    .parse(input.appEnv || 'local');
  const relayUrl = relayAddress(input.relayUrl, appEnv === 'local');
  phoneServiceAddress(input.phoneIdentityUrl, appEnv === 'local');
  if (appEnv !== 'local' && !relayUrl) throw new Error('MESSENGER_RELAY_REQUIRED');
  if (
    (appEnv === 'preview' || appEnv === 'production') &&
    !privacyRelease.reviewed &&
    !reviewedFunctionalBeta(input)
  )
    throw new Error('MESSENGER_SECURITY_REVIEW_REQUIRED');
  return { appEnv, relayUrl };
}
