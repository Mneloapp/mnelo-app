import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { ka } from './ka';

export type Locale = 'en' | 'ka';
export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ka: { translation: ka } },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en', 'ka'],
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
    returnNull: false;
  }
}
