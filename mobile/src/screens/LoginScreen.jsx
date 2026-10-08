import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { Button } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { colors, font, radius, spacing } from '../theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
            <View style={[styles.input, styles.passwordRow]}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!showPassword}
                onSubmitEditing={submit}
                returnKeyType="go"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={10}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} color={colors.textMuted} />
              </Pressable>
            </View>

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
  brandSub: { color: 'rgba(255,255,255,0.75)', fontSize: 15, marginTop: 4 },
  form: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  label: { ...font.h3, fontSize: 14, marginBottom: spacing.sm },
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
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  passwordInput: { flex: 1, fontSize: 16, color: colors.text, minHeight: 48, paddingVertical: 0 },
  error: { color: colors.red, marginTop: spacing.lg, fontSize: 14 },
  hint: { ...font.small, textAlign: 'center', marginTop: spacing.lg },
});
