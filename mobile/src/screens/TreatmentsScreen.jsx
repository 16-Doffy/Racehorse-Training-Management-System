import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import CompleteTaskModal from '../components/CompleteTaskModal';
import NotDoneModal from '../components/NotDoneModal';
import DoseDetailSheet from '../components/DoseDetailSheet';
import StockCard from '../components/StockCard';
import RestockSheet from '../components/RestockSheet';
import HistorySheet from '../components/HistorySheet';
import YesterdayRecap from '../components/YesterdayRecap';
import { Badge, Banner, Button, ChipRow, EmptyState, HorseAvatar, IconButton, LoadError, Loading, Row, Segments } from '../components/ui';
import { useInventory, useRefreshAll, useStableOverview, useTasks, useTreatments } from '../hooks/useGroomData';
import {
  CARE_TYPES,
  MEDICATION_ROUTE,
  TASK_STATE,
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

const timeOf = (task) => task?.dueTime || (task?.scheduledDate ? formatTime(task.scheduledDate) : '—');

/**
 * The vet's orders for the day, as the groom carries them out: "Hôm nay" is every dose and watch
 * order of today in the order of the clock — the hour, the horse, the medicine, the dose and how it
 * is given — each with the one button it needs ("Cho dùng", "Quên ghi", "Xin kho"). "Toa thuốc" is
 * the prescriptions behind them, read-only, with how each of today's doses stands. A dose is given
 * through a confirmation of horse, medicine, dose, route and time; the prescription is the vet's.
 */
export default function TreatmentsScreen({ navigation, segments }) {
  const [view, setView] = useState('today');
  const [filter, setFilter] = useState('mine');
  const [showDone, setShowDone] = useState(false);
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
    return { task, time: timeOf(task), ...line };
  });
  const byClock = (a, b) => a.time.localeCompare(b.time) || stateRank(taskState(a.task, ctx)) - stateRank(taskState(b.task, ctx));
  const todo = entries.filter((e) => needsAction(e.task, ctx)).sort(byClock);
  const done = entries.filter((e) => !needsAction(e.task, ctx)).sort(byClock);
  const next = todo.find((e) => taskState(e.task, ctx)?.open);

  // One group per hour, so "what do I give at 08:00" is one glance.
  const hours = [];
  for (const e of todo) {
    let h = hours.find((x) => x.time === e.time);
    if (!h) hours.push((h = { time: e.time, items: [] }));
    h.items.push(e);
  }

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
    if (!action) return;
    if (action.key === 'complete') setCompleting({ task: e.task, medication: e.medication });
    else if (action.key === 'late') setCompleting({ task: e.task, medication: e.medication, late: true });
    else if (action.key === 'restock') setRestock(restockRequestFor({ missing: missingSupplies(e.task), task: e.task, inventory }));
    else reportNotDone(e.task, action.reason);
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

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader
        title="Thuốc & y lệnh"
        subtitle={todo.length ? `Còn ${todo.length} liều/việc hôm nay${next ? ` · tiếp theo ${next.time}` : ''}` : 'Đã làm hết y lệnh hôm nay'}
        right={<IconButton icon="history" label="Lịch sử cho thuốc" onPress={() => setHistoryOpen(true)} />}
      />

      {segments}

      <View style={styles.toolbar}>
        <Segments
          options={[
            { value: 'today', label: 'Liều hôm nay', icon: 'clock', count: todo.length },
            { value: 'orders', label: `Toa thuốc (${ongoing.length})`, icon: 'treatment' },
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'orders' ? <ChipRow options={FILTERS} value={filter} onChange={setFilter} size="sm" /> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}>
        {isLoading ? (
          <Loading />
        ) : failed ? (
          <LoadError text={isError ? 'Không tải được toa thuốc' : 'Không tải được danh sách liều thuốc'} onRetry={retry} />
        ) : view === 'today' ? (
          <>
            {entries.length === 0 ? (
              <View style={styles.list}>
                <EmptyState icon="treatment" text="Hôm nay không có liều thuốc nào" hint="Bác sĩ kê toa; mỗi giờ dùng thuốc thành một liều cần cho dùng trong ngày." />
              </View>
            ) : todo.length === 0 ? (
              <Banner tone="success" style={{ paddingVertical: spacing.sm }}>
                <Row style={{ gap: spacing.sm }}>
                  <Icon name="checkCircle" size={18} color={colors.green} />
                  <Text style={[font.body, { flex: 1, fontWeight: '700' }]}>Đã cho dùng hết thuốc hôm nay</Text>
                </Row>
              </Banner>
            ) : (
              hours.map((h) => {
                const states = h.items.map((e) => taskState(e.task, ctx)?.key);
                const label = states.includes('missed') ? 'Quá giờ' : states.includes('late') ? 'Trễ' : states.includes('ready') ? 'Bây giờ' : states.includes('blocked') ? 'Bị chặn' : 'Sắp tới';
                const tone = label === 'Bây giờ' ? TASK_STATE.ready : label === 'Sắp tới' ? TASK_STATE.upcoming : label === 'Trễ' ? TASK_STATE.late : TASK_STATE.missed;
                return (
                  <View key={h.time} style={styles.list}>
                    <Row style={styles.hourHead}>
                      <Text style={styles.hour}>{h.time}</Text>
                      <Badge label={label} color={tone.color} bg={tone.bg} />
                      <Text style={[font.small, { marginLeft: 'auto' }]}>{h.items.length} liều/việc</Text>
                    </Row>
                    {h.items.map((e) => (
                      <DoseRow key={e.task._id} entry={e} ctx={ctx} onOpen={() => openEntry(e)} onAct={() => act(e)} />
                    ))}
                  </View>
                );
              })
            )}

            {done.length > 0 ? (
              <View style={styles.list}>
                <Pressable accessibilityRole="button" onPress={() => setShowDone((v) => !v)} style={styles.foldHead} hitSlop={4}>
                  <Text style={styles.groupTitle}>Đã xong · {done.length}</Text>
                  <Icon name={showDone ? 'chevronUp' : 'chevronDown'} size={16} color={colors.textMuted} />
                </Pressable>
                {showDone ? done.map((e) => <DoseRow key={e.task._id} entry={e} ctx={ctx} onOpen={() => openEntry(e)} onAct={() => act(e)} />) : null}
              </View>
            ) : null}

            <YesterdayRecap tasks={doseHistory} noun="liều/việc" onPress={() => setHistoryOpen(true)} />
          </>
        ) : (
          <>
            {visibleOrders.length === 0 ? (
              <View style={styles.list}>
                <EmptyState icon="treatment" text="Không có toa thuốc nào đang áp dụng" hint={filter === 'mine' ? "Chọn 'Tất cả' để xem toa của ngựa khác." : undefined} />
              </View>
            ) : (
              visibleOrders.map((treatment) => (
                <OrderCard
                  key={treatment._id}
                  treatment={treatment}
                  tasks={careTasks}
                  mine={myHorseIds.has(refId(treatment.horse))}
                  ctx={ctx}
                  onOpenMedication={(medication, slots) => setOpenDose({ medication, treatment, slots, focus: null, inventory, ctx })}
                />
              ))
            )}
            <StockCard
              title="Thuốc trong kho"
              category="medicine"
              items={inventory}
              onOpenSupplies={() => navigation.navigate('Kho')}
              emptyText="Kho chưa có mặt hàng thuốc nào. Quản lý CLB là người tạo danh mục."
            />
          </>
        )}
      </ScrollView>

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

/** One dose (or watch order) at its hour: the horse, the medicine as the vet wrote it, and its one button. */
function DoseRow({ entry, ctx, onOpen, onAct }) {
  const { task, medication, isCare } = entry;
  const state = taskState(task, ctx);
  const action = primaryAction(task, ctx);
  const button = action
    ? { ...ACTIONS[action.key], ...(action.key === 'complete' && isCare ? { title: 'Đã làm' } : {}), ...(action.reason ? { title: 'Báo' } : {}) }
    : null;
  const finished = task.status === 'completed';
  const route = MEDICATION_ROUTE[medication?.route];
  const facts = medication ? [medication.dosage && `Liều ${medication.dosage}`, route].filter(Boolean).join(' · ') : task.note;

  let status = null;
  let tone = state?.color;
  if (finished) {
    status = `${isCare ? 'Đã làm' : 'Đã cho dùng'} ${formatTime(task.completedAt)}${task.recordedLate ? ' (ghi muộn)' : ''}`;
    tone = colors.green;
  } else if (task.status === 'skipped') status = state?.key === 'cancelled' ? 'Đã hủy y lệnh' : `Không làm được: ${task.skipReason || '—'}`;
  else if (state?.key === 'ready') status = medication?.instructions ? `Dặn: ${medication.instructions}` : null;
  else status = state?.reason || state?.label;
  if (state?.key === 'ready') tone = colors.forestLight;

  return (
    <View style={[styles.row, finished && styles.rowDone]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${task.horse?.name || ''} ${medication?.name || 'y lệnh'}`} onPress={onOpen} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
        <View style={[styles.rowIcon, { backgroundColor: finished ? colors.greenSoft : isCare ? colors.purpleSoft : colors.redSoft }]}>
          <Icon name={finished ? 'check' : isCare ? 'monitoring' : 'medication'} size={18} color={finished ? colors.green : isCare ? colors.purple : colors.red} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            <Text style={{ color: colors.forest }}>{task.horse?.name || 'Ngựa'}</Text>
            {medication ? ` · ${medication.name}` : isCare ? ' · Theo dõi' : ''}
          </Text>
          {facts ? (
            <Text style={styles.facts} numberOfLines={isCare ? 2 : 1}>
              {facts}
            </Text>
          ) : null}
          {status ? (
            <Text style={[styles.status, { color: tone || colors.textMuted }]} numberOfLines={2}>
              {status}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {button ? (
        <Button title={button.title} icon={button.icon} variant={button.variant} size="sm" style={styles.action} onPress={onAct} />
      ) : finished ? (
        <Icon name="checkCircle" size={26} color={colors.green} />
      ) : state?.key === 'upcoming' ? (
        <View style={styles.timeChip}>
          <Text style={styles.timeChipText}>{entry.time}</Text>
        </View>
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
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  list: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  hourHead: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.cream },
  hour: { fontSize: 18, fontWeight: '800', color: colors.forest, fontVariant: ['tabular-nums'] },
  groupTitle: { ...font.tiny },
  foldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  rowDone: { backgroundColor: '#f7fdf9' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  rowIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  facts: { fontSize: 12.5, color: colors.text, fontWeight: '600' },
  status: { fontSize: 12, fontWeight: '600' },
  action: { minWidth: 96 },
  timeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.graySoft },
  timeChipText: { fontSize: 12.5, fontWeight: '800', color: colors.textMuted },
  orderHead: { gap: spacing.md, padding: spacing.md },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
});
