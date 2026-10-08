// Same visual language as the web app: forest green + gold on cream.
export const colors = {
  forest: '#022c22',
  forestLight: '#064e3b',
  forestSoft: '#ecfdf5',
  gold: '#eab308',
  goldSoft: '#fef9c3',
  cream: '#fdfbf7',
  white: '#ffffff',
  text: '#111827',
  // Both pass 4.5:1 on white and on cream (WCAG AA for body text); the old faint grey was 2.5:1.
  textMuted: '#4b5563',
  textFaint: '#6b7280',
  border: '#e5e7eb',
  borderSoft: '#f1f0ec',
  green: '#16a34a',
  greenSoft: '#dcfce7',
  red: '#dc2626',
  redSoft: '#fee2e2',
  orange: '#ea580c',
  orangeSoft: '#ffedd5',
  yellowSoft: '#fef9c3',
  blue: '#2563eb',
  blueSoft: '#dbeafe',
  purple: '#7c3aed',
  purpleSoft: '#ede9fe',
  graySoft: '#f3f4f6',
  overlay: 'rgba(2, 20, 15, 0.5)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const shadow = {
  card: {
    shadowColor: '#0f3d2e',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0f3d2e',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};

// Be Vietnam Pro: drawn for Vietnamese, so stacked diacritics (ế, ộ, ữ) keep their shape at small
// sizes. Loaded in App.js; the names are the ones @expo-google-fonts registers.
export const fontFamily = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  extrabold: 'BeVietnamPro_800ExtraBold',
};

// Type scale. Body is 15, the smallest text anywhere is 12, and nothing is set in capitals:
// capitals with Vietnamese marks are the hardest thing to read at a glance.
export const font = {
  display: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: colors.forest, letterSpacing: -0.4 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.forest, letterSpacing: -0.3 },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.forest },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  tiny: { fontSize: 12, lineHeight: 16, color: colors.textMuted, fontWeight: '600' },
  number: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.forest },
};
