import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Badge, Card, Row, SectionTitle } from './ui';
import { INVENTORY_CATEGORY, getStockLevel } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

/**
 * Everything the store holds in one category, as it stands right now.
 *
 * This is the overview question ("what do we still have?"), kept separate from the per-ration and
 * per-prescription figures, which belong to the item you opened.
 */
export default function StockCard({ title, category, items, onOpenSupplies, emptyText }) {
  const config = INVENTORY_CATEGORY[category];
  const stock = items.filter((item) => item.category === category).sort((a, b) => a.quantity - b.quantity);

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
        stock.map((item) => {
          const level = getStockLevel(item.quantity);
          return (
            <Row key={item._id} style={styles.row}>
              <View style={[styles.icon, { backgroundColor: level.bg }]}>
                <Icon name={config?.icon || 'supplies'} size={15} color={level.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font.h3} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={font.small}>{item.stableBlock || 'Kho chung'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={[font.h3, { color: level.color }]}>
                  {item.quantity} <Text style={font.small}>{item.unit}</Text>
                </Text>
                <Badge label={level.label} color={level.color} bg={level.bg} />
              </View>
            </Row>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 13 },
  row: { gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  icon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
