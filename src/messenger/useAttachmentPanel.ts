import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  useWindowDimensions,
  type KeyboardEvent,
} from 'react-native';

// The keyboard and attachment grid share one reserved area. On iOS, replacing
// one with the other never first collapses (or doubles) the conversation inset.
export function useAttachmentPanel(bottomInset = 0) {
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [reservedHeight, setReservedHeight] = useState(bottomInset);
  const reserved = useRef(bottomInset);
  const lastKeyboardHeight = useRef(0);
  const keyboardHeight = useRef(0);
  const mode = useRef<'closed' | 'panel' | 'keyboard'>('closed');
  const managedKeyboard = Platform.OS === 'ios';
  const minimumPanelHeight = 212 + bottomInset;
  const panelHeight = useRef(Math.max(minimumPanelHeight, Math.min(320, windowHeight * 0.42)));
  const resize = useCallback(
    (height: number, event?: KeyboardEvent) => {
      if (height === reserved.current) return;
      reserved.current = height;
      if (!reducedMotion && event?.duration) Keyboard.scheduleLayoutAnimation(event);
      else if (!reducedMotion && Platform.OS !== 'web')
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setReservedHeight(height);
    },
    [reducedMotion],
  );
  useEffect(() => {
    panelHeight.current = Math.max(
      minimumPanelHeight,
      lastKeyboardHeight.current || Math.min(320, windowHeight * 0.42),
    );
    const updateKeyboard = (height: number, event?: KeyboardEvent) => {
      keyboardHeight.current = height;
      if (height > 0) {
        lastKeyboardHeight.current = height;
        panelHeight.current = Math.max(minimumPanelHeight, height);
      }
      if (mode.current === 'panel') {
        // Android's window already shrinks for the system keyboard.
        resize(managedKeyboard || height === 0 ? panelHeight.current : 0, event);
      } else resize(managedKeyboard ? Math.max(bottomInset, height) : bottomInset, event);
    };
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', (event) => {
        updateKeyboard(event.endCoordinates.height, event);
        if (mode.current !== 'panel') {
          mode.current = 'keyboard';
          setVisible(false);
        }
      }),
      Keyboard.addListener('keyboardDidHide', (event) => {
        updateKeyboard(0, event);
        if (mode.current !== 'panel') mode.current = 'closed';
      }),
    ];
    if (managedKeyboard) {
      subscriptions.push(
        Keyboard.addListener('keyboardWillShow', (event) =>
          updateKeyboard(event.endCoordinates.height, event),
        ),
        Keyboard.addListener('keyboardWillHide', (event) => updateKeyboard(0, event)),
        Keyboard.addListener('keyboardWillChangeFrame', (event) =>
          updateKeyboard(
            Math.max(
              0,
              Math.min(event.endCoordinates.height, windowHeight - event.endCoordinates.screenY),
            ),
            event,
          ),
        ),
      );
    }
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [bottomInset, minimumPanelHeight, managedKeyboard, windowHeight, resize]);
  function focusInput() {
    mode.current = 'keyboard';
    if (Platform.OS === 'web') {
      setVisible(false);
      resize(bottomInset);
    }
    // Keep the panel under the appearing keyboard until keyboardDidShow.
  }
  return {
    visible,
    managedKeyboard,
    reservedHeight,
    focusInput,
    close: () => {
      mode.current = 'closed';
      setVisible(false);
      resize(managedKeyboard ? Math.max(bottomInset, keyboardHeight.current) : bottomInset);
    },
    toggle: (focusKeyboard: () => void) => {
      if (mode.current === 'panel') {
        focusInput();
        focusKeyboard();
        return;
      }
      mode.current = 'panel';
      const metrics = Keyboard.metrics();
      if (metrics?.height) {
        lastKeyboardHeight.current = metrics.height;
        panelHeight.current = Math.max(minimumPanelHeight, metrics.height);
      }
      setVisible(true);
      resize(managedKeyboard || !Keyboard.isVisible() ? panelHeight.current : 0);
      Keyboard.dismiss();
    },
  };
}
