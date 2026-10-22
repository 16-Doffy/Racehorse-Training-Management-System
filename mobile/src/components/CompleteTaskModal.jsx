import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '../api/endpoints';
import Icon from './Icon';
import { Button, ChipGroup, Row } from './ui';
import {
  EATEN_OPTIONS,
  MANURE_OPTIONS,
  MEDICATION_ROUTE,
  WATER_OPTIONS,
  describeSupplies,
  describeTask,
  formatTime,
  lateRecordTimes,
  newOpId,
  shortageFromError,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Refusals the server explains with a code (stable/dailyTask.controller.js completionCheck): the
// message says what happened; the lists are reloaded so the screen shows the work as it is now.
// How the meal went, the first thing asked: most meals are eaten up, so that is the default and
// "Đã cho ăn" records it at once; the other two open what the vet needs to know.
const OUTCOMES = [
  { value: 'full', label: 'Ăn hết', icon: 'checkCircle', appetite: 'Bình thường', eaten: 100, color: colors.green, bg: colors.greenSoft },
  { value: 'partial', label: 'Ăn không hết', icon: 'alert', appetite: 'Kém', eaten: 50, color: colors.orange, bg: colors.orangeSoft },
  { value: 'refused', label: 'Bỏ ăn', icon: 'block', appetite: 'Bỏ ăn', eaten: 0, color: colors.red, bg: colors.redSoft },
];
const outcomeOf = (appetite) => (appetite === 'Bỏ ăn' ? 'refused' : appetite === 'Kém' ? 'partial' : 'full');

const BLOCK_TITLES = {
  NO_APPROVED_RATION: 'Chưa có khẩu phần được duyệt',
  PRESCRIPTION_CHANGED: 'Y lệnh đã thay đổi',
  TREATMENT_ENDED: 'Đợt điều trị đã kết thúc',
  EXPIRED_SUPPLY: 'Vật tư đã hết hạn',
};

/**
 * Confirms a task as done. For a meal it also collects what the groom saw — appetite, droppings,
 * water, and how much of the issued ration the horse actually ate — because that is what the vet
 * and the training readiness check read. A vet's dose is given only after the groom confirms the
 * horse, medicine, dose, route and time against the order. Other work just confirms and closes.
 *
 * `late`: a meal or dose that was given but not ticked before its window closed. The groom picks
 * when it was really done (inside its window, within 24 hours); the server records that time and
 * marks the record as sent late. `medication`: the prescription line, for its route of administration.
 */
export default function CompleteTaskModal({ task, schedules = [], visible, onClose, onShortage, late = false, medication = null }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [appetite, setAppetite] = useState('Bình thường');
  const [eaten, setEaten] = useState(100);
  const [manure, setManure] = useState('Bình thường');
  const [water, setWater] = useState('Bình thường');
  const [note, setNote] = useState('');
  const [checked, setChecked] = useState(false);
  const [performedAt, setPerformedAt] = useState(null);
  // One id per confirmation: a double tap, or a retry after the answer got lost, is applied once.
  const opId = useRef(null);

  const isFeeding = task?.taskType === 'feeding';
  const isDose = task?.source === 'vet' && task?.taskType === 'medication';
  const lateTimes = late && task ? lateRecordTimes(task) : [];
  const route = MEDICATION_ROUTE[medication?.route];

  useEffect(() => {
    if (!visible) return;
    opId.current = newOpId();
    if (late && task) {
      // The scheduled time when it can be chosen, otherwise the latest allowed.
      const times = lateRecordTimes(task);
      const scheduled = times.find((t) => t.getTime() === new Date(task.scheduledDate).getTime());
      setPerformedAt((scheduled || times[times.length - 1] || null)?.toISOString() || null);
    }
  }, [visible, task?._id, late]);

  const reset = () => {
    setAppetite('Bình thường');
    setEaten(100);
    setManure('Bình thường');
    setWater('Bình thường');
    setNote('');
    setChecked(false);
    setPerformedAt(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-forecast'] });
    queryClient.invalidateQueries({ queryKey: ['care-plan'] });
  };

  const mutation = useMutation({
    mutationFn: (payload) => taskApi.complete(task._id, { ...payload, clientOpId: opId.current }),
    onSuccess: () => {
      refresh();
      close();
    },
    onError: (err) => {
      // Stock ran out between opening this and confirming: offer the restock instead of a dead end.
      const missing = shortageFromError(err);
      if (missing.length && onShortage) {
        const blocked = task;
        close();
        refresh();
        onShortage(missing, blocked);
        return;
      }
      const code = err?.data?.code;
      if (code) {
        refresh();
        if (code === 'PRESCRIPTION_CHANGED' || code === 'TREATMENT_ENDED') queryClient.invalidateQueries({ queryKey: ['treatments'] });
        close();
        Alert.alert(BLOCK_TITLES[code] || 'Không hoàn thành được', err.message);
        return;
      }
      // Refused (409: outside its time, already recorded elsewhere): the list is out of date.
      if (err?.status === 409) refresh();
      Alert.alert('Không hoàn thành được', err?.message || 'Thử lại sau.');
    },
  });

  const chooseOutcome = (value) => {
    const o = OUTCOMES.find((x) => x.value === value);
    setAppetite(o.appetite);
    setEaten(o.eaten);
  };
  const outcome = outcomeOf(appetite);

  const submit = () => {
    if (isDose && !checked) {
      Alert.alert('Chưa xác nhận', 'Kiểm tra đúng ngựa, đúng thuốc, đúng liều, đúng đường dùng và đúng giờ rồi đánh dấu xác nhận.');
      return;
    }
    if (late && !performedAt) {
      Alert.alert('Chọn giờ thực tế', 'Chọn giờ bạn đã thật sự làm việc này.');
      return;
    }
    const payload = isFeeding
      ? { observation: { appetite, manure, waterIntake: water }, amountEatenPercent: eaten, notes: note.trim() || undefined }
      : { notes: note.trim() || undefined };
    mutation.mutate(late ? { ...payload, performedAt } : payload);
  };

  const info = task ? describeTask(task, schedules) : null;
  const issued = describeSupplies(task?.supplies);

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
            <Text style={font.h2}>{late ? 'Ghi nhận muộn' : 'Xác nhận hoàn thành'}</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </Row>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
            {task ? (
              <View style={styles.taskBox}>
                <Row style={{ gap: 6 }}>
                  <Icon name={info.icon} size={16} color={info.color} />
                  <Text style={styles.taskTitle}>
                    {info.label}
                    {info.time ? ` · ${info.time}` : ''}
                  </Text>
                </Row>
                <Text style={font.small}>{task.horse?.name}</Text>
                {task.note && task.taskType !== 'other' ? (
                  <Text style={styles.trainerNote}>{task.source === 'vet' ? 'Bác sĩ dặn' : 'HLV dặn'}: {task.note}</Text>
                ) : null}
                {route ? <Text style={styles.issued}>Đường dùng: {route}</Text> : null}
                {/* What recording this takes out of stock — issued, which is not the same as eaten. */}
                {issued ? <Text style={styles.issued}>Xuất kho: {issued}</Text> : null}
              </View>
            ) : null}

            {late ? (
              <View style={styles.lateBox}>
                <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
                  <Icon name="clock" size={16} color={colors.orange} />
                  <Text style={[font.small, { flex: 1, color: colors.text }]}>
                    Việc này đã quá giờ ghi nhận. Chỉ ghi khi bạn <Text style={{ fontWeight: '700' }}>đã thật sự làm</Text> mà quên bấm —
                    chọn giờ thực tế. Bản ghi được đánh dấu "ghi muộn" để HLV/bác sĩ biết.
                  </Text>
                </Row>
                <Text style={[styles.label, { marginTop: spacing.md }]}>Giờ đã làm</Text>
                <ChipGroup
                  options={lateTimes.map((t) => ({ value: t.toISOString(), label: formatTime(t) }))}
                  value={performedAt}
                  onChange={setPerformedAt}
                  size="sm"
                />
              </View>
            ) : null}

            {isFeeding ? (
              <>
                <View>
                  <Text style={styles.label}>Ngựa ăn thế nào?</Text>
                  <Row style={{ gap: spacing.sm }}>
                    {OUTCOMES.map((o) => {
                      const on = outcome === o.value;
                      return (
                        <Pressable
                          key={o.value}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          onPress={() => chooseOutcome(o.value)}
                          style={[styles.outcome, on && { borderColor: o.color, backgroundColor: o.bg }]}
                        >
                          <Icon name={o.icon} size={22} color={on ? o.color : colors.textFaint} />
                          <Text style={[styles.outcomeText, on && { color: o.color }]} numberOfLines={1}>
                            {o.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </Row>
                </View>
                {outcome === 'partial' ? (
                  <View>
                    <Text style={styles.label}>Ăn được khoảng (so với khẩu phần đã xuất)</Text>
                    <ChipGroup options={EATEN_OPTIONS.filter((o) => o.value > 0 && o.value < 100)} value={eaten} onChange={setEaten} size="sm" />
                  </View>
                ) : null}
                {outcome === 'refused' ? (
                  <Text style={[styles.hint, { color: colors.red }]}>Ngựa bỏ ăn: bác sĩ thú y được báo ngay khi bạn ghi nhận.</Text>
                ) : null}
                <View>
                  <Text style={styles.label}>Phân</Text>
                  <ChipGroup options={MANURE_OPTIONS} value={manure} onChange={setManure} size="sm" />
                </View>
                <View>
                  <Text style={styles.label}>Uống nước</Text>
                  <ChipGroup options={WATER_OPTIONS} value={water} onChange={setWater} size="sm" />
                </View>
              </>
            ) : isDose ? (
              <>
                <Text style={styles.hint}>
                  Chỉ cho dùng đúng như y lệnh. Không tự đổi liều hay giờ — nếu không cho dùng được, chọn "Không làm
                  được" để bác sĩ biết.
                </Text>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() => setChecked((v) => !v)}
                  style={[styles.confirm, checked && styles.confirmOn]}
                >
                  <Icon name={checked ? 'checkCircle' : 'circle'} size={20} color={checked ? colors.green : colors.textFaint} />
                  <Text style={[font.body, { flex: 1 }]}>
                    Đã kiểm tra: đúng ngựa {task?.horse?.name}, đúng thuốc, đúng liều
                    {route ? `, đúng đường dùng (${route.toLowerCase()})` : ''}
                    {task?.dueTime ? `, đúng giờ ${task.dueTime}` : ''}.
                  </Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.hint}>Xác nhận đã hoàn thành {info?.label?.toLowerCase() || 'công việc'} cho {task?.horse?.name}.</Text>
            )}

            <View>
              <Text style={styles.label}>Ghi chú thêm</Text>
              <TextInput
                style={styles.textarea}
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Tuỳ chọn..."
                placeholderTextColor={colors.textFaint}
              />
            </View>
          </ScrollView>

          <Row style={styles.footer}>
            <Button title="Huỷ" variant="subtle" style={{ flex: 1 }} onPress={close} />
            <Button
              title={late ? 'Ghi nhận muộn' : isDose ? 'Đã cho dùng' : isFeeding ? 'Đã cho ăn' : 'Hoàn thành'}
              style={{ flex: 2 }}
              loading={mutation.isPending}
              disabled={mutation.isPending || (isDose && !checked) || (late && !performedAt)}
              onPress={submit}
            />
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '92%' },
  sheetHeader: {
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  close: { fontSize: 18, color: colors.textMuted, paddingHorizontal: spacing.sm },
  taskBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSoft, gap: 2 },
  taskTitle: { ...font.h3 },
  trainerNote: { ...font.small, color: colors.forestLight, marginTop: spacing.sm },
  issued: { ...font.small, color: colors.text, marginTop: spacing.sm, fontWeight: '600' },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  confirmOn: { borderColor: colors.green, backgroundColor: colors.forestSoft },
  outcome: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  outcomeText: { fontSize: 13, fontWeight: '800', color: colors.textMuted },
  lateBox: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.orangeSoft },
  hint: { ...font.small },
  label: { ...font.tiny, marginBottom: spacing.sm },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 70,
    textAlignVertical: 'top',
    backgroundColor: colors.white,
    fontSize: 15,
    color: colors.text,
  },
  footer: { padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.white },
});
