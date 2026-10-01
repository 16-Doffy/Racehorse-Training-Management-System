import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import RestockSheet from '../components/RestockSheet';
import {
  Badge,
  Button,
  Card,
  ChipGroup,
  ChipRow,
  EmptyState,
  IconButton,
  Loading,
  Row,
  SearchInput,
  Sheet,
} from '../components/ui';
import { inventoryApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useInventory, useRefreshAll, useStableOverview } from '../hooks/useGroomData';
import {
  INVENTORY_CATEGORY,
  RESTOCK_STATUS,
  formatDateTime,
  formatStock,
  getStockLevel,
  matchesSearch,
  refId,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const CATEGORY_ORDER = ['feed', 'medicine', 'equipment'];

/** Items with no stableBlock are shared stock; otherwise they belong to a block like "Block A". */
function isInMyArea(item, myBlocks) {
  if (!item.stableBlock) return true;
  return myBlocks.some((b) => item.stableBlock.toLowerCase().startsWith(b.toLowerCase()));
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

  const { items, isLoading } = useInventory();
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
        .map((i) => ({ ...i, level: getStockLevel(i.quantity) }))
        .filter((i) => !lowOnly || i.level.key !== 'ok')
        .sort((a, b) => {
          const rank = { critical: 0, low: 1, ok: 2 };
          const byLevel = (rank[a.level.key] ?? 2) - (rank[b.level.key] ?? 2);
          return byLevel || a.name.localeCompare(b.name, 'vi');
        }),
    [areaItems, category, search, lowOnly]
  );

  const toggleGroup = (key) =>
    setOpenGroups((open) => (open.includes(key) ? open.filter((k) => k !== key) : [...open, key]));

  const sections = useMemo(() => {
    const short = visible.filter((i) => i.level.key !== 'ok');
    const groups = CATEGORY_ORDER.map((key) => ({
      key,
      title: INVENTORY_CATEGORY[key].label,
      icon: INVENTORY_CATEGORY[key].icon,
      color: INVENTORY_CATEGORY[key].color,
      bg: INVENTORY_CATEGORY[key].bg,
      items: visible.filter((i) => i.category === key && i.level.key === 'ok'),
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

  const latestRequestFor = (item) =>
    (item.restockRequests || [])
      .filter((r) => refId(r.requestedBy) === user?._id)
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))[0];

  const lowCount = areaItems.filter((i) => getStockLevel(i.quantity).key !== 'ok').length;
  const pendingCount = myRequests.filter((r) => r.status === 'pending').length;

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
        subtitle={`${visible.length}/${areaItems.length} mặt hàng${myBlocks.length ? ` · khu ${myBlocks.join(', ')}` : ''}`}
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
              request={latestRequestFor(item)}
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
      <ProposeItemModal visible={proposing} onClose={() => setProposing(false)} blocks={myBlocks} />
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

/** One line of the storeroom: what it is, how much is left, and the way to ask for more. */
function ItemRow({ item, request, onRestock, last }) {
  const level = item.level || getStockLevel(item.quantity);
  const config = INVENTORY_CATEGORY[item.category] || {
    label: item.category,
    icon: 'supplies',
    color: colors.textMuted,
    bg: colors.graySoft,
  };
  const status = request && request.status === 'pending' ? RESTOCK_STATUS.pending : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Đề xuất bổ sung ${item.name}`}
      onPress={onRestock}
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: config.bg }]}>
        <Icon name={config.icon} size={16} color={config.color} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={font.h3} numberOfLines={1}>
          {item.name}
        </Text>
        <Row style={{ gap: 6, flexWrap: 'wrap' }}>
          <Text style={font.small}>
            {item.code ? `${item.code} · ` : ''}
            {item.stableBlock || 'Kho chung'}
          </Text>
          {status ? <Badge label={`Đã xin +${request.quantity} ${item.unit}`} color={status.color} bg={status.bg} /> : null}
          {item.isProposed ? <Badge label="Chờ duyệt" color={colors.orange} bg={colors.orangeSoft} /> : null}
        </Row>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Text style={[font.h3, { color: level.color }]}>{formatStock(item)}</Text>
        {level.key === 'ok' ? null : <Badge label={level.label} color={level.color} bg={level.bg} />}
      </View>

      <Icon name="plus" size={16} color={colors.forestLight} />
    </Pressable>
  );
}

/** Everything this groom has asked the Manager for, newest first. */
function RequestHistorySheet({ visible, onClose, requests, pendingCount }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Đề xuất của tôi">
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <Text style={font.small}>
          {requests.length === 0
            ? 'Bạn chưa gửi đề xuất nào.'
            : `${requests.length} đề xuất · ${pendingCount} đang chờ Quản lý duyệt`}
        </Text>
      </View>
      <FlatList
        data={requests}
        keyExtractor={(r) => r._id}
        style={{ maxHeight: 440 }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
        renderItem={({ item: r }) => {
          const status = RESTOCK_STATUS[r.status];
          return (
            <Row style={styles.historyRow}>
              <View style={{ flex: 1 }}>
                <Text style={font.body}>{r.item.name}</Text>
                <Text style={font.small}>
                  +{r.quantity} {r.item.unit} · {formatDateTime(r.requestedAt)}
                </Text>
                {r.note ? <Text style={font.small}>“{r.note}”</Text> : null}
              </View>
              <Badge label={status?.label || r.status} color={status?.color} bg={status?.bg} />
            </Row>
          );
        }}
      />
    </Sheet>
  );
}

/**
 * Asks for something the club does not stock yet. The Manager approves it into the catalogue —
 * until then the item shows as "chờ duyệt" with zero stock.
 */
function ProposeItemModal({ visible, onClose, blocks }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('feed');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const close = () => {
    setName('');
    setCategory('feed');
    setUnit('');
    setQuantity('');
    setNote('');
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (payload) => inventoryApi.proposeItem(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      Alert.alert('Đã gửi đề xuất', 'Quản lý CLB sẽ xem xét đưa vật tư này vào danh mục.');
      close();
    },
    onError: (err) => Alert.alert('Gửi thất bại', err?.message || 'Thử lại sau.'),
  });

  const submit = () => {
    const value = Number(quantity);
    if (!name.trim()) return Alert.alert('Thiếu tên vật tư', 'Nhập tên vật tư cần đề xuất.');
    if (!unit.trim()) return Alert.alert('Thiếu đơn vị', 'Ví dụ: kg, bó, chai, cái.');
    if (!Number.isFinite(value) || value <= 0) return Alert.alert('Số lượng chưa hợp lệ', 'Nhập một số lớn hơn 0.');
    return mutation.mutate({
      name: name.trim(),
      category,
      unit: unit.trim(),
      quantity: value,
      note: note.trim() || undefined,
      stableBlock: blocks?.[0],
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <Row style={styles.sheetHeader}>
            <Text style={font.h2}>Đề xuất vật tư mới</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </Row>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
            <Text style={font.small}>Dùng khi vật tư cần dùng chưa có trong danh mục của câu lạc bộ.</Text>

            <View>
              <Text style={styles.label}>Tên vật tư</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ví dụ: Gel bôi móng"
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <View>
              <Text style={styles.label}>Danh mục</Text>
              <ChipGroup
                options={CATEGORY_ORDER.map((value) => ({ value, label: INVENTORY_CATEGORY[value].label }))}
                value={category}
                onChange={setCategory}
                size="sm"
              />
            </View>

            <Row style={{ gap: spacing.md, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Đơn vị</Text>
                <TextInput
                  style={styles.input}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="kg, chai, cái..."
                  placeholderTextColor={colors.textFaint}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Số lượng</Text>
                <TextInput
                  style={styles.input}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  placeholder="10"
                  placeholderTextColor={colors.textFaint}
                />
              </View>
            </Row>

            <View>
              <Text style={styles.label}>Lý do cần dùng (tuỳ chọn)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Ví dụ: móng ngựa khu A khô nứt, cần bôi hằng ngày."
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <Row style={{ gap: spacing.md }}>
              <Button title="Huỷ" variant="subtle" style={{ flex: 1 }} onPress={close} />
              <Button title="Gửi đề xuất" style={{ flex: 2 }} loading={mutation.isPending} onPress={submit} />
            </Row>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  rowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
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
