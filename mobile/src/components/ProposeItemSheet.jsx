import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from './Icon';
import { Button, Row, Sheet } from './ui';
import { inventoryApi } from '../api/endpoints';
import { INVENTORY_CATEGORY, deliveryBlocks, formatStock, levelOf, matchesSearch } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const CATEGORY_ORDER = ['feed', 'medicine', 'equipment'];
const CATEGORY_HINT = {
  feed: 'Cỏ, cám, khoáng, vitamin…',
  medicine: 'Thuốc, băng gạc, vật tư y tế',
  equipment: 'Đồ dùng lâu dài: dây, chổi, xô…',
};
// The units a groom asks in, per kind of item; any other can be typed.
const UNITS = {
  feed: ['kg', 'g', 'lít', 'bao', 'viên'],
  medicine: ['viên', 'ml', 'liều', 'tuýp', 'hộp', 'lọ'],
  equipment: ['cái', 'bộ', 'đôi', 'cuộn'],
};
const QUICK = [1, 2, 5, 10, 20, 50];
const REASONS = ['Chưa có trong kho', 'Bác sĩ dặn dùng', 'Ngựa mới cần', 'Thay đồ đã hỏng'];
const MAIN_STORE = '__main__';

/**
 * Asks the Manager for something the club does not stock yet; approved, it joins the catalogue (at
 * zero until it arrives). Laid out for a thumb like the restock form: the kind as three cards, the
 * name — with what the store already has under a similar name, to ask for that instead — the unit
 * as quick picks, the amount with − / + and quick amounts, normal or urgent, where it goes, and
 * reasons one tap away.
 */
