import * as Crypto from 'expo-crypto';
import { MessageOutbox, pendingMessage } from '@/features/chats/outbox';
import { usePendingMessages } from '@/features/chats/pending-messages';
import { sessionStorage, sessionStorageKey } from './supabase/client';
const keys = new Map<string, Promise<string>>();
export const messageOutbox = new MessageOutbox(
  sessionStorage,
  (owner) => {
    let key = keys.get(owner);
    if (!key) {
      key = Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        sessionStorageKey + ':' + owner,
      ).then((value) => 'mnelo.outbox.' + value);
      keys.set(owner, key);
    }
    return key;
  },
  (entries) => usePendingMessages.getState().sync(entries.map(pendingMessage)),
);
