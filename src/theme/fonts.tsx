import { createContext, useContext, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { useFonts } from 'expo-font';
import Feather from '@expo/vector-icons/Feather';
import { WelcomeScreen } from '@/components/WelcomeScreen';

const FontsReady = createContext(false);
const fontAssets = {
  DMSans_400Regular: require('../../assets/fonts/DMSans-Regular.ttf'),
  DMSans_500Medium: require('../../assets/fonts/DMSans-Medium.ttf'),
  DMSans_600SemiBold: require('../../assets/fonts/DMSans-SemiBold.ttf'),
  FiraGO_400Regular: require('../../assets/fonts/FiraGO-Regular.ttf'),
  FiraGO_500Medium: require('../../assets/fonts/FiraGO-Medium.ttf'),
  FiraGO_600SemiBold: require('../../assets/fonts/FiraGO-SemiBold.ttf'),
  ...Feather.font,
};

export function TypographyProvider({ children }: PropsWithChildren) {
  const [loaded, error] = useFonts(fontAssets);
  if (error) throw new Error('FONT_LOAD_FAILED', { cause: error });
  if (!loaded) return <WelcomeScreen />;
  return <FontsReady value={loaded}>{children}</FontsReady>;
}

export function useAppFont(weight: string = '400', latin = false) {
  const ready = useContext(FontsReady);
  const { i18n } = useTranslation();
  // Native system faces provide softer platform typography and proper Georgian fallback.
  // Brand artwork stays independent; web keeps its existing editorial faces.
  if (Platform.OS !== 'web')
    return {
      fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
      fontWeight: weight as '400' | '500' | '600',
    };
  if (!ready) return undefined;
  const family = !latin && i18n.language.startsWith('ka') ? 'FiraGO' : 'DMSans';
  // FiraGO's Georgian strokes are optically heavier than DM Sans at the same weight.
  const opticalWeight = family === 'FiraGO' && weight === '500' ? '400' : weight;
  const face =
    opticalWeight === '600' || opticalWeight === '700'
      ? '600SemiBold'
      : opticalWeight === '500'
        ? '500Medium'
        : '400Regular';
  return { fontFamily: `${family}_${face}`, fontWeight: 'normal' as const };
}
