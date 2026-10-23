import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from '../components/Icon';
import { Badge, Banner, Button, EmptyState, Loading, Row, Segments } from '../components/ui';
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
  stallCodeOf,
  taskState,
} from '../utils/groom';
import { coatFor } from '../three/horseBreeds';
import { colors, font, radius, spacing } from '../theme';

const STAGE_HEIGHT = 220;
// How many lines of a history list show before "Xem thêm".
const FIRST = 4;

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

// Where a task stands, in a word or two: a line of the day has no room for the full label.
const SHORT_STATE = { ready: 'Bây giờ', upcoming: 'Sắp tới', late: 'Trễ', missed: 'Quá giờ', blocked: 'Bị chặn', completed: 'Xong', unable: 'Không làm', cancelled: 'Bỏ qua' };
const badgeOf = (state) => (state ? { label: SHORT_STATE[state.key] || state.label, color: state.color, bg: state.bg } : null);

const TABS = [
  { value: 'today', label: 'Hôm nay', icon: 'clock' },
  { value: 'care', label: 'Ăn & thuốc', icon: 'rations' },
  { value: 'history', label: 'Lịch sử', icon: 'history' },
];

/**
 * One horse, kept short: the horse in 3D (with where it is hurt) and one strip of who looks after it
 * and how its day stands, then three parts behind tabs that stay at the top while scrolling — what
 * happens today, what it eats and is given, and what has happened to it. Each list shows its first
 * lines and the rest on "Xem thêm", so no part becomes a long scroll of cards.
 */
