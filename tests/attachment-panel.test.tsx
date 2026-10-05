import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useAttachmentPanel } from '@/messenger/useAttachmentPanel';

test('keyboard and attachment grid keep the same inset throughout both directions of replacement', async () => {
  const events = new Map<string, (event: KeyboardEvent) => void>();
  const originalListen = Keyboard.addListener.bind(Keyboard);
  const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
    events.set(name, callback);
    return originalListen(name, callback);
  });
  const shown = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
  const metrics = jest
    .spyOn(Keyboard, 'metrics')
    .mockReturnValue({ height: 310, screenX: 0, screenY: 534, width: 390 });
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const focus = jest.fn();
  const { result, unmount } = await renderHook(() => useAttachmentPanel(34));
  const event = { endCoordinates: { height: 310, screenY: 534 }, duration: 0 } as KeyboardEvent;
  try {
    await act(() => events.get('keyboardWillShow')?.(event));
    await act(() => events.get('keyboardDidShow')?.(event));
    expect(result.current.reservedHeight).toBe(310);
    await act(() => result.current.toggle(focus));
    expect(result.current.visible).toBe(true);
    expect(dismiss).toHaveBeenCalled();
    expect(result.current.reservedHeight).toBe(310);
    await act(() => events.get('keyboardWillHide')?.(event));
    await act(() => events.get('keyboardDidHide')?.(event));
    expect(result.current.reservedHeight).toBe(310);
    await act(() => result.current.toggle(focus));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(result.current.visible).toBe(true);
    expect(result.current.reservedHeight).toBe(310);
    await act(() => events.get('keyboardWillShow')?.(event));
    await act(() => events.get('keyboardDidShow')?.(event));
    expect(result.current.visible).toBe(false);
    expect(result.current.reservedHeight).toBe(310);
    await act(() => events.get('keyboardWillHide')?.(event));
    await act(() => events.get('keyboardDidHide')?.(event));
    expect(result.current.reservedHeight).toBe(34);
    shown.mockReturnValue(false);
    metrics.mockReturnValue(undefined);
    await act(() => result.current.toggle(focus));
    await act(() => result.current.close());
    await act(() => events.get('keyboardDidHide')?.(event));
    expect(result.current.visible).toBe(false);
    expect(result.current.reservedHeight).toBe(34);
  } finally {
    await unmount();
    listen.mockRestore();
    shown.mockRestore();
    metrics.mockRestore();
    dismiss.mockRestore();
  }
});

test('web attachment panel opens when the browser has no native keyboard metrics API', async () => {
  const platform = Platform.OS;
  const metrics = Object.getOwnPropertyDescriptor(Keyboard, 'metrics');
  const visible = Object.getOwnPropertyDescriptor(Keyboard, 'isVisible');
  Platform.OS = 'web';
  Object.defineProperty(Keyboard, 'metrics', { value: undefined, configurable: true });
  Object.defineProperty(Keyboard, 'isVisible', { value: undefined, configurable: true });
  const { result, unmount } = await renderHook(() => useAttachmentPanel(12));
  try {
    await act(() => result.current.toggle(jest.fn()));
    expect(result.current.visible).toBe(true);
    expect(result.current.reservedHeight).toBeGreaterThan(12);
    await act(() => result.current.focusInput());
    expect(result.current.visible).toBe(false);
    expect(result.current.reservedHeight).toBe(12);
  } finally {
    await unmount();
    Platform.OS = platform;
    if (metrics) Object.defineProperty(Keyboard, 'metrics', metrics);
    else Reflect.deleteProperty(Keyboard, 'metrics');
    if (visible) Object.defineProperty(Keyboard, 'isVisible', visible);
    else Reflect.deleteProperty(Keyboard, 'isVisible');
  }
});
