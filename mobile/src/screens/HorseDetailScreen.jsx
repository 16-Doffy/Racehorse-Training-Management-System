import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import Icon from '../components/Icon';
import { Badge, Card, EmptyState, HorseAvatar, Loading, Row, SectionTitle } from '../components/ui';
import {
  useFeedings,
  useHealthRecords,
  useHorse,
  useHorseTimeline,
  useInventory,
  useSessions,
  useStableOverview,
  useTasks,
  useTreatments,
} from '../hooks/useGroomData';
import {
  HEALTH_STATUS,
  MEAL_CONFIG,
  MEAL_ORDER,
  SESSION_STATUS,
  TASK_STATUS,
  describeDaysLeft,
  describeTask,
  findStock,
  formatDate,
  formatDateTime,
  formatTime,
  getFeedTypeLabel,
  getUpcomingCare,
  isSameDay,
  mealSlotOf,
  mealTimeOf,
  refId,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

// Icons for the kinds of event the timeline endpoint returns.
const TIMELINE_KIND = {
  session: { icon: 'session', color: colors.blue },
  exam: { icon: 'exam', color: colors.purple },
  treatment: { icon: 'treatment', color: colors.red },
  care: { icon: 'tasks', color: colors.green },
  incident: { icon: 'warning', color: colors.orange },
  exam_request: { icon: 'flag', color: colors.purple },
  race: { icon: 'race', color: colors.gold },
};

/** Everything the groom needs about one horse: today's routine, prescription, care dates, history. */
export default function HorseDetailScreen({ route }) {
  const { horseId } = route.params;
  const { data, isLoading } = useHorse(horseId);
  const { assignmentByHorseId, lockedHorseIds } = useStableOverview();
  const { tasks } = useTasks();
  const { feedings } = useFeedings();
  const { sessions } = useSessions();
  const { records } = useHealthRecords(horseId);
  const { events } = useHorseTimeline(horseId);
  const { treatments } = useTreatments();
  const { items: inventory } = useInventory();

  const horse = data?.data;
  const assignment = assignmentByHorseId.get(horseId);
  const health = HEALTH_STATUS[horse?.healthStatus];
  const schedules = feedings.filter((f) => refId(f.horse) === horseId);
  const todayTasks = tasks.filter((t) => refId(t.horse) === horseId && isSameDay(t.scheduledDate, new Date()));
  const todaySessions = sessions.filter(
    (s) => refId(s.horse) === horseId && isSameDay(s.scheduledAt, new Date()) && s.status !== 'cancelled'
  );
  const care = getUpcomingCare(horse, 30);
  const activeTreatments = treatments.filter((t) => refId(t.horse) === horseId && t.status === 'ongoing');

  // The horse's day in one ordered list: meals from the ration, training, and the care tasks.
  const routine = [
    ...schedules.map((s) => {
      const meal = MEAL_CONFIG[s.mealTime] || {};
      const task = todayTasks.find((t) => t.taskType === 'feeding' && mealSlotOf(t) === s.mealTime);
      const status = task ? TASK_STATUS[task.status] : null;
      return {
        key: `meal-${s._id}`,
        time: mealTimeOf(s.mealTime, schedules) || meal.defaultTime,
        icon: meal.icon || 'rations',
        color: colors.gold,
        bg: colors.goldSoft,
        label: meal.label || 'Bữa ăn',
        detail: (s.items || []).map((i) => `${getFeedTypeLabel(i.type).label} ${i.quantity}`).join(' · '),
        badge: status ? { label: status.label, color: status.color, bg: status.bg } : null,
      };
    }),
    ...todaySessions.map((s) => ({
      key: `session-${s._id}`,
      time: formatTime(s.scheduledAt),
      icon: 'session',
      color: colors.blue,
      bg: colors.blueSoft,
      label: s.sessionType === 'trial_run' ? 'Chạy thử' : 'Buổi tập',
      detail: s.objective || '',
      badge: SESSION_STATUS[s.status] || SESSION_STATUS.scheduled,
    })),
    ...todayTasks
      .filter((t) => t.taskType !== 'feeding')
      .map((t) => {
        const info = describeTask(t, schedules);
        const status = TASK_STATUS[t.status] || TASK_STATUS.pending;
        return {
          key: `task-${t._id}`,
          time: info.time,
          icon: info.icon,
          color: info.color,
          bg: info.bg,
          label: info.label,
          detail: t.note || '',
          badge: { label: status.label, color: status.color, bg: status.bg },
        };
      }),
  ].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  if (isLoading) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Loading />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Row style={{ gap: spacing.md }}>
          <HorseAvatar name={horse?.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={font.h1}>{horse?.name}</Text>
            <Text style={font.small}>
              {assignment?.stableBlock || 'Chưa xếp chuồng'}
              {horse?.breed ? ` · ${horse.breed}` : ''}
              {horse?.weightKg ? ` · ${horse.weightKg}kg` : ''}
            </Text>
          </View>
        </Row>
        <Row style={{ gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
          {health ? <Badge label={health.label} color={health.color} bg={health.bg} dot /> : null}
          {lockedHorseIds.has(horseId) ? <Badge label="Khóa huấn luyện" color={colors.red} bg={colors.redSoft} /> : null}
          <Badge label={assignment?.assignedCaretaker?.name || 'Chưa có người phụ trách'} />
        </Row>
      </Card>

      {/* The vet's prescription, with what the store has left of each medicine. */}
      {activeTreatments.length > 0 ? (
        <Card style={styles.vetCard}>
          <SectionTitle>Toa thuốc đang dùng</SectionTitle>
          {activeTreatments.map((treatment) => (
            <View key={treatment._id} style={{ gap: spacing.sm }}>
              <Text style={font.small}>
                BS {treatment.prescribedBy?.name || '—'} · từ {formatDate(treatment.startDate)}
                {treatment.endDate ? ` đến ${formatDate(treatment.endDate)}` : ''}
              </Text>
              {(treatment.medications || []).map((medication, index) => {
                const stock = findStock(medication.name, inventory, 'medicine');
                return (
                  <Row key={index} style={styles.listRow}>
                    <Icon name="medication" size={16} color={colors.red} />
                    <View style={{ flex: 1 }}>
                      <Text style={font.h3}>{medication.name}</Text>
                      <Text style={font.small}>
                        {[medication.dosage, medication.frequency].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Badge
                      label={stock ? `Kho ${stock.quantity} ${stock.unit}` : 'Chưa có trong kho'}
                      color={stock ? stock.level.color : colors.textMuted}
                      bg={stock ? stock.level.bg : colors.graySoft}
                    />
                  </Row>
                );
              })}
              {treatment.careInstructions ? (
                <Row style={styles.listRow}>
                  <Icon name="monitoring" size={16} color={colors.purple} />
                  <Text style={[font.body, { flex: 1 }]}>{treatment.careInstructions}</Text>
                </Row>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle right={<Badge label={formatDate(new Date())} />}>Hôm nay</SectionTitle>
        {routine.length === 0 ? (
          <Text style={font.small}>Chưa có bữa ăn, buổi tập hay công việc nào cho hôm nay.</Text>
        ) : (
          routine.map((entry) => (
            <Row key={entry.key} style={styles.routineRow}>
              <Text style={styles.routineTime}>{entry.time || '--:--'}</Text>
              <View style={[styles.routineIcon, { backgroundColor: entry.bg }]}>
                <Icon name={entry.icon} size={15} color={entry.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font.body} numberOfLines={1}>
                  {entry.label}
                </Text>
                {entry.detail ? (
                  <Text style={font.small} numberOfLines={1}>
                    {entry.detail}
                  </Text>
                ) : null}
              </View>
              {entry.badge ? <Badge label={entry.badge.label} color={entry.badge.color} bg={entry.badge.bg} /> : null}
            </Row>
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>Khẩu phần trong ngày</SectionTitle>
        {schedules.length === 0 ? (
          <EmptyState icon="rations" text="Chưa có khẩu phần nào được thiết lập" hint="HLV Trưởng là người lập và duyệt khẩu phần." />
        ) : (
          MEAL_ORDER.map((slot) => {
            const meal = MEAL_CONFIG[slot];
            const forSlot = schedules.filter((s) => s.mealTime === slot);
            return (
              <View key={slot} style={styles.mealRow}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row style={{ gap: 6 }}>
                    <Icon name={meal.icon} size={15} color={colors.forestLight} />
                    <Text style={font.h3}>{meal.label}</Text>
                  </Row>
                  <Badge label={mealTimeOf(slot, schedules) || meal.defaultTime} />
                </Row>
                {forSlot.length === 0 ? (
                  <Text style={font.small}>Chưa thiết lập</Text>
                ) : (
                  forSlot.map((s) => (
                    <View key={s._id}>
                      {(s.items || []).map((item, index) => {
                        const feed = getFeedTypeLabel(item.type);
                        const stock = findStock(item.type, inventory, 'feed');
                        return (
                          <View key={index} style={{ paddingVertical: 3 }}>
                            <Row style={{ justifyContent: 'space-between' }}>
                              <Row style={{ gap: 6, flex: 1 }}>
                                <Icon name={feed.icon} size={14} color={colors.forestLight} />
                                <Text style={font.body}>{feed.label}</Text>
                              </Row>
                              <Text style={styles.qty}>{item.quantity}</Text>
                            </Row>
                            <Text style={[font.small, { marginLeft: 20, color: stock ? stock.level.color : colors.textFaint }]}>
                              {stock ? `Kho còn ${stock.quantity} ${stock.unit}` : 'Chưa có trong kho'}
                            </Text>
                          </View>
                        );
                      })}
                      <Text style={[font.small, { color: s.approvedBy ? colors.green : colors.orange }]}>
                        {s.approvedBy ? `Duyệt bởi ${s.approvedBy.name || 'HLV'}` : 'Chờ duyệt'}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            );
          })
        )}
      </Card>

      {/* The horse's day, in order: meals, training and care, each with where it stands. */}
      <Card>
        <SectionTitle>Lịch chăm sóc định kỳ</SectionTitle>
        {care.length === 0 ? (
          <Text style={font.small}>Không có lịch tiêm phòng, tẩy giun hay kiểm tra móng trong 30 ngày tới.</Text>
        ) : (
          care.map((c) => (
            <Row key={c.key} style={styles.listRow}>
              <Icon name={c.icon} size={16} color={colors.forestLight} />
              <View style={{ flex: 1 }}>
                <Text style={font.body}>{c.label}</Text>
                <Text style={font.small}>{formatDate(c.date)}</Text>
              </View>
              <Badge
                label={describeDaysLeft(c.daysLeft)}
                color={c.daysLeft < 0 ? colors.red : colors.textMuted}
                bg={c.daysLeft < 0 ? colors.redSoft : colors.graySoft}
              />
            </Row>
          ))
        )}
      </Card>

      {/* One line of time across every role, so the groom sees why a horse is being treated. */}
      <Card>
        <SectionTitle>Diễn biến gần đây</SectionTitle>
        {events.length === 0 ? (
          <Text style={font.small}>Chưa có hoạt động nào được ghi nhận.</Text>
        ) : (
          events.slice(0, 12).map((e, index) => {
            const kind = TIMELINE_KIND[e.kind] || { icon: 'note', color: colors.textMuted };
            return (
              <Row key={`${e.at}-${index}`} style={[styles.listRow, { alignItems: 'flex-start' }]}>
                <View style={[styles.timelineIcon, { backgroundColor: colors.graySoft }]}>
                  <Icon name={kind.icon} size={14} color={kind.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={font.body}>{e.title}</Text>
                  {e.detail ? <Text style={font.small}>{e.detail}</Text> : null}
                  <Text style={font.small}>{formatDateTime(e.at)}</Text>
                </View>
              </Row>
            );
          })
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
                {r.examinedBy?.name ? ` · BS ${r.examinedBy.name}` : ''}
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
  content: { padding: spacing.lg, gap: spacing.md },
  vetCard: { borderLeftWidth: 4, borderLeftColor: colors.red },
  mealRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingVertical: spacing.sm, gap: 2 },
  qty: { fontWeight: '800', color: colors.text },
  listRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingVertical: spacing.sm, gap: spacing.sm },
  routineRow: { gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  routineTime: { ...font.small, fontWeight: '700', color: colors.forest, width: 42 },
  routineIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  timelineIcon: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
