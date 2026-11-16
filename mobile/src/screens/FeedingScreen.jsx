import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import CompleteTaskModal from '../components/CompleteTaskModal';
import MealDetailSheet from '../components/MealDetailSheet';
import NotDoneModal from '../components/NotDoneModal';
import RestockSheet from '../components/RestockSheet';
import HistorySheet from '../components/HistorySheet';
import YesterdayRecap from '../components/YesterdayRecap';
import Icon from '../components/Icon';
import { Badge, EmptyState, IconButton, LoadError, Loading, Row, SearchInput } from '../components/ui';
import { CareFrame, DietTag, DoneMark, FilterTabs, ItemLines, LinkLine, MetaChip, MoreMark, Notice, StallTag, SummaryCard, TimeChip, UseFirstCard, WorkGroup, WorkRow, dietLine, rowAction } from '../components/CareKit';
import { useFeedings, useInventory, useRefreshAll, useStableOverview, useTasks } from '../hooks/useGroomData';
import {
  EATEN_OPTIONS,
  HEALTH_STATUS,
  MEAL_CONFIG,
  MEAL_ORDER,
  NO_RATION_REASON,
  describeObservation,
  expiryOf,
  formatDate,
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
  stockFor,
  taskState,
  useFirstItems,
  weekdayShort,
} from '../utils/groom';
import { colors, spacing } from '../theme';

const SLOT_SHORT = { morning: 'Sáng', noon: 'Trưa', evening: 'Tối' };

/**
 * Feeding, one meal at a time. The summary says how many horses have eaten the meal shown and at what
 * hour; the tabs under it are the day's three meals; the list is one line per horse — its stall, what
 * goes in the bucket, where it stands, and the one button its state calls for: "Cho ăn" when it can be
 * recorded, "Quên ghi" when it was given but its window closed, "Xin kho" when the store is short,
 * "Báo HLV" when there is no approved ration. Tapping the line opens the meal in full with every other
 * action ("Không cho ăn"). A meal is only recorded against an approved ration — the server refuses it
 * otherwise too.
 */