export default function HorseDetailScreen({ route }) {
  const { horseId } = route.params;
  const [tab, setTab] = useState('today');
  const [restock, setRestock] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

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
  // Painted the way the Manager set the horse up: its breed, or its own coat colour.
  const coat = useMemo(() => coatFor({ breed: horse?.breed, color: horse?.color }), [horse?.breed, horse?.color]);
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
  const stall = stallCodeOf(assignment);

  // The horse's day in one ordered list: meals from the ration, training, the vet's visit and the care tasks.
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
            detail: (s.items || [])
              .map((i) => {
                const line = rationLine(i);
                return `${line.label} ${line.amount}`;
              })
              .join(' · '),
            badge: badgeOf(state),
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
          detail: s.status === 'cancelled' && s.cancelReason ? `Đã hủy: ${s.cancelReason}` : s.status === 'aborted' && s.abortReason ? `Dừng giữa chừng: ${s.abortReason}` : s.objective || '',
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
              // A watch order is for the whole day; the hour on its task is only when it was written.
              time: t.dueTime || (t.taskType === 'monitoring' ? null : info.time),
              icon: info.icon,
              color: info.color,
              bg: info.bg,
              label: info.label,
              detail: t.taskType === 'other' ? '' : t.note || '',
              badge: badgeOf(state),
            };
          }),
      ].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')),
    [schedules, todayTasks, todaySessions, exams, feedings, inventory]
  );

  if (isLoading) return <Loading />;

  // A list shows its first lines; "Xem thêm" opens the rest.
  const firstOf = (key, list) => (expanded.has(key) ? list : list.slice(0, FIRST));
  const more = (key, list) =>
    list.length > FIRST ? (
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          setExpanded((s) => {
            const next = new Set(s);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        style={styles.more}
        hitSlop={4}
      >
        <Text style={styles.moreText}>{expanded.has(key) ? 'Thu gọn' : `Xem thêm ${list.length - FIRST}`}</Text>
        <Icon name={expanded.has(key) ? 'chevronUp' : 'chevronDown'} size={14} color={colors.forestLight} />
      </Pressable>
    ) : null;

  return (
    <View style={styles.screen}>
      {/* The tabs (the second child) stay at the top while the part under them scrolls. */}
      <ScrollView contentContainerStyle={styles.content} stickyHeaderIndices={[1]}>
        <View style={{ gap: spacing.md }}>
          {/* The horse on its stage: turned 360° by hand, with the injuries the vet marked glowing where
              they are, and whether it may work — the things to know before opening a stall. */}
          <HorseStage
            name={horse?.name}
            subtitle={[stall || assignment?.stableBlock || 'Chưa xếp chuồng', horse?.breed, coat.from !== 'default' ? coat.label : null, horse?.weightKg ? `${horse.weightKg}kg` : null].filter(Boolean).join(' · ')}
            coat={coat}
            height={STAGE_HEIGHT}
            badges={[
              health ? { label: health.label, color: health.color, bg: health.bg, dot: true } : null,
              clearanceCfg ? { label: clearanceCfg.label, color: clearanceCfg.color, bg: clearanceCfg.bg } : null,
              lockedHorseIds.has(horseId) ? { label: 'Khóa huấn luyện', color: colors.red, bg: colors.redSoft } : null,
            ].filter(Boolean)}
            markers={markers}
          />

          {/* Who looks after it and how its day stands, in one strip. */}
          <View style={styles.strip}>
            <Row style={{ gap: 6 }}>
              <Icon name="person" size={14} color={colors.textMuted} />
              <Text style={styles.stripText} numberOfLines={1}>
                {assignment?.assignedCaretaker?.name || 'Chưa có người phụ trách'}
              </Text>
              {stall ? (
                <View style={styles.stall}>
                  <Text style={styles.stallText}>{stall}</Text>
                </View>
              ) : null}
            </Row>
            <Row style={{ gap: spacing.sm }}>
              <Stat icon="tasks" label="xong" value={`${doneCount}/${todayTasks.length}`} tint={colors.forest} />
              <Stat icon="rations" label="bữa" value={mealCount} tint={colors.orange} />
              <Stat icon="medication" label="thuốc" value={doseCount} tint={colors.red} />
            </Row>
            {clearance?.reason ? <Text style={styles.clearanceNote}>{clearance.reason}</Text> : null}
          </View>

          {shortages.length > 0 ? (
            <Banner tone="danger" style={{ paddingVertical: spacing.sm }}>
              <Row style={{ gap: spacing.sm }}>
                <Icon name="supplies" size={17} color={colors.red} />
                <Text style={[font.small, { flex: 1, color: colors.text }]} numberOfLines={2}>
                  <Text style={{ fontWeight: '700' }}>Kho thiếu cho ngựa này: </Text>
                  {shortages.map((m) => `${m.name} (thiếu ${m.short} ${m.unit})`).join(', ')}
                </Text>
                <Button title="Xin thêm" size="sm" variant="danger" style={{ minWidth: 0, paddingHorizontal: 10 }} onPress={() => setRestock(restockRequestFor({ missing: shortages, inventory }))} />
              </Row>
            </Banner>
          ) : null}
        </View>

        <View style={styles.tabs}>
          <Segments options={TABS} value={tab} onChange={setTab} />
        </View>

        {tab === 'today' ? (
          <View style={{ gap: spacing.md }}>
            <Section title="Lịch trình trong ngày" count={routine.length}>
              {routine.length === 0 ? (
                <EmptyState icon="calendar" text="Hôm nay chưa có lịch nào cho ngựa này" />
              ) : (
                routine.map((entry) => (
                  <Row key={entry.key} style={styles.line}>
                    <Text style={[styles.time, !entry.time && styles.allDay]}>{entry.time || 'Cả ngày'}</Text>
                    <View style={[styles.lineIcon, { backgroundColor: entry.bg }]}>
                      <Icon name={entry.icon} size={15} color={entry.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.lineTitle} numberOfLines={2}>
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
            </Section>

            {exams.length > 0 ? (
              <Section title="Lịch bác sĩ khám" count={exams.length} note="Giữ ngựa trong chuồng, sẵn sàng khi bác sĩ tới.">
                {exams.map((e) => (
                  <Row key={e._id} style={[styles.line, { alignItems: 'flex-start' }]}>
                    <View style={[styles.lineIcon, { backgroundColor: colors.purpleSoft }]}>
                      <Icon name="exam" size={15} color={colors.purple} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.lineTitle}>
                        {e.scheduledFor ? `Hẹn ${formatDateTime(e.scheduledFor)}` : 'Chờ bác sĩ nhận và hẹn giờ'}
                        {e.acceptedBy ? ` · BS ${e.acceptedBy}` : ''}
                      </Text>
                      {e.reason ? (
                        <Text style={font.small} numberOfLines={2}>
                          {e.reason}
                        </Text>
                      ) : null}
                    </View>
                    {e.priority === 'urgent' || e.priority === 'high' ? <Badge label={e.priority === 'urgent' ? 'Khẩn' : 'Ưu tiên'} color={colors.red} bg={colors.redSoft} /> : null}
                  </Row>
                ))}
              </Section>
            ) : null}

            {care.length === 0 ? (
              <Row style={styles.quiet}>
                <Icon name="checkCircle" size={15} color={colors.green} />
                <Text style={[font.small, { flex: 1 }]}>Không có lịch tiêm phòng, tẩy giun hay kiểm tra móng trong 30 ngày tới.</Text>
              </Row>
            ) : (
              <Section title="Chăm sóc định kỳ sắp tới" count={care.length}>
                {care.map((c) => {
                  const last = lastCareOf(c.key);
                  return (
                    <Row key={c.key} style={styles.line}>
                      <View style={[styles.lineIcon, { backgroundColor: colors.forestSoft }]}>
                        <Icon name={c.icon} size={15} color={colors.forestLight} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.lineTitle}>
                          {c.label} · {formatDate(c.date)}
                        </Text>
                        {last ? (
                          <Text style={font.small} numberOfLines={1}>
                            Lần trước: {formatDate(last.date)}
                            {last.product ? ` · ${last.product}` : ''}
                          </Text>
                        ) : null}
                      </View>
                      <Badge label={describeDaysLeft(c.daysLeft)} color={c.daysLeft < 0 ? colors.red : colors.textMuted} bg={c.daysLeft < 0 ? colors.redSoft : colors.graySoft} />
                    </Row>
                  );
                })}
              </Section>
            )}
          </View>
        ) : null}

        {tab === 'care' ? (
          <View style={{ gap: spacing.md }}>
            {/* The vet's prescription: dose, the hours it is due, and the stock behind it. */}
            {plan?.prescriptions?.length ? (
              plan.prescriptions.map((prescription) => (
                <Section
                  key={prescription._id}
                  title="Đơn thuốc đang dùng"
                  accent={colors.red}
                  right={activeTreatment?.isTrainingLocked ? <Badge label="Khóa tập" color={colors.red} bg={colors.redSoft} /> : null}
                  note={`BS ${prescription.prescribedBy || '—'} · từ ${formatDate(prescription.startDate)}${prescription.endDate ? ` đến ${formatDate(prescription.endDate)}` : ''}`}
                  noteOnTop
                >
                  {prescription.medications.map((medication, index) => (
                    <View key={index} style={styles.line}>
                      <View style={[styles.lineIcon, { backgroundColor: colors.redSoft }]}>
                        <Icon name="medication" size={15} color={colors.red} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Row style={{ gap: spacing.sm }}>
                          <Text style={[styles.lineTitle, { flex: 1 }]} numberOfLines={2}>
                            {medication.name}
                          </Text>
                          <Text style={styles.qty}>{medication.dosage}</Text>
                        </Row>
                        {medication.times?.length || MEDICATION_ROUTE[medication.route] ? (
                          <Row style={{ gap: 5, flexWrap: 'wrap' }}>
                            {MEDICATION_ROUTE[medication.route] ? <Badge label={MEDICATION_ROUTE[medication.route]} /> : null}
                            {(medication.times || []).map((time) => (
                              <Badge key={time} label={time} color={colors.forest} bg={colors.forestSoft} />
                            ))}
                          </Row>
                        ) : null}
                        <Text style={[font.small, { color: medication.enough === false ? colors.red : colors.textMuted }]} numberOfLines={1}>
                          {medication.stock
                            ? `Kho còn ${formatStock(medication.stock, medication.stock.available)}${medication.dailyNeed ? ` · cần ${medication.dailyNeed} ${medication.stock.unit}/ngày` : ''}`
                            : 'Chưa gắn với mặt hàng trong kho'}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {prescription.careInstructions ? (
                    <Row style={[styles.line, { alignItems: 'flex-start' }]}>
                      <View style={[styles.lineIcon, { backgroundColor: colors.purpleSoft }]}>
                        <Icon name="monitoring" size={15} color={colors.purple} />
                      </View>
                      <Text style={[font.body, { flex: 1 }]}>{prescription.careInstructions}</Text>
                    </Row>
                  ) : null}
                </Section>
              ))
            ) : (
              <Row style={styles.quiet}>
                <Icon name="treatment" size={15} color={colors.textMuted} />
                <Text style={[font.small, { flex: 1 }]}>Ngựa này không có toa thuốc nào đang áp dụng.</Text>
              </Row>
            )}

            <Section title="Khẩu phần trong ngày" count={plan?.rations?.length || 0}>
              {!plan?.rations?.length ? (
                <EmptyState icon="rations" text="Chưa có khẩu phần nào được thiết lập" hint="HLV Trưởng là người lập và duyệt khẩu phần." />
              ) : (
                plan.rations.map((ration) => {
                  const meal = MEAL_CONFIG[ration.mealTime] || {};
                  return (
                    <View key={ration._id} style={[styles.line, { alignItems: 'flex-start' }]}>
                      <View style={[styles.lineIcon, { backgroundColor: colors.goldSoft }]}>
                        <Icon name={meal.icon || 'rations'} size={15} color={colors.gold} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Row style={{ justifyContent: 'space-between' }}>
                          <Text style={styles.lineTitle}>{meal.label || ration.mealTime}</Text>
                          <Text style={styles.time}>{ration.timeOfDay || meal.defaultTime}</Text>
                        </Row>
                        {ration.items.map((item, index) => (
                          <Row key={index} style={{ gap: 6 }}>
                            <Icon name={getFeedTypeLabel(item.name).icon} size={13} color={colors.forestLight} />
                            <Text style={[font.small, { flex: 1, color: colors.text }]} numberOfLines={1}>
                              {item.stock?.name || item.name}
                              <Text style={{ color: item.enough === false ? colors.red : colors.textMuted }}>
                                {item.stock ? ` · kho còn ${formatStock(item.stock, item.stock.available)}` : ' · chưa gắn kho'}
                              </Text>
                            </Text>
                            <Text style={styles.qty}>{item.quantity}</Text>
                          </Row>
                        ))}
                      </View>
                    </View>
                  );
                })
              )}
            </Section>
          </View>
        ) : null}

        {tab === 'history' ? (
          <View style={{ gap: spacing.md }}>
            {/* One line of time across every role, so the groom sees why a horse is being treated. */}
            <Section title="Diễn biến gần đây" count={events.length}>
              {events.length === 0 ? (
                <Text style={[font.small, styles.pad]}>Chưa có hoạt động nào được ghi nhận.</Text>
              ) : (
                firstOf('events', events.slice(0, 30)).map((e, index) => {
                  const kind = TIMELINE_KIND[e.kind] || { icon: 'note', color: colors.textMuted };
                  return (
                    <Row key={`${e.at}-${index}`} style={[styles.line, { alignItems: 'flex-start' }]}>
                      <View style={[styles.lineIcon, { backgroundColor: colors.graySoft }]}>
                        <Icon name={kind.icon} size={14} color={kind.color} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.lineTitle} numberOfLines={2}>
                          {e.title}
                        </Text>
                        {e.detail ? (
                          <Text style={font.small} numberOfLines={2}>
                            {e.detail}
                          </Text>
                        ) : null}
                        <Text style={styles.when}>{formatDateTime(e.at)}</Text>
                      </View>
                    </Row>
                  );
                })
              )}
              {more('events', events.slice(0, 30))}
            </Section>

            {/* What the vet recorded doing: the groom is asked "when was he last wormed?". Read-only here. */}
            <Section title="Tiêm phòng · tẩy giun · đóng móng" count={careEvents.length}>
              {careEvents.length === 0 ? (
                <Text style={[font.small, styles.pad]}>Bác sĩ chưa ghi lần tiêm phòng, tẩy giun hay đóng móng nào.</Text>
              ) : (
                firstOf('care', careEvents).map((e) => {
                  const kind = CARE_EVENT_KIND[e.kind] || { label: e.kind, icon: 'note' };
                  return (
                    <Row key={e._id} style={[styles.line, { alignItems: 'flex-start' }]}>
                      <View style={[styles.lineIcon, { backgroundColor: colors.forestSoft }]}>
                        <Icon name={kind.icon} size={14} color={colors.forestLight} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.lineTitle} numberOfLines={1}>
                          {kind.label}
                          {e.product ? ` — ${e.product}` : ''}
                        </Text>
                        <Text style={font.small} numberOfLines={1}>
                          {[formatDate(e.date), e.performedBy?.name, e.batchNumber ? `Lô ${e.batchNumber}` : null, e.dose].filter(Boolean).join(' · ')}
                        </Text>
                        {e.nextDue ? <Text style={[font.small, { color: colors.forestLight }]}>Hẹn lần sau: {formatDate(e.nextDue)}</Text> : null}
                      </View>
                    </Row>
                  );
                })
              )}
              {more('care', careEvents)}
            </Section>

            <Section title="Hồ sơ khám" count={records.length}>
              {records.length === 0 ? (
                <Text style={[font.small, styles.pad]}>Chưa có hồ sơ khám bệnh nào.</Text>
              ) : (
                firstOf('records', records).map((r) => (
                  <Row key={r._id} style={[styles.line, { alignItems: 'flex-start' }]}>
                    <View style={[styles.lineIcon, { backgroundColor: colors.purpleSoft }]}>
                      <Icon name="exam" size={14} color={colors.purple} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.lineTitle} numberOfLines={2}>
                        {r.diagnosis}
                      </Text>
                      <Text style={styles.when}>
                        {formatDate(r.date || r.createdAt)}
                        {r.examinedBy?.name ? ` · BS ${r.examinedBy.name}` : ''}
                      </Text>
                    </View>
                  </Row>
                ))
              )}
              {more('records', records)}
            </Section>
          </View>
        ) : null}
      </ScrollView>

      <RestockSheet request={restock} visible={!!restock} onClose={() => setRestock(null)} />
    </View>
  );
}

/** A part of the horse page: its title (and count), a note, and its lines in one card. */
function Section({ title, count, right, note, noteOnTop = false, accent, children }) {
  return (
    <View style={[styles.card, accent && { borderLeftWidth: 4, borderLeftColor: accent }]}>
      <Row style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        {count ? (
          <View style={styles.count}>
            <Text style={styles.countText}>{count}</Text>
          </View>
        ) : null}
        <View style={{ marginLeft: 'auto' }}>{right}</View>
      </Row>
      {note && noteOnTop ? <Text style={[font.small, styles.pad, { marginTop: -4 }]}>{note}</Text> : null}
      {children}
      {note && !noteOnTop ? <Text style={[font.small, styles.pad, { paddingBottom: spacing.md }]}>{note}</Text> : null}
    </View>
  );
}

/** One number of the day, beside its label. */
function Stat({ icon, label, value, tint }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={14} color={tint} />
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  strip: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.white },
  stripText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.text },
  stall: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.forest },
  stallText: { fontSize: 12, fontWeight: '800', color: colors.gold, letterSpacing: 0.3 },
  stat: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.cream },
  statValue: { fontSize: 15, fontWeight: '800' },
  statLabel: { flexShrink: 1, fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  clearanceNote: { ...font.small, color: colors.orange },
  // The sticky tabs need their own background, or the cards scroll visibly under them.
  tabs: { backgroundColor: colors.cream, paddingVertical: spacing.xs },
  card: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.white, overflow: 'hidden' },
  cardHead: { gap: 6, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.forest, flexShrink: 1 },
  count: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.graySoft, alignItems: 'center' },
  countText: { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  pad: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  lineIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  lineTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  time: { fontSize: 12.5, fontWeight: '800', color: colors.forest, width: 44, fontVariant: ['tabular-nums'] },
  allDay: { fontSize: 11, color: colors.purple },
  when: { fontSize: 11.5, color: colors.textFaint, marginTop: 1 },
  qty: { fontWeight: '800', color: colors.text },
  quiet: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.white },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  moreText: { fontSize: 13, fontWeight: '700', color: colors.forestLight },
});
