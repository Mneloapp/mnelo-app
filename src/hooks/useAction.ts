import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RepositoryError } from '@/services/repository';
export function useAction() {
  const { t } = useTranslation();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async <T>(action: () => Promise<T>, done?: (result: T) => void) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await action();
      done?.(result);
      return result;
    } catch (cause) {
      const code = cause instanceof RepositoryError ? cause.code : 'UNAVAILABLE';
      setError(t(`errors.${code}`));
      return undefined;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run, clear: () => setError(undefined) };
}
