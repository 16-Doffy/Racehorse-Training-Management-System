import { useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import CompleteTaskModal from '../components/CompleteTaskModal';
import NotDoneModal from '../components/NotDoneModal';
import DoseDetailSheet from '../components/DoseDetailSheet';
import RestockSheet from '../components/RestockSheet';
import HistorySheet from '../components/HistorySheet';
import YesterdayRecap from '../components/YesterdayRecap';
import { Badge, Banner, Button, ChipRow, CountTabs, EmptyState, HorseAvatar, IconButton, LoadError, Loading, Row, Sheet } from '../components/ui';
import { useInventory, useRefreshAll, useStableOverview, useTasks, useTreatments } from '../hooks/useGroomData';
import {
  CARE_TYPES,
  MEDICATION_ROUTE,
  doseSlots,
  formatDate,
  formatTime,
  isSameDay,
  missingSupplies,
  needsAction,
  primaryAction,
  refId,
  restockRequestFor,
  stateRank,
  taskState,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const FILTERS = [
  { value: 'mine', label: 'Ngựa của tôi' },
  { value: 'all', label: 'Tất cả' },
  { value: 'locked', label: 'Đang khóa tập' },
];

// A dose has its hour; a watch order ("chườm lạnh sáng và chiều") is for the whole day, and the time
// on its task is only when the order came in — so it shows no clock and sorts after the doses.
const timeOf = (task) => task?.dueTime || (task?.taskType === 'monitoring' ? null : task?.scheduledDate ? formatTime(task.scheduledDate) : null);
const clockKey = (entry) => entry.time || '99:99';

/**
 * The vet's orders for the day, as the groom carries them out, a part at a time so the list stays
 * short: "Làm ngay" (now, late, missed or blocked), "Sắp tới" (not time yet) and "Đã xong". Each part
 * is grouped by horse — the groom gives one horse its medicines, then the next — and each line is
 * the hour, the medicine as the vet wrote it and the one button it needs ("Cho dùng", "Quên ghi",
 * "Xin kho"). The prescriptions behind them open from the header, read-only. A dose is given through
 * a confirmation of horse, medicine, dose, route and time.
 */
export default function TreatmentsScreen({ navigation, segments }) {
  const [part, setPart] = useState(null);
  const [filter, setFilter] = useState('mine');
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [openDose, setOpenDose] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [notDone, setNotDone] = useState(null);
  const [notDoneReason, setNotDoneReason] = useState('');
  const [restock, setRestock] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { treatments, isLoading, isError, refetch } = useTreatments();
  const { tasks, isError: tasksFailed, refetch: refetchTasks } = useTasks();
  const { items: inventory } = useInventory();
  const { myHorseIds } = useStableOverview();
  const refreshAll = useRefreshAll();
  const ctx = useMemo(() => ({ inventory }), [inventory]);

  // Today's doses and watch orders — the groom's own worklist, whoever the horse belongs to.
  const careTasks = useMemo(() => tasks.filter((t) => CARE_TYPES.includes(t.taskType) && isSameDay(t.scheduledDate, new Date())), [tasks]);
  const doseHistory = useMemo(() => tasks.filter((t) => CARE_TYPES.includes(t.taskType)), [tasks]);
  const ongoing = useMemo(() => treatments.filter((t) => t.status === 'ongoing'), [treatments]);

  // Which prescription line each of today's tasks carries out, so its row can name the medicine,
  // the dose and the route, and its detail can show the order in full.
  const lineOf = useMemo(() => {
    const map = new Map();
    for (const treatment of ongoing) {
      const mine = myHorseIds.has(refId(treatment.horse));
      for (const medication of treatment.medications || []) {
        const slots = doseSlots(treatment, medication, careTasks, { mine });
        slots.forEach((slot) => slot.task && map.set(slot.task._id, { treatment, medication, slots }));
      }
      const care = careTasks.find((t) => refId(t.treatment) === treatment._id && t.taskType === 'monitoring' && t.note === treatment.careInstructions);
      if (care) map.set(care._id, { treatment, isCare: true });
    }
    return map;
  }, [ongoing, careTasks, myHorseIds]);

  const entries = careTasks.map((task) => {
    const line = lineOf.get(task._id) || { treatment: ongoing.find((t) => t._id === refId(task.treatment)), isCare: task.taskType !== 'medication' };
    return { task, time: timeOf(task), state: taskState(task, ctx), ...line };
  });
  const partOf = (e) => (!needsAction(e.task, ctx) ? 'done' : e.state?.key === 'upcoming' ? 'later' : 'now');
  const counts = { now: 0, later: 0, done: 0 };
  entries.forEach((e) => {
    counts[partOf(e)] += 1;
  });
  // The part to open with: what can be done now, else what comes next.
  const shown = part || (counts.now ? 'now' : counts.later ? 'later' : 'done');
  const urgent = entries.some((e) => ['missed', 'late', 'blocked'].includes(e.state?.key));
  // The next dose whose time has not come yet.
  const next = entries.filter((e) => e.time && partOf(e) === 'later').sort((a, b) => clockKey(a).localeCompare(clockKey(b)))[0];

  // The chosen part, one group per horse, the horse with the earliest dose first.
  const groups = [];
  entries
    .filter((e) => partOf(e) === shown)
    .sort((a, b) => clockKey(a).localeCompare(clockKey(b)) || stateRank(a.state) - stateRank(b.state))
    .forEach((e) => {
      const key = refId(e.task.horse);
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, horse: e.task.horse, items: [] }));
      g.items.push(e);
    });

  const visibleOrders = ongoing
    .filter((t) => (filter === 'mine' ? myHorseIds.has(refId(t.horse)) : true))
    .filter((t) => (filter === 'locked' ? t.isTrainingLocked : true));

  const reportNotDone = (task, reason = '') => {
    setNotDoneReason(reason);
    setNotDone(task);
  };
  const openEntry = (e) =>
    e.medication
      ? setOpenDose({ medication: e.medication, treatment: e.treatment, slots: e.slots, focus: e.task.dueTime || null, inventory, ctx })
      : setOpenDose({ isCare: e.isCare, title: e.task.note, task: e.task, treatment: e.treatment, inventory, ctx });
  const act = (e) => {
    const action = primaryAction(e.task, ctx);
    if (!action) return openEntry(e);
    if (action.key === 'complete') return setCompleting({ task: e.task, medication: e.medication });
    if (action.key === 'late') return setCompleting({ task: e.task, medication: e.medication, late: true });
    if (action.key === 'restock') return setRestock(restockRequestFor({ missing: missingSupplies(e.task), task: e.task, inventory }));
    return reportNotDone(e.task, action.reason);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const failed = isError || tasksFailed;
  const retry = () => {
    refetch();
    refetchTasks();
  };
  const left = counts.now + counts.later;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader
        title="Thuốc & y lệnh"
        subtitle={left ? `Còn ${left} liều/việc hôm nay${next ? ` · tiếp theo ${next.time}` : ''}` : 'Đã làm hết y lệnh hôm nay'}
        right={
          <>
            <IconButton icon="treatment" label={`Toa thuốc đang áp dụng (${ongoing.length})`} onPress={() => setOrdersOpen(true)} />
            <IconButton icon="history" label="Lịch sử cho thuốc" onPress={() => setHistoryOpen(true)} />
          </>
        }
      />

      {segments}

      <View style={styles.toolbar}>
        <CountTabs
          value={shown}
          onChange={setPart}
          options={[
            { value: 'now', label: 'Làm ngay', sub: `${counts.now} liều/việc`, alert: urgent },
            { value: 'later', label: 'Sắp tới', sub: next ? `${counts.later} · từ ${next.time}` : `${counts.later} liều/việc` },
            { value: 'done', label: 'Đã xong', sub: `${counts.done} liều/việc` },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}>
        {isLoading ? (
          <Loading />
        ) : failed ? (
          <LoadError text={isError ? 'Không tải được toa thuốc' : 'Không tải được danh sách liều thuốc'} onRetry={retry} />
        ) : entries.length === 0 ? (
          <View style={styles.list}>
            <EmptyState icon="treatment" text="Hôm nay không có liều thuốc nào" hint="Bác sĩ kê toa; mỗi giờ dùng thuốc thành một liều cần cho dùng trong ngày." />
          </View>
        ) : groups.length === 0 ? (
          shown === 'now' && !left ? (
            <Banner tone="success" style={{ paddingVertical: spacing.sm }}>
              <Row style={{ gap: spacing.sm }}>
                <Icon name="checkCircle" size={18} color={colors.green} />
                <Text style={[font.body, { flex: 1, fontWeight: '700' }]}>Đã cho dùng hết thuốc hôm nay</Text>
              </Row>
            </Banner>
          ) : (
            <View style={styles.list}>
              <EmptyState icon={shown === 'done' ? 'empty' : 'checkCircle'} text={shown === 'now' ? 'Chưa có liều nào cần làm ngay' : shown === 'later' ? 'Không còn liều nào sắp tới' : 'Chưa ghi nhận liều nào hôm nay'} />
            </View>
          )
        ) : (
          groups.map((g) => (
            <View key={g.key} style={styles.list}>
              <Row style={styles.horseHead}>
                <HorseAvatar name={g.horse?.name} size={26} />
                <Text style={styles.horseName} numberOfLines={1}>
                  {g.horse?.name || 'Ngựa'}
                </Text>
                <Text style={font.small}>{g.items.length} liều/việc</Text>
              </Row>
              {g.items.map((e) => (
                <DoseRow key={e.task._id} entry={e} ctx={ctx} onOpen={() => openEntry(e)} onAct={() => act(e)} />
              ))}
            </View>
          ))
        )}

        {!isLoading && !failed ? <YesterdayRecap tasks={doseHistory} noun="liều/việc" onPress={() => setHistoryOpen(true)} /> : null}
      </ScrollView>

      {/* The prescriptions behind the doses: read here, written by the vet. */}
      <Sheet visible={ordersOpen} onClose={() => setOrdersOpen(false)} title={`Toa thuốc đang áp dụng (${ongoing.length})`}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <ChipRow options={FILTERS} value={filter} onChange={setFilter} size="sm" />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xs, gap: spacing.md }}>
          {visibleOrders.length === 0 ? (
            <EmptyState icon="treatment" text="Không có toa thuốc nào" hint={filter === 'mine' ? "Chọn 'Tất cả' để xem toa của ngựa khác." : undefined} />
          ) : (
            visibleOrders.map((treatment) => (
              <OrderCard
                key={treatment._id}
                treatment={treatment}
                tasks={careTasks}
                mine={myHorseIds.has(refId(treatment.horse))}
                ctx={ctx}
                onOpenMedication={(medication, slots) => {
                  setOrdersOpen(false);
                  setOpenDose({ medication, treatment, slots, focus: null, inventory, ctx });
                }}
              />
            ))
          )}
          <Button
            title="Xem thuốc trong kho"
            icon="supplies"
            variant="ghost"
            size="sm"
            onPress={() => {
              setOrdersOpen(false);
              navigation.navigate('Kho');
            }}
          />
        </ScrollView>
      </Sheet>

      <DoseDetailSheet
        dose={openDose}
        visible={!!openDose}
        onClose={() => setOpenDose(null)}
        onAskSupply={(entry, task) => {
          setOpenDose(null);
          setRestock(restockRequestFor({ entry, missing: missingSupplies(task), task, inventory }));
        }}
        onComplete={(task) => {
          const medication = openDose?.medication;
          setOpenDose(null);
          setCompleting({ task, medication });
        }}
        onRecordLate={(task) => {
          const medication = openDose?.medication;
          setOpenDose(null);
          setCompleting({ task, medication, late: true });
        }}
        onNotDone={(task, reason) => {
          setOpenDose(null);
          reportNotDone(task, reason);
        }}
      />

      {/* `completing` = { task, medication?, late? }: the medicine line gives the route to confirm. */}
      <CompleteTaskModal
        task={completing?.task}
        medication={completing?.medication}
        late={!!completing?.late}
        visible={!!completing}
        onClose={() => setCompleting(null)}
        onShortage={(missing, task) => setRestock(restockRequestFor({ missing, task, inventory }))}
      />
      <NotDoneModal task={notDone} visible={!!notDone} initialReason={notDoneReason} onClose={() => setNotDone(null)} />
      <RestockSheet request={restock} visible={!!restock} onClose={() => setRestock(null)} />
      <HistorySheet visible={historyOpen} onClose={() => setHistoryOpen(false)} title="Lịch sử cho thuốc" tasks={doseHistory} emptyText="Chưa có liều nào được ghi nhận trong khoảng này" />
    </SafeAreaView>
  );
}

