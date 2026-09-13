import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';
import { peerKey } from './model';

export { bytesToHex, hexToBytes };
export type RandomBytes = (length: number) => Uint8Array;
export function createKeys(random: RandomBytes) {
  const secret = random(32);
  return { secret: bytesToHex(secret), key: bytesToHex(ed25519.getPublicKey(secret)) };
}
export function verifyIdentity(secret: string, key: string) {
  return (
    peerKey.safeParse(key).success && bytesToHex(ed25519.getPublicKey(hexToBytes(secret))) === key
  );
}
export function directChatId(a: string, b: string) {
  peerKey.parse(a);
  peerKey.parse(b);
  return (
    'direct-' +
    bytesToHex(sha256(new TextEncoder().encode(['mnelo-direct-v1', ...[a, b].sort()].join(':'))))
  );
}
export function sign(secret: string, payload: string) {
  return bytesToHex(ed25519.sign(new TextEncoder().encode(payload), hexToBytes(secret)));
}
export function verify(key: string, signature: string, payload: string): boolean {
  try {
    if (!/^[a-f0-9]{128}$/.test(signature) || !peerKey.safeParse(key).success) return false;
    return ed25519.verify(
      hexToBytes(signature),
      new TextEncoder().encode(payload),
      hexToBytes(key),
      { zip215: false },
    );
  } catch {
    return false;
  }
}

// An archive primitive, not a messaging protocol. The random recovery key is user-held.
const archiveAAD = new TextEncoder().encode('mnelo-user-backup-v1');
export function sealArchive(plaintext: Uint8Array, key: string, random: RandomBytes): Uint8Array {
  peerKey.parse(key);
  const nonce = random(12);
  const encrypted = gcm(hexToBytes(key), nonce, archiveAAD).encrypt(plaintext);
  const result = new Uint8Array(13 + encrypted.length);
  result[0] = 1;
  result.set(nonce, 1);
  result.set(encrypted, 13);
  return result;
}
export function openArchive(archive: Uint8Array, key: string): Uint8Array {
  peerKey.parse(key);
  if (archive.length < 29 || archive[0] !== 1) throw new Error('BACKUP_INVALID');
  return gcm(hexToBytes(key), archive.slice(1, 13), archiveAAD).decrypt(archive.slice(13));
}
