import { useState } from 'react';
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
  APPETITE_OPTIONS,
  MANURE_OPTIONS,
  TASK_CONFIG,
  WATER_OPTIONS,
  describeTask,
  shortageFromError,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Confirms a task as done. For feeding tasks it also collects what the groom saw — appetite,
 * droppings, water — because that is what the vet and the training readiness check read. The
 * server treats the observation as optional, so other task types just confirm and close.
 */
export default function CompleteTaskModal({ task, schedules = [], visible, onClose, onShortage }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [appetite, setAppetite] = useState('Bình thường');
  const [manure, setManure] = useState('Bình thường');
  const [water, setWater] = useState('Bình thường');
  const [note, setNote] = useState('');

  const isFeeding = task?.taskType === 'feeding';

  const reset = () => {
    setAppetite('Bình thường');
    setManure('Bình thường');
    setWater('Bình thường');
    setNote('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (payload) => taskApi.complete(task._id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      close();
    },
    onError: (err) => {
      // Stock ran out between opening this and confirming: offer the restock instead of a dead end.
      const missing = shortageFromError(err);
      if (missing.length && onShortage) {
        const blocked = task;
        close();
        onShortage(missing, blocked);
        return;
      }
      Alert.alert('Không hoàn thành được', err?.message || 'Thử lại sau.');
    },
  });

  const submit = () => {
    const payload = isFeeding
      ? { observation: { appetite, manure, waterIntake: water }, notes: note.trim() || undefined }
      : { notes: note.trim() || undefined };
    mutation.mutate(payload);
  };

  const info = task ? describeTask(task, schedules) : null;
  const taskCfg = TASK_CONFIG[task?.taskType];

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
            <Text style={font.h2}>Xác nhận hoàn thành</Text>
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
                {task.note ? <Text style={styles.trainerNote}>{task.source === 'vet' ? 'Bác sĩ dặn' : 'HLV dặn'}: {task.note}</Text> : null}
              </View>
            ) : null}

            {isFeeding ? (
              <>
                <Text style={styles.hint}>
                  Ghi nhận giúp bác sĩ phát hiện sớm dấu hiệu bất thường. Nếu ngựa bỏ ăn hoặc phân lỏng, hệ thống báo
                  bác sĩ thú y ngay.
                </Text>
                <View>
                  <Text style={styles.label}>Ăn uống</Text>
                  <ChipGroup options={APPETITE_OPTIONS} value={appetite} onChange={setAppetite} />
                </View>
                <View>
                  <Text style={styles.label}>Phân</Text>
                  <ChipGroup options={MANURE_OPTIONS} value={manure} onChange={setManure} />
                </View>
                <View>
                  <Text style={styles.label}>Uống nước</Text>
                  <ChipGroup options={WATER_OPTIONS} value={water} onChange={setWater} />
                </View>
              </>
            ) : (
              <Text style={styles.hint}>Xác nhận đã hoàn thành {taskCfg?.label?.toLowerCase() || 'công việc'} cho {task?.horse?.name}.</Text>
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
            <Button title="Hoàn thành" style={{ flex: 2 }} loading={mutation.isPending} onPress={submit} />
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
