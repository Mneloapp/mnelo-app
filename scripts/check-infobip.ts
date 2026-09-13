import { infobipConfiguration, infobipSms } from '../identity/infobip';

async function main() {
  try {
    await infobipSms(infobipConfiguration(process.env)).validateSetup();
    process.stdout.write('Infobip registration configuration verified. No SMS sent.\n');
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    process.stderr.write(
      (['IDENTITY_CONFIGURATION_INVALID', 'PHONE_RATE_LIMITED'].includes(code)
        ? code
        : 'PHONE_PROVIDER_UNAVAILABLE') + '\n',
    );
    process.exitCode = 1;
  }
}
void main();
