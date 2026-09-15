import { useRef, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTranslation } from 'react-i18next';
import { SearchField } from './SearchField';
import { IconButton, ui } from './ui';

// Search is a real list header, revealed by native scrolling. Its height never
// animates the list's viewport, and even an empty list has enough travel to hide it.
export function usePullSearch<Item>(value: string) {
  const listRef = useRef<FlatList<Item>>(null);
  const [headerHeight, setHeaderHeight] = useState(76);
  const [viewport, setViewport] = useState(0);
  const [focused, setFocused] = useState(false);
  const interacted = useRef(false);
  const [initialOffset] = useState({ x: 0, y: 76 });
  const reduceMotion = useReducedMotion();
  const locked = Boolean(value.trim()) || focused;
  function positionInitially(height: number) {
    if (!interacted.current) listRef.current?.scrollToOffset({ offset: height, animated: false });
  }
  return {
    listRef,
    locked,
    reveal: () => {
      interacted.current = true;
      listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
    },
    close: () => {
      interacted.current = true;
      Keyboard.dismiss();
      setFocused(false);
      listRef.current?.scrollToOffset({ offset: headerHeight, animated: !reduceMotion });
    },
    focus: (active: boolean) => {
      setFocused(active);
      if (active) {
        interacted.current = true;
        listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
      }
    },
    measureHeader: (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      if (height <= 0) return;
      setHeaderHeight(height);
      positionInitially(height);
    },
    scrollProps: {
      style: ui.flex,
      contentOffset: initialOffset,
      contentContainerStyle: { minHeight: viewport + headerHeight },
      // Keep the native sticky wrapper mounted while focusing the input.
      // Inserting it on focus remounts TextInput and reuses the initial scroll
      // offset, dropping the keyboard and moving the header down on iOS.
      stickyHeaderIndices: [0],
      stickyHeaderHiddenOnScroll: !locked,
      scrollEventThrottle: 16,
      bounces: true,
      alwaysBounceVertical: true,
      onLayout: (event: LayoutChangeEvent) => {
        setViewport(event.nativeEvent.layout.height);
        positionInitially(headerHeight);
      },
      onContentSizeChange: () => positionInitially(headerHeight),
      onScrollBeginDrag: () => {
        interacted.current = true;
      },
    },
  };
}
export function PullSearch({
  label,
  value,
  onChangeText,
  onFocusChange,
  onClose,
  onLayout,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onFocusChange: (focused: boolean) => void;
  onClose: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.content} onLayout={onLayout} testID="pull-search-header">
      <View style={ui.flex}>
        <SearchField
          label={label}
          value={value}
          onChangeText={onChangeText}
          onFocusChange={onFocusChange}
        />
      </View>
      <IconButton
        icon="x"
        label={t('common.cancel')}
        onPress={() => {
          onChangeText('');
          onClose();
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  content: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
});
