import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useDevice } from '../DeviceProvider';
import { devicePhoneClient } from '../phone-client';
import type { phoneEn } from '../phone-copy';

const errors: Record<string, keyof typeof phoneEn> = {
  PHONE_INVALID: 'invalid',
  PHONE_IDENTITY_CHANGED: 'identityChanged',
  PHONE_CODE_INVALID: 'invalidCode',
  PHONE_CODE_EXPIRED: 'expires',
  PHONE_RATE_LIMITED: 'limited',
  PHONE_REGISTRATION_REQUIRED: 'permission',
  IDENTITY_RECOVERY_REQUIRED: 'recovery',
  FIXTURE_PHONE_REQUIRED: 'fixtureOnly',
  PHONE_CONTACTS_PERMISSION: 'contactsPermissionRequired',
  PHONE_CONTACTS_UNAVAILABLE: 'contactsUnavailable',
};
export function usePhoneAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (value) {
      setError(
        t(`phone.${value instanceof Error ? (errors[value.message] ?? 'failed') : 'failed'}`),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function usePhoneService() {
  const { engine, identity } = useDevice();
  const client = useMemo(
    () => (identity ? devicePhoneClient(engine.currentIdentity()) : null),
    [engine, identity],
  );
  const status = useQuery({
    queryKey: ['device', 'phone-status'],
    queryFn: () => client!.execute({ action: 'status' }),
    enabled: Boolean(client),
    retry: false,
    staleTime: 30000,
  });
  return { client, status };
}
