import { createPreferences } from './preferences-core';
import { localeStorage } from '@/services/locale-storage';
// Local UI preference only, independent of account sessions.
export const usePreferences = createPreferences(localeStorage);
