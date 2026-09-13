import type { ContactInvitation } from './contact-link';
let current: ContactInvitation | null = null;
const listeners = new Set<() => void>();
export const invitationSnapshot = () => current;
export const observeInvitation = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setInvitation(value: ContactInvitation | null) {
  current = value;
  listeners.forEach((listener) => listener());
}
