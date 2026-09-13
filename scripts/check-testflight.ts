import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseProjectEnv } from '@expo/env';
import { z } from 'zod';
import { privacyRelease, reviewedFunctionalBeta } from '../src/messenger/environment';

// Read-only local preflight. No Apple account mutation, network probe, SMS,
// certificate export or release-gate override. Never print environment values.
const saved = parseProjectEnv(process.cwd(), { mode: 'production', silent: true }).env;
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--profile'))
  throw new Error('TESTFLIGHT_PROFILE_ARGUMENT_INVALID');
const profileName = args[1] ?? 'testflight';
const profiles = z
  .object({
    build: z.record(
      z.string(),
      z.object({
        distribution: z.string().optional(),
        developmentClient: z.boolean().optional(),
        environment: z.string().optional(),
        env: z.record(z.string(), z.string()).optional(),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync('eas.json', 'utf8')));
const selected = profiles.build[profileName];
if (!selected) throw new Error('TESTFLIGHT_PROFILE_UNKNOWN');
// Explicit build-profile values override the local development dotenv fallback.
// Remote EAS environment values/credentials still require a separate live check.
// A production check must not inherit the developer's local dotenv endpoints.
const env = {
  ...(profileName === 'production' ? {} : saved),
  ...process.env,
  ...selected.env,
};

function endpoint(value: string | undefined, protocol: 'https:' | 'wss:') {
  if (!value) return 'missing';
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.protocol !== protocol ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.localhost') ||
      url.hostname === '[::1]' ||
      /^127\./.test(url.hostname)
    )
      return 'not_a_remote_secure_endpoint';
    // A syntactically valid URL is not evidence of deployment or connectivity.
    return 'configured_but_reachability_unverified';
  } catch {
    return 'invalid';
  }
}

function distributionIdentity() {
  if (process.platform !== 'darwin') return 'not_checked_on_this_host';
  try {
    const output = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    });
    return output.includes('Apple Distribution:')
      ? 'present_app_provisioning_unverified'
      : 'absent_locally_xcode_managed_signing_must_be_checked';
  } catch {
    return 'unavailable';
  }
}

const phoneService = endpoint(env.EXPO_PUBLIC_PHONE_IDENTITY_URL, 'https:');
const signalingService = endpoint(env.EXPO_PUBLIC_RELAY_URL, 'wss:');
const functionalBeta = reviewedFunctionalBeta({
  appEnv: env.EXPO_PUBLIC_APP_ENV,
  relayUrl: env.EXPO_PUBLIC_RELAY_URL,
  phoneIdentityUrl: env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
});
const storeProfiles = Object.entries(profiles.build)
  .filter(([, value]) => value.distribution === 'store' && !value.developmentClient)
  .map(([name]) => name);
const developmentOriginInProduction =
  env.EXPO_PUBLIC_APP_ENV === 'production' &&
  [env.EXPO_PUBLIC_PHONE_IDENTITY_URL, env.EXPO_PUBLIC_RELAY_URL].some((value) => {
    if (!value) return false;
    try {
      return ['identity-dev.mnelo.com', 'relay-dev.mnelo.com'].includes(new URL(value).hostname);
    } catch {
      return false; // The endpoint validator reports malformed URLs separately.
    }
  });
const blockers = [
  ...(developmentOriginInProduction ? ['PRODUCTION_DEVELOPMENT_ENDPOINT_FORBIDDEN'] : []),
  ...(!['preview', 'production'].includes(env.EXPO_PUBLIC_APP_ENV ?? '')
    ? ['TESTFLIGHT_ENV_NOT_SELECTED']
    : []),
  ...(!privacyRelease.reviewed && !functionalBeta ? ['MESSENGER_SECURITY_REVIEW_REQUIRED'] : []),
  ...(phoneService !== 'configured_but_reachability_unverified' ? ['REMOTE_HTTPS_REQUIRED'] : []),
  ...(signalingService !== 'configured_but_reachability_unverified' ? ['REMOTE_WSS_REQUIRED'] : []),
  ...(selected.distribution !== 'store' || selected.developmentClient
    ? ['STORE_DISTRIBUTION_PROFILE_REQUIRED']
    : []),
];
console.log(
  JSON.stringify(
    {
      scope: 'local TestFlight preflight; not a build or device QA result',
      selectedProfile: profileName,
      selectedEnvironment: selected.environment,
      phoneService,
      signalingService,
      independentProtocolReview: privacyRelease.reviewed
        ? 'recorded'
        : 'pending_public_production_blocked',
      functionalBeta: functionalBeta ? 'scoped_engineering_review' : 'not_selected',
      storeProfiles,
      localDistributionSigning: distributionIdentity(),
      remainingEvidence: [
        'App Store Connect record for com.mnelo.messenger and TestFlight access',
        'Owner-completed export compliance and any contractual declarations',
        'Reachable reviewed HTTPS identity and WSS signaling deployment',
        'Paid Infobip access and admitted testers; actual OTP receipt on each phone',
        'Internet ICE/TURN configuration and two-phone Wi-Fi/cellular checks',
        'Successful signed standalone archive/upload and Apple processing',
        'Production APNs alert/VoIP credentials and device token registration',
        'Closed-app/locked-screen alerts, CallKit answer/audio and in-place vault migration on two iPhones',
        'Android Firebase configuration, Telecom/FCM real-device lifecycle acceptance',
      ],
      blockers,
      result: blockers.length ? 'LOCAL_PREREQUISITES_BLOCKED' : 'LIVE_VALIDATION_REQUIRED',
    },
    null,
    2,
  ),
);
// Passing these local checks never proves hosting, signing or device acceptance.
process.exitCode = blockers.length ? 1 : 0;
