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
