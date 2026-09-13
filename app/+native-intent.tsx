import { parseContactLink } from '@/messenger/contact-link';
import { setInvitation } from '@/messenger/pending-invitation';
/** Only a bounded, strict contact invitation reaches an in-memory preview.
 * The router still receives constant paths, never external query strings.
 * No network request, automatic contact trust, enrollment or calling occurs here. */
export function redirectSystemPath(options: { path: string; initial: boolean }): string {
  const invitation = parseContactLink(options.path);
  if (invitation) {
    setInvitation(invitation);
    return '/contact-invite';
  }
  return '/';
}