export default function FeedingScreen({ navigation, segments }) {
  const [slotChoice, setSlotChoice] = useState(null);
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
    () => tasks.filter((t) => t.taskType === 'feeding' && myHorseIds.has(refId(t.horse))),
    [tasks, myHorseIds]
  );

  const rationsByHorse = useMemo(() => {
    const map = new Map();
    feedings.forEach((f) => map.set(refId(f.horse), [...(map.get(refId(f.horse)) || []), f]));
    return map;
  }, [feedings]);

  // The horses I feed: those I look after, and any horse whose meal was given to me today (covering a
  // colleague). Only these: a meal can only be recorded by the groom it was given to.
  const fedByMe = useMemo(() => new Set(feedingTasks.map((t) => refId(t.horse))), [feedingTasks]);
  const stallOf = (horseId) => stallCodeOf(assignmentByHorseId.get(horseId));
  const scoped = horses
    .filter((h) => myHorseIds.has(h._id) || fedByMe.has(h._id))
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
    const list = rowsFor(s).filter((r) => r.task);
    const done = list.filter((r) => r.task.status === 'completed').length;
    const alert = list.some((r) => ['missed', 'blocked'].includes(taskState(r.task, ctx)?.key));
    const at = mealTimeOf(s, allSchedules);
    return { value: s, label: SLOT_SHORT[s], alert, sub: list.length ? `${done === list.length ? '✓ ' : ''}${done}/${list.length} · ${at}` : at };
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
  // Feed to use first: what today's rations take whose next lot expires soon, and what waits unused.
  const useFirst = useFirstItems(inventory, 'feed', usedItems).slice(0, 5);
  const feeds = inventory.filter((i) => i.category === 'feed' && i.isActive !== false);
  const storeLine = [
    `${feeds.length} loại`,
    feeds.filter((i) => i.level?.short).length ? `${feeds.filter((i) => i.level?.short).length} sắp hết` : null,
    useFirst.length ? `${useFirst.length} sắp hết hạn` : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
  const mealAt = mealTimeOf(slot, allSchedules);
  const isNow = current.slot === slot && !current.tomorrow;
  const severe = shortages.some((s) => s.level.key !== 'low');

  const summary = (
    <SummaryCard
      done={withTask.length ? doneCount : 0}
      total={withTask.length || null}
      label={withTask.length ? `ngựa đã ăn ${meal.label.toLowerCase()}${isNow ? ' (bữa hiện tại)' : ''}` : `Chưa có ngựa nào cần ăn ${meal.label.toLowerCase()}`}
      note={withTask.length ? (todo.length ? `Còn ${todo.length} ngựa cần cho ăn${noRation.length ? ` · ${noRation.length} chưa có KP` : ''}` : 'Đã xong bữa này') : null}
      right={<MetaChip icon={meal.icon} text={mealAt} />}
      progress={withTask.length ? (doneCount / withTask.length) * 100 : null}
    />
  );

  const filters = (
    <>
      <FilterTabs options={tabs} value={slot} onChange={setSlotChoice} />
      <SearchInput value={search} onChange={setSearch} placeholder="Tìm ngựa, mã chuồng..." />
    </>
  );

  const overlays = (
    <>
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
    </>
  );

  return (
    <CareFrame
      subtitle={`Hôm nay · ${weekdayShort(new Date())} ${formatDate(new Date()).slice(0, 5)}`}
      right={<IconButton icon="history" label="Lịch sử cho ăn" onPress={() => setHistoryOpen(true)} />}
      segments={segments}
      summary={summary}
      filters={filters}
      refreshing={refreshing}
      onRefresh={onRefresh}
      overlays={overlays}
    >
      {shortages.length > 0 ? (
        <Notice
          tone={severe ? 'danger' : 'warning'}
          title="Kho sắp hết:"
          text={shortages.map((s) => `${s.name} ${s.level.key === 'expired' ? 'hết hạn' : `còn ${formatStock(s)}${s.daysLeft != null ? ` (${formatDays(s.daysLeft)})` : ''}`}`).join(' · ')}
          action="Xin thêm"
          onAction={() =>
            shortages.length === 1
              ? setRestock(restockRequestFor({ entry: { inventoryItem: shortages[0]._id, name: shortages[0].name, unit: shortages[0].unit, available: shortages[0].quantity }, inventory }))
              : navigation.navigate('Kho')
          }
        />
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
        <WorkGroup>
          <EmptyState icon="stable" text={search ? 'Không tìm thấy ngựa nào' : 'Bạn chưa phụ trách ngựa nào'} hint={search ? 'Thử xoá từ khoá.' : 'Quản lý phân công ngựa cho bạn ở Chuồng trại.'} />
        </WorkGroup>
      ) : (
        <>
          {rows.length === 0 ? (
            <WorkGroup>
              <EmptyState icon={meal.icon} text={`Không có ngựa nào ăn ${meal.label.toLowerCase()}`} hint="Khẩu phần do HLV lập và duyệt." />
            </WorkGroup>
          ) : todo.length > 0 ? (
            <WorkGroup title={`Cần cho ăn · ${todo.length}`}>
              {todo.map((r) => (
                <MealRow key={r.horse._id} row={r} ctx={ctx} onOpen={() => open(r)} onAct={() => act(r)} />
              ))}
            </WorkGroup>
          ) : (
            <Notice tone="success" icon="checkCircle" title={`Xong ${meal.label.toLowerCase()}`} text="cho mọi ngựa." />
          )}

          {noRation.length > 0 ? (
            <WorkGroup title={`Chưa có khẩu phần · ${noRation.length}`}>
              {noRation.map((r) => (
                <NoRationRow key={r.horse._id} row={r} ctx={ctx} onReport={() => reportNotDone(r.task, NO_RATION_REASON)} />
              ))}
            </WorkGroup>
          ) : null}

          {settled.length > 0 ? (
            <WorkGroup title={`Đã xong · ${settled.length}`} foldable open={showDone} onToggle={() => setShowDone((v) => !v)}>
              {settled.map((r) => (
                <MealRow key={r.horse._id} row={r} ctx={ctx} onOpen={() => open(r)} onAct={() => act(r)} />
              ))}
            </WorkGroup>
          ) : null}

          {noSlot.length > 0 ? (
            <Row style={styles.footnote}>
              <Icon name="info" size={14} color={colors.textFaint} />
              <Text style={styles.footnoteText}>
                Không ăn {meal.label.toLowerCase()}: {noSlot.map((h) => h.name).join(', ')}
              </Text>
            </Row>
          ) : null}
        </>
      )}

      <UseFirstCard entries={useFirst} kind="feed" onOpenStore={() => navigation.navigate('Kho')} />

      {/* Reference, below the day's work: how yesterday went and what the store holds. */}
      <YesterdayRecap tasks={mealHistory} noun="bữa" onPress={() => setHistoryOpen(true)} />
      <LinkLine icon="supplies" title="Kho thức ăn:" text={feeds.length ? storeLine : 'chưa có mặt hàng nào'} tone={colors.forestLight} onPress={() => navigation.navigate('Kho')} />
    </CareFrame>
  );
}

