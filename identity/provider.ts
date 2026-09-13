import { fixtureSms, twilioSms } from './verification';
import { vonageSms } from './vonage';
import { infobipConfiguration, infobipSms } from './infobip';

export function phoneProviderMode(args: readonly string[]) {
  if (
    args.length !== 1 ||
    !['--fixture', '--vonage', '--twilio', '--infobip'].includes(args[0] ?? '')
  )
    throw new Error('IDENTITY_MODE_REQUIRED');
  return args[0] as '--fixture' | '--vonage' | '--twilio' | '--infobip';
}

export function phoneProvider(
  mode: ReturnType<typeof phoneProviderMode>,
  env: Record<string, string | undefined>,
) {
  if (mode === '--fixture') return fixtureSms(true);
  if (mode === '--infobip') return infobipSms(infobipConfiguration(env));
  if (mode === '--vonage')
    return vonageSms({ apiKey: env.VONAGE_API_KEY ?? '', apiSecret: env.VONAGE_API_SECRET ?? '' });
  if (mode === '--twilio')
    return twilioSms({
      account: env.TWILIO_ACCOUNT_SID ?? '',
      token: env.TWILIO_AUTH_TOKEN ?? '',
      service: env.TWILIO_VERIFY_SERVICE_SID ?? '',
    });
  throw new Error('IDENTITY_MODE_REQUIRED');
}
