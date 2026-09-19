import { render, screen } from '@testing-library/react-native';
import { MessageReceiptDetails } from '@/messenger/screens/MessageInfoScreen';
import { formatDate, formatTime } from '@/i18n/format';
import type { MessageInfo } from '@/messenger/message-info';

jest.mock('@/messenger/components/ChatMessageBubble', () => ({ ChatMessageBubble: () => null }));
jest.mock('@/messenger/DeviceProvider', () => ({ useDevice: () => ({}) }));
jest.mock('@/messenger/components/ContactCard', () => ({ PeerAvatar: () => null }));
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock'),
);

const delivered = new Date('2026-09-19T19:02:01Z').getTime();
const read = delivered + 60_000;
const display = (time: number) =>
  `${formatDate(new Date(time).toISOString())} · ${formatTime(new Date(time).toISOString())}`;

test('missing historical recipient rows never imply nobody received or read a message', async () => {
  await render(
    <MessageReceiptDetails info={{ kind: 'group', recipients: [] } as unknown as MessageInfo} />,
  );
  expect(screen.getByText('Receipt history is unavailable for this message.')).toBeOnTheScreen();
  expect(screen.queryByText('Read by')).toBeNull();
  expect(screen.queryByText('Not delivered yet')).toBeNull();
});

test('direct message distinguishes unknown delivery time from a known read time with leaves', async () => {
  const info = {
    kind: 'direct',
    recipients: [{ peer: 'one', name: 'One', status: 'read', deliveredAt: null, readAt: read }],
  } as MessageInfo;
  const rendered = await render(<MessageReceiptDetails info={info} />);
  expect(screen.getByText('Read')).toBeOnTheScreen();
  expect(screen.getByText('Delivered')).toBeOnTheScreen();
  expect(screen.getByText('—')).toBeOnTheScreen();
  expect(screen.getByText(display(read))).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Read on their device' })).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'Delivered to their device' })).toBeOnTheScreen();
  await rendered.rerender(
    <MessageReceiptDetails
      info={{ ...info, recipients: [{ ...info.recipients[0]!, deliveredAt: delivered }] }}
    />,
  );
  expect(screen.queryByText('—')).toBeNull();
  expect(screen.getByText(display(delivered))).toBeOnTheScreen();
});

test('group shows each recipient once in read, delivered or pending sections', async () => {
  const info = {
    kind: 'group',
    recipients: [
      { peer: 'one', name: 'Read person', status: 'read', deliveredAt: delivered, readAt: read },
      {
        peer: 'two',
        name: 'Delivered person',
        status: 'delivered',
        deliveredAt: delivered,
        readAt: null,
      },
      { peer: 'three', name: 'Pending person', status: 'pending', deliveredAt: null, readAt: null },
    ],
  } as MessageInfo;
  await render(<MessageReceiptDetails info={info} />);
  expect(screen.getAllByText('Read person')).toHaveLength(1);
  expect(screen.getAllByText('Delivered person')).toHaveLength(1);
  expect(screen.getAllByText('Pending person')).toHaveLength(1);
  expect(screen.getByText('Read by')).toBeOnTheScreen();
  expect(screen.getByText('Delivered to')).toBeOnTheScreen();
  expect(screen.getByText(display(read))).toBeOnTheScreen();
  expect(screen.getByText(display(delivered))).toBeOnTheScreen();
});
