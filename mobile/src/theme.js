// Same visual language as the web app: forest green + gold on cream.
export const colors = {
  forest: '#022c22',
  forestLight: '#064e3b',
  gold: '#eab308',
  cream: '#fdfbf7',
  white: '#ffffff',
  text: '#1f2937',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  border: '#e5e7eb',
  borderSoft: '#f0f0f0',
  green: '#16a34a',
  greenSoft: '#dcfce7',
  red: '#dc2626',
  redSoft: '#fee2e2',
  orange: '#ea580c',
  orangeSoft: '#ffedd5',
  yellowSoft: '#fef9c3',
  blue: '#2563eb',
  blueSoft: '#dbeafe',
  graySoft: '#f3f4f6',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};

export const font = {
  h1: { fontSize: 24, fontWeight: '700', color: colors.forest },
  h2: { fontSize: 18, fontWeight: '700', color: colors.forest },
  h3: { fontSize: 15, fontWeight: '700', color: colors.forest },
  body: { fontSize: 14, color: colors.text },
  small: { fontSize: 12, color: colors.textMuted },
  tiny: { fontSize: 10, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' },
};