export default function ProposeItemSheet({ visible, onClose, blocks = [], items = [], onUseExisting }) {
  const [category, setCategory] = useState('feed');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [amount, setAmount] = useState('');
  const [priority, setPriority] = useState('normal');
  const [destination, setDestination] = useState(null);
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();
  const zones = deliveryBlocks(blocks);
  const place = destination ?? (zones[0] || MAIN_STORE);

  const reset = () => {
    setCategory('feed');
    setName('');
    setUnit('');
    setAmount('');
    setPriority('normal');
    setDestination(null);
    setNote('');
  };
  const close = () => {
    reset();
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (payload) => inventoryApi.proposeItem(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      Alert.alert('Đã gửi đề xuất', 'Quản lý CLB sẽ xem xét đưa vật tư này vào danh mục. Theo dõi ở "Đề xuất của tôi".');
      close();
    },
    onError: (err) => Alert.alert('Gửi thất bại', err?.message || 'Thử lại sau.'),
  });

  // What the store already holds under a similar name: better asked for than proposed again.
  const typed = name.trim();
  const similar = typed.length >= 3 ? items.filter((i) => !i.isProposed && (matchesSearch(i.name, typed) || matchesSearch(typed, i.name))).slice(0, 3) : [];
  const value = Number(String(amount).replace(',', '.'));
  const validAmount = Number.isFinite(value) && value > 0;
  const ready = !!typed && !!unit.trim() && validAmount;
  const setValue = (v) => setAmount(v > 0 ? String(Math.round(v * 100) / 100) : '');
  const addReason = (r) => setNote((n) => (n.includes(r) ? n : n.trim() ? `${n.trim()}; ${r.toLowerCase()}` : r));
  const pickCategory = (c) => {
    setCategory(c);
    // A unit picked for another kind is probably wrong for this one.
    if (unit && !UNITS[c].includes(unit)) setUnit('');
  };

  const submit = () => {
    if (!typed) return Alert.alert('Thiếu tên vật tư', 'Nhập tên vật tư cần đề xuất.');
    if (!unit.trim()) return Alert.alert('Thiếu đơn vị', 'Chọn hoặc gõ đơn vị, VD: kg, chai, cái.');
    if (!validAmount) return Alert.alert('Chưa có số lượng', 'Chọn hoặc nhập số lượng lớn hơn 0.');
    const block = place === MAIN_STORE ? undefined : place;
    return mutation.mutate({
      name: typed,
      category,
      unit: unit.trim(),
      quantity: value,
      note: note.trim() || undefined,
      stableBlock: block,
      destinationBlock: block,
      priority,
    });
  };

  return (
    <Sheet visible={visible} onClose={close} title="Đề xuất vật tư mới">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={font.small}>Dùng khi thứ cần dùng chưa có trong kho. Quản lý duyệt thì món này được thêm vào danh mục.</Text>

        {/* What kind of thing it is. */}
        <View style={styles.section}>
          <Text style={styles.label}>Thuộc nhóm</Text>
          <Row style={{ gap: spacing.sm }}>
            {CATEGORY_ORDER.map((c) => {
              const cfg = INVENTORY_CATEGORY[c];
              const on = category === c;
              return (
                <Pressable key={c} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => pickCategory(c)} style={[styles.kind, on && { borderColor: cfg.color, backgroundColor: cfg.bg }]}>
                  <View style={[styles.kindIcon, { backgroundColor: on ? colors.white : cfg.bg }]}>
                    <Icon name={cfg.icon} size={18} color={cfg.color} />
                  </View>
                  <Text style={[styles.kindTitle, on && { color: cfg.color }]}>{cfg.label}</Text>
                  <Text style={styles.kindHint} numberOfLines={2}>
                    {CATEGORY_HINT[c]}
                  </Text>
                </Pressable>
              );
            })}
          </Row>
        </View>

        {/* What it is, and what the store already has like it. */}
        <View style={styles.section}>
          <Text style={styles.label}>Tên vật tư</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={category === 'medicine' ? 'VD: Gel bôi móng' : category === 'equipment' ? 'VD: Dây dắt ngựa' : 'VD: Cỏ Timothy'}
            placeholderTextColor={colors.textFaint}
          />
          {similar.length ? (
            <View style={styles.similar}>
              <Row style={{ gap: 6 }}>
                <Icon name="info" size={15} color={colors.blue} />
                <Text style={[font.small, { flex: 1, color: colors.text }]}>Kho đã có món gần giống — xin thêm món đó thay vì đề xuất mới:</Text>
              </Row>
              {similar.map((i) => {
                const level = levelOf(i);
                return (
                  <Row key={i._id} style={styles.similarRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.similarName} numberOfLines={1}>
                        {i.name}
                      </Text>
                      <Text style={[font.small, { color: level.short ? level.color : colors.textMuted }]}>Còn {formatStock(i)}</Text>
                    </View>
                    <Button
                      title="Xin thêm"
                      icon="plus"
                      size="sm"
                      variant="ghost"
                      style={{ minWidth: 0, paddingHorizontal: 10 }}
                      onPress={() => {
                        close();
                        onUseExisting?.(i);
                      }}
                    />
                  </Row>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* The unit, then how much of it. */}
        <View style={styles.section}>
          <Text style={styles.label}>Đơn vị</Text>
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            {UNITS[category].map((u) => (
              <Pressable key={u} accessibilityRole="radio" accessibilityState={{ selected: unit === u }} onPress={() => setUnit(u)} style={[styles.chip, unit === u && styles.chipOn]}>
                <Text style={[styles.chipText, unit === u && { color: colors.white }]}>{u}</Text>
              </Pressable>
            ))}
            <TextInput
              style={[styles.chip, styles.unitOther, unit && !UNITS[category].includes(unit) && styles.unitOtherOn]}
              value={UNITS[category].includes(unit) ? '' : unit}
              onChangeText={setUnit}
              placeholder="Khác…"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="Đơn vị khác"
            />
          </Row>

          <Text style={[styles.label, { marginTop: spacing.sm }]}>Số lượng cần</Text>
          <Row style={{ gap: spacing.sm }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Bớt" onPress={() => setValue((validAmount ? value : 0) - 1)} style={styles.stepBtn}>
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
                accessibilityLabel="Số lượng"
              />
              <Text style={styles.amountUnit}>{unit || 'đơn vị'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Thêm" onPress={() => setValue((validAmount ? value : 0) + 1)} style={styles.stepBtn}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </Row>
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            {QUICK.map((qv) => (
              <Pressable key={qv} accessibilityRole="button" onPress={() => setValue(qv)} style={[styles.chip, value === qv && styles.chipOn]}>
                <Text style={[styles.chipText, value === qv && { color: colors.white }]}>
                  {qv}
                  {unit ? ` ${unit}` : ''}
                </Text>
              </Pressable>
            ))}
          </Row>
        </View>

        {/* How soon, and where to. */}
        <View style={styles.section}>
          <Text style={styles.label}>Mức độ cần</Text>
          <Row style={{ gap: spacing.sm }}>
            {[
              { value: 'normal', label: 'Bình thường', hint: 'Đặt cùng đợt mua tới', icon: 'clock' },
              { value: 'urgent', label: 'Khẩn', hint: 'Cần ngay cho ngựa', icon: 'warning' },
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
            {[...zones.map((z) => ({ value: z, label: z })), { value: MAIN_STORE, label: 'Kho chung' }].map((d) => (
              <Pressable key={d.value} accessibilityRole="radio" accessibilityState={{ selected: place === d.value }} onPress={() => setDestination(d.value)} style={[styles.chip, place === d.value && styles.chipOn]}>
                <Text style={[styles.chipText, place === d.value && { color: colors.white }]}>{d.label}</Text>
              </Pressable>
            ))}
          </Row>
        </View>

        {/* Why it is needed. */}
        <View style={styles.section}>
          <Text style={styles.label}>Lý do (Quản lý sẽ thấy)</Text>
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            {REASONS.map((r) => {
              const on = note.toLowerCase().includes(r.toLowerCase());
              return (
                <Pressable key={r} accessibilityRole="button" onPress={() => addReason(r)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && { color: colors.white }]}>{r}</Text>
                </Pressable>
              );
            })}
          </Row>
          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="VD: móng ngựa khu A khô nứt, cần bôi hằng ngày."
            placeholderTextColor={colors.textFaint}
          />
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Row style={{ gap: spacing.md }}>
          <Button title="Huỷ" variant="subtle" style={{ flex: 1 }} onPress={close} />
          <Button
            title={ready ? `Gửi đề xuất · ${Math.round(value * 100) / 100} ${unit.trim()}` : 'Gửi đề xuất'}
            icon="arrowRight"
            variant={priority === 'urgent' ? 'danger' : 'primary'}
            style={{ flex: 2 }}
            loading={mutation.isPending}
            disabled={!ready}
            onPress={submit}
          />
        </Row>
        {!ready ? (
          <Text style={styles.missing}>
            Còn thiếu: {[!typed && 'tên', !unit.trim() && 'đơn vị', !validAmount && 'số lượng'].filter(Boolean).join(', ')}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  section: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.white },
  label: { ...font.tiny },
  kind: { flex: 1, minWidth: 0, gap: 4, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  kindIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  kindTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  kindHint: { fontSize: 11, color: colors.textMuted, lineHeight: 14 },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, fontSize: 16, color: colors.text },
  similar: { gap: 6, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.blueSoft },
  similarRow: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.white },
  similarName: { fontSize: 14, fontWeight: '700', color: colors.text },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.text },
  // As small as the chips beside it: a text field otherwise takes its own default width.
  unitOther: { width: 92, fontSize: 13, fontWeight: '700', color: colors.text, paddingVertical: 6 },
  unitOtherOn: { borderColor: colors.forest, borderWidth: 1.5 },
  stepBtn: { width: 52, height: 52, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forestSoft },
  stepText: { fontSize: 26, fontWeight: '700', color: colors.forest, lineHeight: 30 },
  amountBox: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.forest, backgroundColor: colors.white },
  // minWidth 0: a text field otherwise keeps its own width and pushes the unit out of the box.
  amountInput: { flex: 1, minWidth: 0, width: '100%', fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', paddingVertical: 0 },
  amountUnit: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  choice: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  choiceTitle: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
  choiceHint: { fontSize: 11.5, color: colors.textMuted },
  note: { minHeight: 64, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, fontSize: 14.5, color: colors.text, textAlignVertical: 'top' },
  actions: { padding: spacing.lg, paddingTop: spacing.md, gap: 6, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.white },
  missing: { fontSize: 11.5, color: colors.textMuted, textAlign: 'right' },
});
