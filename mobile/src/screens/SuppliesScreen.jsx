import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import RestockSheet from '../components/RestockSheet';
import ProposeItemSheet from '../components/ProposeItemSheet';
import { Badge, Button, Card, ChipRow, EmptyState, IconButton, LoadError, Loading, Row, SearchInput, Sheet } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useInventory, useRefreshAll, useStableOverview } from '../hooks/useGroomData';
import {
  FEED_TYPE,
  INVENTORY_CATEGORY,
  approvedOf,
  areaKey,
  deliveryBlocks,
  formatDate,
  formatDateTime,
  formatDays,
  isOpenRequest,
  levelOf,
  matchesSearch,
  packsText,
  parseStableBlock,
  refId,
  restockState,
} from '../utils/groom';

// What needs attention first: expired or empty, then running low, then nearing expiry.
const LEVEL_RANK = { expired: 0, out: 0, low: 1, expiring: 2, ok: 3 };
import { colors, font, radius, spacing } from '../theme';

const CATEGORY_ORDER = ['feed', 'medicine', 'equipment'];

/**
 * Items with no stableBlock are shared stock; otherwise they belong to a block like "Block A", which
 * is the same area as "Khu A" and the zone of stall "A-03".
 */
function isInMyArea(item, myBlocks) {
  if (!item.stableBlock) return true;
  const area = areaKey(parseStableBlock(item.stableBlock).block);
  return myBlocks.some((b) => areaKey(b) === area);
}

/**
 * The storeroom. A club can hold hundreds of lines, so this is one scrolling list of short rows —
 * search and filters narrow it, what is running out floats to the top, and a row opens the request
 * to the Manager. Nothing here is a wall of cards.
 */
