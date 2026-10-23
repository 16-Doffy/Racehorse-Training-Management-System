import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import CompleteTaskModal from '../components/CompleteTaskModal';
import MealDetailSheet from '../components/MealDetailSheet';
import StockCard from '../components/StockCard';
import NotDoneModal from '../components/NotDoneModal';
import RestockSheet from '../components/RestockSheet';
import HistorySheet from '../components/HistorySheet';
import YesterdayRecap from '../components/YesterdayRecap';
import { Badge, Banner, Button, CountTabs, EmptyState, IconButton, LoadError, Loading, ProgressBar, Row, SearchInput, StallPlate } from '../components/ui';
import { useFeedings, useInventory, useRefreshAll, useStableOverview, useTasks } from '../hooks/useGroomData';
import {
  EATEN_OPTIONS,
  HEALTH_STATUS,
  MEAL_CONFIG,
  MEAL_ORDER,
  NO_RATION_REASON,
  describeObservation,
  formatDays,
  formatStock,
  formatTime,
  isSameDay,
  matchesSearch,
  mealTimeOf,
  missingSupplies,
  needsAction,
  nextMealSlot,
  primaryAction,
  rationLine,
  refId,
  restockRequestFor,
  stallCodeOf,
  stateRank,
  taskState,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const SLOT_SHORT = { morning: 'Sáng', noon: 'Trưa', evening: 'Tối' };

/**
 * Feeding, one meal at a time. The tabs are the day's three meals (the current one first open), each
 * with how many horses have eaten; under them, one line per horse for that meal — what goes in the
 * bucket and the one button its state calls for: "Cho ăn" when it can be recorded, "Quên ghi" when
 * it was given but its window closed, "Xin kho" when the store is short, "Báo HLV" when there is no
 * approved ration. Tapping the line opens the meal in full with every other action ("Không cho ăn").
 * A meal is only recorded against an approved ration — the server refuses it otherwise too.
 */
export default function FeedingScreen({ navigation, segments }) {
  const [slotChoice, setSlotChoice] = useState(null);
  const [scope, setScope] = useState('mine');
  const [search, setSearch] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [openMeal, setOpenMeal] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [recordingLate, setRecordingLate] = useState(null);
  const [notDone, setNotDone] = useState(null);
  const [notDoneReason, setNotDoneReason] = useState('');
  const [restock, setRestock] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { feedings, rations, isLoading, isError, refetch } = useFeedings();
  const { items: inventory } = useInventory();
  const { tasks, isError: tasksFailed, refetch: refetchTasks } = useTasks();
  const { horses, myHorseIds, assignmentByHorseId } = useStableOverview();
  const refreshAll = useRefreshAll();
  // What decides whether a meal can be recorded: an approved ration, stock that covers it, nothing expired.
  const ctx = useMemo(() => ({ rations, inventory }), [rations, inventory]);

  const feedingTasks = useMemo(() => tasks.filter((t) => t.taskType === 'feeding' && isSameDay(t.scheduledDate, new Date())), [tasks]);
  const mealHistory = useMemo(
    () => tasks.filter((t) => t.taskType === 'feeding' && (scope === 'all' || myHorseIds.has(refId(t.horse)))),
    [tasks, scope, myHorseIds]
  );

  const rationsByHorse = useMemo(() => {
    const map = new Map();
    feedings.forEach((f) => map.set(refId(f.horse), [...(map.get(refId(f.horse)) || []), f]));
    return map;
  }, [feedings]);

  // My horses: those I look after, and any horse whose meal was given to me today (covering a colleague).
  const fedByMe = useMemo(() => new Set(feedingTasks.map((t) => refId(t.horse))), [feedingTasks]);
  const stallOf = (horseId) => stallCodeOf(assignmentByHorseId.get(horseId));
  const scoped = horses
    .filter((h) => scope === 'all' || myHorseIds.has(h._id) || fedByMe.has(h._id))
    .filter((h) => matchesSearch(`${h.name} ${stallOf(h._id) || ''}`, search))
    .sort((a, b) => (stallOf(a._id) || '~').localeCompare(stallOf(b._id) || '~', 'vi', { numeric: true }));

  const allSchedules = scoped.flatMap((h) => rationsByHorse.get(h._id) || []);
  const current = nextMealSlot(allSchedules);
  const slot = slotChoice || current.slot;

  // A meal's work: the make-up the trainer asked for stands in for the missed one it replaces.
  const mealTaskOf = (horseId, s) => {
    const own = feedingTasks.filter((t) => refId(t.horse) === horseId && t.mealSlot === s);
    return own.find((t) => t.makeUpOf) || own[0] || null;
  };
  const dailyTaskOf = (horseId) => feedingTasks.find((t) => refId(t.horse) === horseId && !t.mealSlot) || null;

  const rowsFor = (s) =>
    scoped
      .map((horse) => {
        const schedules = (rationsByHorse.get(horse._id) || []).filter((r) => r.mealTime === s);
        const task = mealTaskOf(horse._id, s);
        if (!task && !schedules.length) return null;
        return { horse, schedules, allSchedules: rationsByHorse.get(horse._id) || [], task, stall: stallOf(horse._id) };
      })
      .filter(Boolean);

  const tabs = MEAL_ORDER.map((s) => {
    const rows = rowsFor(s).filter((r) => r.task);
    const done = rows.filter((r) => r.task.status === 'completed').length;
    const alert = rows.some((r) => ['missed', 'blocked'].includes(taskState(r.task, ctx)?.key));
    return { value: s, label: SLOT_SHORT[s], icon: MEAL_CONFIG[s].icon, done, total: rows.length, alert, sub: mealTimeOf(s, allSchedules) };
  });

  const rows = rowsFor(slot).sort((a, b) => stateRank(taskState(a.task, ctx)) - stateRank(taskState(b.task, ctx)));
  const inSlot = new Set(rows.map((r) => r.horse._id));
  const todo = rows.filter((r) => !r.task || needsAction(r.task, ctx));
  const settled = rows.filter((r) => r.task && !needsAction(r.task, ctx));
  const withTask = rows.filter((r) => r.task);
  const doneCount = withTask.filter((r) => r.task.status === 'completed').length;
  // Horses without any ration get one "feed the horse" task, which can't be recorded until there is one.
  const noRation = scoped.map((h) => ({ horse: h, task: dailyTaskOf(h._id), stall: stallOf(h._id) })).filter((r) => r.task);
  const noSlot = scoped.filter((h) => (rationsByHorse.get(h._id) || []).length > 0 && !inSlot.has(h._id));

  // Feeds the rations in scope use that are running out, with how long they last.
  const usedItems = new Set(allSchedules.flatMap((s) => (s.items || []).map((i) => String(refId(i.inventoryItem) || ''))).filter(Boolean));
  const shortages = inventory.filter((item) => usedItems.has(String(item._id)) && item.level?.short);

  const reportNotDone = (task, reason = '') => {
    setNotDoneReason(reason);
    setNotDone(task);
  };
  const askStock = (task) => setRestock(restockRequestFor({ missing: missingSupplies(task), task, inventory }));
  const act = (row) => {
    const action = primaryAction(row.task, ctx);
    if (!action) return;
    if (action.key === 'complete') setCompleting(row.task);
    else if (action.key === 'late') setRecordingLate(row.task);
    else if (action.key === 'restock') askStock(row.task);
    else reportNotDone(row.task, action.reason);
  };
  const open = (row) => setOpenMeal({ horse: row.horse, slot, schedules: row.schedules, task: row.task, allSchedules: row.allSchedules, inventory, ctx });

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const meal = MEAL_CONFIG[slot];
  const subtitle = withTask.length
    ? `${meal.label} · ${doneCount}/${withTask.length} ngựa đã ăn${todo.length ? ` · còn ${todo.length}` : ''}`
    : `${meal.label} · chưa có bữa nào cần cho ăn`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Cho ăn" subtitle={subtitle} right={<IconButton icon="history" label="Lịch sử cho ăn" onPress={() => setHistoryOpen(true)} />} />

      {segments}

      <View style={styles.toolbar}>
        <CountTabs options={tabs} value={slot} onChange={setSlotChoice} />
        <Row style={{ gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Tìm ngựa, mã chuồng..." />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={scope === 'mine' ? 'Đang xem ngựa của tôi, chạm để xem tất cả' : 'Đang xem tất cả ngựa, chạm để xem ngựa của tôi'}
            onPress={() => setScope((s) => (s === 'mine' ? 'all' : 'mine'))}
            style={({ pressed }) => [styles.scope, scope === 'all' && styles.scopeOn, pressed && { opacity: 0.7 }]}
          >
            <Icon name="stable" size={15} color={scope === 'all' ? colors.white : colors.forest} />
            <Text style={[styles.scopeText, scope === 'all' && { color: colors.white }]}>{scope === 'mine' ? 'Của tôi' : 'Tất cả'}</Text>
          </Pressable>
        </Row>
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}>
        {withTask.length > 0 ? (
          <View style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.progressLabel}>
                {current.slot === slot && !current.tomorrow ? 'Bữa hiện tại' : meal.label} · {mealTimeOf(slot, allSchedules)}
              </Text>
              <Text style={styles.progressValue}>
                {doneCount}/{withTask.length} đã ăn
              </Text>
            </Row>
            <ProgressBar percent={(doneCount / withTask.length) * 100} tint={colors.green} track={colors.graySoft} height={6} />
          </View>
        ) : null}

        {shortages.length > 0 ? (
          <Banner tone={shortages.some((s) => s.level.key !== 'low') ? 'danger' : 'warning'} style={styles.alert}>
            <Row style={{ gap: spacing.sm }}>
              <Icon name="warning" size={17} color={shortages.some((s) => s.level.key !== 'low') ? colors.red : colors.orange} />
              <Text style={[font.small, { flex: 1, color: colors.text }]} numberOfLines={2}>
                <Text style={{ fontWeight: '700' }}>Kho sắp hết: </Text>
                {shortages
                  .map((s) => `${s.name} ${s.level.key === 'expired' ? 'hết hạn' : `còn ${formatStock(s)}${s.daysLeft != null ? ` (${formatDays(s.daysLeft)})` : ''}`}`)
                  .join(' · ')}
              </Text>
              <Button
                title="Xin thêm"
                size="sm"
                variant="danger"
                onPress={() =>
                  shortages.length === 1
                    ? setRestock(restockRequestFor({ entry: { inventoryItem: shortages[0]._id, name: shortages[0].name, unit: shortages[0].unit, available: shortages[0].quantity }, inventory }))
                    : navigation.navigate('Kho')
                }
              />
            </Row>
          </Banner>
        ) : null}

        {isLoading ? (
          <Loading />
        ) : isError || tasksFailed ? (
          <LoadError
            text={isError ? 'Không tải được khẩu phần' : 'Không tải được danh sách bữa ăn'}
            onRetry={() => {
              refetch();
              refetchTasks();
            }}
          />
        ) : scoped.length === 0 ? (
          <View style={styles.list}>
            <EmptyState icon="stable" text={search ? 'Không tìm thấy ngựa nào' : 'Bạn chưa phụ trách ngựa nào'} hint={search ? 'Thử xoá từ khoá.' : "Chạm 'Của tôi' để xem cả ngựa khác."} />
          </View>
        ) : (
          <>
            {noRation.length > 0 ? (
              <View style={styles.list}>
                <Text style={styles.groupTitle}>Chưa có khẩu phần · {noRation.length}</Text>
                {noRation.map((r) => (
                  <NoRationRow key={r.horse._id} row={r} ctx={ctx} onReport={() => reportNotDone(r.task, NO_RATION_REASON)} />
                ))}
              </View>
            ) : null}

            {rows.length === 0 ? (
              <View style={styles.list}>
                <EmptyState icon={meal.icon} text={`Không có ngựa nào ăn ${meal.label.toLowerCase()}`} hint="Khẩu phần do HLV lập và duyệt." />
              </View>
            ) : (
              <>
                {todo.length > 0 ? (
                  <View style={styles.list}>
                    <Text style={styles.groupTitle}>Cần cho ăn · {todo.length}</Text>
                    {todo.map((r) => (
                      <MealRow key={r.horse._id} row={r} ctx={ctx} onOpen={() => open(r)} onAct={() => act(r)} />
                    ))}
                  </View>
                ) : (
                  <Banner tone="success" style={styles.alert}>
                    <Row style={{ gap: spacing.sm }}>
                      <Icon name="checkCircle" size={18} color={colors.green} />
                      <Text style={[font.body, { flex: 1, fontWeight: '700' }]}>Xong {meal.label.toLowerCase()} cho mọi ngựa</Text>
                    </Row>
                  </Banner>
                )}

                {settled.length > 0 ? (
                  <View style={styles.list}>
                    <Pressable accessibilityRole="button" onPress={() => setShowDone((v) => !v)} style={styles.foldHead} hitSlop={4}>
                      <Text style={[styles.groupTitle, { paddingBottom: 0 }]}>Đã xong · {settled.length}</Text>
                      <Icon name={showDone ? 'chevronUp' : 'chevronDown'} size={16} color={colors.textMuted} />
                    </Pressable>
                    {showDone ? settled.map((r) => <MealRow key={r.horse._id} row={r} ctx={ctx} onOpen={() => open(r)} onAct={() => act(r)} />) : null}
                  </View>
                ) : null}
              </>
            )}

            {noSlot.length > 0 ? (
              <Text style={styles.footnote}>
                Không ăn {meal.label.toLowerCase()}: {noSlot.map((h) => h.name).join(', ')}
              </Text>
            ) : null}
          </>
        )}

        {/* Reference, below the day's work: how yesterday went and what the store holds. */}
        <YesterdayRecap tasks={mealHistory} noun="bữa" onPress={() => setHistoryOpen(true)} />
        <StockCard
          title="Thức ăn trong kho"
          category="feed"
          items={inventory}
          onOpenSupplies={() => navigation.navigate('Kho')}
          emptyText="Kho chưa có mặt hàng thức ăn nào. Quản lý CLB là người tạo danh mục."
        />
      </ScrollView>

      <MealDetailSheet
        meal={openMeal}
        visible={!!openMeal}
        onClose={() => setOpenMeal(null)}
        onAskSupply={(entry) => {
          const task = openMeal?.task;
          setOpenMeal(null);
          setRestock(restockRequestFor({ entry, missing: missingSupplies(task), task, inventory }));
        }}
        onComplete={() => {
          const task = openMeal?.task;
          setOpenMeal(null);
          setCompleting(task);
        }}
        onRecordLate={() => {
          const task = openMeal?.task;
          setOpenMeal(null);
          setRecordingLate(task);
        }}
        onNotDone={(reason) => {
          const task = openMeal?.task;
          setOpenMeal(null);
          reportNotDone(task, reason);
        }}
      />

      <CompleteTaskModal
        task={completing}
        schedules={completing ? feedings.filter((f) => refId(f.horse) === refId(completing.horse)) : []}
        visible={!!completing}
        onClose={() => setCompleting(null)}
        onShortage={(missing, task) => setRestock(restockRequestFor({ missing, task, inventory }))}
      />
      <CompleteTaskModal
        task={recordingLate}
        late
        schedules={recordingLate ? feedings.filter((f) => refId(f.horse) === refId(recordingLate.horse)) : []}
        visible={!!recordingLate}
        onClose={() => setRecordingLate(null)}
        onShortage={(missing, task) => setRestock(restockRequestFor({ missing, task, inventory }))}
      />
      <NotDoneModal task={notDone} visible={!!notDone} initialReason={notDoneReason} onClose={() => setNotDone(null)} />
      <RestockSheet request={restock} visible={!!restock} onClose={() => setRestock(null)} />
      <HistorySheet visible={historyOpen} onClose={() => setHistoryOpen(false)} title="Lịch sử cho ăn" tasks={mealHistory} emptyText="Chưa có bữa nào được ghi nhận trong khoảng này" />
    </SafeAreaView>
  );
}

