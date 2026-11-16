import { createContext, forwardRef, useContext } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';

/**
 * The app's typeface, Be Vietnam Pro — drawn for Vietnamese, its marks clear at small sizes — on every
 * Text and TextInput. A custom font comes as one family per weight (Android ignores fontWeight with
 * it), so the weight a style asks for picks the family. Bold (700) reads as SemiBold and only the
 * heaviest (800, 900) as Bold: the screens were written for the loud system bold.
 */
export const FONT = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
};

const BY_WEIGHT = {
  100: FONT.regular,
  200: FONT.regular,
  300: FONT.regular,
  400: FONT.regular,
  normal: FONT.regular,
  500: FONT.medium,
  600: FONT.semibold,
  700: FONT.semibold,
  bold: FONT.semibold,
  800: FONT.bold,
  900: FONT.bold,
};

// The family of the Text around this one: a nested Text with no weight of its own keeps it, as text does.
const Around = createContext(null);

/** The style without its weight, and the family that weight (or the text around) calls for. */
function resolve(style, around) {
  const flat = StyleSheet.flatten(style) || {};
  const { fontWeight, ...rest } = flat;
  const family = flat.fontFamily || (fontWeight != null ? BY_WEIGHT[String(fontWeight)] || FONT.regular : around || FONT.regular);
  return { family, style: [rest, { fontFamily: family }] };
}

export const Text = forwardRef(function AppText({ style, ...props }, ref) {
  const { family, style: resolved } = resolve(style, useContext(Around));
  return (
    <Around.Provider value={family}>
      <RNText ref={ref} {...props} style={resolved} />
    </Around.Provider>
  );
});

export const TextInput = forwardRef(function AppTextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={resolve(style, null).style} />;
});