/**
 * One horse's meal: its stall, what goes in the bucket, where it stands, and the one button for it.
 */
function MealRow({ row, ctx, onOpen, onAct }) {
  const { horse, schedules, task, stall } = row;
  const state = taskState(task, ctx);
  const action = primaryAction(task, ctx);
  // A known reason (no approved ration, an expired feed) goes to the trainer; otherwise it is a missed meal.
  const button = action ? { ...rowAction(action.key, { complete: 'Cho ăn' }), ...(action.reason ? { title: 'Báo HLV' } : {}), onPress: onAct } : null;
  const health = horse.healthStatus && horse.healthStatus !== 'eligible' ? HEALTH_STATUS[horse.healthStatus] : null;
  const fed = task?.status === 'completed';
  const rationItems = schedules.flatMap((s) => s.items || []);
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
  // Not time yet: the hour on the right says it. Ready: the button says it.
  else if (state?.key === 'upcoming') status = null;
  else if (state?.key === 'ready') status = task.makeUpOf ? `Cho ăn bù lúc ${formatTime(task.scheduledDate)}` : null;
  else status = state?.reason || state?.label;

  const trailing = fed ? <DoneMark /> : state?.key === 'upcoming' ? <TimeChip time={task.makeUpOf ? formatTime(task.scheduledDate) : mealTimeOf(task.mealSlot, row.allSchedules)} /> : <MoreMark />;

  return (
    <WorkRow
      lead={<StallTag code={stall} name={horse.name} />}
      title={horse.name}
      label={`Bữa của ${horse.name}`}
      tags={
        <>
          {task?.makeUpOf ? <Badge label="Ăn bù" color={colors.blue} bg={colors.blueSoft} /> : null}
          {rationItems.length > 0 && !approved ? <Badge label="Chờ HLV duyệt" color={colors.orange} bg={colors.orangeSoft} /> : null}
          {health ? <View style={[styles.healthDot, { backgroundColor: health.color }]} accessibilityLabel={health.label} /> : null}
          {!fed ? <DietTag diet={horse.feedingDiet} /> : null}
        </>
      }
      // On a sick diet the vet's words (or what to mind) right under the name, before the bucket is filled.
      detail={rationItems.length ? (fed ? null : dietLine(horse.feedingDiet)) : 'Chưa có khẩu phần'}
      footer={
        rationItems.length ? (
          <ItemLines
            items={rationItems.map((item) => {
              const line = rationLine(item);
              const stock = stockFor({ inventoryItem: item.inventoryItem, name: item.type }, ctx.inventory || [], 'feed');
              return { icon: line.icon, label: line.label, amount: line.amount, expiry: stock?.linked && !fed ? expiryOf(stock.items[0]) : null };
            })}
          />
        ) : null
      }
      status={status}
      statusTone={tone}
      action={button}
      trailing={trailing}
      done={fed}
      onPress={onOpen}
    />
  );
}

/** A horse with no ration at all: nothing to measure out, so the trainer is told instead. */
function NoRationRow({ row, ctx, onReport }) {
  const state = taskState(row.task, ctx);
  const pending = row.task.status === 'pending';
  return (
    <WorkRow
      lead={<StallTag code={row.stall} name={row.horse.name} />}
      title={row.horse.name}
      detail={pending ? 'Chưa có khẩu phần' : null}
      status={pending ? null : state?.key === 'cancelled' ? 'HLV cho bỏ qua' : `Đã báo HLV: ${row.task.skipReason}`}
      statusTone={colors.orange}
      action={pending ? { title: 'Báo HLV', icon: 'block', variant: 'ghost', onPress: onReport } : null}
      trailing={pending ? null : <MoreMark />}
    />
  );
}

const styles = StyleSheet.create({
  healthDot: { width: 8, height: 8, borderRadius: 4 },
  footnote: { gap: 6, paddingHorizontal: spacing.xs, alignItems: 'flex-start' },
  footnoteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textMuted },
});
