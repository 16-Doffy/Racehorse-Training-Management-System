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
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
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

export const font = {
  display: { fontSize: 26, fontWeight: '800', color: colors.forest, letterSpacing: -0.5 },
  h1: { fontSize: 22, fontWeight: '800', color: colors.forest, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: '700', color: colors.forest },
  h3: { fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  small: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  tiny: { fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' },
  number: { fontSize: 24, fontWeight: '800', color: colors.forest },
};