// The button a meal's state calls for (utils/groom.js primaryAction), in the words of feeding.
const ACTIONS = {
  complete: { title: 'Cho ăn', icon: 'check', variant: 'primary' },
  late: { title: 'Quên ghi', icon: 'clock', variant: 'subtle' },
  restock: { title: 'Xin kho', icon: 'plus', variant: 'danger' },
  notDone: { title: 'Báo lỡ', icon: 'block', variant: 'ghost' },
};

/**
 * One horse's meal: its stall, what goes in the bucket, where it stands, and the one button for it.
 * The line and the button are two touch targets side by side, never nested.
 */
function MealRow({ row, ctx, onOpen, onAct }) {
  const { horse, schedules, task, stall } = row;
  const state = taskState(task, ctx);
  const action = primaryAction(task, ctx);
  // A known reason (no approved ration, an expired feed) goes to the trainer; otherwise it is a missed meal.
  const button = action ? { ...ACTIONS[action.key], ...(action.reason ? { title: 'Báo HLV' } : {}) } : null;
  const health = horse.healthStatus && horse.healthStatus !== 'eligible' ? HEALTH_STATUS[horse.healthStatus] : null;
  const fed = task?.status === 'completed';
  const items = schedules.flatMap((s) => s.items || []).map(rationLine);
  const approved = schedules.some((s) => s.approvedBy);
  const eaten = EATEN_OPTIONS.find((o) => o.value === task?.observation?.amountEatenPercent);

  let status;
  let tone = state?.color || colors.textMuted;
  if (!task) status = 'Chưa có việc cho bữa này';
  else if (fed) {
    status = [`Đã ăn ${formatTime(task.completedAt)}${task.recordedLate ? ' (ghi muộn)' : ''}`, eaten && eaten.value !== 100 ? eaten.label : null, describeObservation(task.observation)]
      .filter(Boolean)
      .join(' · ');
    const unwell = task.observation?.appetite === 'refused' || task.observation?.manure === 'loose' || (eaten && eaten.value < 50);
    tone = unwell ? colors.red : colors.green;
  } else if (task.status === 'skipped') status = state?.key === 'cancelled' ? 'HLV cho bỏ bữa này' : `Không cho ăn: ${task.skipReason || '—'}`;
  else if (state?.key === 'upcoming') status = state.reason || `Chưa tới giờ · ${mealTimeOf(task.mealSlot, row.allSchedules)}`;
  else if (state?.key === 'ready') status = task.makeUpOf ? `Cho ăn bù lúc ${formatTime(task.scheduledDate)}` : 'Cho ăn được bây giờ';
  else status = state?.reason || state?.label;

  return (
    <View style={[styles.row, fed && styles.rowDone]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Bữa của ${horse.name}`} onPress={onOpen} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
        <StallPlate code={stall} name={horse.name} size="sm" />
        <View style={{ flex: 1, gap: 2 }}>
          <Row style={{ gap: 6 }}>
            <Text style={styles.name} numberOfLines={1}>
              {horse.name}
            </Text>
            {task?.makeUpOf ? <Badge label="Ăn bù" color={colors.blue} bg={colors.blueSoft} /> : null}
            {health ? <View style={[styles.healthDot, { backgroundColor: health.color }]} accessibilityLabel={health.label} /> : null}
          </Row>
          <Text style={styles.ration} numberOfLines={1}>
            {items.length ? items.map((i) => `${i.label} ${i.amount}`.trim()).join(' · ') : 'Chưa có khẩu phần'}
            {items.length > 0 && !approved ? ' · chờ HLV duyệt' : ''}
          </Text>
          <Text style={[styles.status, { color: tone }]} numberOfLines={2}>
            {status}
          </Text>
        </View>
      </Pressable>
      {button ? (
        <Button title={button.title} icon={button.icon} variant={button.variant} size="sm" style={styles.action} onPress={onAct} />
      ) : fed ? (
        <Icon name="checkCircle" size={26} color={colors.green} />
      ) : state?.key === 'upcoming' ? (
        <View style={styles.timeChip}>
          <Text style={styles.timeChipText}>{task.makeUpOf ? formatTime(task.scheduledDate) : mealTimeOf(task.mealSlot, row.allSchedules)}</Text>
        </View>
      ) : (
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      )}
    </View>
  );
}

/** A horse with no ration at all: nothing to measure out, so the trainer is told instead. */
function NoRationRow({ row, ctx, onReport }) {
  const state = taskState(row.task, ctx);
  const pending = row.task.status === 'pending';
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <StallPlate code={row.stall} name={row.horse.name} size="sm" muted />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name} numberOfLines={1}>
            {row.horse.name}
          </Text>
          <Text style={[styles.status, { color: pending ? colors.red : colors.orange }]} numberOfLines={2}>
            {pending ? 'Chưa có khẩu phần được HLV duyệt — chưa ghi nhận cho ăn được.' : state?.key === 'cancelled' ? 'HLV cho bỏ qua' : `Đã báo: ${row.task.skipReason}`}
          </Text>
        </View>
      </View>
      {pending ? <Button title="Báo HLV" icon="block" variant="ghost" size="sm" style={styles.action} onPress={onReport} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  scope: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  scopeOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  scopeText: { fontSize: 13, fontWeight: '700', color: colors.forest },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  progressLabel: { fontSize: 12.5, fontWeight: '700', color: colors.forest },
  progressValue: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  alert: { paddingVertical: spacing.sm },
  list: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  groupTitle: { ...font.tiny, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  foldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: spacing.md, paddingBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  rowDone: { backgroundColor: '#f7fdf9' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text, flexShrink: 1 },
  ration: { fontSize: 12.5, color: colors.text },
  status: { fontSize: 12, fontWeight: '600' },
  healthDot: { width: 8, height: 8, borderRadius: 4 },
  action: { minWidth: 92 },
  timeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.graySoft },
  timeChipText: { fontSize: 12.5, fontWeight: '800', color: colors.textMuted },
  footnote: { ...font.small, paddingHorizontal: spacing.xs },
});
