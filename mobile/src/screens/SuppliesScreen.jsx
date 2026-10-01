import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import {
  Badge,
  Banner,
  Button,
  Card,
  ChipGroup,
  ChipRow,
  EmptyState,
  Loading,
  Row,
  SearchInput,
  SectionTitle,
} from '../components/ui';
import { inventoryApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useInventory, useRefreshAll, useStableOverview } from '../hooks/useGroomData';
import {
  INVENTORY_CATEGORY,
  LOW_STOCK_THRESHOLD,
  RESTOCK_STATUS,
  formatDateTime,
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

export default function SuppliesScreen() {
  const { user } = useAuth();
  const [category, setCategory] = useState('all');
  const [onlyMyArea, setOnlyMyArea] = useState(true);
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState(null);
  const [proposing, setProposing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { items, isLoading } = useInventory();
  const { myBlocks } = useStableOverview();
  const refreshAll = useRefreshAll();

  const areaActive = onlyMyArea && myBlocks.length > 0;
  const areaItems = items.filter((i) => !areaActive || isInMyArea(i, myBlocks));
  const visible = areaItems
    .filter((i) => category === 'all' || i.category === category)
    .filter((i) => matchesSearch(`${i.name} ${i.stableBlock || ''}`, search));

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

  const needsAttention = visible.filter((i) => getStockLevel(i.quantity).key !== 'ok');
  const pendingCount = myRequests.filter((r) => r.status === 'pending').length;

  // Grouped by category so the store reads like a storeroom, not one long list.
  const sections = CATEGORY_ORDER.map((key) => ({
    key,
    config: INVENTORY_CATEGORY[key],
    items: visible.filter((i) => i.category === key && getStockLevel(i.quantity).key === 'ok'),
    total: visible.filter((i) => i.category === key).length,
  })).filter((section) => section.total > 0);

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
        title="Vật tư khu vực"
        subtitle={myBlocks.length ? `Khu ${myBlocks.join(', ')}` : 'Kho chung'}
        right={
          <Button title="Vật tư mới" icon="plus" variant="ghost" size="sm" onPress={() => setProposing(true)} />
        }
      />

      <View style={styles.toolbar}>
        <SearchInput value={search} onChange={setSearch} placeholder="Tìm vật tư..." />
        <ChipRow options={categoryFilters} value={category} onChange={setCategory} size="sm" />
        <Pressable onPress={() => setOnlyMyArea((v) => !v)} disabled={myBlocks.length === 0} hitSlop={6}>
          <Row style={{ gap: 6 }}>
            <Icon name={areaActive ? 'checkCircle' : 'close'} size={15} color={areaActive ? colors.green : colors.textFaint} />
            <Text style={[font.small, areaActive && { color: colors.forest, fontWeight: '700' }]}>
              Chỉ khu vực tôi phụ trách
            </Text>
          </Row>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {isLoading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="supplies"
              text={items.length === 0 ? 'Chưa có vật tư nào trong danh mục' : 'Không có vật tư nào khớp bộ lọc'}
              hint="Quản lý CLB tạo danh mục; bạn có thể đề xuất vật tư mới."
              action={<Button title="Đề xuất vật tư mới" icon="plus" onPress={() => setProposing(true)} />}
            />
          </Card>
        ) : (
          <>
            {/* What needs asking for comes first, whatever category it is in. */}
            {needsAttention.length > 0 ? (
              <Card style={styles.alertCard}>
                <SectionTitle right={<Badge label={`${needsAttention.length}`} color={colors.red} bg={colors.redSoft} />}>
                  Cần bổ sung gấp
                </SectionTitle>
                {needsAttention.map((item) => (
                  <ItemRow
                    key={item._id}
                    item={item}
                    request={latestRequestFor(item)}
                    onRestock={() => setTarget(item)}
                  />
                ))}
              </Card>
            ) : (
              <Banner tone="success">
                <Row style={{ gap: spacing.sm }}>
                  <Icon name="checkCircle" size={18} color={colors.green} />
                  <Text style={[font.body, { flex: 1 }]}>Tất cả vật tư trong khu vực đều còn đủ.</Text>
                </Row>
              </Banner>
            )}

            {sections.map((section) => (
              <Card key={section.key}>
                <SectionTitle
                  right={<Badge label={`${section.total} mặt hàng`} color={section.config.color} bg={section.config.bg} />}
                >
                  <Row style={{ gap: 6 }}>
                    <Icon name={section.config.icon} size={16} color={section.config.color} />
                    <Text style={font.h2}>{section.config.label}</Text>
                  </Row>
                </SectionTitle>
                {section.items.length === 0 ? (
                  <Text style={font.small}>Mọi mặt hàng nhóm này đang nằm ở mục cần bổ sung.</Text>
                ) : (
                  section.items.map((item) => (
                    <ItemRow key={item._id} item={item} request={latestRequestFor(item)} onRestock={() => setTarget(item)} />
                  ))
                )}
              </Card>
            ))}

            <Card style={{ marginBottom: spacing.xl }}>
              <SectionTitle right={pendingCount ? <Badge label={`${pendingCount} chờ duyệt`} color={colors.gold} bg={colors.goldSoft} /> : null}>
                Đề xuất của tôi
              </SectionTitle>
              {myRequests.length === 0 ? (
                <Text style={font.small}>Bạn chưa gửi đề xuất nào.</Text>
              ) : (
                myRequests.slice(0, 10).map((r) => {
                  const status = RESTOCK_STATUS[r.status];
                  return (
                    <Row key={r._id} style={styles.historyRow}>
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
                })
              )}
            </Card>
          </>
        )}
      </ScrollView>

      <RestockModal item={target} visible={!!target} onClose={() => setTarget(null)} latestRequest={target ? latestRequestFor(target) : null} />
      <ProposeItemModal visible={proposing} onClose={() => setProposing(false)} blocks={myBlocks} />
    </SafeAreaView>
  );
}

function ItemRow({ item, request, onRestock }) {
  const level = getStockLevel(item.quantity);
  const config = INVENTORY_CATEGORY[item.category] || { label: item.category, icon: 'supplies', color: colors.textMuted, bg: colors.graySoft };
  const status = request ? RESTOCK_STATUS[request.status] : null;

  return (
    <View style={styles.itemRow}>
      <Row style={{ gap: spacing.md }}>
        <View style={[styles.itemIcon, { backgroundColor: config.bg }]}>
          <Icon name={config.icon} size={17} color={config.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Row style={{ gap: 6 }}>
            <Text style={font.h3} numberOfLines={1}>
              {item.name}
            </Text>
            {item.isProposed ? <Badge label="Chờ duyệt" color={colors.orange} bg={colors.orangeSoft} /> : null}
          </Row>
          <Text style={font.small}>{item.stableBlock || 'Kho chung'}</Text>
          {status ? (
            <Row style={{ gap: 6, marginTop: 2 }}>
              <Badge label={status.label} color={status.color} bg={status.bg} />
              <Text style={font.small}>
                +{request.quantity} {item.unit}
              </Text>
            </Row>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[font.h3, { color: level.color }]}>
            {item.quantity} <Text style={font.small}>{item.unit}</Text>
          </Text>
          <Badge label={level.label} color={level.color} bg={level.bg} />
        </View>
      </Row>
      <Button
        title="Đề xuất bổ sung"
        icon="plus"
        variant={level.key === 'ok' ? 'ghost' : 'primary'}
        size="sm"
        style={{ marginTop: spacing.sm }}
        onPress={onRestock}
      />
    </View>
  );
}

function RestockModal({ item, visible, onClose, latestRequest }) {
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const close = () => {
    setQuantity('');
    setNote('');
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (value) => inventoryApi.requestRestock(item._id, value, note.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      Alert.alert('Đã gửi đề xuất', 'Quản lý CLB sẽ xem xét và bạn sẽ nhận được thông báo kết quả.');
      close();
    },
    onError: (err) => Alert.alert('Gửi thất bại', err?.message || 'Thử lại sau.'),
  });

  const submit = () => {
    const value = Number(quantity);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Số lượng chưa hợp lệ', 'Nhập một số lớn hơn 0.');
      return;
    }
    mutation.mutate(value);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Row style={styles.sheetHeader}>
            <Text style={font.h2}>Đề xuất bổ sung</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Icon name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </Row>
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            {item ? (
              <Row style={styles.itemBox}>
                <View style={{ flex: 1 }}>
                  <Text style={font.h3}>{item.name}</Text>
                  <Text style={font.small}>{item.stableBlock || 'Kho chung'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={font.tiny}>Tồn kho</Text>
                  <Text style={font.h3}>
                    {item.quantity} {item.unit}
                  </Text>
                </View>
              </Row>
            ) : null}

            {latestRequest?.status === 'pending' ? (
              <Banner tone="warning">
                <Text style={font.small}>
                  Bạn đã có một đề xuất đang chờ duyệt cho vật tư này (+{latestRequest.quantity} {item?.unit}).
                </Text>
              </Banner>
            ) : null}

            <View>
              <Text style={styles.label}>Số lượng cần bổ sung ({item?.unit})</Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder="Ví dụ: 20"
                placeholderTextColor={colors.textFaint}
                autoFocus
              />
            </View>

            <View>
              <Text style={styles.label}>Ghi chú cho quản lý (tuỳ chọn)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Ví dụ: dùng cho đợt điều trị của Thunder Bolt."
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <Row style={{ gap: spacing.md }}>
              <Button title="Huỷ" variant="subtle" style={{ flex: 1 }} onPress={close} />
              <Button title="Gửi đề xuất" style={{ flex: 2 }} loading={mutation.isPending} onPress={submit} />
            </Row>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Asks for something the club does not stock yet. The Manager approves it into the catalogue —
 * until then the item shows as "chờ duyệt" with zero stock.
 */
function ProposeItemModal({ visible, onClose, blocks }) {
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
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
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  alertCard: { borderLeftWidth: 4, borderLeftColor: colors.red },
  itemRow: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  itemIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
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
  itemBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSoft },
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
