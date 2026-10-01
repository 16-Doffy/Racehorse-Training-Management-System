import { useState } from 'react';
import {
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '../api/endpoints';
import Icon from './Icon';
import { Badge, Button, ChipGroup, Row } from './ui';
import { INCIDENT_PRESETS, SEVERITY, TASK_CONFIG, formatDate } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const MAX_IMAGES = 5;
const SEVERITY_OPTIONS = Object.entries(SEVERITY).map(([value, cfg]) => ({ value, label: cfg.label }));

/**
 * Reports an incident on one daily task: quick symptom chips, severity, and photos taken with the
 * phone camera or picked from the gallery. The vet is notified by the server on submit.
 */
export default function IncidentModal({ task, visible, onClose }) {
  const queryClient = useQueryClient();
  const [presets, setPresets] = useState([]);
  const [detail, setDetail] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [photos, setPhotos] = useState([]);

  const reset = () => {
    setPresets([]);
    setDetail('');
    setSeverity('medium');
    setPhotos([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const mutation = useMutation({
    mutationFn: (formData) => taskApi.reportIncident(task._id, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      Alert.alert('Đã gửi báo cáo', 'Bác sĩ thú y đã nhận được thông báo.');
      close();
    },
    onError: (err) => Alert.alert('Gửi thất bại', err?.message || 'Thử lại sau.'),
  });

  const togglePreset = (preset) =>
    setPresets((prev) => (prev.includes(preset) ? prev.filter((p) => p !== preset) : [...prev, preset]));

  const addPhoto = async (fromCamera) => {
    if (photos.length >= MAX_IMAGES) return;
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Chưa có quyền', fromCamera ? 'Cho phép ứng dụng dùng camera để chụp ảnh sự cố.' : 'Cho phép truy cập thư viện ảnh.');
      return;
    }
    const picker = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({ quality: 0.6, mediaTypes: ['images'] });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets].slice(0, MAX_IMAGES));
    }
  };

  const submit = () => {
    const description = [presets.join(', '), detail.trim()].filter(Boolean).join('. ');
    if (!description) {
      Alert.alert('Thiếu thông tin', 'Chọn ít nhất một dấu hiệu hoặc nhập mô tả.');
      return;
    }
    const formData = new FormData();
    formData.append('description', description);
    formData.append('severity', severity);
    photos.forEach((photo, index) => {
      formData.append('images', {
        uri: photo.uri,
        name: photo.fileName || `incident-${index}.jpg`,
        type: photo.mimeType || 'image/jpeg',
      });
    });
    mutation.mutate(formData);
  };

  const taskCfg = TASK_CONFIG[task?.taskType] || { label: task?.taskType, icon: 'note' };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Row style={styles.sheetHeader}>
            <Row style={{ gap: 8 }}><Icon name="warning" size={18} color="#dc2626" /><Text style={font.h2}>Báo cáo sự cố</Text></Row>
            <Pressable onPress={close} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </Row>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
            {task ? (
              <View style={styles.taskBox}>
                <Text style={styles.taskHorse}>{task.horse?.name}</Text>
                <Text style={font.small}>
                  {taskCfg.label} · {formatDate(task.scheduledDate)}
                </Text>
              </View>
            ) : null}

            {task?.incidentReport ? (
              <Badge label="Việc này đã có báo cáo — gửi mới sẽ thay thế báo cáo cũ" color={colors.orange} bg={colors.orangeSoft} style={styles.wrapBadge} />
            ) : null}

            <View>
              <Text style={styles.label}>Dấu hiệu ghi nhận</Text>
              <ChipGroup options={INCIDENT_PRESETS} value={presets} onChange={togglePreset} multiple />
            </View>

            <View>
              <Text style={styles.label}>Mô tả chi tiết</Text>
              <TextInput
                style={styles.textarea}
                value={detail}
                onChangeText={setDetail}
                multiline
                numberOfLines={3}
                placeholder="Thời điểm phát hiện, biểu hiện cụ thể..."
                placeholderTextColor={colors.textFaint}
              />
            </View>

            <View>
              <Text style={styles.label}>Mức độ</Text>
              <ChipGroup options={SEVERITY_OPTIONS} value={severity} onChange={setSeverity} />
            </View>

            <View>
              <Text style={styles.label}>Hình ảnh thực tế ({photos.length}/{MAX_IMAGES})</Text>
              <Row style={{ flexWrap: 'wrap', gap: spacing.sm }}>
                {photos.map((photo, index) => (
                  <Pressable key={photo.uri} onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}>
                    <Image source={{ uri: photo.uri }} style={styles.thumb} />
                    <View style={styles.removeBadge}>
                      <Text style={styles.removeText}>✕</Text>
                    </View>
                  </Pressable>
                ))}
              </Row>
              <Row style={{ marginTop: spacing.md, gap: spacing.md }}>
                <Button title="Chụp ảnh" icon="camera" variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => addPhoto(true)} />
                <Button title="Chọn từ máy" icon="gallery" variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => addPhoto(false)} />
              </Row>
            </View>
          </ScrollView>

          <Row style={styles.footer}>
            <Button title="Huỷ" variant="subtle" style={{ flex: 1 }} onPress={close} />
            <Button title="Gửi báo cáo" variant="danger" style={{ flex: 2 }} loading={mutation.isPending} onPress={submit} />
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
  taskBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSoft },
  taskHorse: { ...font.h3 },
  label: { ...font.tiny, marginBottom: spacing.sm },
  wrapBadge: { alignSelf: 'stretch' },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 90,
    textAlignVertical: 'top',
    backgroundColor: colors.white,
    fontSize: 15,
    color: colors.text,
  },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.graySoft },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.red,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  footer: { padding: spacing.lg, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.white },
});
