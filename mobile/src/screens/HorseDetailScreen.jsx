import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, EmptyState, HorseAvatar, Loading, Row, SectionTitle } from '../components/ui';
import { useFeedings, useHealthRecords, useHorse, useSessions, useStableOverview, useTasks } from '../hooks/useGroomData';
import {
  HEALTH_STATUS,
  MEAL_CONFIG,
  MEAL_ORDER,
  TASK_STATUS,
  describeDaysLeft,
  describeTask,
  formatDate,
  formatTime,
  getFeedTypeLabel,
  getUpcomingCare,
  isSameDay,
  mealTimeOf,
  refId,
} from '../utils/groom';
import { colors, font, spacing } from '../theme';

/** Everything the groom needs about one horse: today's routine, care dates and recent health notes. */
export default function HorseDetailScreen({ route }) {
  const { horseId } = route.params;
  const { data, isLoading } = useHorse(horseId);
  const { assignmentByHorseId, lockedHorseIds } = useStableOverview();
  const { tasks } = useTasks();
  const { feedings } = useFeedings();
  const { sessions } = useSessions();
  const { records } = useHealthRecords(horseId);

  const horse = data?.data;
  const assignment = assignmentByHorseId.get(horseId);
  const health = HEALTH_STATUS[horse?.healthStatus];
  const schedules = feedings.filter((f) => refId(f.horse) === horseId);
  const todayTasks = tasks.filter((t) => refId(t.horse) === horseId && isSameDay(t.scheduledDate, new Date()));
  const todaySessions = sessions.filter(
    (s) => refId(s.horse) === horseId && isSameDay(s.scheduledAt, new Date()) && s.status !== 'cancelled'
  );
  const care = getUpcomingCare(horse, 30);

  if (isLoading) return <Loading />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Row style={{ gap: spacing.md }}>
          <HorseAvatar name={horse?.name} size={54} />
          <View style={{ flex: 1 }}>
            <Text style={font.h1}>{horse?.name}</Text>
            <Text style={font.small}>
              {assignment?.stableBlock || 'Chưa xếp chuồng'}
              {horse?.breed ? ` • ${horse.breed}` : ''}
              {horse?.weightKg ? ` • ${horse.weightKg}kg` : ''}
            </Text>
          </View>
        </Row>
        <Row style={{ gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
          {health ? <Badge label={health.label} color={health.color} bg={health.bg} /> : null}
          {lockedHorseIds.has(horseId) ? <Badge label="🔒 Khóa huấn luyện" color={colors.red} bg={colors.redSoft} /> : null}
          <Badge label={`👤 ${assignment?.assignedCaretaker?.name || 'Chưa có người phụ trách'}`} />
        </Row>
      </Card>

      <Card>
        <SectionTitle>Khẩu phần trong ngày</SectionTitle>
        {schedules.length === 0 ? (
          <EmptyState emoji="🍽️" text="Chưa có khẩu phần nào được thiết lập" hint="HLV Trưởng là người lập và duyệt khẩu phần." />
        ) : (
          MEAL_ORDER.map((slot) => {
            const meal = MEAL_CONFIG[slot];
            const forSlot = schedules.filter((s) => s.mealTime === slot);
            return (
              <View key={slot} style={styles.mealRow}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={font.h3}>
                    {meal.emoji} {meal.label}
                  </Text>
                  <Badge label={mealTimeOf(slot, schedules) || meal.defaultTime} />
                </Row>
                {forSlot.length === 0 ? (
                  <Text style={font.small}>Chưa thiết lập</Text>
                ) : (
                  forSlot.map((s) => (
                    <View key={s._id}>
                      {(s.items || []).map((item, index) => {
                        const feed = getFeedTypeLabel(item.type);
                        return (
                          <Row key={index} style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                            <Text style={font.body}>
                              {feed.emoji} {feed.label}
                            </Text>
                            <Text style={styles.qty}>{item.quantity}</Text>
                          </Row>
                        );
                      })}
                      <Text style={font.small}>
                        {s.approvedBy ? `✓ Duyệt bởi ${s.approvedBy.name || 'HLV'}` : 'Chờ duyệt'}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <SectionTitle>Lịch hôm nay</SectionTitle>
        {todayTasks.length === 0 && todaySessions.length === 0 ? (
          <Text style={font.small}>Không có công việc hay buổi tập nào hôm nay.</Text>
        ) : (
          <>
            {todaySessions.map((s) => (
              <Row key={s._id} style={styles.listRow}>
                <Text style={{ flex: 1 }}>
                  🏇 {s.sessionType === 'trial_run' ? 'Chạy thử' : 'Buổi tập'} • {formatTime(s.scheduledAt)}
                </Text>
                <Badge label={s.status === 'in_progress' ? 'Đang diễn ra' : s.status === 'completed' ? 'Xong' : 'Đã lên lịch'} />
              </Row>
            ))}
            {todayTasks.map((t) => {
              const info = describeTask(t, schedules);
              const status = TASK_STATUS[t.status] || TASK_STATUS.pending;
              return (
                <Row key={t._id} style={styles.listRow}>
                  <Text style={{ flex: 1 }}>
                    {info.emoji} {info.label}
                    {info.time ? ` • ${info.time}` : ''}
                  </Text>
                  <Badge label={status.label} color={status.color} bg={status.bg} />
                </Row>
              );
            })}
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>Lịch chăm sóc định kỳ</SectionTitle>
        {care.length === 0 ? (
          <Text style={font.small}>Không có lịch tiêm phòng, tẩy giun hay kiểm tra móng trong 30 ngày tới.</Text>
        ) : (
          care.map((c) => (
            <Row key={c.key} style={styles.listRow}>
              <Text style={{ flex: 1 }}>
                {c.emoji} {c.label} • {formatDate(c.date)}
              </Text>
              <Badge
                label={describeDaysLeft(c.daysLeft)}
                color={c.daysLeft < 0 ? colors.red : colors.textMuted}
                bg={c.daysLeft < 0 ? colors.redSoft : colors.graySoft}
              />
            </Row>
          ))
        )}
      </Card>

      <Card style={{ marginBottom: spacing.xxl }}>
        <SectionTitle>Hồ sơ khám gần đây</SectionTitle>
        {records.length === 0 ? (
          <Text style={font.small}>Chưa có hồ sơ khám bệnh nào.</Text>
        ) : (
          records.slice(0, 5).map((r) => (
            <View key={r._id} style={styles.listRow}>
              <Text style={font.body}>{r.diagnosis}</Text>
              <Text style={font.small}>
                {formatDate(r.date || r.createdAt)}
                {r.examinedBy?.name ? ` • BS ${r.examinedBy.name}` : ''}
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, gap: spacing.lg },
  mealRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingVertical: spacing.sm, gap: 2 },
  qty: { fontWeight: '700', color: colors.text },
  listRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingVertical: spacing.sm, gap: 2 },
});
