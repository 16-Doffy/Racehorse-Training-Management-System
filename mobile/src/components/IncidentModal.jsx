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
import { INCIDENT_CATEGORY, INCIDENT_PRESETS, SEVERITY, describeTask, formatDate, formatTime } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_IMAGES = 5;
const SEVERITY_OPTIONS = Object.entries(SEVERITY).map(([value, cfg]) => ({ value, label: cfg.label }));
const CATEGORY_OPTIONS = Object.entries(INCIDENT_CATEGORY).map(([value, cfg]) => ({ value, label: cfg.label }));
// When it was seen, in the steps a groom can tell without typing a time while holding a horse.
const WHEN_OPTIONS = [
  { value: 0, label: 'Vừa xong' },
  { value: 15, label: '15 phút trước' },
  { value: 30, label: '30 phút trước' },
  { value: 60, label: '1 giờ trước' },
  { value: 120, label: '2 giờ trước' },
  { value: 240, label: '4 giờ trước' },
];
// A symptom chip already says what kind of incident it is.
const PRESET_CATEGORY = {
  'Ngựa bỏ ăn': 'refused_feed',
  'Có dấu hiệu đau bụng': 'illness',
  'Có dấu hiệu sốt': 'illness',
  'Móng bị xước': 'hoof_injury',
  'Đi khập khiễng': 'hoof_injury',
  'Vết thương ngoài da': 'accident',
};

/**
 * Reports an incident on one daily task: what kind, quick symptom chips, when it was seen,
 * severity, and photos taken with the phone camera or picked from the gallery. The vet and the
 * trainer are notified by the server on submit.
 */
export default function IncidentModal({ task, visible, onClose }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [presets, setPresets] = useState([]);
  const [category, setCategory] = useState(null);
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [detail, setDetail] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [photos, setPhotos] = useState([]);

  const reset = () => {
    setPresets([]);
    setCategory(null);
    setMinutesAgo(0);
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

  const togglePreset = (preset) => {
    setPresets((prev) => (prev.includes(preset) ? prev.filter((p) => p !== preset) : [...prev, preset]));
    // The first symptom picked suggests the kind; the groom can still change it.
    if (!category && PRESET_CATEGORY[preset]) setCategory(PRESET_CATEGORY[preset]);
  };

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
    if (category) formData.append('category', category);
    if (minutesAgo > 0) formData.append('occurredAt', new Date(Date.now() - minutesAgo * 60000).toISOString());
    photos.forEach((photo, index) => {
      formData.append('images', {
        uri: photo.uri,
        name: photo.fileName || `incident-${index}.jpg`,
        type: photo.mimeType || 'image/jpeg',
      });
    });
    mutation.mutate(formData);
  };

  const taskCfg = task ? describeTask(task) : { label: '', icon: 'note' };

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
              <Text style={styles.label}>Loại sự cố</Text>
              <ChipGroup options={CATEGORY_OPTIONS} value={category} onChange={setCategory} size="sm" />
            </View>

            <View>
              <Text style={styles.label}>
                Thời điểm phát hiện{minutesAgo > 0 ? ` · khoảng ${formatTime(new Date(Date.now() - minutesAgo * 60000))}` : ''}
              </Text>
              <ChipGroup options={WHEN_OPTIONS} value={minutesAgo} onChange={setMinutesAgo} size="sm" />
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
