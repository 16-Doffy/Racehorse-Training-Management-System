import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Icon from './Icon';
import { Badge, Card, Row, SectionTitle } from './ui';
import { INVENTORY_CATEGORY, getStockLevel } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

/**
 * Everything the store holds in one category, as it stands right now.
 *
 * This is the overview question ("what do we still have?"), kept separate from the per-ration and
 * per-prescription figures, which belong to the item you opened. It sits above the day's work, so
 * it opens folded: only what is running out shows, the rest is one tap away.
 */
export default function StockCard({ title, category, items, onOpenSupplies, emptyText }) {
  const [expanded, setExpanded] = useState(false);
  const config = INVENTORY_CATEGORY[category];
  const stock = items
    .filter((item) => item.category === category)
    .map((item) => ({ ...item, level: getStockLevel(item.quantity) }))
    .sort((a, b) => a.quantity - b.quantity);
  const short = stock.filter((item) => item.level.key !== 'ok');
  const shown = expanded ? stock : short;
  const hiddenCount = stock.length - shown.length;

  return (
    <Card>
      <SectionTitle
        right={
          onOpenSupplies ? (
            <Pressable onPress={onOpenSupplies} hitSlop={8}>
              <Text style={styles.link}>Kho vật tư →</Text>
            </Pressable>
          ) : null
        }
      >
        {title}
      </SectionTitle>

      {stock.length === 0 ? (
        <Text style={font.small}>{emptyText}</Text>
      ) : (
        <>
          {short.length === 0 && !expanded ? (
            <Row style={styles.allGood}>
              <Icon name="checkCircle" size={16} color={colors.green} />
              <Text style={[font.body, { flex: 1 }]}>Kho đủ dùng · {stock.length} mặt hàng</Text>
            </Row>
          ) : null}

          {shown.map((item) => (
            <Row key={item._id} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: item.level.bg }]}>
                <Icon name={config?.icon || 'supplies'} size={15} color={item.level.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font.h3} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={font.small}>{item.stableBlock || 'Kho chung'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={[font.h3, { color: item.level.color }]}>
                  {item.quantity} <Text style={font.small}>{item.unit}</Text>
                </Text>
                <Badge label={item.level.label} color={item.level.color} bg={item.level.bg} />
              </View>
            </Row>
          ))}

          {stock.length > short.length ? (
            <Pressable style={styles.toggle} onPress={() => setExpanded((v) => !v)} hitSlop={6}>
              <Text style={styles.link}>{expanded ? 'Thu gọn' : `Xem ${hiddenCount} mặt hàng còn đủ`}</Text>
              <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={14} color={colors.forestLight} />
            </Pressable>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 13 },
  row: { gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  allGood: { gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  icon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
});
