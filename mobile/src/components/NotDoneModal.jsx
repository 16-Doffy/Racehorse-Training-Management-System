import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutbox } from '../offline/OutboxContext';
import { hapticSuccess, hapticWarning } from '../utils/haptics';
import Icon from './Icon';
import DragSheet from './DragSheet';
import { Button, ChipGroup, Row } from './ui';
import { TASK_CONFIG } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

// The reasons a stable hand actually has; tapping one fills the box so nobody types on a phone
// while holding a horse.
const PRESETS = [
  'Ngựa không chịu ăn',
  'Ngựa nhả thuốc ra',
  'Ngựa đang được bác sĩ khám',
  'Ngựa không có trong chuồng',
  'Thiếu vật tư',
];

/** Reports a task as not done, with the reason. The trainer (and vet, for an order) is told. */
export default function NotDoneModal({ task, visible, onClose }) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const { submit: send } = useOutbox();

  const close = () => {
    setReason('');
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (text) =>
      send(
        'notDone',
        { taskId: task._id, reason: text },
        { taskId: task._id, label: TASK_CONFIG[task.taskType]?.label || 'Việc chuồng', horseName: task.horse?.name }
      ),
    onSuccess: (res) => {
      hapticSuccess();
      if (!res.queued) queryClient.invalidateQueries({ queryKey: ['tasks'] });
      close();
    },
    onError: (err) => {
      hapticWarning();
      Alert.alert('Không gửi được', err?.message || 'Thử lại sau.');
    },
  });

  const submit = () => {
    const text = reason.trim();
    if (!text) {
      Alert.alert('Thiếu lý do', 'Hãy ghi rõ vì sao không thực hiện được.');
      return;
    }
    mutation.mutate(text);
  };

  const cfg = TASK_CONFIG[task?.taskType];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <DragSheet onClose={close} style={styles.sheet} handle="overlay">
          <Row style={styles.header}>
            <Text style={font.h2}>Không thực hiện được</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </Row>

          <View style={{ padding: spacing.lg, gap: spacing.lg }}>
            {task ? (
              <View style={styles.taskBox}>
                <Row style={{ gap: 6 }}>
                  <Icon name={cfg?.icon || 'note'} size={15} color={cfg?.color} />
                  <Text style={font.h3}>{cfg?.label || task.taskType}</Text>
                </Row>
                <Text style={font.small}>{task.horse?.name}</Text>
              </View>
            ) : null}

            <Text style={font.small}>HLV Trưởng sẽ nhận được lý do này{task?.source === 'vet' ? ', bác sĩ thú y cũng vậy' : ''}.</Text>

            <View>
              <Text style={styles.label}>Lý do thường gặp</Text>
              <ChipGroup options={PRESETS} value={reason} onChange={setReason} />
            </View>

            <View>
              <Text style={styles.label}>Lý do cụ thể</Text>
              <TextInput
                style={styles.textarea}
                value={reason}
                onChangeText={setReason}
                multiline
                placeholder="Ví dụ: ngựa nhả thuốc ra hai lần, đã báo bác sĩ."
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <Row style={{ gap: spacing.md }}>
              <Button title="Huỷ" variant="subtle" style={{ flex: 1 }} onPress={close} />
              <Button title="Gửi báo cáo" variant="danger" style={{ flex: 2 }} loading={mutation.isPending} onPress={submit} />
            </Row>
          </View>
        </DragSheet>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  header: {
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  close: { fontSize: 18, color: colors.textMuted, paddingHorizontal: spacing.sm },
  taskBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSoft },
  label: { ...font.tiny, marginBottom: spacing.sm },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: colors.white,
    fontSize: 15,
    color: colors.text,
  },
});
