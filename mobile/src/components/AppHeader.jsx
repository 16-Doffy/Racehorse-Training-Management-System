import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from './Icon';
import { Badge, Card, EmptyState, IconButton, Row, Sheet } from './ui';
import { notificationApi } from '../api/endpoints';
import { useNotifications } from '../hooks/useGroomData';
import { formatDateTime } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const TONE = {
  critical: { label: 'Khẩn', color: colors.red, bg: colors.redSoft, icon: 'alert' },
  warning: { label: 'Lưu ý', color: colors.orange, bg: colors.orangeSoft, icon: 'warning' },
  info: { label: 'Thông tin', color: colors.blue, bg: colors.blueSoft, icon: 'info' },
};

/**
 * Screen header: title on the left, the notification bell on the right. Notifications live
 * behind the bell instead of taking a block on the dashboard, so every screen can reach them.
 */
export default function AppHeader({ title, subtitle, eyebrow, right }) {
  const [open, setOpen] = useState(false);
  const { notifications } = useNotifications();
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <>
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
          <IconButton icon={unread ? 'bellActive' : 'bell'} label="Thông báo" badge={unread} onPress={() => setOpen(true)} />
        </Row>
      </View>

      <NotificationSheet visible={open} onClose={() => setOpen(false)} notifications={notifications} unread={unread} />
    </>
  );
}

function NotificationSheet({ visible, onClose, notifications, unread }) {
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title={unread ? `Thông báo (${unread} mới)` : 'Thông báo'}>
      <ScrollView contentContainerStyle={styles.sheetBody}>
        {notifications.length === 0 ? (
          <EmptyState icon="bell" text="Chưa có thông báo nào" />
        ) : (
          notifications.map((n) => {
            const tone = TONE[n.severity] || TONE.info;
            return (
              <Card
                key={n._id}
                style={[styles.notification, !n.isRead && { borderLeftWidth: 3, borderLeftColor: tone.color }]}
                onPress={n.isRead ? undefined : () => markRead.mutate(n._id)}
              >
                <Row style={{ gap: spacing.md, alignItems: 'flex-start' }}>
                  <View style={[styles.notificationIcon, { backgroundColor: tone.bg }]}>
                    <Icon name={tone.icon} size={16} color={tone.color} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[font.body, !n.isRead && { fontWeight: '700' }]}>{n.message}</Text>
                    <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
                      {n.horse?.name ? <Badge label={n.horse.name} /> : null}
                      <Text style={font.small}>{formatDateTime(n.createdAt)}</Text>
                    </Row>
                  </View>
                  {!n.isRead ? <View style={[styles.unreadDot, { backgroundColor: tone.color }]} /> : null}
                </Row>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Sheet>
  );
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
