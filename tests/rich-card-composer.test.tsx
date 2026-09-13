import { fireEvent, render, screen } from '@testing-library/react-native';
import { RichCardComposer } from '@/messenger/components/RichCardComposer';
jest.mock('@noble/hashes/sha2.js', () => ({ sha256: jest.fn() }));
jest.mock('@noble/hashes/utils.js', () => ({ bytesToHex: jest.fn() }));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);
// Exercise form validation independently from the native date picker chrome.
jest.mock('@/messenger/components/EventDateField', () =>
  jest.requireActual('@/messenger/components/EventDateField.tsx'),
);
test('a poll needs distinct answers; adding/removing an option preserves remaining answers', async () => {
  const send = jest.fn();
  await render(
    <RichCardComposer kind="poll" close={jest.fn()} send={send} busy={false} error={null} />,
  );
  const submit = () => screen.getByRole('button', { name: 'Send poll' });
  expect(submit()).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Question'), 'Which day?');
  await fireEvent.changeText(screen.getByLabelText('Option 1'), 'Saturday');
  await fireEvent.changeText(screen.getByLabelText('Option 2'), 'Saturday');
  expect(submit()).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Option 2'), 'Sunday');
  await fireEvent.press(screen.getByRole('button', { name: 'Add option' }));
  expect(submit()).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Option 3'), 'Monday');
  await fireEvent.press(screen.getByRole('button', { name: 'Remove option 2' }));
  await fireEvent.press(submit());
  expect(send).toHaveBeenCalledWith({
    version: 1,
    type: 'poll',
    question: 'Which day?',
    options: ['Saturday', 'Monday'],
    multiple: true,
  });
});
test('an event requires valid dates; moving the start forward also moves the end', async () => {
  const send = jest.fn();
  await render(
    <RichCardComposer kind="event" close={jest.fn()} send={send} busy={false} error={null} />,
  );
  await fireEvent.changeText(screen.getByLabelText('Event name'), 'Test meeting');
  await fireEvent.changeText(screen.getByLabelText('Starts'), '2027-01-10 13:00');
  expect(screen.getByLabelText('Ends').props.value).toBe('2027-01-10 14:00');
  await fireEvent.changeText(screen.getByLabelText('Ends'), '2027-01-10 12:00');
  expect(screen.getByRole('button', { name: 'Send event' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Ends'), '2027-01-10 14:00');
  await fireEvent.press(screen.getByRole('button', { name: 'Send event' }));
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Test meeting',
      start: new Date('2027-01-10T13:00:00').getTime(),
      end: new Date('2027-01-10T14:00:00').getTime(),
    }),
  );
});
