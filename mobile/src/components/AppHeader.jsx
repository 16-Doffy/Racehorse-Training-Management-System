import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { useNavigation } from '@react-navigation/native';
import Icon from './Icon';
import { IconButton, Row } from './ui';
import { useNotifications } from '../hooks/useGroomData';
import { colors, font, radius, spacing } from '../theme';


/**
 * Screen header: title on the left, the screen's own actions on the right. The notification bell
 * is shown only where `bell` is set — the dashboard, the screen a groom opens first — so the work
 * screens keep their header for their own actions.
 */
export default function AppHeader({ title, subtitle, eyebrow, right, bell = false }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={font.tiny}>{eyebrow}</Text> : null}
        <Text style={font.h1} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={font.small} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Row style={{ gap: spacing.sm }}>
        {right}
        {bell ? <NotificationBell /> : null}
      </Row>
    </View>
  );
}

/** The bell with its unread count; it opens the notifications screen. Notifications are fetched only here. */
export function NotificationBell() {
  const navigation = useNavigation();
  const { notifications } = useNotifications();
  const unread = notifications.filter((n) => !n.isRead).length;
  return <IconButton icon={unread ? 'bellActive' : 'bell'} label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'} badge={unread} onPress={() => navigation.navigate('Notifications')} />;
}

/** Compact header for screens inside the tab bar that also need a back-free title row. */
export function ScreenToolbar({ children, style }) {
  return <View style={[styles.toolbar, style]}>{children}</View>;
}

export function LogoutButton({ onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Đăng xuất" onPress={onPress} style={styles.logout} hitSlop={6}>
      <Icon name="logout" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.cream,
  },
  toolbar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md, backgroundColor: colors.cream },
  sheetBody: { padding: spacing.lg, gap: spacing.md },
  notification: { padding: spacing.md },
  notificationIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  readAll: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' },
  readAllText: { color: colors.forestLight, fontWeight: '700', fontSize: 13 },
  logout: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
