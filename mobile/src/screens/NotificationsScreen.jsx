import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import { ChipRow, EmptyState, LoadError, Loading, Row } from '../components/ui';
import { notificationApi } from '../api/endpoints';
import { useNotifications } from '../hooks/useGroomData';
import { NOTIFICATION_GROUPS, foldNotifications, formatDayLabel, formatTime, notificationTarget, startOfDay } from '../utils/groom';
import { colors, radius, spacing } from '../theme';

/**
 * Every notification of the groom on a screen of its own: unread or all, narrowed by what they are about
 * (meals, medicine, chores, the horses, the store), by day, newest first. The same message about several
 * horses sent at once is one line ("Đến giờ bữa chiều 17:00 của 4 ngựa: Pegasus, Orion, …"). Tapping one
 * marks it read and opens where the work is: the right part of "Chăm sóc", the store, the incidents or
 * the horse.
 */
export default function NotificationsScreen({ navigation }) {
  const [view, setView] = useState('unread');
  const [group, setGroup] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { notifications, isLoading, isError, refetch } = useNotifications();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({ mutationFn: (ids) => Promise.all(ids.map((id) => notificationApi.markRead(id))), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => notificationApi.markAllRead(), onSuccess: refresh });

  const folded = useMemo(() => foldNotifications(notifications), [notifications]);
  // Counted as shown: alike ones folded into one line count once.
  const unreadCount = folded.filter((e) => e.unread).length;
  const inView = folded.filter((e) => view === 'all' || e.unread);
  const groupChips = [
    { value: 'all', label: 'Tất cả', count: inView.length },
    ...Object.entries(NOTIFICATION_GROUPS)
      .map(([key, g]) => ({ value: key, label: g.label, count: inView.filter((e) => e.group === key).length }))
      .filter((c) => c.count > 0),
  ];
  const shown = inView.filter((e) => group === 'all' || e.group === group);

  // By day, newest first, as the server sends them.
  const days = [];
  for (const e of shown) {
    const key = startOfDay(e.createdAt).getTime();
    let d = days.find((x) => x.key === key);
    if (!d) days.push((d = { key, label: formatDayLabel(e.createdAt), items: [] }));
    d.items.push(e);
  }

  const open = (entry) => {
    if (entry.unread) markRead.mutate(entry.items.filter((n) => !n.isRead).map((n) => n._id));
    const target = notificationTarget(entry.items[0]);
    if (!target) return;
    if (target.screen === 'Chăm sóc' || target.screen === 'Kho') navigation.navigate('Tabs', { screen: target.screen, params: { ...(target.params || {}), at: Date.now() } });
    else navigation.navigate(target.screen, target.params);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.toolbar}>
        <Row style={{ gap: spacing.sm }}>
          <View style={styles.switch}>
            {[
              { value: 'unread', label: `Chưa đọc${unreadCount ? ` · ${unreadCount}` : ''}` },
              { value: 'all', label: 'Tất cả' },
            ].map((o) => {
              const on = view === o.value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setView(o.value);
                    setGroup('all');
                  }}
                  style={[styles.switchItem, on && styles.switchItemOn]}
                >
                  <Text style={[styles.switchText, on && styles.switchTextOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {unreadCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đánh dấu đã đọc hết"
              disabled={markAll.isPending}
              onPress={() => markAll.mutate()}
              hitSlop={8}
              style={({ pressed }) => [styles.readAll, pressed && { opacity: 0.6 }]}
            >
              <Icon name="check" size={15} color={colors.forest} />
              <Text style={styles.readAllText}>{markAll.isPending ? 'Đang đánh dấu…' : 'Đọc hết'}</Text>
            </Pressable>
          ) : null}
        </Row>
        {groupChips.length > 2 ? <ChipRow options={groupChips} value={group} onChange={setGroup} size="sm" /> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}>
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <LoadError text="Không tải được thông báo" onRetry={refetch} />
        ) : shown.length === 0 ? (
          <View style={styles.emptyBox}>
            <EmptyState
              icon={view === 'unread' ? 'checkCircle' : 'bell'}
              text={view === 'unread' ? 'Bạn đã đọc hết thông báo' : 'Chưa có thông báo nào'}
              hint={view === 'unread' && notifications.length ? 'Chọn "Tất cả" để xem lại thông báo cũ.' : undefined}
            />
          </View>
        ) : (
          days.map((d) => (
            <View key={d.key} style={{ gap: spacing.sm }}>
              <Text style={styles.day}>{d.label}</Text>
              <View style={styles.card}>
                {d.items.map((e, i) => (
                  <NotificationRow key={e.key} entry={e} first={i === 0} onPress={() => open(e)} />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One notification (or several alike, folded): what it is about, the title, a line more, when — and a dot until it is read. */
function NotificationRow({ entry, first, onPress }) {
  const g = NOTIFICATION_GROUPS[entry.group] || NOTIFICATION_GROUPS.other;
  const urgent = entry.severity === 'critical';
  const warn = entry.severity === 'warning';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.unread ? 'Chưa đọc. ' : ''}${entry.title}. ${entry.body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowLine, entry.unread && styles.rowUnread, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.icon, { backgroundColor: g.bg }]}>
        <Icon name={g.icon} size={17} color={g.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[styles.title, entry.unread && styles.titleUnread]} numberOfLines={2}>
          {entry.title}
        </Text>
        {entry.body ? (
          <Text style={styles.body} numberOfLines={2}>
            {entry.body}
          </Text>
        ) : null}
        <Row style={{ gap: 6, marginTop: 2 }}>
          {urgent || warn ? (
            <View style={[styles.tag, { backgroundColor: urgent ? colors.redSoft : colors.orangeSoft }]}>
              <Text style={[styles.tagText, { color: urgent ? colors.red : colors.orange }]}>{urgent ? 'Khẩn' : 'Lưu ý'}</Text>
            </View>
          ) : null}
          <Text style={styles.meta} numberOfLines={1}>
            {g.label} · {formatTime(entry.createdAt)}
            {entry.items.length > 1 ? ` · ${entry.items.length} thông báo` : ''}
          </Text>
        </Row>
      </View>
      {entry.unread ? <View style={[styles.dot, { backgroundColor: urgent ? colors.red : colors.forest }]} /> : <Icon name="chevronRight" size={15} color={colors.textFaint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm, backgroundColor: colors.cream },
  switch: { flex: 1, flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: colors.graySoft },
  switchItem: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  switchItemOn: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  switchText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  switchTextOn: { color: colors.forest, fontWeight: '800' },
  readAll: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: spacing.sm },
  readAllText: { fontSize: 13, fontWeight: '800', color: colors.forest },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  emptyBox: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, marginTop: spacing.sm },
  day: { fontSize: 11.5, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 2, marginTop: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 64 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  rowUnread: { backgroundColor: '#f7fbf8' },
  icon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.text },
  titleUnread: { fontWeight: '800' },
  body: { fontSize: 12.5, lineHeight: 17, color: colors.textMuted },
  meta: { flexShrink: 1, fontSize: 11.5, fontWeight: '600', color: colors.textFaint },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
  tagText: { fontSize: 10.5, fontWeight: '800' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
});
