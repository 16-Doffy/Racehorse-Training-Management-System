import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from './Icon';
import { Badge, Banner, Button, Card, ChipGroup, DataRow, Row, Sheet } from './ui';
import { inventoryApi } from '../api/endpoints';
import { TASK_CONFIG, formatStock, getStockLevel } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

/**
 * Asks the Manager for more of one stock item.
 *
 * Opened from the storeroom, or from a meal or dose that cannot be recorded for lack of supplies —
 * in which case the request carries the task, so the Manager sees which work is blocked, and the
 * amount is pre-filled with what is short.
 */
export default function RestockSheet({ request, visible, onClose }) {
  const { item, task, missing } = request || {};
  const packed = !!(item?.packUnit && item?.packSize);
  const [mode, setMode] = useState(packed ? 'packs' : 'units');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  // Pre-fill with the shortfall, rounded up to whole packs when the item is sold in packs.
  useEffect(() => {
    if (!visible || !item) return;
    const short = missing?.find((m) => String(m.inventoryItem) === String(item._id))?.short;
    setMode(packed ? 'packs' : 'units');
    setNote(task ? `Thiếu để làm việc ${TASK_CONFIG[task.taskType]?.label || ''} cho ${task.horse?.name || 'ngựa'}.` : '');
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
      Alert.alert('Đã gửi đề xuất', task ? 'Quản lý sẽ thấy việc này đang bị chặn vì thiếu vật tư.' : 'Quản lý CLB sẽ xem xét.');
      close();
    },
    onError: (err) => Alert.alert('Gửi thất bại', err?.message || 'Thử lại sau.'),
  });

  const submit = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Số lượng chưa hợp lệ', 'Nhập một số lớn hơn 0.');
      return;
    }
    mutation.mutate({
      ...(mode === 'packs' ? { packs: value } : { quantity: value }),
      note: note.trim() || undefined,
      task: task?._id,
    });
  };

  if (!item) return <Sheet visible={visible} onClose={onClose} title="Đề xuất bổ sung" />;

  const level = getStockLevel(item.quantity);
  const converted = mode === 'packs' && packed && Number(amount) > 0 ? Number(amount) * item.packSize : null;

  return (
    <Sheet visible={visible} onClose={close} title="Đề xuất bổ sung">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card>
          <Row style={{ gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Row style={{ gap: 6 }}>
                {item.code ? <Badge label={item.code} /> : null}
                <Text style={font.h3} numberOfLines={1}>
                  {item.name}
                </Text>
              </Row>
              <Text style={font.small}>{item.stableBlock || 'Kho chung'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[font.h3, { color: level.color }]}>{formatStock(item)}</Text>
              <Badge label={level.label} color={level.color} bg={level.bg} />
            </View>
          </Row>
        </Card>

        {task ? (
          <Banner tone="danger">
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="warning" size={16} color={colors.red} />
              <View style={{ flex: 1 }}>
                <Text style={font.body}>
                  Đang chặn việc {TASK_CONFIG[task.taskType]?.label?.toLowerCase() || 'chăm sóc'} cho {task.horse?.name}
                </Text>
                {missing?.length ? (
                  <Text style={font.small}>
                    {missing.map((m) => `${m.name}: cần ${m.needed} ${m.unit}, còn ${m.available} ${m.unit}`).join(' · ')}
                  </Text>
                ) : null}
              </View>
            </Row>
          </Banner>
        ) : null}

        {packed ? (
          <View>
            <Text style={styles.label}>Đơn vị đề xuất</Text>
            <ChipGroup
              options={[
                { value: 'packs', label: `Theo ${item.packUnit}` },
                { value: 'units', label: `Theo ${item.unit}` },
              ]}
              value={mode}
              onChange={setMode}
              size="sm"
            />
          </View>
        ) : null}

        <View>
          <Text style={styles.label}>Số lượng ({mode === 'packs' ? item.packUnit : item.unit})</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder={mode === 'packs' ? 'Ví dụ: 2' : 'Ví dụ: 20'}
            placeholderTextColor={colors.textFaint}
          />
          {converted ? (
            <DataRow label="Quy đổi" value={`${converted} ${item.unit}`} />
          ) : null}
        </View>

        <View>
          <Text style={styles.label}>Ghi chú cho quản lý</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Ví dụ: dùng cho đợt điều trị của Thunder Bolt."
            placeholderTextColor={colors.textFaint}
          />
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Row style={{ gap: spacing.md }}>
          <Button title="Huỷ" variant="subtle" style={{ flex: 1 }} onPress={close} />
          <Button title="Gửi đề xuất" style={{ flex: 2 }} loading={mutation.isPending} onPress={submit} />
        </Row>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
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
  actions: { padding: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.white },
});
