import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Banner, Button, Card, EmptyState, HorseAvatar, Row, SectionTitle, StatTile } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useFeedings, useNotifications, useInventory, useRefreshAll, useStableOverview, useToday } from '../hooks/useGroomData';
import {
  HEALTH_STATUS,
  MEAL_CONFIG,
  MEAL_ORDER,
  describeDaysLeft,
  describeTask,
  formatDayLabel,
  formatDateTime,
  getStockLevel,
  getUpcomingCare,
  mealTimeOf,
  parseStableBlock,
  refId,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

export default function DashboardScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const refreshAll = useRefreshAll();
  const [refreshing, setRefreshing] = useState(false);

  const { todayTasks, done, pending, overdue, isLoading } = useToday();
  const { myAssignments, myHorseIds, myBlocks, horseById } = useStableOverview();
  const { feedings } = useFeedings();
  const { items } = useInventory();
  const { notifications } = useNotifications();

  const lowStock = items.filter((i) => getStockLevel(i.quantity).key !== 'ok');
  const percent = todayTasks.length ? Math.round((done.length / todayTasks.length) * 100) : 0;

  const careReminders = useMemo(
    () =>
      [...myHorseIds]
        .flatMap((id) => getUpcomingCare(horseById.get(id), 7).map((c) => ({ ...c, horse: horseById.get(id) })))
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .slice(0, 5),
    [myHorseIds, horseById]
  );

  // Next meal across the horses this groom looks after, using each ration's own clock time.
  const nextMeal = useMemo(() => {
    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const slots = MEAL_ORDER.map((slot) => {
      const time = mealTimeOf(slot, feedings.filter((f) => myHorseIds.has(refId(f.horse)))) || MEAL_CONFIG[slot].defaultTime;
      const [hh, mm] = time.split(':').map(Number);
      return { slot, time, minutes: hh * 60 + mm };
    });
    return slots.find((s) => s.minutes + 60 > minutesNow) || { ...slots[0], tomorrow: true };
  }, [feedings, myHorseIds]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={font.tiny}>{formatDayLabel(new Date())}</Text>
            <Text style={styles.hello}>Xin chào, {user?.name}</Text>
            <Text style={font.small}>
              Bạn phụ trách {myAssignments.length} chiến mã{myBlocks.length ? ` tại ${myBlocks.join(', ')}` : ''}
            </Text>
          </View>
          <Pressable onPress={signOut} style={styles.logout} hitSlop={8}>
            <Text style={styles.logoutText}>Thoát</Text>
          </Pressable>
        </View>

        <Card style={styles.progressCard}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.progressLabel}>Tiến độ hôm nay</Text>
            <Text style={styles.progressCount}>
              {done.length}/{todayTasks.length} việc
            </Text>
          </Row>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.progressMeal}>
            {MEAL_CONFIG[nextMeal.slot].emoji} {nextMeal.tomorrow ? 'Bữa đầu ngày mai' : `Sắp tới: ${MEAL_CONFIG[nextMeal.slot].label}`} lúc{' '}
            <Text style={{ color: colors.gold, fontWeight: '700' }}>{nextMeal.time}</Text>
          </Text>
          <Row style={{ marginTop: spacing.lg, gap: spacing.md }}>
            <Button title="Làm việc hôm nay" variant="gold" style={{ flex: 1 }} onPress={() => navigation.navigate('Việc')} />
            <Button title="Báo sự cố" variant="danger" style={{ flex: 1 }} onPress={() => navigation.navigate('Incidents')} />
          </Row>
        </Card>

        {overdue.length > 0 && (
          <Banner tone="warning">
            <Text style={font.body}>⚠️ Còn {overdue.length} việc quá hạn từ những ngày trước.</Text>
            <Button
              title="Xem ngay"
              variant="subtle"
              size="sm"
              style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}
              onPress={() => navigation.navigate('Việc')}
            />
          </Banner>
        )}

        <View style={styles.statRow}>
          <StatTile label="Việc hôm nay" value={done.length} suffix={`/ ${todayTasks.length}`} tint={colors.green} onPress={() => navigation.navigate('Việc')} />
          <StatTile label="Còn phải làm" value={pending.length + overdue.length} tint={colors.gold} onPress={() => navigation.navigate('Việc')} />
        </View>
        <View style={styles.statRow}>
          <StatTile label="Chiến mã phụ trách" value={myAssignments.length} onPress={() => navigation.navigate('Chuồng')} />
          <StatTile label="Vật tư sắp hết" value={lowStock.length} tint={colors.red} onPress={() => navigation.navigate('Vật tư')} />
        </View>

        <Card>
          <SectionTitle
            right={
              <Pressable onPress={() => navigation.navigate('Việc')} hitSlop={8}>
                <Text style={styles.link}>Xem tất cả →</Text>
              </Pressable>
            }
          >
            Việc cần làm
          </SectionTitle>
          {isLoading ? (
            <Text style={font.small}>Đang tải...</Text>
          ) : pending.length === 0 ? (
            <EmptyState
              emoji={todayTasks.length ? '✅' : '📭'}
              text={todayTasks.length ? 'Đã xong hết việc hôm nay' : 'Chưa có việc nào được giao hôm nay'}
            />
          ) : (
            pending.slice(0, 5).map((task) => {
              const info = describeTask(task, feedings.filter((f) => refId(f.horse) === refId(task.horse)));
              return (
                <Pressable
                  key={task._id}
                  style={styles.taskRow}
                  onPress={() => navigation.navigate('Việc', { taskId: task._id })}
                >
                  <Text style={{ fontSize: 20 }}>{info.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskLabel}>{info.label}</Text>
                    <Text style={font.small}>
                      {task.horse?.name}
                      {info.time ? ` • ${info.time}` : ''}
                    </Text>
                  </View>
                  {task.trainingSession ? <Badge label="Sau buổi tập" color={colors.blue} bg={colors.blueSoft} /> : null}
                </Pressable>
              );
            })
          )}
        </Card>

        <Card>
          <SectionTitle
            right={
              <Pressable onPress={() => navigation.navigate('Chuồng')} hitSlop={8}>
                <Text style={styles.link}>Sơ đồ →</Text>
              </Pressable>
            }
          >
            Chuồng phụ trách
          </SectionTitle>
          {myAssignments.length === 0 ? (
            <EmptyState emoji="🏠" text="Bạn chưa được phân công chuồng nào" hint="Liên hệ Quản lý CLB để được xếp chuồng." />
          ) : (
            myAssignments.map((a) => {
              const horseId = refId(a.horse);
              const horse = horseById.get(horseId);
              const health = HEALTH_STATUS[horse?.healthStatus] || HEALTH_STATUS.eligible;
              const horseTasks = todayTasks.filter((t) => refId(t.horse) === horseId);
              const doneCount = horseTasks.filter((t) => t.status === 'completed').length;
              return (
                <Pressable
                  key={a._id}
                  style={styles.stallRow}
                  onPress={() => navigation.navigate('HorseDetail', { horseId, name: a.horse?.name })}
                >
                  <HorseAvatar name={a.horse?.name} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskLabel}>{a.horse?.name}</Text>
                    <Text style={font.small}>{parseStableBlock(a.stableBlock).stall}</Text>
                  </View>
                  <Badge label={health.label} color={health.color} bg={health.bg} />
                  {horseTasks.length > 0 && (
                    <Text style={font.small}>
                      {doneCount}/{horseTasks.length}
                    </Text>
                  )}
                </Pressable>
              );
            })
          )}
        </Card>

        <Card>
          <SectionTitle>Nhắc lịch chăm sóc (7 ngày)</SectionTitle>
          {careReminders.length === 0 ? (
            <Text style={font.small}>Không có lịch tiêm phòng, tẩy giun hay kiểm tra móng sắp tới.</Text>
          ) : (
            careReminders.map((c) => (
              <Row key={`${c.horse?._id}-${c.key}`} style={styles.careRow}>
                <Text style={{ flex: 1 }}>
                  {c.emoji} {c.label} • <Text style={{ fontWeight: '700' }}>{c.horse?.name}</Text>
                </Text>
                <Badge
                  label={describeDaysLeft(c.daysLeft)}
                  color={c.daysLeft < 0 ? colors.red : c.daysLeft <= 2 ? colors.orange : colors.textMuted}
                  bg={c.daysLeft < 0 ? colors.redSoft : c.daysLeft <= 2 ? colors.orangeSoft : colors.graySoft}
                />
              </Row>
            ))
          )}
        </Card>

        <Card style={{ marginBottom: spacing.xxl }}>
          <SectionTitle
            right={
              <Pressable onPress={() => navigation.navigate('Notifications')} hitSlop={8}>
                <Text style={styles.link}>Tất cả →</Text>
              </Pressable>
            }
          >
            Thông báo
          </SectionTitle>
          {notifications.length === 0 ? (
            <Text style={font.small}>Không có thông báo mới.</Text>
          ) : (
            notifications.slice(0, 4).map((n) => (
              <View key={n._id} style={styles.notiRow}>
                <Text style={[font.body, !n.isRead && { fontWeight: '700' }]}>{n.message}</Text>
                <Text style={font.small}>{formatDateTime(n.createdAt)}</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  hello: { ...font.h1, marginVertical: 2 },
  logout: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  logoutText: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  progressCard: { backgroundColor: colors.forest, borderColor: colors.forest },
  progressLabel: { ...font.tiny, color: colors.gold },
  progressCount: { color: colors.white, fontWeight: '700' },
  progressTrack: { height: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.pill, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: 10, backgroundColor: colors.gold, borderRadius: radius.pill },
  progressMeal: { color: 'rgba(255,255,255,0.85)', marginTop: spacing.md, fontSize: 13 },
  statRow: { flexDirection: 'row', gap: spacing.md },
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 13 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  taskLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  stallRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  careRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  notiRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft, gap: 2 },
});
