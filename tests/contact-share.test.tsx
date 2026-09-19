import { fireEvent, render, screen } from '@testing-library/react-native';
import { ContactShareChoices } from '@/messenger/components/ContactShareChoices';
import {
  encodeSharedContact,
  forwardSharedContact,
  presentSharedContact,
  sharedContactText,
} from '@/messenger/contact-share';
import type { LocalMessage } from '@/messenger/model';
import { mediaErrorMessage } from '@/messenger/media-send-error';

const known = { key: 'a'.repeat(64), name: 'Friend 💕', phone: '+12025550102', blocked: false };
const legacy = `Old name\nmnelo1:${known.key}`;
test('new cards contain a valid phone and friendly name without a public key', () => {
  expect(encodeSharedContact(known)).toBe('Friend 💕\n+12025550102');
  expect(encodeSharedContact({ ...known, name: `Friend\nmnelo1:${known.key}` })).toBe(
    'Friend\n+12025550102',
  );
  expect(() => encodeSharedContact({ name: 'Phone not verified' })).toThrow(
    'CONTACT_PHONE_UNAVAILABLE',
  );
  expect(() => encodeSharedContact({ name: 'Bad', phone: '+123' })).toThrow(
    'CONTACT_PHONE_UNAVAILABLE',
  );
  expect(mediaErrorMessage(new Error('CONTACT_PHONE_UNAVAILABLE')).key).toBe(
    'contactPhoneUnavailable',
  );
});
test('legacy card resolves only an existing local phone binding and remains safe without one', () => {
  expect(sharedContactText(legacy, [known])).toBe('Friend 💕\n+12025550102');
  expect(sharedContactText(legacy)).toBe('Old name');
  expect(sharedContactText(`mnelo1:${known.key}`)).toBe('');
  expect(sharedContactText('Old name\nmnelo1:truncated')).toBe('Old name');
  expect(sharedContactText(`Old name\n${known.key}`)).toBe('Old name');
  expect(sharedContactText(legacy, [{ ...known, key: 'b'.repeat(64) }])).toBe('Old name');
  expect(forwardSharedContact(legacy, [known])).toBe('Friend 💕\n+12025550102');
  expect(() => forwardSharedContact(legacy)).toThrow('CONTACT_PHONE_UNAVAILABLE');
});
test('only contact cards get a presentation migration; local stored bodies and ordinary text remain intact', () => {
  const message = { kind: 'contact', body: legacy, id: 'card' } as LocalMessage;
  const presented = presentSharedContact(message, [known]);
  expect(presented.body).toBe('Friend 💕\n+12025550102');
  expect(message.body).toBe(legacy);
  const text = { ...message, kind: 'text' as const };
  expect(presentSharedContact(text, [known])).toBe(text);
});
test('contact picker sends phone card and explains disabled contacts without a number', async () => {
  const onShare = jest.fn();
  await render(
    <ContactShareChoices
      contacts={[
        known,
        { key: 'b'.repeat(64), name: 'No number', blocked: false },
        { ...known, key: 'c'.repeat(64), name: 'Blocked', blocked: true },
      ]}
      busy={false}
      onShare={onShare}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Friend 💕\n+12025550102' }));
  expect(onShare).toHaveBeenCalledWith('Friend 💕\n+12025550102');
  expect(screen.getByRole('button', { name: 'No number' })).toBeDisabled();
  expect(
    screen.getByText('This contact has no phone number available to share.'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Blocked')).toBeNull();
  expect(screen.queryByText(/mnelo1:/)).toBeNull();
});
