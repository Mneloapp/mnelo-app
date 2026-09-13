import { useEffect, useRef, useState } from 'react';
import { Keyboard, useWindowDimensions } from 'react-native';
export function useAttachmentPanel() {
  const [visible, setVisible] = useState(false),
    [keyboardHeight, setKeyboardHeight] = useState(300);
  const pending = useRef(false);
  const { height } = useWindowDimensions();
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      pending.current = false;
      setVisible(false);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      if (pending.current) {
        pending.current = false;
        setVisible(true);
      }
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return {
    visible,
    height: Math.max(180, Math.min(keyboardHeight, height * 0.43)),
    close: () => {
      pending.current = false;
      setVisible(false);
    },
    toggle: () => {
      if (visible || pending.current) {
        pending.current = false;
        setVisible(false);
        return;
      }
      if (Keyboard.isVisible()) {
        pending.current = true;
        Keyboard.dismiss();
      } else setVisible(true);
    },
  };
}
