import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from './Icon';
import { Badge, Banner, Button, Row, Sheet } from './ui';
import { inventoryApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useStableOverview } from '../hooks/useGroomData';
import {
  FEED_TYPE,
  INVENTORY_CATEGORY,
  approvedOf,
  deliveryBlocks,
  describeTask,
  formatDate,
  formatDays,
  isOpenRequest,
  levelOf,
  packsText,
  parseStableBlock,
  refId,
  restockState,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

// The request's destination when it is for the shared store rather than one block.
const MAIN_STORE = '__main__';
// Reasons a groom gives most, one tap each; they add to the note rather than replace it.
const REASONS = ['Sắp hết', 'Đã hết', 'Sắp hết hạn', 'Dùng cho đợt điều trị', 'Có ngựa mới về'];
const num = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * One stock item in full, and asking the Manager for more of it.
 *
 * The top is the item as the storeroom has it — how much is left (and in packs), the minimum, how
 * many days it lasts, its expiry, how it is bought — and any request of mine still open. The form
 * under it is made for a thumb: packs or units, − and + with quick amounts and a suggestion, what the
 * stock will be once it arrives, normal or urgent, where it goes, and reasons one tap away.
 *
 * Opened from the storeroom, or from a meal or dose that cannot be recorded for lack of supplies — then
 * the request carries the task, so the Manager sees which work is blocked, the amount is filled with
 * what is short and it is urgent. Nothing changes in stock until the Manager approves and receives it.
 */
export default function RestockSheet({ request, visible, onClose }) {
  const { user } = useAuth();
  const { myBlocks, assignmentByHorseId } = useStableOverview();
  const { item, task, missing } = request || {};
  const packed = !!(item?.packUnit && item?.packSize);
  // A request of mine already with the Manager for this item: asking again only if more is needed.
  const already = (item?.restockRequests || []).filter((r) => refId(r.requestedBy) === user?._id && isOpenRequest(r));
  const [mode, setMode] = useState(packed ? 'packs' : 'units');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('normal');
  const [destination, setDestination] = useState(MAIN_STORE);
  const queryClient = useQueryClient();

  // Where it should go: the zone of the horse whose work is blocked, else the groom's own zones.
  const taskBlock = task ? parseStableBlock(assignmentByHorseId.get(refId(task.horse))?.stableBlock || '').block : null;
  const blocks = deliveryBlocks([taskBlock, ...myBlocks]);

  // What would bring the stock back to twice its minimum, in the unit chosen (whole packs).
  const suggestFor = (m) => {
    if (!item || !(item.reorderLevel > 0)) return null;
    const need = item.reorderLevel * 2 - item.quantity;
    if (need <= 0) return null;
    return m === 'packs' && packed ? Math.max(1, Math.ceil(need / item.packSize)) : Math.ceil(need);
  };

  // Pre-fill with the shortfall, rounded up to whole packs when the item is sold in packs.
  useEffect(() => {
    if (!visible || !item) return;
    const short = missing?.find((m) => String(m.inventoryItem) === String(item._id))?.short;
    setMode(packed ? 'packs' : 'units');
    // Work that is waiting on it is urgent by default; the groom can still say otherwise.
    setPriority(task ? 'urgent' : 'normal');
    setDestination(blocks[0] || MAIN_STORE);
    setNote(task ? `Thiếu để làm việc ${describeTask(task).label.toLowerCase()} cho ${task.horse?.name || 'ngựa'}.` : '');
    if (!short) {
      setAmount('');
      return;
    }
    setAmount(packed ? String(Math.max(1, Math.ceil(short / item.packSize))) : String(short));
  }, [visible, item, task, missing, packed]);

  const close = () => {
    setAmount('');
    setNote('');
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (payload) => inventoryApi.requestRestock(item._id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['care-plan'] });
      Alert.alert(
        'Đã gửi đề xuất',
        `${task ? 'Quản lý sẽ thấy việc này đang bị chặn vì thiếu vật tư. ' : ''}Theo dõi ở "Đề xuất của tôi" trong Kho; kho chỉ tăng khi Quản lý nhận hàng về.`
      );
      close();
    },
    onError: (err) => Alert.alert('Gửi thất bại', err?.message || 'Thử lại sau.'),
  });

  if (!item) return <Sheet visible={visible} onClose={onClose} title="Đề xuất bổ sung" />;

  const level = levelOf(item);
  const category = INVENTORY_CATEGORY[item.category];
  const feed = item.category === 'feed' ? FEED_TYPE[item.feedType] : null;
  const unitOf = (m) => (m === 'packs' ? item.packUnit : item.unit);
  const value = Number(String(amount).replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0;
  const inUnits = valid ? (mode === 'packs' && packed ? value * item.packSize : value) : 0;
  const suggestion = suggestFor(mode);
  // Quick amounts: a few packs, or a few of the pack size (or the minimum) in units.
  const base = mode === 'packs' ? 1 : item.packSize || (item.reorderLevel > 0 ? item.reorderLevel : 1);
  const quick = [1, 2, 5, 10].map((n) => num(n * base));
  const step = mode === 'packs' ? 1 : item.packSize || 1;
  const setValue = (v) => setAmount(v > 0 ? String(num(v)) : '');
  const switchMode = (m) => {
    if (m === mode) return;
    // Keep the amount meaning the same when switching between packs and units.
    if (valid && packed) setValue(m === 'packs' ? Math.ceil(value / item.packSize) : value * item.packSize);
    setMode(m);
  };
  const addReason = (r) => setNote((n) => (n.includes(r) ? n : n.trim() ? `${n.trim()}; ${r.toLowerCase()}` : r));

  const submit = () => {
    if (!valid) {
      Alert.alert('Chưa nhập số lượng', 'Chọn hoặc nhập số lượng cần xin (lớn hơn 0).');
      return;
    }
    mutation.mutate({
      ...(mode === 'packs' ? { packs: value } : { quantity: value }),
      note: note.trim() || undefined,
      task: task?._id,
      priority,
      destinationBlock: destination === MAIN_STORE ? undefined : destination,
    });
  };

  const facts = [
    ['Mức tối thiểu', item.reorderLevel > 0 ? `${num(item.reorderLevel)} ${item.unit}` : 'Chưa đặt'],
    ['Đủ dùng', item.dailyUsage ? `${item.daysLeft != null ? formatDays(item.daysLeft) : '—'} (dùng ${num(item.dailyUsage)} ${item.unit}/ngày)` : 'Chưa có khẩu phần/đơn dùng'],
    ['Hạn dùng', item.expiryDate ? formatDate(item.expiryDate) : 'Không ghi'],
    ['Quy cách', packed ? `1 ${item.packUnit} = ${num(item.packSize)} ${item.unit}` : `Mua lẻ theo ${item.unit}`],
    ['Nơi để', item.stableBlock || 'Kho chung'],
  ];

  return (
    <Sheet visible={visible} onClose={close} title="Xin bổ sung vật tư">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* The item, as the storeroom has it. */}
        <View style={styles.itemCard}>
          <Row style={{ gap: spacing.md, alignItems: 'flex-start' }}>
            <View style={[styles.itemIcon, { backgroundColor: category?.bg || colors.graySoft }]}>
              <Icon name={category?.icon || 'supplies'} size={20} color={category?.color || colors.textMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                {item.code ? <Badge label={item.code} /> : null}
                {category ? <Badge label={category.label} color={category.color} bg={category.bg} /> : null}
                {feed ? <Badge label={feed.label} color={feed.color} bg={feed.bg} /> : null}
              </Row>
              {item.description ? <Text style={font.small}>{item.description}</Text> : null}
            </View>
          </Row>

          <View style={[styles.stockBox, { borderColor: level.short ? level.bg : colors.borderSoft, backgroundColor: level.short ? `${level.bg}` : colors.cream }]}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Text style={font.tiny}>Đang có trong kho</Text>
                <Text style={[styles.stockValue, { color: level.color }]}>
                  {num(item.quantity)} {item.unit}
                </Text>
                {packsText(item) ? <Text style={font.small}>= {packsText(item)}</Text> : null}
              </View>
              <Badge label={level.label} color={level.color} bg={level.short ? colors.white : level.bg} />
            </Row>
          </View>

          <View style={{ gap: 4 }}>
            {facts.map(([label, text]) => (
              <Row key={label} style={{ justifyContent: 'space-between', gap: spacing.md }}>
                <Text style={font.small}>{label}</Text>
                <Text style={styles.factValue}>{text}</Text>
              </Row>
            ))}
          </View>
        </View>

        {task ? (
          <Banner tone="danger">
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="warning" size={16} color={colors.red} />
              <View style={{ flex: 1 }}>
                <Text style={font.body}>
                  Đang chặn việc {describeTask(task).label.toLowerCase()} cho {task.horse?.name}
                </Text>
                {missing?.length ? <Text style={font.small}>{missing.map((m) => `${m.name}: cần ${m.needed} ${m.unit}, còn ${m.available} ${m.unit}`).join(' · ')}</Text> : null}
              </View>
            </Row>
          </Banner>
        ) : null}

        {already.length ? (
          <Banner tone="info">
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="clock" size={16} color={colors.blue} />
              <Text style={[font.small, { flex: 1, color: colors.text }]}>
                Bạn đã xin mặt hàng này:{' '}
                {already.map((r) => `+${restockState(r).key === 'approved' ? approvedOf(r) : r.quantity} ${item.unit} (${restockState(r).label.toLowerCase()})`).join(', ')}. Chỉ gửi thêm
                nếu cần nhiều hơn.
              </Text>
            </Row>
          </Banner>
        ) : null}

        {/* How much: packs or units, − / +, quick amounts and a suggestion. */}
        <View style={styles.section}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.label}>Xin thêm bao nhiêu?</Text>
            {packed ? (
              <View style={styles.modeSwitch}>
                {['packs', 'units'].map((m) => (
                  <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: mode === m }} onPress={() => switchMode(m)} style={[styles.modeOption, mode === m && styles.modeOptionOn]}>
                    <Text style={[styles.modeText, mode === m && { color: colors.white }]}>Theo {unitOf(m)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Row>
          <Row style={{ gap: spacing.sm }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Bớt" onPress={() => setValue((valid ? value : 0) - step)} style={styles.stepBtn}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <View style={styles.amountBox}>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="0"
                placeholderTextColor={colors.textFaint}
                accessibilityLabel={`Số lượng theo ${unitOf(mode)}`}
              />
              <Text style={styles.amountUnit}>{unitOf(mode)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Thêm" onPress={() => setValue((valid ? value : 0) + step)} style={styles.stepBtn}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </Row>
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            {suggestion ? (
              <Pressable accessibilityRole="button" onPress={() => setValue(suggestion)} style={[styles.quick, styles.quickSuggest, value === suggestion && styles.quickOn]}>
                <Icon name="flag" size={12} color={value === suggestion ? colors.white : colors.forest} />
                <Text style={[styles.quickText, { color: value === suggestion ? colors.white : colors.forest }]}>
                  Gợi ý {suggestion} {unitOf(mode)}
                </Text>
              </Pressable>
            ) : null}
            {quick.map((qv) => (
              <Pressable key={qv} accessibilityRole="button" onPress={() => setValue(qv)} style={[styles.quick, value === qv && styles.quickOn]}>
                <Text style={[styles.quickText, value === qv && { color: colors.white }]}>
                  {qv} {unitOf(mode)}
                </Text>
              </Pressable>
            ))}
          </Row>
          {valid ? (
            <Text style={styles.after}>
              {mode === 'packs' && packed ? `= ${num(inUnits)} ${item.unit} · ` : ''}Hàng về, kho sẽ có <Text style={{ fontWeight: '800' }}>{num(item.quantity + inUnits)} {item.unit}</Text>
              {packsText(item, item.quantity + inUnits) ? ` (${packsText(item, item.quantity + inUnits)})` : ''}
            </Text>
          ) : suggestion ? (
            <Text style={styles.after}>Gợi ý đưa kho lên khoảng gấp đôi mức tối thiểu.</Text>
          ) : null}
        </View>

        {/* How soon, and where to. */}
        <View style={styles.section}>
          <Text style={styles.label}>Mức độ cần</Text>
          <Row style={{ gap: spacing.sm }}>
            {[
              { value: 'normal', label: 'Bình thường', hint: 'Đặt cùng đợt mua tới', icon: 'clock' },
              { value: 'urgent', label: 'Khẩn', hint: 'Đang hoặc sắp chặn việc', icon: 'warning' },
            ].map((p) => {
              const on = priority === p.value;
              const tone = p.value === 'urgent' ? colors.red : colors.forest;
              return (
                <Pressable
                  key={p.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setPriority(p.value)}
                  style={[styles.choice, on && { borderColor: tone, backgroundColor: p.value === 'urgent' ? colors.redSoft : colors.forestSoft }]}
                >
                  <Row style={{ gap: 6 }}>
                    <Icon name={p.icon} size={15} color={on ? tone : colors.textFaint} />
                    <Text style={[styles.choiceTitle, on && { color: tone }]}>{p.label}</Text>
                  </Row>
                  <Text style={styles.choiceHint}>{p.hint}</Text>
                </Pressable>
              );
            })}
          </Row>
          <Text style={[styles.label, { marginTop: spacing.sm }]}>Giao về</Text>
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            {[...blocks.map((b) => ({ value: b, label: b })), { value: MAIN_STORE, label: 'Kho chung' }].map((d) => (
              <Pressable key={d.value} accessibilityRole="radio" accessibilityState={{ selected: destination === d.value }} onPress={() => setDestination(d.value)} style={[styles.quick, destination === d.value && styles.quickOn]}>
                <Text style={[styles.quickText, destination === d.value && { color: colors.white }]}>{d.label}</Text>
              </Pressable>
            ))}
          </Row>
        </View>

        {/* Why: reasons one tap each, and anything else in words. */}
        <View style={styles.section}>
          <Text style={styles.label}>Lý do (Quản lý sẽ thấy)</Text>
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            {REASONS.map((r) => {
              const on = note.toLowerCase().includes(r.toLowerCase());
              return (
                <Pressable key={r} accessibilityRole="button" onPress={() => addReason(r)} style={[styles.quick, on && styles.quickOn]}>
                  <Text style={[styles.quickText, on && { color: colors.white }]}>{r}</Text>
                </Pressable>
              );
            })}
          </Row>
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Thêm ghi chú nếu cần, VD: dùng cho đợt điều trị của Thunder Bolt."
            placeholderTextColor={colors.textFaint}
          />
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Row style={{ gap: spacing.md }}>
          <Button title="Huỷ" variant="subtle" style={{ flex: 1 }} onPress={close} />
          <Button
            title={valid ? `Gửi đề xuất · ${num(value)} ${unitOf(mode)}` : 'Gửi đề xuất'}
            icon="arrowRight"
            variant={priority === 'urgent' ? 'danger' : 'primary'}
            style={{ flex: 2 }}
            loading={mutation.isPending}
            disabled={!valid}
            onPress={submit}
          />
        </Row>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  itemCard: { gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.white },
  itemIcon: { width: 42, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 16.5, fontWeight: '800', color: colors.text, lineHeight: 22 },
  stockBox: { padding: spacing.md, borderRadius: radius.sm, borderWidth: 1 },
  stockValue: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  factValue: { flexShrink: 1, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.text },
  section: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.white },
  label: { ...font.tiny },
  modeSwitch: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: colors.graySoft },
  modeOption: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  modeOptionOn: { backgroundColor: colors.forest },
  modeText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  stepBtn: { width: 52, height: 52, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forestSoft },
  stepText: { fontSize: 26, fontWeight: '700', color: colors.forest, lineHeight: 30 },
  amountBox: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.forest, backgroundColor: colors.white },
  // minWidth 0: a text field otherwise keeps its own width and pushes the unit out of the box.
  amountInput: { flex: 1, minWidth: 0, width: '100%', fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', paddingVertical: 0 },
  amountUnit: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  quickSuggest: { borderColor: colors.forest, backgroundColor: colors.forestSoft },
  quickOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  quickText: { fontSize: 13, fontWeight: '700', color: colors.text },
  after: { fontSize: 12.5, color: colors.forestLight },
  choice: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  choiceTitle: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
  choiceHint: { fontSize: 11.5, color: colors.textMuted },
  note: { minHeight: 64, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, fontSize: 14.5, color: colors.text, textAlignVertical: 'top' },
  actions: { padding: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.white },
});
