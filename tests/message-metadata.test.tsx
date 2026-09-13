import { MessageBubble } from '@/messenger/components/MessageBubble';
import { AppText } from '@/components/AppText';
import { formatTime } from '@/i18n/format';
import { render, screen } from '@testing-library/react-native';
import { DeliveryLeaf } from '@/messenger/components/MessageMetadata';
test('no delivery leaf before acknowledgment or on received messages; accessible delivered/read states differ', async () => {
  const view = await render(<DeliveryLeaf status="pending" />);
  expect(screen.queryByRole('image')).toBeNull();
  await view.rerender(<DeliveryLeaf status="received" />);
  expect(screen.queryByRole('image')).toBeNull();
  await view.rerender(<DeliveryLeaf status="delivered" />);
  expect(screen.getByRole('image', { name: 'Delivered to their device' })).toBeOnTheScreen();
  await view.rerender(<DeliveryLeaf status="read" />);
  expect(screen.getByRole('image', { name: 'Read on their device' })).toBeOnTheScreen();
});

test('both sides show a time without a gesture and only acknowledged outgoing messages show the small leaf', async () => {
  const sentAt = new Date('2026-09-13T13:37:00Z').getTime();
  const page = await render(
    <MessageBubble own={false} status="received" sentAt={sentAt}>
      <AppText>Hello</AppText>
    </MessageBubble>,
  );
  expect(screen.getByText(formatTime(new Date(sentAt).toISOString()))).toBeOnTheScreen();
  expect(screen.queryByRole('image')).toBeNull();
  await page.rerender(
    <MessageBubble own status="pending" sentAt={sentAt}>
      <AppText>Hello</AppText>
    </MessageBubble>,
  );
  expect(screen.queryByRole('image')).toBeNull();
  await page.rerender(
    <MessageBubble own status="read" sentAt={sentAt}>
      <AppText>Hello</AppText>
    </MessageBubble>,
  );
  expect(screen.getByRole('image', { name: 'Read on their device' })).toBeOnTheScreen();
  expect(screen.getByTestId('message-metadata')).toHaveStyle({ flexDirection: 'row' });
});
