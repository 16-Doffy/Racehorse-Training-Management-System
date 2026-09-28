import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, shadow, spacing } from '../theme';

export function Card({ children, style, onPress }) {
  // A plain View ignores a function style, so only the Pressable branch may use one.
  const base = [styles.card, shadow.card, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={font.h2}>{children}</Text>
      {right}
    </View>
  );
}

export function Badge({ label, color = colors.textMuted, bg = colors.graySoft, style }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, size = 'md' }) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.forest, fg: colors.white },
    gold: { bg: colors.gold, fg: colors.forest },
    danger: { bg: colors.red, fg: colors.white },
    ghost: { bg: colors.white, fg: colors.forest, border: colors.border },
    subtle: { bg: colors.graySoft, fg: colors.text },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: palette.bg, borderColor: palette.border || palette.bg },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, size === 'sm' && styles.buttonTextSm, { color: palette.fg }]}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/** Round avatar with the horse's initial — the API has no photos for horses. */
export function HorseAvatar({ name, size = 44 }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: colors.gold, fontWeight: '700', fontSize: size * 0.4 }}>
        {name?.[0]?.toUpperCase() || '?'}
      </Text>
    </View>
  );
}

export function StatTile({ label, value, suffix, tint = colors.forest, onPress }) {
  return (
    <Card style={[styles.stat, { borderTopColor: tint }]} onPress={onPress}>
      <Text style={font.tiny} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {suffix ? <Text style={styles.statSuffix}>{suffix}</Text> : null}
      </View>
    </Card>
  );
}

export function EmptyState({ emoji = '📭', text, hint }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 34 }}>{emoji}</Text>
      <Text style={[font.body, { color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm }]}>{text}</Text>
      {hint ? <Text style={[font.small, { textAlign: 'center', marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

export function Loading({ text = 'Đang tải...' }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.forest} />
      <Text style={[font.small, { marginTop: spacing.sm }]}>{text}</Text>
    </View>
  );
}

export function Banner({ tone = 'warning', children }) {
  const palette = {
    warning: { bg: colors.yellowSoft, border: '#fde047' },
    danger: { bg: colors.redSoft, border: '#fecaca' },
    info: { bg: colors.blueSoft, border: '#bfdbfe' },
  }[tone];
  return <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>{children}</View>;
}

/** Single-choice chips, used for severity, symptoms and the observation form. */
export function ChipGroup({ options, value, onChange, multiple }) {
  const selected = (option) => (multiple ? value?.includes(option) : value === option);
  return (
    <View style={styles.chipGroup}>
      {options.map((option) => {
        const label = typeof option === 'string' ? option : option.label;
        const key = typeof option === 'string' ? option : option.value;
        const active = selected(key);
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: !!active }}
            onPress={() => onChange(key)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ children, style }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: { minHeight: 38, paddingHorizontal: spacing.md },
  buttonText: { fontSize: 15, fontWeight: '700' },
  buttonTextSm: { fontSize: 13 },
  avatar: { backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  // minWidth 0 lets three tiles share a narrow phone row instead of overflowing off-screen.
  stat: { flex: 1, minWidth: 0, borderTopWidth: 3, padding: spacing.md, gap: 2 },
  statValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.forest },
  statSuffix: { fontSize: 12, color: colors.textFaint, paddingBottom: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontSize: 13, color: colors.text },
  chipTextActive: { color: colors.white, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
