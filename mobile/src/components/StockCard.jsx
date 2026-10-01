import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Badge, Card, ChipRow, EmptyState, Row, SearchInput, SectionTitle, Sheet } from './ui';
import { INVENTORY_CATEGORY, formatStock, getStockLevel, matchesSearch } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const FILTERS = [
  { value: 'low', label: 'Cần bổ sung' },
  { value: 'all', label: 'Tất cả' },
];

/**
 * How the store stands in one category, without burying the day's work under it.
 *
 * A club can hold hundreds of lines, so the card itself only answers "is anything running out?" —
 * the few items that are, and a count of the rest. The whole list, searchable, is one tap away.
 */
export default function StockCard({ title, category, items, onOpenSupplies, emptyText }) {
  const config = INVENTORY_CATEGORY[category];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('low');

  const stock = useMemo(
    () =>
      items
        .filter((item) => item.category === category)
        .map((item) => ({ ...item, level: getStockLevel(item.quantity) }))
        .sort((a, b) => a.quantity - b.quantity),
    [items, category]
  );

  const low = stock.filter((item) => item.level.key !== 'ok');
  const preview = low.slice(0, 3);

  const listed = (filter === 'low' ? low : stock).filter((item) =>
    matchesSearch(`${item.name} ${item.code || ''} ${item.stableBlock || ''}`, search)
  );

  return (
    <>
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
            <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
              <Badge label={`${stock.length} loại`} />
              {low.length ? (
                <Badge label={`${low.length} cần bổ sung`} color={colors.orange} bg={colors.orangeSoft} />
              ) : (
                <Badge label="Đều còn đủ" color={colors.green} bg={colors.greenSoft} />
              )}
            </Row>

            {/* Only what is running out — the rest is noise while working. */}
            {preview.map((item) => (
              <StockRow key={item._id} item={item} icon={config?.icon} compact />
            ))}

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFilter(low.length ? 'low' : 'all');
                setSearch('');
                setOpen(true);
              }}
              style={styles.more}
            >
              <Icon name="search" size={14} color={colors.forestLight} />
              <Text style={styles.link}>Xem cả kho ({stock.length} loại)</Text>
            </Pressable>
          </>
        )}
      </Card>

      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={styles.sheetTools}>
          <SearchInput value={search} onChange={setSearch} placeholder="Tìm theo tên hoặc mã..." />
          <ChipRow
            options={[
              { ...FILTERS[0], label: `Cần bổ sung (${low.length})` },
              { ...FILTERS[1], label: `Tất cả (${stock.length})` },
            ]}
            value={filter}
            onChange={setFilter}
            size="sm"
          />
        </View>
        <FlatList
          data={listed}
          keyExtractor={(item) => item._id}
          style={styles.list}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={7}
          renderItem={({ item }) => <StockRow item={item} icon={config?.icon} />}
          ListEmptyComponent={
            <EmptyState icon="supplies" text="Không có mặt hàng nào khớp" hint="Thử xoá từ khoá hoặc chọn 'Tất cả'." />
          }
        />
      </Sheet>
    </>
  );
}

function StockRow({ item, icon, compact }) {
  const level = item.level || getStockLevel(item.quantity);
  return (
    <Row style={styles.row}>
      <View style={[styles.icon, { backgroundColor: level.bg }]}>
        <Icon name={icon || 'supplies'} size={15} color={level.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={font.h3} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={font.small} numberOfLines={1}>
          {item.code ? `${item.code} · ` : ''}
          {item.stableBlock || 'Kho chung'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[font.h3, { color: level.color }]}>{formatStock(item)}</Text>
        {compact && level.key === 'ok' ? null : <Badge label={level.label} color={level.color} bg={level.bg} />}
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 13 },
  row: { gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  icon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  sheetTools: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  list: { maxHeight: 420 },
});
