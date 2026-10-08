import { createContext, useContext } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { fontFamily } from '../theme';

// A custom font has one family name per weight, so `fontWeight: '700'` alone would fall back to
// the system font. Every <Text> in the app goes through here: the weight a style asks for picks
// the family, and nothing else in the code has to know.
const FAMILY_BY_WEIGHT = {
  normal: fontFamily.regular,
  '400': fontFamily.regular,
  '500': fontFamily.medium,
  '600': fontFamily.semibold,
  '700': fontFamily.bold,
  bold: fontFamily.bold,
  '800': fontFamily.extrabold,
  '900': fontFamily.extrabold,
};

function withFont(style, nested) {
  const flat = StyleSheet.flatten(style) || {};
  // A <Text> inside a <Text> inherits the parent's family unless it states its own weight.
  if (nested && flat.fontWeight === undefined && flat.fontFamily === undefined) return style;
  const family = flat.fontFamily || FAMILY_BY_WEIGHT[String(flat.fontWeight ?? '400')] || fontFamily.regular;
  // The weight lives in the family now; leaving fontWeight on would make some platforms bold it again.
  return [style, { fontFamily: family, fontWeight: 'normal' }];
}

const InText = createContext(false);

export function Text({ style, ...props }) {
  const nested = useContext(InText);
  return (
    <InText.Provider value>
      <RNText {...props} style={withFont(style, nested)} />
    </InText.Provider>
  );
}

export function TextInput({ style, ...props }) {
  return <RNTextInput {...props} style={withFont(style, false)} />;
}

export default Text;
