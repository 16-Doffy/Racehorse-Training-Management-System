import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Icon from './Icon';
import { useOutbox } from '../offline/OutboxContext';
import { colors, font, radius, spacing } from '../theme';

/**
 * One slim strip that tells the groom the truth about the connection: offline (and how many writes
 * are saved), sending, or a write the server refused. Silent when all is well.
 */
export default function SyncBanner({ bottom }) {
  const { items, failures, online, syncing, flush, dismissFailure } = useOutbox();
  const pending = items.length;
  if (online && !pending && !failures.length) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      {failures.slice(0, 2).map((f) => (
        <View key={f.id} style={[styles.bar, styles.failure]}>
          <Icon name="warning" size={18} color={colors.red} />
          <View style={{ flex: 1 }}>
            <Text style={[font.body, { fontWeight: '600' }]} numberOfLines={1}>
              Không gửi được: {f.label}
              {f.horseName ? ` · ${f.horseName}` : ''}
            </Text>
            <Text style={font.small}>{f.message}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo lỗi" onPress={() => dismissFailure(f.id)} hitSlop={10}>
            <Icon name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}

      {!online || pending ? (
        <View style={[styles.bar, online ? styles.sending : styles.offline]}>
          <Icon name={online ? 'refresh' : 'clock'} size={18} color={online ? colors.blue : colors.orange} />
          <Text style={[font.body, { flex: 1 }]} numberOfLines={2}>
            {!online
              ? pending
                ? `Không có mạng · ${pending} thao tác đã lưu, sẽ gửi khi có mạng`
                : 'Không có mạng · đang dùng dữ liệu đã lưu trong máy'
              : syncing
                ? `Đang gửi ${pending} thao tác…`
                : `${pending} thao tác chờ gửi`}
          </Text>
          {online && !syncing ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Gửi lại ngay" onPress={flush} hitSlop={10}>
              <Text style={styles.retry}>Gửi lại</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, gap: spacing.sm },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  offline: { backgroundColor: colors.orangeSoft, borderColor: '#fdba74' },
  sending: { backgroundColor: colors.blueSoft, borderColor: '#93c5fd' },
  failure: { backgroundColor: colors.redSoft, borderColor: '#fca5a5' },
  retry: { color: colors.forestLight, fontWeight: '700', fontSize: 14 },
});
