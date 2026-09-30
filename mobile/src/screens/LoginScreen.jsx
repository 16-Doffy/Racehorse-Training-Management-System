import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { colors, font, radius, spacing } from '../theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Nhập email và mật khẩu.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err?.message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.brandMark}>RTMS</Text>
            <Text style={styles.brandTitle}>Racehorse TMS</Text>
            <Text style={styles.brandSub}>Đội Chăm sóc & Chuồng trại</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="groom@demo.com"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
            />

            <Text style={[styles.label, { marginTop: spacing.lg }]}>Mật khẩu</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              onSubmitEditing={submit}
              returnKeyType="go"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button title="Đăng nhập" onPress={submit} loading={loading} style={{ marginTop: spacing.xl }} />
            <Text style={styles.hint}>Ứng dụng dành riêng cho Nhân viên Chăm sóc. Các vai trò khác dùng bản web.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.forest },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  brandMark: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 4,
    borderWidth: 2,
    borderColor: colors.gold,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  brandTitle: { color: colors.white, fontSize: 26, fontWeight: '700', marginTop: spacing.lg },
  brandSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },
  form: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  label: { ...font.tiny, color: colors.textMuted, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.white,
  },
  error: { color: colors.red, marginTop: spacing.lg, fontSize: 13 },
  hint: { ...font.small, textAlign: 'center', marginTop: spacing.lg },
});
