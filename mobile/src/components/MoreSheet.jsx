import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Icon from './Icon';
import { Sheet } from './ui';
import { colors, font, radius, spacing } from '../theme';

/**
 * The screens that don't fit on the tab bar, one tap away. Each entry says what it is for, so the
 * groom doesn't have to remember which tab hides what.
 */
export default function MoreSheet({ visible, onClose, items, active, onSelect }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Chức năng khác">
      <View style={styles.list}>
        {items.map((item) => {
          const isActive = item.route === active;
          return (
            <Pressable
              key={item.route}
              onPress={() => onSelect(item)}
              style={({ pressed }) => [styles.item, isActive && styles.itemActive, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.icon, { backgroundColor: item.bg }]}>
                <Icon name={item.icon} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{item.label}</Text>
                <Text style={font.small} numberOfLines={1}>
                  {item.hint}
                </Text>
              </View>
              {item.badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
                </View>
              ) : null}
              <Icon name="chevronRight" size={16} color={colors.textFaint} />
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.white,
  },
  itemActive: { borderColor: colors.forest, backgroundColor: colors.forestSoft },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  badge: {
    backgroundColor: colors.red,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
});
