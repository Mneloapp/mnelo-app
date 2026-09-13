export function mobileSourceViolations(source: string): string[] {
  const violations: string[] = [];
  if (
    /SUPABASE_SERVICE_ROLE_KEY|LIVEKIT_API_SECRET|LIVEKIT_API_KEY|EXPO_ACCESS_TOKEN|DATABASE_PASSWORD|TWILIO_AUTH_TOKEN|VONAGE_API_SECRET|VONAGE_API_KEY|INFOBIP_API_KEY|MNELO_TURN_SECRET|MNELO_APNS_(?:(?:SANDBOX|PRODUCTION)_)?KEY_(?:FILE|ID)|MNELO_FCM_CREDENTIAL_FILE|MNELO_REVIEW_ACCESS_FILE/.test(
      source,
    )
  )
    violations.push('server-secret-reference');
  if (/sb_secret_[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source))
    violations.push('secret-literal');
  if (/\bconsole\.(log|error|warn|info|debug)\s*\(/.test(source))
    violations.push('unreviewed-logging');
  if (/AsyncStorage/.test(source)) violations.push('unreviewed-persistence');
  return violations;
}