const ACTIONS = {
  complete: { title: 'Cho dùng', icon: 'check', variant: 'primary' },
  late: { title: 'Quên ghi', icon: 'clock', variant: 'subtle' },
  restock: { title: 'Xin kho', icon: 'plus', variant: 'danger' },
  notDone: { title: 'Báo lỡ', icon: 'block', variant: 'ghost' },
};

/**
 * One dose (or watch order) of a horse: its hour on the left, the medicine with its dose and route,
 * and its one button. The vet's instructions and everything else are in the detail, one tap away.
 */
function DoseRow({ entry, ctx, onOpen, onAct }) {
  const { task, medication, isCare, state, time } = entry;
  const action = primaryAction(task, ctx);
  const button = action
    ? { ...ACTIONS[action.key], ...(action.key === 'complete' && isCare ? { title: 'Đã làm' } : {}), ...(action.reason ? { title: 'Báo' } : {}) }
    : null;
  const finished = task.status === 'completed';
  const route = MEDICATION_ROUTE[medication?.route];
  const title = medication ? medication.name : isCare ? 'Theo dõi' : task.note || 'Y lệnh';
  const facts = medication ? [medication.dosage, route].filter(Boolean).join(' · ') : task.note;

  // One short line of where it stands, only when it is not simply "do it now".
  let status = null;
  let tone = state?.color || colors.textMuted;
  if (finished) {
    status = `${isCare ? 'Đã làm' : 'Đã cho dùng'} ${formatTime(task.completedAt)}${task.recordedLate ? ' (ghi muộn)' : ''}`;
    tone = colors.green;
  } else if (task.status === 'skipped') status = state?.key === 'cancelled' ? 'Đã hủy y lệnh' : `Không làm được: ${task.skipReason || '—'}`;
  else if (state?.key !== 'ready') status = state?.key === 'upcoming' ? state.label : state?.reason || state?.label;

  return (
    <View style={[styles.row, finished && styles.rowDone]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${task.horse?.name || ''} ${title}`} onPress={onOpen} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
        <View style={[styles.clock, isCare && styles.clockCare, finished && styles.clockDone]}>
          {time ? (
            <Text style={[styles.clockText, finished && { color: colors.green }]}>{time}</Text>
          ) : (
            <Icon name={finished ? 'check' : 'monitoring'} size={17} color={finished ? colors.green : colors.purple} />
          )}
        </View>
        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <Row style={{ gap: 5 }}>
            {medication ? <Icon name="medication" size={13} color={finished ? colors.textFaint : colors.red} /> : null}
            {/* The vet left instructions: they are in the detail. Before the name, never pushed off by it. */}
            {medication?.instructions && !finished ? <Icon name="info" size={13} color={colors.forestLight} /> : null}
            <Text style={[styles.title, finished && styles.doneText]} numberOfLines={2}>
              {title}
            </Text>
          </Row>
          {facts ? (
            <Text style={styles.facts} numberOfLines={medication ? 1 : 2}>
              {facts}
            </Text>
          ) : null}
          {status ? (
            <Text style={[styles.status, { color: tone }]} numberOfLines={1}>
              {status}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {button ? (
        <Button title={button.title} icon={button.icon} variant={button.variant} size="sm" style={styles.action} onPress={onAct} />
      ) : finished ? (
        <Icon name="checkCircle" size={24} color={colors.green} />
      ) : (
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      )}
    </View>
  );
}

const SLOT_TONE = (state) => {
  if (!state) return { color: colors.textFaint, bg: colors.graySoft };
  if (state.key === 'completed') return { color: colors.green, bg: colors.greenSoft };
  return { color: state.color, bg: state.bg };
};

/** A prescription as the vet wrote it, one line per medicine with how each of today's doses stands. */
function OrderCard({ treatment, tasks, mine, ctx, onOpenMedication }) {
  const medications = treatment.medications || [];
  return (
    <View style={styles.list}>
      <Row style={styles.orderHead}>
        <HorseAvatar name={treatment.horse?.name} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {treatment.horse?.name}
          </Text>
          <Text style={font.small} numberOfLines={1}>
            BS {treatment.prescribedBy?.name || '—'} · từ {formatDate(treatment.startDate)}
            {treatment.endDate ? ` đến ${formatDate(treatment.endDate)}` : ''}
          </Text>
        </View>
        {treatment.isTrainingLocked ? <Badge label="Khóa tập" color={colors.red} bg={colors.redSoft} /> : null}
      </Row>

      {medications.length === 0 ? <Text style={[font.small, styles.orderLine]}>Toa không kê thuốc, chỉ có hướng dẫn chăm sóc.</Text> : null}
      {medications.map((medication, index) => {
        const slots = doseSlots(treatment, medication, tasks, { mine });
        return (
          <Pressable
            key={`${medication.name}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Chi tiết ${medication.name}`}
            onPress={() => onOpenMedication(medication, slots)}
            style={({ pressed }) => [styles.orderLine, pressed && { opacity: 0.7 }]}
          >
            <Icon name="medication" size={16} color={colors.red} />
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <Text style={font.h3} numberOfLines={1}>
                {medication.name}
                <Text style={styles.facts}>
                  {medication.dosage ? ` · ${medication.dosage}` : ''}
                  {MEDICATION_ROUTE[medication.route] ? ` · ${MEDICATION_ROUTE[medication.route]}` : ''}
                </Text>
              </Text>
              <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                {slots.map((slot, i) => {
                  const tone = SLOT_TONE(slot.task ? taskState(slot.task, ctx) : null);
                  return <Badge key={slot.time || `once-${i}`} label={`${slot.time || 'Trong ngày'}${slot.task?.status === 'completed' ? ' ✓' : ''}`} color={tone.color} bg={tone.bg} />;
                })}
              </Row>
            </View>
            <Icon name="chevronRight" size={15} color={colors.textFaint} />
          </Pressable>
        );
      })}
      {treatment.careInstructions ? (
        <Row style={styles.orderLine}>
          <Icon name="monitoring" size={16} color={colors.purple} />
          <Text style={[font.small, { flex: 1, color: colors.text }]}>{treatment.careInstructions}</Text>
        </Row>
      ) : null}
      {treatment.notes ? <Text style={[font.small, styles.orderLine]}>{treatment.notes}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  list: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  horseHead: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 7, backgroundColor: colors.cream },
  horseName: { flex: 1, fontSize: 14.5, fontWeight: '800', color: colors.forest },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  rowDone: { backgroundColor: '#f7fdf9' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0, overflow: 'hidden' },
  clock: { width: 46, height: 36, borderRadius: radius.sm, backgroundColor: colors.forestSoft, alignItems: 'center', justifyContent: 'center' },
  clockCare: { backgroundColor: colors.purpleSoft },
  clockDone: { backgroundColor: colors.greenSoft },
  clockText: { fontSize: 13, fontWeight: '800', color: colors.forest, fontVariant: ['tabular-nums'] },
  // A one-word medicine name longer than the line breaks inside the word rather than running under the button.
  title: { flexShrink: 1, minWidth: 0, fontSize: 14.5, fontWeight: '800', color: colors.text, ...(Platform.OS === 'web' ? { wordBreak: 'break-word' } : null) },
  doneText: { color: colors.textMuted },
  facts: { fontSize: 12.5, color: colors.text, fontWeight: '600' },
  status: { fontSize: 11.5, fontWeight: '600' },
  action: { minWidth: 0, paddingHorizontal: 10 },
  orderHead: { gap: spacing.md, padding: spacing.md },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
});
