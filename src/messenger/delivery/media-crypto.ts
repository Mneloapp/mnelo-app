import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, type RandomBytes } from '../crypto';
import {
  privateMediaDescriptor,
  MEDIA_CHUNK_BYTES,
  MEDIA_MAX_BYTES,
  type PrivateMediaDescriptor,
} from './media-schema';

const aad = (owner: string, recipient: string, id: string) =>
  new TextEncoder().encode(JSON.stringify(['mnelo-private-attachment-v2', owner, recipient, id]));
export function encryptMedia(
  bytes: Uint8Array,
  input: { owner: string; recipient: string; id: string; createdAt: number },
  random: RandomBytes,
) {
  if (bytes.length < 1 || bytes.length > MEDIA_MAX_BYTES - 16) throw new Error('MEDIA_SIZE_LIMIT');
  const key = random(32),
    nonce = random(12);
  const encrypted = gcm(key, nonce, aad(input.owner, input.recipient, input.id)).encrypt(bytes);
  const descriptor = privateMediaDescriptor.parse({
    version: 2,
    owner: input.owner,
    key: bytesToHex(key),
    nonce: bytesToHex(nonce),
    blob: {
      id: input.id,
      recipient: input.recipient,
      createdAt: input.createdAt,
      size: encrypted.length,
      parts: Math.ceil(encrypted.length / MEDIA_CHUNK_BYTES),
      digest: bytesToHex(sha256(encrypted)),
    },
  });
  return { encrypted, descriptor };
}
export function decryptMedia(
  input: PrivateMediaDescriptor,
  encrypted: Uint8Array,
  recipient: string,
) {
  const value = privateMediaDescriptor.parse(input);
  if (
    value.blob.recipient !== recipient ||
    encrypted.length !== value.blob.size ||
    bytesToHex(sha256(encrypted)) !== value.blob.digest
  )
    throw new Error('MEDIA_INTEGRITY_INVALID');
  return gcm(
    hexToBytes(value.key),
    hexToBytes(value.nonce),
    aad(value.owner, recipient, value.blob.id),
  ).decrypt(encrypted);
}
export function bytesToBase64(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join(''));
}
export const base64ToBytes = (text: string) =>
  Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
