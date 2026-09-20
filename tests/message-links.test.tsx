import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { messageLinkRanges, messageLinks } from '@/messenger/message-links';
import { MessageText } from '@/messenger/components/MessageText';

const booking = 'https://www.booking.com/Share-linkFixture';
const body = `Check out Example hotel on Booking.com!\n${booking}`;

test('shared prose keeps the full booking URL, original text ranges and repeated links', () => {
  const text = `${body}.\n(${booking}) www.example.com/a?q=1&x=2`;
  const ranges = messageLinkRanges(text);
  expect(ranges.map((link) => text.slice(link.start, link.end))).toEqual([
    booking,
    booking,
    'www.example.com/a?q=1&x=2',
  ]);
  expect(messageLinks(text)).toEqual([booking, 'https://www.example.com/a?q=1&x=2']);
  expect(messageLinks('https://example.org/wiki/A_(B).')).toEqual([
    'https://example.org/wiki/A_(B)',
  ]);
  expect(
    messageLinks('javascript:alert(1) file:///secret https://user:password@example.com https://'),
  ).toEqual([]);
});

test('a link is underlined, accessible and opens only after a tap; long press keeps message actions', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const select = jest.fn();
  try {
    await render(<MessageText body={body} links={messageLinkRanges(body)} onLongPress={select} />);
    const link = screen.getByRole('link', { name: booking });
    expect(link).toHaveStyle({ textDecorationLine: 'underline' });
    expect(open).not.toHaveBeenCalled();
    await fireEvent(link, 'longPress');
    expect(select).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    await fireEvent.press(link);
    await waitFor(() => expect(open).toHaveBeenCalledWith(booking));
  } finally {
    open.mockRestore();
  }
});

test('the actions overlay disables link navigation and failed opens are reported', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('OPEN_FAILED'));
  try {
    const view = await render(
      <MessageText body={body} links={messageLinkRanges(body)} enabled={false} />,
    );
    await fireEvent.press(screen.getByRole('link', { name: booking }));
    expect(open).not.toHaveBeenCalled();
    await view.rerender(<MessageText body={body} links={messageLinkRanges(body)} />);
    await fireEvent.press(screen.getByRole('link', { name: booking }));
    await screen.findByRole('alert');
  } finally {
    open.mockRestore();
  }
});
