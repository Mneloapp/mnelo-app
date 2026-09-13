import { create } from 'zustand';
export type SupportedLocale = 'en' | 'ka';
export type LocaleStorage = {
  get(): Promise<string | null>;
  set(locale: SupportedLocale): Promise<void>;
};
export function createPreferences(storage: LocaleStorage) {
  let restored: Promise<void> | undefined;
  let revision = 0;
  let serial: Promise<unknown> = Promise.resolve();
  return create<{
    locale: SupportedLocale;
    ready: boolean;
    restore(): Promise<void>;
    setLocale(locale: SupportedLocale): Promise<void>;
  }>((set) => ({
    locale: 'en',
    ready: false,
    restore() {
      if (!restored) {
        restored = storage
          .get()
          .then((locale) => {
            if (revision === 0) set({ locale: locale === 'ka' ? 'ka' : 'en' });
          })
          .catch(() => undefined)
          .finally(() => set({ ready: true }));
      }
      return restored;
    },
    setLocale(locale) {
      if (locale !== 'en' && locale !== 'ka') return Promise.reject(new Error('INVALID_LOCALE'));
      revision++;
      const next = serial.then(async () => {
        await storage.set(locale);
        set({ locale, ready: true });
      });
      serial = next.catch(() => undefined);
      return next;
    },
  }));
}
