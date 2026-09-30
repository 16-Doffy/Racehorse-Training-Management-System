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
import { Badge, Button, Card, ChipGroup, EmptyState, Loading, Row, SectionTitle, StatTile } from '../components/ui';
import { inventoryApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useInventory, useRefreshAll, useStableOverview } from '../hooks/useGroomData';
import {
  INVENTORY_CATEGORY,
  LOW_STOCK_THRESHOLD,
  RESTOCK_STATUS,
  formatDateTime,
  getStockLevel,
  refId,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const CATEGORIES = [
  { value: 'all', label: 'Tất cả' },
  ...Object.entries(INVENTORY_CATEGORY).map(([value, cfg]) => ({ value, label: `${cfg.emoji} ${cfg.label}` })),
];

/** Items with no stableBlock are shared stock; otherwise they belong to a block like "Block A". */
function isInMyArea(item, myBlocks) {
  if (!item.stableBlock) return true;
  return myBlocks.some((b) => item.stableBlock.toLowerCase().startsWith(b.toLowerCase()));
}

export default function SuppliesScreen() {
  const { user } = useAuth();
  const [category, setCategory] = useState('all');
  const [onlyMyArea, setOnlyMyArea] = useState(true);
  const [target, setTarget] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { items, isLoading } = useInventory();
  const { myBlocks } = useStableOverview();
  const refreshAll = useRefreshAll();

  const areaActive = onlyMyArea && myBlocks.length > 0;
  const areaItems = items.filter((i) => !areaActive || isInMyArea(i, myBlocks));
  const visible = areaItems.filter((i) => category === 'all' || i.category === category);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={font.h1}>Vật tư Khu vực</Text>
        <Text style={font.small}>
          Thức ăn, thuốc và dụng cụ tại khu vực bạn phụ trách{myBlocks.length ? ` (${myBlocks.join(', ')})` : ''}.
        </Text>
        <ChipGroup options={CATEGORIES} value={category} onChange={setCategory} />
        <Pressable onPress={() => setOnlyMyArea((v) => !v)} disabled={myBlocks.length === 0}>
          <Text style={styles.toggle}>
            {areaActive ? '☑' : '☐'} Chỉ khu vực tôi phụ trách
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <Row style={{ gap: spacing.md }}>
          <StatTile label="Đang theo dõi" value={areaItems.length} />
          <StatTile label={`Sắp hết (≤${LOW_STOCK_THRESHOLD})`} value={areaItems.filter((i) => getStockLevel(i.quantity).key === 'low').length} tint={colors.orange} />
          <StatTile label="Hết hàng" value={areaItems.filter((i) => getStockLevel(i.quantity).key === 'out').length} tint={colors.red} />
        </Row>

        {isLoading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              emoji="📦"
              text="Chưa có vật tư nào"
              hint="Quản lý CLB là người tạo danh mục vật tư."
            />
          </Card>
        ) : (
          visible.map((item) => {
            const level = getStockLevel(item.quantity);
            const cfg = INVENTORY_CATEGORY[item.category] || { label: item.category, emoji: '📦' };
            const request = latestRequestFor(item);
            const status = request ? RESTOCK_STATUS[request.status] : null;
            return (
              <Card key={item._id} style={{ gap: spacing.sm }}>
                <Row style={{ gap: spacing.md }}>
                  <Text style={{ fontSize: 24 }}>{cfg.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{item.name}</Text>
                    <Text style={font.small}>
                      {cfg.label} • {item.stableBlock || 'Kho chung'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.qty}>
                      {item.quantity} <Text style={font.small}>{item.unit}</Text>
                    </Text>
                    <Badge label={level.label} color={level.color} bg={level.bg} />
                  </View>
                </Row>
                {request && status ? (
                  <Row style={{ gap: spacing.sm }}>
                    <Badge label={status.label} color={status.color} bg={status.bg} />
                    <Text style={font.small}>
                      +{request.quantity} {item.unit} • {formatDateTime(request.requestedAt)}
                    </Text>
                  </Row>
                ) : null}
                <Button
                  title="Đề xuất bổ sung"
                  icon="+"
                  variant={level.key === 'ok' ? 'ghost' : 'primary'}
                  size="sm"
                  onPress={() => setTarget(item)}
                />
              </Card>
            );
          })
        )}

        <Card style={{ marginBottom: spacing.xxl }}>
          <SectionTitle>Lịch sử đề xuất của tôi</SectionTitle>
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
                      +{r.quantity} {r.item.unit} • {formatDateTime(r.requestedAt)}
                    </Text>
                  </View>
                  <Badge label={status?.label || r.status} color={status?.color} bg={status?.bg} />
                </Row>
              );
            })
          )}
        </Card>
      </ScrollView>

      <RestockModal item={target} visible={!!target} onClose={() => setTarget(null)} latestRequest={target ? latestRequestFor(target) : null} />
    </SafeAreaView>
  );
}

function RestockModal({ item, visible, onClose, latestRequest }) {
  const [quantity, setQuantity] = useState('');
  const queryClient = useQueryClient();

  const close = () => {
    setQuantity('');
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (value) => inventoryApi.requestRestock(item._id, value),
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
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </Row>
          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            {item ? (
              <View style={styles.itemBox}>
                <Text style={font.h3}>
                  {INVENTORY_CATEGORY[item.category]?.emoji} {item.name}
                </Text>
                <Text style={font.small}>
                  Tồn kho: {item.quantity} {item.unit} • {item.stableBlock || 'Kho chung'}
                </Text>
              </View>
            ) : null}

            {latestRequest?.status === 'pending' ? (
              <Text style={styles.warn}>
                ⚠ Bạn đã có một đề xuất đang chờ duyệt cho vật tư này (+{latestRequest.quantity} {item?.unit}).
              </Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  toggle: { ...font.small, color: colors.forest, fontWeight: '700' },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  qty: { fontSize: 18, fontWeight: '700', color: colors.forest },
  historyRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingVertical: spacing.sm, gap: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  sheetHeader: {
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  close: { fontSize: 18, color: colors.textMuted, paddingHorizontal: spacing.sm },
  itemBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSoft },
  warn: { ...font.small, color: colors.orange },
  label: { ...font.tiny, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.white,
  },
});
