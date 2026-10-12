import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from '@tanstack/react-query';
import Icon from '../components/Icon';
import { Badge, Button, Card, Row, SectionTitle } from '../components/ui';
import { authApi, filesApi } from '../api/endpoints';
import { API_ORIGIN } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useStableOverview, useToday } from '../hooks/useGroomData';
import { colors, font, radius, spacing } from '../theme';

/** Turns the API's relative file URL into something <Image> can load. */
const toImageUrl = (url) => (!url || /^https?:\/\//.test(url) ? url : `${API_ORIGIN}${url}`);

/**
 * The groom's own account. The photo and the name are one card at the top because that is what a
 * colleague sees; editing and the password sit below, and the password form stays folded until it
 * is wanted — nobody changes a password on the way past.
 */
export default function ProfileScreen({ navigation }) {
  const { user, signOut, updateUser } = useAuth();
  const { myAssignments, myBlocks } = useStableOverview();
  const { todayTasks, done } = useToday();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [uploading, setUploading] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const dirty = name.trim() !== (user?.name || '') || phone.trim() !== (user?.phone || '');

  const saveProfile = useMutation({
    mutationFn: (payload) => authApi.updateProfile(payload),
    onSuccess: (res) => {
      updateUser(res.data);
      Alert.alert('Đã lưu', 'Hồ sơ của bạn đã được cập nhật.');
    },
    onError: (err) => Alert.alert('Lưu thất bại', err?.message || 'Thử lại sau.'),
  });

  const changePassword = useMutation({
    mutationFn: (payload) => authApi.changePassword(payload),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSecurityOpen(false);
      Alert.alert('Đã đổi mật khẩu', 'Lần đăng nhập sau hãy dùng mật khẩu mới.');
    },
    onError: (err) => Alert.alert('Không đổi được', err?.message || 'Thử lại sau.'),
  });

  const pickAvatar = async (fromCamera) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Chưa có quyền', fromCamera ? 'Cho phép dùng camera để chụp ảnh.' : 'Cho phép truy cập thư viện ảnh.');
      return;
    }
    const picker = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({ quality: 0.6, mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] });
    if (result.canceled) return;

    const photo = result.assets[0];
    const formData = new FormData();
    formData.append('files', { uri: photo.uri, name: photo.fileName || 'avatar.jpg', type: photo.mimeType || 'image/jpeg' });
    formData.append('purpose', 'avatar');

    setUploading(true);
    try {
      const res = await filesApi.upload(formData);
      const url = res.data?.[0]?.url;
      if (!url) throw new Error('Không nhận được link ảnh.');
      setAvatarUrl(url);
      saveProfile.mutate({ avatarUrl: url });
    } catch (err) {
      Alert.alert('Tải ảnh thất bại', err?.message || 'Thử lại sau.');
    } finally {
      setUploading(false);
    }
  };

  const chooseAvatar = () =>
    Alert.alert('Ảnh đại diện', 'Chọn cách lấy ảnh', [
      { text: 'Chụp ảnh', onPress: () => pickAvatar(true) },
      { text: 'Chọn từ thư viện', onPress: () => pickAvatar(false) },
      { text: 'Huỷ', style: 'cancel' },
    ]);

  const submitProfile = () => {
    if (!name.trim()) {
      Alert.alert('Thiếu tên', 'Tên không được để trống.');
      return;
    }
    saveProfile.mutate({ name: name.trim(), phone: phone.trim() });
  };

  const submitPassword = () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Thiếu thông tin', 'Nhập mật khẩu hiện tại và mật khẩu mới.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Mật khẩu quá ngắn', 'Mật khẩu mới cần ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Chưa khớp', 'Mật khẩu mới và ô xác nhận chưa giống nhau.');
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  };

  const confirmSignOut = () =>
    Alert.alert('Đăng xuất', 'Bạn sẽ phải đăng nhập lại ở ca sau.', [
      { text: 'Ở lại', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: () => {
          navigation.goBack();
          signOut();
        },
      },
    ]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* The card a colleague would recognise you by. */}
        <Card style={styles.hero}>
          <Row style={{ gap: spacing.lg }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Đổi ảnh đại diện" onPress={chooseAvatar}>
              {avatarUrl ? (
                <Image source={{ uri: toImageUrl(avatarUrl) }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <Text style={styles.avatarLetter}>{(user?.name || '?').trim().charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.avatarEdit}>
                <Icon name={uploading ? 'refresh' : 'camera'} size={13} color={colors.forest} />
              </View>
            </Pressable>

            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.heroName} numberOfLines={1}>
                {user?.name}
              </Text>
              <Text style={styles.heroMeta} numberOfLines={1}>
                {user?.email}
              </Text>
              {user?.phone ? (
                <Row style={{ gap: 5 }}>
                  <Icon name="phone" size={12} color={colors.gold} />
                  <Text style={styles.heroMeta}>{user.phone}</Text>
                </Row>
              ) : null}
              <Badge label="Nhân viên chăm sóc" color={colors.forest} bg={colors.gold} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            </View>
          </Row>
        </Card>

        {/* What this account is responsible for, so the screen is not only a form. */}
        <Row style={{ gap: spacing.sm }}>
          <Stat icon="stall" label="Chuồng" value={myAssignments.length} />
          <Stat icon="tasks" label="Hôm nay" value={`${done.length}/${todayTasks.length}`} />
          <Stat icon="stable" label="Khu vực" value={myBlocks.length ? myBlocks.join(', ') : '—'} small />
        </Row>

        <Card>
          <SectionTitle>Thông tin cá nhân</SectionTitle>
          <Field label="Họ tên" value={name} onChange={setName} placeholder="Họ tên" icon="person" />
          <Field
            label="Số điện thoại"
            value={phone}
            onChange={setPhone}
            placeholder="09xxxxxxxx"
            icon="phone"
            keyboardType="phone-pad"
          />
          <Button
            title={dirty ? 'Lưu thay đổi' : 'Chưa có thay đổi'}
            icon="check"
            disabled={!dirty}
            style={{ marginTop: spacing.md }}
            loading={saveProfile.isPending}
            onPress={submitProfile}
          />
        </Card>

        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: securityOpen }}
            onPress={() => setSecurityOpen((v) => !v)}
          >
            <Row style={{ gap: spacing.sm }}>
              <Icon name="lock" size={16} color={colors.forestLight} />
              <View style={{ flex: 1 }}>
                <Text style={font.h2}>Mật khẩu</Text>
                <Text style={font.small}>Đổi mật khẩu đăng nhập của bạn</Text>
              </View>
              <Icon name={securityOpen ? 'chevronUp' : 'chevronDown'} size={16} color={colors.textFaint} />
            </Row>
          </Pressable>

          {securityOpen ? (
            <View style={{ marginTop: spacing.md }}>
              <Field label="Mật khẩu hiện tại" value={currentPassword} onChange={setCurrentPassword} secure placeholder="••••••" />
              <Field label="Mật khẩu mới" value={newPassword} onChange={setNewPassword} secure placeholder="Ít nhất 6 ký tự" />
              <Field
                label="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={setConfirmPassword}
                secure
                placeholder="Nhập lại"
              />
              <Button
                title="Đổi mật khẩu"
                icon="lock"
                variant="ghost"
                style={{ marginTop: spacing.md }}
                loading={changePassword.isPending}
                onPress={submitPassword}
              />
            </View>
          ) : null}
        </Card>

        <Pressable accessibilityRole="button" onPress={confirmSignOut} style={styles.signOut}>
          <Icon name="logout" size={16} color={colors.red} />
          <Text style={styles.signOutText}>Đăng xuất</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stat({ icon, label, value, small }) {
  return (
    <Card style={styles.stat}>
      <Row style={{ gap: 5 }}>
        <Icon name={icon} size={12} color={colors.forestLight} />
        <Text style={font.tiny} numberOfLines={1}>
          {label}
        </Text>
      </Row>
      <Text style={[styles.statValue, small && { fontSize: 14 }]} numberOfLines={1}>
        {value}
      </Text>
    </Card>
  );
}

function Field({ label, value, onChange, placeholder, secure, keyboardType, icon }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        {icon ? <Icon name={icon} size={15} color={colors.textFaint} /> : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { backgroundColor: colors.forest, borderColor: colors.forest, padding: spacing.lg },
  heroName: { ...font.h1, color: colors.white },
  heroMeta: { fontSize: 12.5, color: 'rgba(255,255,255,0.75)' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.forestLight },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 28, fontWeight: '800', color: colors.gold },
  avatarEdit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stat: { flex: 1, padding: spacing.md, gap: 3 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.forest },
  label: { ...font.tiny, marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
  },
  input: { flex: 1, minHeight: 48, fontSize: 15.5, color: colors.text },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
  },
  signOutText: { color: colors.red, fontWeight: '700', fontSize: 14 },
});
