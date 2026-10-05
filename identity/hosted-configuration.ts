export function hostedIdentityConfiguration(env: Record<string, string | undefined>) {
  const mode = env.MNELO_HOSTED_IDENTITY;
  if (mode !== undefined && mode !== '' && mode !== 'development' && mode !== 'public')
    throw new Error('IDENTITY_CONFIGURATION_INVALID');
  const hosted = mode === 'development' || mode === 'public';
  const publicRegistration = mode === 'public';
  const combinedRelay = env.MNELO_COMBINED_RELAY === '1';
  if (env.MNELO_COMBINED_RELAY && (!hosted || !combinedRelay))
    throw new Error('IDENTITY_CONFIGURATION_INVALID');
  if (env.MNELO_REVIEW_ACCESS_FILE && (!hosted || !combinedRelay))
    throw new Error('REVIEW_REQUIRES_ISOLATED_HOSTED_ROUTING');
  const policyFile = env.MNELO_PUBLIC_REGISTRATION_POLICY_FILE;
  if (
    publicRegistration
      ? !combinedRelay || !policyFile?.startsWith('/') || Boolean(env.MNELO_ALLOWED_PHONE_INDICES)
      : Boolean(policyFile)
  )
    throw new Error('PUBLIC_REGISTRATION_CONFIGURATION_INVALID');
  return { hosted, publicRegistration, combinedRelay, policyFile };
}
