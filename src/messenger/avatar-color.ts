// Cosmetic identity hash, not cryptography. A contact keeps the same color
// across launches and chat/call rendering orders, without a loading flash.
// Groups use their own IDs; saved profile photos override this fallback.
export function fallbackAvatarColor(identity: string): string {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index++)
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = (hash ^ (hash >>> 13)) >>> 0;
  const hue = hash % 360;
  const saturation = 46 + ((hash >>> 9) % 16);
  const lightness = 76 + ((hash >>> 17) % 7);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