export default function SuppliesScreen() {
  const { user } = useAuth();
  const [category, setCategory] = useState('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [onlyMyArea, setOnlyMyArea] = useState(true);
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState(null);
  const [proposing, setProposing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Every group starts folded: the screen opens as four lines, and you open what you need.
  const [openGroups, setOpenGroups] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const { items, isLoading, isError, refetch } = useInventory();
  const { myBlocks } = useStableOverview();
  const refreshAll = useRefreshAll();

  const areaActive = onlyMyArea && myBlocks.length > 0;
  const areaItems = useMemo(
    () => items.filter((i) => !areaActive || isInMyArea(i, myBlocks)),
    [items, areaActive, myBlocks]
  );

  // Low stock first, then by name: the list answers "what do I need to ask for?" before anything else.
  const visible = useMemo(
    () =>
      areaItems
        .filter((i) => category === 'all' || i.category === category)
        .filter((i) => matchesSearch(`${i.name} ${i.code || ''} ${i.stableBlock || ''}`, search))
        .map((i) => ({ ...i, level: levelOf(i) }))
        .filter((i) => !lowOnly || i.level.short)
        .sort((a, b) => {
          const byLevel = (LEVEL_RANK[a.level.key] ?? 3) - (LEVEL_RANK[b.level.key] ?? 3);
          return byLevel || a.name.localeCompare(b.name, 'vi');
        }),
    [areaItems, category, search, lowOnly]
  );

  const toggleGroup = (key) =>
    setOpenGroups((open) => (open.includes(key) ? open.filter((k) => k !== key) : [...open, key]));

  const sections = useMemo(() => {
    const short = visible.filter((i) => i.level.short);
    const groups = CATEGORY_ORDER.map((key) => ({
      key,
      title: INVENTORY_CATEGORY[key].label,
      icon: INVENTORY_CATEGORY[key].icon,
      color: INVENTORY_CATEGORY[key].color,
      bg: INVENTORY_CATEGORY[key].bg,
      items: visible.filter((i) => i.category === key && !i.level.short),
    })).filter((g) => g.items.length);
    return [
      ...(short.length
        ? [{ key: 'short', title: 'Cần bổ sung', icon: 'warning', color: colors.red, bg: colors.redSoft, items: short }]
        : []),
      ...groups,
    ].map((group) => ({ ...group, data: openGroups.includes(group.key) ? group.items : [] }));
  }, [visible, openGroups]);

  const myRequests = useMemo(
    () =>
      items
        .flatMap((item) =>
          (item.restockRequests || [])
            .filter((r) => refId(r.requestedBy) === user?._id)
            .map((r) => ({ ...r, item }))
        )
        .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)),
    [items, user?._id]
  );

  // The groom's latest request still with the Manager for this item (asked, or ordered and on its way).
  const openRequestFor = (item) =>
    (item.restockRequests || [])
      .filter((r) => refId(r.requestedBy) === user?._id && isOpenRequest(r))
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))[0];

  const lowCount = areaItems.filter((i) => levelOf(i).short).length;
  // The real zones the groom works in, not the free text of hand-written stalls.
  const zones = deliveryBlocks(myBlocks);
  const zonesLabel = zones.length ? zones.join(', ') : '';
  // Still in the Manager's hands: waiting for a decision, or approved and waiting for the delivery.
  const pendingCount = myRequests.filter(isOpenRequest).length;

  const categoryFilters = [
    { value: 'all', label: 'Tất cả', count: areaItems.length },
    ...CATEGORY_ORDER.map((key) => ({
      value: key,
      label: INVENTORY_CATEGORY[key].label,
      count: areaItems.filter((i) => i.category === key).length,
    })),
  ];

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="Kho vật tư"
        subtitle={`${areaItems.length} mặt hàng${lowCount ? ` · ${lowCount} cần bổ sung` : ''}${pendingCount ? ` · ${pendingCount} đề xuất đang chờ` : ''}${zonesLabel ? ` · ${zonesLabel}` : ''}`}
        right={
          <Row style={{ gap: spacing.sm }}>
            <IconButton
              icon="clock"
              label="Đề xuất của tôi"
              badge={pendingCount}
              onPress={() => setHistoryOpen(true)}
            />
            <IconButton icon="plus" label="Đề xuất vật tư mới" onPress={() => setProposing(true)} />
          </Row>
        }
      />

      <View style={styles.toolbar}>
        <SearchInput value={search} onChange={setSearch} placeholder="Tìm theo tên hoặc mã vật tư..." />
        <ChipRow options={categoryFilters} value={category} onChange={setCategory} size="sm" />
        <Row style={{ gap: spacing.lg }}>
          <Toggle
            on={lowOnly}
            label={`Chỉ món cần bổ sung${lowCount ? ` (${lowCount})` : ''}`}
            tint={colors.red}
            onPress={() => setLowOnly((v) => !v)}
          />
          <Toggle
            on={areaActive}
            label="Khu của tôi"
            disabled={myBlocks.length === 0}
            onPress={() => setOnlyMyArea((v) => !v)}
          />
        </Row>
      </View>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <View style={styles.content}>
          <LoadError text="Không tải được kho vật tư" onRetry={() => refetch()} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          initialNumToRender={12}
          windowSize={9}
          removeClippedSubviews
          renderSectionHeader={({ section }) => {
            const open = section.data.length > 0;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${section.title}, ${section.items.length} mặt hàng`}
                onPress={() => toggleGroup(section.key)}
                style={({ pressed }) => [
                  styles.groupHeader,
                  section.key === 'short' && styles.groupHeaderAlert,
                  !open && styles.groupHeaderClosed,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.groupIcon, { backgroundColor: section.bg }]}>
                  <Icon name={section.icon} size={15} color={section.color} />
                </View>
                <Text style={[font.h3, { flex: 1 }]}>{section.title}</Text>
                <Badge
                  label={`${section.items.length} mặt hàng`}
                  color={section.key === 'short' ? colors.red : colors.textMuted}
                  bg={section.key === 'short' ? colors.redSoft : colors.graySoft}
                />
                <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} color={colors.textFaint} />
              </Pressable>
            );
          }}
          renderSectionFooter={() => <View style={styles.groupFooter} />}
          renderItem={({ item, index, section }) => (
            <ItemRow
              item={item}
              request={openRequestFor(item)}
              last={index === section.data.length - 1}
              onRestock={() => setTarget(item)}
            />
          )}
          ListEmptyComponent={
            <Card>
              <EmptyState
                icon="supplies"
                text={items.length === 0 ? 'Chưa có vật tư nào trong danh mục' : 'Không có vật tư nào khớp bộ lọc'}
                hint="Quản lý CLB tạo danh mục; bạn có thể đề xuất vật tư mới."
                action={<Button title="Đề xuất vật tư mới" icon="plus" onPress={() => setProposing(true)} />}
              />
            </Card>
          }
        />
      )}

      <RestockSheet request={target ? { item: target } : null} visible={!!target} onClose={() => setTarget(null)} />
      <RequestHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        requests={myRequests}
        pendingCount={pendingCount}
      />
      <ProposeItemSheet visible={proposing} onClose={() => setProposing(false)} blocks={myBlocks} items={items} onUseExisting={(item) => setTarget(item)} />
    </SafeAreaView>
  );
}

/** A filter you switch on and off, next to the chips that pick one value out of several. */
function Toggle({ on, label, onPress, disabled, tint = colors.forest }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6}>
      <Row style={{ gap: 6 }}>
        <Icon name={on ? 'checkCircle' : 'circle'} size={15} color={on ? tint : colors.textFaint} />
        <Text style={[font.small, on && { color: tint, fontWeight: '700' }]}>{label}</Text>
      </Row>
    </Pressable>
  );
}

/**
 * One line of the storeroom, in full: the name (on two lines if it needs them), its code, place and
 * kind, then how much is left — in its unit and in packs — how many days that lasts, its expiry, and
 * any request of mine still open; "Xin thêm" asks for more. The line opens the item in full too.
 */
function ItemRow({ item, request, onRestock, last }) {
  const level = levelOf(item);
  const config = INVENTORY_CATEGORY[item.category] || {
    label: item.category,
    icon: 'supplies',
    color: colors.textMuted,
    bg: colors.graySoft,
  };
  const feed = item.category === 'feed' ? FEED_TYPE[item.feedType] : null;
  // Asked for, or approved and on its way — either way it is not on the shelf yet.
  const status = request ? restockState(request) : null;
  const packs = packsText(item);
  const days = item.dailyUsage ? (item.daysLeft != null ? formatDays(item.daysLeft) : null) : null;

  // Two touch targets side by side, never nested: the line opens the item, the button asks for more.
  return (
    <View style={[styles.row, last && styles.rowLast]}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, còn ${item.quantity} ${item.unit}, ${level.label}`}
      onPress={onRestock}
      style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: config.bg }]}>
        <Icon name={config.icon} size={16} color={config.color} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={font.small} numberOfLines={1}>
          {[item.code, item.stableBlock || 'Kho chung', feed?.label].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[styles.stock, { color: level.short ? level.color : colors.text }]}>
          Còn {item.quantity} {item.unit}
          {packs ? <Text style={styles.stockPacks}> ({packs})</Text> : null}
          {level.key !== 'ok' ? <Text style={{ color: level.color }}> · {level.label}</Text> : null}
        </Text>
      </View>
    </Pressable>
      {/* The state in badges, and the button beside them — the line above keeps the whole width. */}
      <Row style={styles.rowFoot}>
        <Row style={{ flex: 1, gap: 6, flexWrap: 'wrap' }}>
          {days ? <Badge label={`Đủ ${days}`} color={item.daysLeft < 3 ? colors.red : colors.textMuted} bg={item.daysLeft < 3 ? colors.redSoft : colors.graySoft} /> : null}
          {item.expiryDate ? <Badge label={`HSD ${formatDate(item.expiryDate)}`} color={level.key === 'expired' || level.key === 'expiring' ? level.color : colors.textMuted} bg={level.key === 'expired' || level.key === 'expiring' ? level.bg : colors.graySoft} /> : null}
          {status ? (
            <Badge
              label={`${status.key === 'approved' ? 'Chờ hàng về' : request.priority === 'urgent' ? 'Đã xin khẩn' : 'Đã xin'} +${status.key === 'approved' ? approvedOf(request) : request.quantity} ${item.unit}`}
              color={status.color}
              bg={status.bg}
            />
          ) : null}
          {item.isProposed ? <Badge label="Chờ duyệt" color={colors.orange} bg={colors.orangeSoft} /> : null}
        </Row>
        <Button title="Xin thêm" icon="plus" size="sm" variant={level.short ? 'danger' : 'ghost'} style={styles.askBtn} onPress={onRestock} />
      </Row>
    </View>
  );
}

