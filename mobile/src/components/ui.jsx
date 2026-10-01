import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Icon from './Icon';
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

export function SectionTitle({ children, right, style }) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <Text style={font.h2}>{children}</Text>
      {right}
    </View>
  );
}

export function Badge({ label, color = colors.textMuted, bg = colors.graySoft, style, dot }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {dot ? <View style={[styles.badgeDot, { backgroundColor: color }]} /> : null}
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
        <Row style={{ gap: 6 }}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} color={palette.fg} /> : null}
          <Text style={[styles.buttonText, size === 'sm' && styles.buttonTextSm, { color: palette.fg }]} numberOfLines={1}>
            {title}
          </Text>
        </Row>
      )}
    </Pressable>
  );
}

/** Small round tap target for header actions (bell, filter, close). */
export function IconButton({ icon, onPress, badge, label, tone = 'light' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        tone === 'dark' ? styles.iconButtonDark : styles.iconButtonLight,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={20} color={tone === 'dark' ? colors.white : colors.forest} />
      {badge > 0 ? (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Initial-letter avatar for a horse (seed data has no photos). */
export function HorseAvatar({ name, size = 44, tone = 'forest' }) {
  const bg = tone === 'forest' ? colors.forest : colors.goldSoft;
  const fg = tone === 'forest' ? colors.gold : colors.forest;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 3, backgroundColor: bg }]}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.4 }}>{name?.[0]?.toUpperCase() || '?'}</Text>
    </View>
  );
}

export function StatTile({ label, value, suffix, tint = colors.forest, icon, onPress, style }) {
  return (
    <Card style={[styles.stat, style]} onPress={onPress}>
      <View style={[styles.statStripe, { backgroundColor: tint }]} />
      <Row style={{ gap: 6 }}>
        {icon ? <Icon name={icon} size={13} color={tint} /> : null}
        <Text style={[font.tiny, { flex: 1 }]} numberOfLines={2}>
          {label}
        </Text>
      </Row>
      <View style={styles.statValueRow}>
        <Text style={[font.number, { color: tint === colors.forest ? colors.forest : tint }]}>{value}</Text>
        {suffix ? <Text style={styles.statSuffix}>{suffix}</Text> : null}
      </View>
    </Card>
  );
}

export function EmptyState({ icon = 'empty', text, hint, action }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={38} color={colors.textFaint} />
      <Text style={[font.body, { color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm }]}>{text}</Text>
      {hint ? <Text style={[font.small, { textAlign: 'center', marginTop: 4 }]}>{hint}</Text> : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
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

export function Banner({ tone = 'warning', children, style }) {
  const palette = {
    warning: { bg: colors.yellowSoft, border: '#fde68a' },
    danger: { bg: colors.redSoft, border: '#fecaca' },
    info: { bg: colors.blueSoft, border: '#bfdbfe' },
    success: { bg: colors.greenSoft, border: '#bbf7d0' },
  }[tone];
  return <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }, style]}>{children}</View>;
}

/** Chips for filters. `multiple` keeps an array, otherwise one value. */
export function ChipGroup({ options, value, onChange, multiple, size = 'md' }) {
  const selected = (key) => (multiple ? value?.includes(key) : value === key);
  return (
    <View style={styles.chipGroup}>
      {options.map((option) => {
        const label = typeof option === 'string' ? option : option.label;
        const key = typeof option === 'string' ? option : option.value;
        const count = typeof option === 'object' ? option.count : undefined;
        const active = selected(key);
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: !!active }}
            onPress={() => onChange(key)}
            style={[styles.chip, size === 'sm' && styles.chipSm, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, size === 'sm' && styles.chipTextSm, active && styles.chipTextActive]}>
              {label}
              {count !== undefined ? ` ${count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontally scrolling chips — for long filter lists that must not wrap into a wall. */
export function ChipRow(props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: spacing.lg }}>
      <ChipGroup {...props} />
    </ScrollView>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Tìm kiếm...' }) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={16} color={colors.textFaint} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Xoá tìm kiếm" onPress={() => onChange('')} hitSlop={8}>
          <Icon name="close" size={16} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Search plus a filter button, with the number of narrowed-down filters on it. Keeps one line of
 * chrome at the top of a screen instead of three rows of chips.
 */
export function FilterBar({ search, onSearch, placeholder, activeCount, onOpenFilters, right }) {
  return (
    <Row style={{ gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <SearchInput value={search} onChange={onSearch} placeholder={placeholder} />
      </View>
      {onOpenFilters ? <IconButton icon="filter" label="Bộ lọc" badge={activeCount} onPress={onOpenFilters} /> : null}
      {right}
    </Row>
  );
}

/** The filter groups behind that button: one titled chip group per axis. */
export function FilterSheet({ visible, onClose, groups, onReset }) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Bộ lọc"
      footer={
        <Row style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          {onReset ? <Button title="Đặt lại" variant="subtle" style={{ flex: 1 }} onPress={onReset} /> : null}
          <Button title="Xong" style={{ flex: 2 }} onPress={onClose} />
        </Row>
      }
    >
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {groups.map((group) => (
          <View key={group.title} style={{ gap: spacing.sm }}>
            <Text style={font.tiny}>{group.title}</Text>
            <ChipGroup options={group.options} value={group.value} onChange={group.onChange} size="sm" />
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

export function ProgressBar({ percent, tint = colors.gold, track = 'rgba(255,255,255,0.15)', height = 10 }) {
  return (
    <View style={[styles.progressTrack, { backgroundColor: track, height, borderRadius: height }]}>
      <View style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: tint, height, borderRadius: height }} />
    </View>
  );
}

/** Bottom sheet used for notifications and pickers. */
export function Sheet({ visible, title, onClose, children, footer }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} accessibilityLabel="Đóng" onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Row style={styles.sheetHeader}>
            <Text style={font.h2}>{title}</Text>
            <IconButton icon="close" label="Đóng" onPress={onClose} />
          </Row>
          {children}
          {footer}
        </View>
      </View>
    </Modal>
  );
}

export function Row({ children, style }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/** Key/value line used inside detail cards. */
export function DataRow({ label, value, valueStyle }) {
  return (
    <Row style={styles.dataRow}>
      <Text style={[font.small, { flex: 1 }]}>{label}</Text>
      <Text style={[font.body, { fontWeight: '600' }, valueStyle]}>{value}</Text>
    </Row>
  );
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
  disabled: { opacity: 0.45 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: { minHeight: 40, paddingHorizontal: spacing.md },
  buttonText: { fontSize: 15, fontWeight: '700' },
  buttonTextSm: { fontSize: 13 },
  iconButton: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconButtonLight: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  iconButtonDark: { backgroundColor: 'rgba(255,255,255,0.12)' },
  iconBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, minWidth: 0, padding: spacing.md, paddingTop: spacing.lg, gap: 4, overflow: 'hidden' },
  statStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  statValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  statSuffix: { fontSize: 12, color: colors.textFaint, paddingBottom: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipSm: { paddingHorizontal: spacing.md, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  chipTextSm: { fontSize: 12 },
  chipTextActive: { color: colors.white },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  progressTrack: { overflow: 'hidden', width: '100%' },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    paddingBottom: spacing.lg,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  sheetHeader: { justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dataRow: { justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md },
});
