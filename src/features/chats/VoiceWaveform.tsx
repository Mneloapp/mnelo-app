import { memo, useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { theme } from '@/theme/tokens';
import { VOICE_METER_INTERVAL, waveformBars } from './voice-waveform';

const HEIGHT = 30;
const WaveBar = memo(function WaveBar({
  level,
  color,
  animate,
}: {
  level: number;
  color: string;
  animate: boolean;
}) {
  const target = Math.max(0.08, Math.min(1, level));
  const [scale] = useState(() => new Animated.Value(target));
  useEffect(() => {
    if (!animate) {
      scale.setValue(target);
      return;
    }
    const motion = Animated.timing(scale, {
      toValue: target,
      duration: VOICE_METER_INTERVAL,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    });
    motion.start();
    return () => motion.stop();
  }, [animate, scale, target]);
  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: color, transform: [{ scaleY: scale }] }]}
    />
  );
});

export function VoiceWaveform({
  samples,
  live = false,
  progress = 0,
}: {
  samples: readonly number[];
  live?: boolean;
  progress?: number;
}) {
  const [count, setCount] = useState(24);
  const reduced = useReducedMotion();
  return (
    <View
      style={styles.wave}
      onLayout={({ nativeEvent }) =>
        setCount(Math.max(1, Math.min(56, Math.floor(nativeEvent.layout.width / 6))))
      }
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {waveformBars(samples, count, live).map((level, index) => (
        <WaveBar
          key={index}
          level={level}
          animate={live && !reduced}
          color={
            live
              ? index >= count - 4
                ? theme.colors.success
                : theme.colors.textSecondary
              : (index + 1) / count <= progress
                ? theme.colors.success
                : theme.colors.controlBorder
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wave: {
    flex: 1,
    minWidth: 0,
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  bar: { width: 3, height: HEIGHT, borderRadius: theme.radii.pill },
});