const REQUEST_FILTERS = [
  { value: 'open', label: 'Đang xử lý' },
  { value: 'all', label: 'Tất cả' },
];

/**
 * Everything this groom has asked the Manager for, newest first, with where each one stands:
 * waiting for a decision, approved and on its way (not usable yet), received (with how much
 * actually arrived), or rejected (with the Manager's reason).
 */
function RequestHistorySheet({ visible, onClose, requests, pendingCount }) {
  const [filter, setFilter] = useState('open');
  const awaiting = requests.filter((r) => restockState(r).key === 'approved').length;
  const shown = filter === 'open' ? requests.filter(isOpenRequest) : requests;

  return (
    <Sheet visible={visible} onClose={onClose} title="Đề xuất của tôi">
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <Text style={font.small}>
          {requests.length === 0
            ? 'Bạn chưa gửi đề xuất nào.'
            : `${requests.length} đề xuất · ${pendingCount - awaiting} chờ duyệt · ${awaiting} đã duyệt, chờ hàng về`}
        </Text>
        {requests.length > 0 ? (
          <ChipRow
            options={REQUEST_FILTERS.map((f) => ({ ...f, count: f.value === 'open' ? pendingCount : requests.length }))}
            value={filter}
            onChange={setFilter}
            size="sm"
          />
        ) : null}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(r) => r._id}
        style={{ maxHeight: 440 }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
        ListEmptyComponent={
          requests.length ? <EmptyState icon="supplies" text="Không có đề xuất nào đang chờ xử lý" /> : null
        }
        renderItem={({ item: r }) => {
          const status = restockState(r);
          return (
            <Row style={[styles.historyRow, { alignItems: 'flex-start' }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                  <Text style={font.body}>{r.item.name}</Text>
                  {r.priority === 'urgent' ? <Badge label="Khẩn" color={colors.red} bg={colors.redSoft} /> : null}
                </Row>
                <Text style={font.small}>
                  Xin +{r.quantity} {r.item.unit}
                  {r.destinationBlock ? ` · cho ${r.destinationBlock}` : ''} · {formatDateTime(r.requestedAt)}
                </Text>
                {r.task ? <Text style={[font.small, { color: colors.red }]}>Gửi từ một việc đang bị chặn vì thiếu vật tư</Text> : null}
                {r.note ? <Text style={font.small}>“{r.note}”</Text> : null}
                {status.key === 'approved' ? (
                  <Text style={[font.small, { color: colors.blue }]}>
                    {status.partial
                      ? `Quản lý duyệt ${approvedOf(r)}/${r.quantity} ${r.item.unit} — kho chỉ tăng khi hàng về.`
                      : 'Đã duyệt — kho chỉ tăng khi Quản lý nhận hàng về.'}
                  </Text>
                ) : null}
                {r.status === 'received' ? (
                  <Text style={[font.small, { color: colors.green }]}>
                    Đã nhận {r.receivedQty ?? r.quantity} {r.item.unit}
                    {r.receivedAt ? ` · ${formatDateTime(r.receivedAt)}` : ''}
                    {r.receivedQty !== null && r.receivedQty !== undefined && r.receivedQty !== r.quantity
                      ? ` (xin ${r.quantity}${r.approvedQuantity != null && r.approvedQuantity !== r.quantity ? `, duyệt ${r.approvedQuantity}` : ''})`
                      : ''}
                  </Text>
                ) : null}
                {r.reviewNote ? (
                  <Text style={[font.small, { color: r.status === 'rejected' ? colors.red : colors.textMuted }]}>
                    Quản lý: {r.reviewNote}
                  </Text>
                ) : null}
              </View>
              <Badge label={status.label} color={status.color} bg={status.bg} />
            </Row>
          );
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderSoft,
  },
  groupHeaderAlert: { borderColor: colors.redSoft, backgroundColor: colors.redSoft },
  groupHeaderClosed: { borderBottomWidth: 1, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  groupIcon: { width: 26, height: 26, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  groupFooter: { height: spacing.md },
  // A line is the item (full width) over its badges and button.
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderSoft,
    borderTopColor: colors.borderSoft,
  },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowFoot: { gap: spacing.sm, paddingLeft: 34 + spacing.md, alignItems: 'center' },
  rowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  itemName: { fontSize: 15, fontWeight: '800', color: colors.text, lineHeight: 20 },
  stock: { fontSize: 14, fontWeight: '800' },
  stockPacks: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  askBtn: { alignSelf: 'center', minWidth: 0, paddingHorizontal: 10 },
  historyRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft, gap: spacing.sm },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '90%' },
  sheetHeader: {
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  label: { ...font.tiny, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.white,
  },
  inputMultiline: { minHeight: 76, paddingTop: spacing.md, fontSize: 15, textAlignVertical: 'top' },
});
