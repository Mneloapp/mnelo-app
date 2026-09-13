import { contactLink, parseContactLink } from '@/messenger/contact-link';
import { redirectSystemPath } from '../app/+native-intent';
import { invitationSnapshot, setInvitation } from '@/messenger/pending-invitation';
import { emptyProfile, localProfile, safeWebsite } from '@/messenger/local-profile';

const contact = { key: 'a'.repeat(64), name: 'გიორგი დევდარიანი' };
afterEach(() => setInvitation(null));
test('QR links preserve Georgian names and only carry a name and public key', () => {
  const link = contactLink(contact);
  expect(parseContactLink(link)).toEqual(contact);
  expect(new URL(link).search).toBe('');
  expect(new URL(link).pathname).toBe('/invite');
  expect(parseContactLink('mnelo://contact/' + link.split('#')[1])).toEqual(contact);
  expect(link).not.toContain('@');
});
test('only a constant preview route reaches Router; the contact is not automatically trusted', () => {
  expect(redirectSystemPath({ path: contactLink(contact), initial: true })).toBe('/contact-invite');
  expect(invitationSnapshot()).toEqual(contact);
});
test.each([
  'https://evil.example/invite#v1:' + 'a'.repeat(64) + ':41',
  'https://mnelo.com.evil.example/invite#v1:' + 'a'.repeat(64) + ':41',
  'https://mnelo.com/invite?redirect=account#v1:' + 'a'.repeat(64) + ':41',
  'mnelo://contact/v1:' + 'a'.repeat(64) + ':0a',
  'mnelo://contact/v1:' + 'a'.repeat(64) + ':ff',
  'mnelo://contact/v1:' + 'a'.repeat(64) + ':4',
  'mnelo://account?delete=1',
  '%'.repeat(100_000),
])('rejects hostile or malformed contact input without forwarding it: %#', (input) => {
  expect(parseContactLink(input)).toBeNull();
  expect(redirectSystemPath({ path: input, initial: false })).toBe('/');
  expect(invitationSnapshot()).toBeNull();
});
test('business-card fields are optional, bounded, and reject unsafe links and control fields', () => {
  expect(localProfile.parse({ username: '', firstName: '', lastName: '' })).toEqual(emptyProfile());
  for (const website of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com\n',
  ]) {
    expect(safeWebsite(website)).toBeNull();
  }
  expect(safeWebsite('example.com/contact')).toBe('https://example.com/contact');
  expect(localProfile.safeParse({ ...emptyProfile(), email: 'invalid' }).success).toBe(false);
  expect(localProfile.safeParse({ ...emptyProfile(), headline: 'x'.repeat(81) }).success).toBe(
    false,
  );
  expect(localProfile.safeParse({ ...emptyProfile(), public_key: 'b'.repeat(64) }).success).toBe(
    false,
  );
});
