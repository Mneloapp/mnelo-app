import { Alert, Button } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ChatSwipeActions } from '@/messenger/components/ChatSwipeActions';
import { exportChat } from '@/messenger/export-chat';
let mockOwner = 'self';
let mockFocused = true;
const mockEngine = {
  currentIdentity: () => ({ key: mockOwner }),
  deleteLocalChat: jest.fn(async () => {}),
};
jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused,
  useFocusEffect: jest.requireActual('react').useEffect,
}));
jest.mock('@/messenger/DeviceProvider', () => ({
  useDevice: () => ({ engine: mockEngine, view: mockEngine }),
}));
jest.mock('@/messenger/export-chat', () => ({ exportChat: jest.fn(async () => {}) }));
async function show() {
  return render(
    <ChatSwipeActions id="chat" title="Friend">
      {(actions) => (
        <>
          <Button title="Delete accessible action" onPress={actions.onDelete} />
          <Button title="Export accessible action" onPress={actions.onExportDelete} />
        </>
      )}
    </ChatSwipeActions>,
  );
}
beforeEach(() => {
  mockOwner = 'self';
  mockFocused = true;
});
test('delete requires explicit confirmation; a changed account invalidates an already open confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await show();
  await fireEvent.press(screen.getByText('Delete accessible action'));
  expect(mockEngine.deleteLocalChat).not.toHaveBeenCalled();
  mockOwner = 'another';
  await act(async () => alert.mock.calls.at(-1)![2]![1]!.onPress!());
  expect(mockEngine.deleteLocalChat).not.toHaveBeenCalled();
  mockOwner = 'self';
  await fireEvent.press(screen.getByText('Delete accessible action'));
  await act(async () => alert.mock.calls.at(-1)![2]![1]!.onPress!());
  expect(mockEngine.deleteLocalChat).toHaveBeenCalledWith('chat');
});
test('export-and-delete goes through the save-confirming exporter and never deletes on share-sheet dismissal', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  await show();
  await fireEvent.press(screen.getByText('Export accessible action'));
  expect(exportChat).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls.at(-1)![2]![1]!.onPress!());
  await waitFor(() =>
    expect(exportChat).toHaveBeenCalledWith(
      mockEngine,
      mockEngine,
      'chat',
      expect.objectContaining({ deleteAfterSaving: true, isCurrent: expect.any(Function) }),
    ),
  );
  expect(mockEngine.deleteLocalChat).not.toHaveBeenCalled();
});
