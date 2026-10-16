import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from '../components/Icon';
import { Badge, Banner, Button, Card, EmptyState, Loading, Row, SectionTitle, Segments } from '../components/ui';
import RestockSheet from '../components/RestockSheet';
import HorseStage from '../components/HorseStage';
import {
  useCareEvents,
  useInjuryMarkers,
  useCarePlan,
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
  CARE_EVENT_KIND,
  HEALTH_STATUS,
  MEAL_CONFIG,
  MEDICATION_ROUTE,
  SESSION_STATUS,
  TRAINING_LEVEL,
  describeDaysLeft,
  describeTask,
  formatDate,
  formatDateTime,
  formatStock,
  formatTime,
  getFeedTypeLabel,
  getUpcomingCare,
  isSameDay,
  mealTimeOf,
  rationLine,
  refId,
  restockRequestFor,
  taskState,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

// The status colours, lightened to read on the dark 3D stage.
const ON_DARK = { eligible: '#86efac', monitoring: '#fde047', injured: '#fca5a5', quarantined: '#fdba74' };
const ON_DARK_LEVEL = { none: '#fca5a5', light: '#fdba74', moderate: '#fde047', high: '#86efac' };

// Icons for the kinds of event the timeline endpoint returns.
const TIMELINE_KIND = {
  session: { icon: 'session', color: colors.blue },
  exam: { icon: 'exam', color: colors.purple },
  treatment: { icon: 'treatment', color: colors.red },
  care: { icon: 'tasks', color: colors.green },
  incident: { icon: 'warning', color: colors.orange },
  exam_request: { icon: 'flag', color: colors.purple },
  race: { icon: 'race', color: colors.gold },
  routine_care: { icon: 'syringe', color: colors.forestLight },
};

const TABS = [
  { value: 'today', label: 'Hôm nay', icon: 'clock' },
  { value: 'care', label: 'Khẩu phần & thuốc', icon: 'rations' },
  { value: 'history', label: 'Lịch sử', icon: 'history' },
];

/**
 * One horse, in three parts: what has to happen today, what it is supposed to eat and be given,
 * and what has already happened to it. Splitting them keeps each answer a short screen rather than
 * one long scroll of cards.
 */
export default function HorseDetailScreen({ route }) {
  const { horseId } = route.params;
  const [tab, setTab] = useState('today');
  const [restock, setRestock] = useState(null);

  const { data, isLoading } = useHorse(horseId);
  const { assignmentByHorseId, lockedHorseIds } = useStableOverview();
  const { tasks } = useTasks();
  const { feedings } = useFeedings();
  const { sessions } = useSessions();
  const { records } = useHealthRecords(horseId);
  const { events } = useHorseTimeline(horseId);
  const { treatments } = useTreatments();
  const { items: inventory } = useInventory();
  const { sheets } = useCarePlan(horseId);
  const { careEvents } = useCareEvents(horseId);
  const { markers } = useInjuryMarkers(horseId);

  const horse = data?.data;
  const plan = sheets[0];
  const clearance = plan?.trainingClearance || horse?.trainingClearance;
  const clearanceCfg = clearance ? TRAINING_LEVEL[clearance.level] : null;
  const shortages = plan?.shortages || [];

  const assignment = assignmentByHorseId.get(horseId);
  const health = HEALTH_STATUS[horse?.healthStatus];
  const schedules = feedings.filter((f) => refId(f.horse) === horseId);
  const todayTasks = tasks.filter((t) => refId(t.horse) === horseId && isSameDay(t.scheduledDate, new Date()));
  // A cancelled session stays on the list with its reason, so the groom doesn't get the horse ready for nothing.
  const todaySessions = sessions.filter((s) => refId(s.horse) === horseId && isSameDay(s.scheduledAt, new Date()));
  const care = getUpcomingCare(horse, 30);
  // When the vet will come for this horse (from the open exam requests), soonest first.
  const exams = useMemo(() => plan?.exams || [], [plan]);
  const lastCareOf = (kind) => careEvents.find((e) => e.kind === kind);
  const activeTreatment = treatments.find((t) => refId(t.horse) === horseId && t.status === 'ongoing');

  const doneCount = todayTasks.filter((t) => t.status === 'completed').length;
  const mealCount = todayTasks.filter((t) => t.taskType === 'feeding').length;
  const doseCount = todayTasks.filter((t) => ['medication', 'monitoring'].includes(t.taskType)).length;

  // The horse's day in one ordered list: meals from the ration, training, and the care tasks.
  const routine = useMemo(
    () =>
      [
        ...schedules.map((s) => {
          const meal = MEAL_CONFIG[s.mealTime] || {};
          const task = todayTasks.find((t) => t.taskType === 'feeding' && t.mealSlot === s.mealTime);
          const state = taskState(task, { rations: feedings, inventory });
          return {
            key: `meal-${s._id}`,
            time: mealTimeOf(s.mealTime, schedules) || meal.defaultTime,
            icon: meal.icon || 'rations',
            color: colors.gold,
            bg: colors.goldSoft,
            label: meal.label || 'Bữa ăn',
            detail: (s.items || []).map((i) => {
              const line = rationLine(i);
              return `${line.label} ${line.amount}`;
            }).join(' · '),
            badge: state ? { label: state.label, color: state.color, bg: state.bg } : null,
          };
        }),
        ...todaySessions.map((s) => ({
          key: `session-${s._id}`,
          time: formatTime(s.scheduledAt),
          icon: 'session',
          color: colors.blue,
          bg: colors.blueSoft,
          label: s.sessionType === 'trial_run' ? 'Chạy thử' : 'Buổi tập',
          // Called off or stopped: why, so the groom knows the horse isn't going out (or came back early).
          detail:
            s.status === 'cancelled' && s.cancelReason
              ? `Đã hủy: ${s.cancelReason}`
              : s.status === 'aborted' && s.abortReason
                ? `Dừng giữa chừng: ${s.abortReason}`
                : s.objective || '',
          badge: SESSION_STATUS[s.status] || { label: s.status, color: colors.textMuted, bg: colors.graySoft },
        })),
        // The vet's visit, when it is today: the horse has to be in its stall and ready.
        ...exams
          .filter((e) => e.scheduledFor && isSameDay(e.scheduledFor, new Date()))
          .map((e) => ({
            key: `exam-${e._id}`,
            time: formatTime(e.scheduledFor),
            icon: 'exam',
            color: colors.purple,
            bg: colors.purpleSoft,
            label: `Bác sĩ khám${e.acceptedBy ? ` — BS ${e.acceptedBy}` : ''}`,
            detail: e.reason || '',
            badge: { label: 'Lịch khám', color: colors.purple, bg: colors.purpleSoft },
          })),
        ...todayTasks
          .filter((t) => t.taskType !== 'feeding')
          .map((t) => {
            const info = describeTask(t, schedules);
            const state = taskState(t, { rations: feedings, inventory });
            return {
              key: `task-${t._id}`,
              time: t.dueTime || info.time,
              icon: info.icon,
              color: info.color,
              bg: info.bg,
              label: info.label,
              detail: t.taskType === 'other' ? '' : t.note || '',
              badge: { label: state.label, color: state.color, bg: state.bg },
            };
          }),
      ].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')),
    [schedules, todayTasks, todaySessions, exams, feedings, inventory]
  );

  if (isLoading) return <Loading />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* The horse on its stage: turned 360° by hand, with the injuries the vet marked glowing where they are,
            and whether it may work — the things to know before opening a stall. */}
        <HorseStage
          name={horse?.name}
          subtitle={[assignment?.stableBlock || 'Chưa xếp chuồng', horse?.breed, horse?.weightKg ? `${horse.weightKg}kg` : null]
            .filter(Boolean)
            .join(' · ')}
          badges={[
            health ? { label: health.label, color: ON_DARK[horse?.healthStatus] || '#a7f3d0', dot: true } : null,
            clearanceCfg ? { label: clearanceCfg.label, color: ON_DARK_LEVEL[clearance.level] || '#fde68a' } : null,
            lockedHorseIds.has(horseId) ? { label: 'Khóa huấn luyện', color: '#fca5a5' } : null,
          ].filter(Boolean)}
          markers={markers}
        />

        <Card style={styles.hero}>
          <Row style={{ gap: 5 }}>
            <Icon name="person" size={13} color={colors.textFaint} />
            <Text style={font.small}>Phụ trách: {assignment?.assignedCaretaker?.name || 'Chưa có người phụ trách'}</Text>
          </Row>
          {clearance?.reason ? <Text style={styles.clearanceNote}>{clearance.reason}</Text> : null}
        </Card>

        <Row style={{ gap: spacing.sm }}>
          <MiniStat icon="tasks" label="Việc" value={`${doneCount}/${todayTasks.length}`} tint={colors.forest} />
          <MiniStat icon="rations" label="Bữa ăn" value={mealCount} tint={colors.gold} />
          <MiniStat icon="medication" label="Thuốc" value={doseCount} tint={colors.red} />
        </Row>

        {shortages.length > 0 ? (
          <Banner tone="danger">
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="supplies" size={17} color={colors.red} />
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: '700' }]}>Kho không đủ cho một ngày của ngựa này</Text>
                <Text style={font.small}>
                  {shortages.map((m) => `${m.name}: thiếu ${m.short} ${m.unit}`).join(' · ')}
                </Text>
                <Button
                  title="Xin bổ sung"
                  icon="plus"
                  variant="danger"
                  size="sm"
                  style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
                  onPress={() => setRestock(restockRequestFor({ missing: shortages, inventory }))}
                />
              </View>
            </Row>
          </Banner>
        ) : null}

        <Segments options={TABS} value={tab} onChange={setTab} />

        {tab === 'today' ? (
          <>
            <Card>
              <SectionTitle>Lịch trình trong ngày</SectionTitle>
              {routine.length === 0 ? (
                <EmptyState icon="calendar" text="Hôm nay chưa có lịch nào cho ngựa này" />
              ) : (
                routine.map((entry) => (
                  <Row key={entry.key} style={styles.routineRow}>
                    <Text style={styles.routineTime}>{entry.time || '--:--'}</Text>
                    <View style={[styles.routineIcon, { backgroundColor: entry.bg }]}>
                      <Icon name={entry.icon} size={15} color={entry.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h3}>{entry.label}</Text>
                      {entry.detail ? (
                        <Text style={font.small} numberOfLines={2}>
                          {entry.detail}
                        </Text>
                      ) : null}
                    </View>
                    {entry.badge ? <Badge label={entry.badge.label} color={entry.badge.color} bg={entry.badge.bg} /> : null}
                  </Row>
                ))
              )}
            </Card>

            {exams.length > 0 ? (
              <Card>
                <SectionTitle>Lịch bác sĩ khám</SectionTitle>
                {exams.map((e) => (
                  <Row key={e._id} style={[styles.listRow, { alignItems: 'flex-start', gap: spacing.sm }]}>
                    <Icon name="exam" size={16} color={colors.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={font.body}>
                        {e.scheduledFor ? `Hẹn ${formatDateTime(e.scheduledFor)}` : 'Chờ bác sĩ nhận và hẹn giờ'}
                        {e.acceptedBy ? ` · BS ${e.acceptedBy}` : ''}
                      </Text>
                      {e.reason ? <Text style={font.small}>{e.reason}</Text> : null}
                    </View>
                    {e.priority === 'urgent' || e.priority === 'high' ? (
                      <Badge label={e.priority === 'urgent' ? 'Khẩn' : 'Ưu tiên'} color={colors.red} bg={colors.redSoft} />
                    ) : null}
                  </Row>
                ))}
                <Text style={[font.small, { marginTop: spacing.sm }]}>Giữ ngựa trong chuồng, sẵn sàng khi bác sĩ tới.</Text>
              </Card>
            ) : null}

            <Card style={{ marginBottom: spacing.xxl }}>
              <SectionTitle>Lịch chăm sóc định kỳ</SectionTitle>
              {care.length === 0 ? (
                <Text style={font.small}>Không có lịch tiêm phòng, tẩy giun hay kiểm tra móng trong 30 ngày tới.</Text>
              ) : (
                care.map((c) => {
                  const last = lastCareOf(c.key);
                  return (
                    <Row key={c.key} style={styles.listRow}>
                      <Icon name={c.icon} size={16} color={colors.forestLight} />
                      <View style={{ flex: 1 }}>
                        <Text style={font.body}>
                          {c.label} · {formatDate(c.date)}
                        </Text>
                        {last ? <Text style={font.small}>Lần trước: {formatDate(last.date)}{last.product ? ` · ${last.product}` : ''}</Text> : null}
                      </View>
                      <Badge
                        label={describeDaysLeft(c.daysLeft)}
                        color={c.daysLeft < 0 ? colors.red : colors.textMuted}
                        bg={c.daysLeft < 0 ? colors.redSoft : colors.graySoft}
                      />
                    </Row>
                  );
                })
              )}
            </Card>
          </>
        ) : null}

        {tab === 'care' ? (
          <>
            {/* The vet's prescription: dose, the hours it is due, and the stock behind it. */}
            {plan?.prescriptions?.length ? (
              plan.prescriptions.map((prescription) => (
                <Card key={prescription._id} style={styles.vetCard}>
                  <SectionTitle right={activeTreatment?.isTrainingLocked ? <Badge label="Khóa tập" color={colors.red} bg={colors.redSoft} /> : null}>
                    Đơn thuốc đang dùng
                  </SectionTitle>
                  <Text style={font.small}>
                    BS {prescription.prescribedBy || '—'} · từ {formatDate(prescription.startDate)}
                    {prescription.endDate ? ` đến ${formatDate(prescription.endDate)}` : ''}
                  </Text>
                  {prescription.medications.map((medication, index) => (
                    <View key={index} style={styles.listRow}>
                      <Row style={{ gap: spacing.sm }}>
                        <Icon name="medication" size={16} color={colors.red} />
                        <Text style={[font.h3, { flex: 1 }]}>{medication.name}</Text>
                        <Text style={styles.qty}>{medication.dosage}</Text>
                      </Row>
                      {medication.times?.length || MEDICATION_ROUTE[medication.route] ? (
                        <Row style={{ gap: 5, marginLeft: 24, flexWrap: 'wrap' }}>
                          {MEDICATION_ROUTE[medication.route] ? <Badge label={MEDICATION_ROUTE[medication.route]} /> : null}
                          {(medication.times || []).map((time) => (
                            <Badge key={time} label={time} color={colors.forest} bg={colors.forestSoft} />
                          ))}
                        </Row>
                      ) : null}
                      <Text
                        style={[
                          font.small,
                          { marginLeft: 24, color: medication.enough === false ? colors.red : colors.textMuted },
                        ]}
                      >
                        {medication.stock
                          ? `Kho còn ${formatStock(medication.stock, medication.stock.available)}${
                              medication.dailyNeed ? ` · cần ${medication.dailyNeed} ${medication.stock.unit}/ngày` : ''
                            }`
                          : 'Chưa gắn với mặt hàng trong kho'}
                      </Text>
                    </View>
                  ))}
                  {prescription.careInstructions ? (
                    <Row style={[styles.listRow, { gap: spacing.sm }]}>
                      <Icon name="monitoring" size={16} color={colors.purple} />
                      <Text style={[font.body, { flex: 1 }]}>{prescription.careInstructions}</Text>
                    </Row>
                  ) : null}
                </Card>
              ))
            ) : (
              <Card>
                <SectionTitle>Đơn thuốc</SectionTitle>
                <Text style={font.small}>Ngựa này không có toa thuốc nào đang áp dụng.</Text>
              </Card>
            )}

            <Card style={{ marginBottom: spacing.xxl }}>
              <SectionTitle>Khẩu phần trong ngày</SectionTitle>
              {!plan?.rations?.length ? (
                <EmptyState
                  icon="rations"
                  text="Chưa có khẩu phần nào được thiết lập"
                  hint="HLV Trưởng là người lập và duyệt khẩu phần."
                />
              ) : (
                plan.rations.map((ration) => {
                  const meal = MEAL_CONFIG[ration.mealTime] || {};
                  return (
                    <View key={ration._id} style={styles.mealRow}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Row style={{ gap: 6 }}>
                          <Icon name={meal.icon || 'rations'} size={15} color={colors.forestLight} />
                          <Text style={font.h3}>{meal.label || ration.mealTime}</Text>
                        </Row>
                        <Badge label={ration.timeOfDay || meal.defaultTime} />
                      </Row>
                      {ration.items.map((item, index) => (
                        <View key={index} style={{ paddingVertical: 3 }}>
                          <Row style={{ justifyContent: 'space-between' }}>
                            <Row style={{ gap: 6, flex: 1 }}>
                              <Icon name={getFeedTypeLabel(item.name).icon} size={14} color={colors.forestLight} />
                              <Text style={font.body}>{item.stock?.name || item.name}</Text>
                            </Row>
                            <Text style={styles.qty}>{item.quantity}</Text>
                          </Row>
                          <Text
                            style={[
                              font.small,
                              { marginLeft: 20, color: item.enough === false ? colors.red : colors.textMuted },
                            ]}
                          >
                            {item.stock
                              ? `Kho còn ${formatStock(item.stock, item.stock.available)}`
                              : 'Chưa gắn với mặt hàng trong kho'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
            </Card>
          </>
        ) : null}

        {tab === 'history' ? (
          <>
            {/* One line of time across every role, so the groom sees why a horse is being treated. */}
            <Card>
              <SectionTitle>Diễn biến gần đây</SectionTitle>
              {events.length === 0 ? (
                <Text style={font.small}>Chưa có hoạt động nào được ghi nhận.</Text>
              ) : (
                events.slice(0, 20).map((e, index) => {
                  const kind = TIMELINE_KIND[e.kind] || { icon: 'note', color: colors.textMuted };
                  return (
                    <Row key={`${e.at}-${index}`} style={[styles.listRow, { alignItems: 'flex-start', gap: spacing.sm }]}>
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

            {/* What the vet recorded doing: the groom is asked "when was he last wormed?". Read-only here. */}
            <Card>
              <SectionTitle>Tiêm phòng · tẩy giun · đóng móng</SectionTitle>
              {careEvents.length === 0 ? (
                <Text style={font.small}>Bác sĩ chưa ghi lần tiêm phòng, tẩy giun hay đóng móng nào.</Text>
              ) : (
                careEvents.slice(0, 10).map((e) => {
                  const kind = CARE_EVENT_KIND[e.kind] || { label: e.kind, icon: 'note' };
                  return (
                    <Row key={e._id} style={[styles.listRow, { alignItems: 'flex-start', gap: spacing.sm }]}>
                      <View style={[styles.timelineIcon, { backgroundColor: colors.forestSoft }]}>
                        <Icon name={kind.icon} size={14} color={colors.forestLight} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={font.body}>
                          {kind.label}
                          {e.product ? ` — ${e.product}` : ''}
                        </Text>
                        <Text style={font.small}>
                          {formatDate(e.date)}
                          {e.performedBy?.name ? ` · ${e.performedBy.name}` : ''}
                          {e.batchNumber ? ` · Lô ${e.batchNumber}` : ''}
                          {e.dose ? ` · ${e.dose}` : ''}
                        </Text>
                        {e.note ? <Text style={font.small}>{e.note}</Text> : null}
                        {e.nextDue ? <Text style={[font.small, { color: colors.forestLight }]}>Hẹn lần sau: {formatDate(e.nextDue)}</Text> : null}
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
                records.slice(0, 8).map((r) => (
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
          </>
        ) : null}
      </ScrollView>

      <RestockSheet request={restock} visible={!!restock} onClose={() => setRestock(null)} />
    </View>
  );
}

/** Three numbers across the top: the day in one glance, without taking a card each. */
function MiniStat({ icon, label, value, tint }) {
  return (
    <Card style={styles.stat}>
      <Row style={{ gap: 5 }}>
        <Icon name={icon} size={13} color={tint} />
        <Text style={font.tiny} numberOfLines={1}>
          {label}
        </Text>
      </Row>
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, gap: spacing.md },
  hero: { padding: spacing.md },
  clearanceNote: { ...font.small, color: colors.orange, marginTop: spacing.sm },
  stat: { flex: 1, padding: spacing.md, gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800' },
  vetCard: { borderLeftWidth: 4, borderLeftColor: colors.red },
  mealRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingVertical: spacing.sm, gap: 2 },
  qty: { fontWeight: '800', color: colors.text },
  listRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingVertical: spacing.sm, gap: 4 },
  routineRow: { gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  routineTime: { ...font.small, fontWeight: '700', color: colors.forest, width: 42 },
  routineIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  timelineIcon: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
