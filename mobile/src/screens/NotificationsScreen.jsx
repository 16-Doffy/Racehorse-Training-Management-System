import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Card, EmptyState, Loading, Row } from '../components/ui';
import { notificationApi } from '../api/endpoints';
import { useNotifications, useRefreshAll } from '../hooks/useGroomData';
import { formatDateTime } from '../utils/groom';
import { colors, font, spacing } from '../theme';

const SEVERITY_TONE = {
  critical: { color: colors.red, bg: colors.redSoft, label: 'Khẩn' },
  warning: { color: colors.orange, bg: colors.orangeSoft, label: 'Lưu ý' },
  info: { color: colors.blue, bg: colors.blueSoft, label: 'Thông tin' },
};

export default function NotificationsScreen() {
  const { notifications, isLoading } = useNotifications();
  const refreshAll = useRefreshAll();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const markRead = useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
    >
      {isLoading ? (
        <Loading />
      ) : notifications.length === 0 ? (
        <Card>
          <EmptyState emoji="🔔" text="Chưa có thông báo nào" />
        </Card>
      ) : (
        notifications.map((n) => {
          const tone = SEVERITY_TONE[n.severity] || SEVERITY_TONE.info;
          return (
            <Card
              key={n._id}
              style={!n.isRead && styles.unread}
              onPress={n.isRead ? undefined : () => markRead.mutate(n._id)}
            >
              <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <Badge label={tone.label} color={tone.color} bg={tone.bg} />
                {!n.isRead ? <Text style={styles.tapHint}>Chạm để đánh dấu đã đọc</Text> : null}
              </Row>
              <Text style={[font.body, !n.isRead && { fontWeight: '700' }]}>{n.message}</Text>
              <View style={{ marginTop: 4 }}>
                <Text style={font.small}>
                  {n.horse?.name ? `${n.horse.name} • ` : ''}
                  {formatDateTime(n.createdAt)}
                </Text>
              </View>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  unread: { borderLeftWidth: 4, borderLeftColor: colors.gold },
  tapHint: { ...font.small, color: colors.textFaint },
});
