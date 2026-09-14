import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CallQuickReplies } from '@/messenger/components/CallQuickReplies';
let mockReplies: string[] = [];
const mockEngine = {
  callQuickReplies: async () => mockReplies,
  saveCallQuickReplies: jest.fn(async (rows: string[]) => {
    mockReplies = rows;
  }),
};
jest.mock('@/messenger/DeviceProvider', () => ({ useDevice: () => ({ engine: mockEngine }) }));
test('quick replies can be edited and saved; only selecting a reply sends it', async () => {
  const send = jest.fn(async () => {}),
    close = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <CallQuickReplies onSend={send} onClose={close} />
    </QueryClientProvider>,
  );
  await screen.findByRole('button', { name: 'Edit replies' });
  expect(send).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Edit replies' }));
  await fireEvent.changeText(screen.getByLabelText('Reply 1'), '');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Reply 1'), 'შემდეგ დაგირეკავ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('button', { name: 'შემდეგ დაგირეკავ' });
  expect(mockEngine.saveCallQuickReplies).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'შემდეგ დაგირეკავ' }));
  expect(send).toHaveBeenCalledWith('შემდეგ დაგირეკავ');
  expect(close).toHaveBeenCalledTimes(1);
});
