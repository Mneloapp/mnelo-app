import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, type KeyboardEvent } from 'react-native';
import { useAttachmentPanel } from '@/messenger/useAttachmentPanel';
test('attachment panel replaces the keyboard only after dismissal and closes when typing resumes', async () => {
  const events = new Map<string, (event: KeyboardEvent) => void>();
  const originalListen = Keyboard.addListener.bind(Keyboard);
  const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
    events.set(name, callback);
    return originalListen(name, callback);
  });
  const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true),
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const { result, unmount } = await renderHook(() => useAttachmentPanel());
  await act(() => result.current.toggle());
  expect(dismiss).toHaveBeenCalled();
  expect(result.current.visible).toBe(false);
  await act(() => events.get('keyboardDidHide')?.({} as KeyboardEvent));
  expect(result.current.visible).toBe(true);
  await act(() =>
    events.get('keyboardDidShow')?.({ endCoordinates: { height: 290 } } as KeyboardEvent),
  );
  expect(result.current.visible).toBe(false);
  await act(() => result.current.toggle());
  await act(() => result.current.close());
  await act(() => events.get('keyboardDidHide')?.({} as KeyboardEvent));
  expect(result.current.visible).toBe(false);
  visible.mockReturnValue(false);
  await act(() => result.current.toggle());
  expect(result.current.visible).toBe(true);
  await unmount();
  listen.mockRestore();
  visible.mockRestore();
  dismiss.mockRestore();
});
