import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import CompleteTaskModal from '../components/CompleteTaskModal';
import IncidentModal from '../components/IncidentModal';
import NotDoneModal from '../components/NotDoneModal';
import TaskDetailSheet from '../components/TaskDetailSheet';
import RestockSheet from '../components/RestockSheet';
import { Badge, Banner, Button, ChipRow, EmptyState, IconButton, LoadError, Loading, ProgressBar, Row, Segments, StallPlate } from '../components/ui';
import { useFeedings, useInventory, useRefreshAll, useStableOverview, useTasks } from '../hooks/useGroomData';
import { taskApi } from '../api/endpoints';
import {
  CHORE_TYPES,
  HEALTH_STATUS,
  TASK_CONFIG,
  TASK_TYPE_ORDER,
  addDays,
  describeTask,
  formatDate,
  formatDayLabel,
  formatTime,
  isSameDay,
  isToday,
  missingSupplies,
  needsAction,
  newOpId,
  primaryAction,
  refId,
  restockRequestFor,
  stallCodeOf,
  startOfDay,
  stateRank,
  taskState,
  weekdayShort,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

// Meals live on "Cho ăn" and doses on "Thuốc", where the ration and the prescription are. This tab
// is the stable work itself — mucking out, washing, icing, hooves and whatever else the trainer
// assigns ("Việc khác") — which is what a groom means by "việc chuồng".

/**
 * The day's stable work. "Cần làm" first (late, then now, then later), each line with a "Xong"
 * button when it can be ticked; "Đã xong" holds what is recorded or reported. The list groups by
 * horse — the groom walks stall to stall — or by job, to muck out every stall in one round. Earlier
 * work still open carries over and is offered from today. The detail sheet holds every action
 * (acknowledge, can't do it, report an incident, ask for supplies).
 */
export default function TasksScreen({ navigation, segments }) {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState('todo');
  const [type, setType] = useState('all');
  const [groupBy, setGroupBy] = useState('horse');
  const [detail, setDetail] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [notDone, setNotDone] = useState(null);
  const [notDoneReason, setNotDoneReason] = useState('');
  const [restock, setRestock] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { tasks, isLoading, isError, refetch } = useTasks();
  const { feedings } = useFeedings();
  const { items: inventory } = useInventory();
  const { assignmentByHorseId, horseById } = useStableOverview();
  const refreshAll = useRefreshAll();
  const queryClient = useQueryClient();

  const acknowledge = useMutation({
    mutationFn: (id) => taskApi.acknowledge(id, newOpId()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  // Stock, and whether any of it has expired, decide whether a chore can be recorded.
  const ctx = useMemo(() => ({ inventory }), [inventory]);
  const chores = useMemo(() => tasks.filter((t) => CHORE_TYPES.includes(t.taskType)), [tasks]);
  const dayTasks = useMemo(() => chores.filter((t) => isSameDay(t.scheduledDate, day)), [chores, day]);
  // Earlier chores still to do: mucking out a day late is still mucking out.
  const overdue = useMemo(() => chores.filter((t) => new Date(t.scheduledDate) < startOfDay(new Date()) && taskState(t, ctx)?.open), [chores, ctx]);

  const planned = dayTasks.filter((t) => taskState(t, ctx)?.key !== 'cancelled');
  const doneCount = dayTasks.filter((t) => t.status === 'completed').length;
  const percent = planned.length ? Math.round((doneCount / planned.length) * 100) : 0;
  const todoAll = dayTasks.filter((t) => needsAction(t, ctx));
  const doneAll = dayTasks.filter((t) => !needsAction(t, ctx));

  const typeChips = useMemo(() => {
    const counts = new Map();
    dayTasks.forEach((t) => counts.set(t.taskType, (counts.get(t.taskType) || 0) + 1));
    return [
      { value: 'all', label: 'Mọi việc', count: dayTasks.length },
      ...TASK_TYPE_ORDER.filter((key) => counts.get(key)).map((key) => ({ value: key, label: TASK_CONFIG[key].label, count: counts.get(key) })),
    ];
  }, [dayTasks]);

  const stallOf = (horseId) => stallCodeOf(assignmentByHorseId.get(horseId));
  const byUrgency = (a, b) =>
    stateRank(taskState(a, ctx)) - stateRank(taskState(b, ctx)) || new Date(a.scheduledDate) - new Date(b.scheduledDate);
  const shown = (view === 'todo' ? todoAll : view === 'done' ? doneAll : dayTasks).filter((t) => type === 'all' || t.taskType === type);

  // By horse in stall order (the round through the stable), or by job in the list's own order.
  const groups = useMemo(() => {
    const map = new Map();
    shown.forEach((task) => {
      const key = groupBy === 'horse' ? refId(task.horse) : task.taskType;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(task);
    });
    const list = [...map.entries()].map(([key, items]) => ({ key, items: items.sort(byUrgency) }));
    if (groupBy === 'type') return list.sort((a, b) => TASK_TYPE_ORDER.indexOf(a.key) - TASK_TYPE_ORDER.indexOf(b.key));
    return list.sort((a, b) => (stallOf(a.key) || '~').localeCompare(stallOf(b.key) || '~', 'vi', { numeric: true }));
  }, [shown, groupBy, assignmentByHorseId, ctx]);

  const schedulesFor = (horseId) => feedings.filter((f) => refId(f.horse) === horseId);
  const act = (task) => {
    const action = primaryAction(task, ctx);
    if (!action) return setDetail(task);
    if (action.key === 'complete') return setCompleting(task);
    if (action.key === 'restock') return setRestock(restockRequestFor({ missing: missingSupplies(task), task, inventory }));
    setNotDoneReason(action.reason || '');
    return setNotDone(task);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="Việc chuồng"
        subtitle={planned.length ? `${isToday(day) ? 'Hôm nay' : formatDayLabel(day)}: ${doneCount}/${planned.length} việc xong${todoAll.length ? ` · còn ${todoAll.length}` : ''}` : 'Vệ sinh · tắm · ngâm chân · móng · việc khác'}
        right={<IconButton icon="warning" label="Báo cáo sự cố" onPress={() => navigation?.navigate('Incidents')} />}
      />

      {segments}

      <View style={styles.toolbar}>
        <Row style={styles.dayRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Ngày trước" onPress={() => setDay((d) => addDays(d, -1))} hitSlop={8} style={styles.dayNav}>
            <Icon name="chevronLeft" size={18} color={colors.forest} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Về hôm nay" style={{ flex: 1, alignItems: 'center' }} onPress={() => setDay(startOfDay(new Date()))}>
            <Text style={styles.dayLabel}>
              {formatDayLabel(day)}
              {isToday(day) ? ` · ${weekdayShort(day)} ${formatDate(day).slice(0, 5)}` : ''}
            </Text>
            {!isToday(day) ? <Text style={styles.dayHint}>Chạm để về hôm nay</Text> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Ngày sau" onPress={() => setDay((d) => addDays(d, 1))} hitSlop={8} style={styles.dayNav}>
            <Icon name="chevronRight" size={18} color={colors.forest} />
          </Pressable>
        </Row>
        {planned.length > 0 ? <ProgressBar percent={percent} tint={colors.green} track={colors.graySoft} height={5} /> : null}
        <Row style={{ gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Segments
              options={[
                { value: 'todo', label: 'Cần làm', count: todoAll.length },
                { value: 'done', label: `Đã xong (${doneAll.length})` },
                { value: 'all', label: 'Tất cả' },
              ]}
              value={view}
              onChange={setView}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={groupBy === 'horse' ? 'Đang nhóm theo ngựa, chạm để nhóm theo việc' : 'Đang nhóm theo việc, chạm để nhóm theo ngựa'}
            onPress={() => setGroupBy((g) => (g === 'horse' ? 'type' : 'horse'))}
            style={({ pressed }) => [styles.groupToggle, pressed && { opacity: 0.7 }]}
          >
            <Icon name={groupBy === 'horse' ? 'stall' : 'tasks'} size={16} color={colors.forest} />
            <Text style={styles.groupToggleText}>{groupBy === 'horse' ? 'Theo ngựa' : 'Theo việc'}</Text>
          </Pressable>
        </Row>
        {typeChips.length > 2 ? <ChipRow options={typeChips} value={type} onChange={setType} size="sm" /> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}>
        {overdue.length > 0 && isToday(day) ? (
          <Banner tone="warning" style={{ paddingVertical: spacing.sm }}>
            <Row style={{ gap: spacing.sm }}>
              <Icon name="clock" size={17} color={colors.orange} />
              <Text style={[font.small, { flex: 1, color: colors.text }]}>
                <Text style={{ fontWeight: '700' }}>{overdue.length} việc hôm trước</Text> chưa xong — vẫn làm được.
              </Text>
              <Button title="Xem" size="sm" variant="ghost" onPress={() => setDay(startOfDay(overdue[overdue.length - 1].scheduledDate))} />
            </Row>
          </Banner>
        ) : null}

        {isLoading ? (
          <Loading />
        ) : isError ? (
          <LoadError text="Không tải được danh sách việc" onRetry={() => refetch()} />
        ) : groups.length === 0 ? (
          view === 'todo' && dayTasks.length > 0 && type === 'all' ? (
            <Banner tone="success" style={{ paddingVertical: spacing.sm }}>
              <Row style={{ gap: spacing.sm }}>
                <Icon name="checkCircle" size={18} color={colors.green} />
                <Text style={[font.body, { flex: 1, fontWeight: '700' }]}>Xong hết việc chuồng {isToday(day) ? 'hôm nay' : 'ngày này'}</Text>
              </Row>
            </Banner>
          ) : (
            <View style={styles.list}>
              <EmptyState
                icon={dayTasks.length ? 'search' : 'empty'}
                text={dayTasks.length ? 'Không có việc nào ở mục này' : `Không có việc nào ${isToday(day) ? 'hôm nay' : 'vào ngày này'}`}
              />
            </View>
          )
        ) : (
          groups.map(({ key, items }) => (
            <View key={key} style={styles.list}>
              {groupBy === 'horse' ? (
                <HorseHead horse={horseById.get(key) || items[0].horse} stall={stallOf(key)} items={items} />
              ) : (
                <TypeHead type={key} items={items} />
              )}
              {items.map((task) => (
                <ChoreRow
                  key={task._id}
                  task={task}
                  ctx={ctx}
                  schedules={schedulesFor(refId(task.horse))}
                  label={groupBy === 'type' ? task.horse?.name : null}
                  stall={groupBy === 'type' ? stallOf(refId(task.horse)) : null}
                  onOpen={() => setDetail(task)}
                  onAct={() => act(task)}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* The list stays short; the sheet carries the detail and every action. */}
      <TaskDetailSheet
        task={detail}
        ctx={ctx}
        schedules={detail ? schedulesFor(refId(detail.horse)) : []}
        visible={!!detail}
        onClose={() => setDetail(null)}
        acknowledging={acknowledge.isPending && acknowledge.variables === detail?._id}
        onAcknowledge={() => acknowledge.mutate(detail._id)}
        onComplete={() => {
          const task = detail;
          setDetail(null);
          setCompleting(task);
        }}
        onNotDone={() => {
          const task = detail;
          setDetail(null);
          setNotDoneReason('');
          setNotDone(task);
        }}
        onAskSupply={(entry) => {
          const task = detail;
          setDetail(null);
          setRestock(restockRequestFor({ entry, missing: missingSupplies(task), task, inventory }));
        }}
        onReport={() => {
          const task = detail;
          setDetail(null);
          setReporting(task);
        }}
      />

      <CompleteTaskModal
        task={completing}
        schedules={completing ? schedulesFor(refId(completing.horse)) : []}
        visible={!!completing}
        onClose={() => setCompleting(null)}
        onShortage={(missing, task) => setRestock(restockRequestFor({ missing, task, inventory }))}
      />
      <IncidentModal task={reporting} visible={!!reporting} onClose={() => setReporting(null)} />
      <NotDoneModal task={notDone} visible={!!notDone} initialReason={notDoneReason} onClose={() => setNotDone(null)} />
      <RestockSheet request={restock} visible={!!restock} onClose={() => setRestock(null)} />
    </SafeAreaView>
  );
}

function HorseHead({ horse, stall, items }) {
  const health = horse?.healthStatus && horse.healthStatus !== 'eligible' ? HEALTH_STATUS[horse.healthStatus] : null;
  const done = items.filter((t) => t.status === 'completed').length;
  return (
    <Row style={styles.head}>
      <StallPlate code={stall} name={horse?.name} size="sm" />
      <Text style={styles.headTitle} numberOfLines={1}>
        {horse?.name || 'Không rõ ngựa'}
      </Text>
      {health ? <Badge label={health.label} color={health.color} bg={health.bg} dot /> : null}
      <Text style={styles.headCount}>
        {done}/{items.length}
      </Text>
    </Row>
  );
}

function TypeHead({ type, items }) {
  const cfg = TASK_CONFIG[type] || TASK_CONFIG.other;
  const done = items.filter((t) => t.status === 'completed').length;
  return (
    <Row style={styles.head}>
      <View style={[styles.typeIcon, { backgroundColor: cfg.bg }]}>
        <Icon name={cfg.icon} size={17} color={cfg.color} />
      </View>
      <Text style={styles.headTitle} numberOfLines={1}>
        {cfg.label}
      </Text>
      <Text style={styles.headCount}>
        {done}/{items.length} ngựa
      </Text>
    </Row>
  );
}

const ACTIONS = {
  complete: { title: 'Xong', icon: 'check', variant: 'primary' },
  late: { title: 'Quên ghi', icon: 'clock', variant: 'subtle' },
  restock: { title: 'Xin kho', icon: 'plus', variant: 'danger' },
  notDone: { title: 'Báo', icon: 'block', variant: 'ghost' },
};

/**
 * One chore: what (or, grouped by job, which horse), when and how it stands, with its one button.
 * The line opens the detail; the button never sits inside it.
 */
function ChoreRow({ task, ctx, schedules, label, stall, onOpen, onAct }) {
  const info = describeTask(task, schedules);
  const state = taskState(task, ctx);
  const action = primaryAction(task, ctx);
  const button = action ? ACTIONS[action.key] : null;
  const finished = task.status === 'completed';
  const vet = task.source === 'vet';
  const late = !isToday(task.scheduledDate) && state?.open;

  let status = state?.label;
  if (finished) status = `Xong ${formatTime(task.completedAt)}`;
  else if (task.status === 'skipped') status = state?.key === 'cancelled' ? 'HLV cho bỏ qua' : `Không làm được: ${task.skipReason || '—'}`;
  else if (state?.key === 'blocked' || state?.key === 'upcoming') status = state.reason || state.label;

  return (
    <View style={[styles.row, vet && task.status === 'pending' && styles.rowVet]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${info.label} — ${task.horse?.name || ''}`} onPress={onOpen} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
        {label ? (
          <StallPlate code={stall} name={label} size="sm" />
        ) : (
          <View style={[styles.typeIcon, { backgroundColor: finished ? colors.greenSoft : info.bg }]}>
            <Icon name={finished ? 'check' : info.icon} size={17} color={finished ? colors.green : info.color} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={[styles.title, finished && styles.doneText]} numberOfLines={1}>
            {label || info.label}
          </Text>
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            {info.time ? <Text style={styles.time}>{info.time}</Text> : null}
            {late ? <Text style={[styles.status, { color: colors.orange }]}>từ {formatDate(task.scheduledDate).slice(0, 5)}</Text> : null}
            {status ? (
              <Text style={[styles.status, { color: finished ? colors.green : state?.color || colors.textMuted }]} numberOfLines={1}>
                {status}
              </Text>
            ) : null}
            {vet ? <Badge label="Y lệnh" color={colors.red} bg={colors.redSoft} /> : null}
            {task.incidentReport ? <Icon name="warning" size={13} color={colors.orange} /> : null}
            {task.status === 'pending' && task.acknowledgedAt ? <Icon name="thumb" size={13} color={colors.green} /> : null}
          </Row>
          {task.note && task.taskType !== 'other' && !finished ? (
            <Text style={styles.note} numberOfLines={1}>
              {vet ? 'BS dặn' : 'HLV dặn'}: {task.note}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {button ? (
        <Button title={button.title} icon={button.icon} variant={button.variant} size="sm" style={styles.action} onPress={onAct} />
      ) : finished ? (
        <Icon name="checkCircle" size={26} color={colors.green} />
      ) : (
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  dayRow: { gap: spacing.sm },
  dayNav: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.graySoft, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { ...font.h3, color: colors.forest },
  dayHint: { fontSize: 11, color: colors.textMuted },
  groupToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  groupToggleText: { fontSize: 12.5, fontWeight: '700', color: colors.forest },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  list: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  head: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.cream },
  headTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.forest },
  headCount: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  // A vet's order is not a chore: a red edge so it reads differently in a long list.
  rowVet: { borderLeftWidth: 3, borderLeftColor: colors.red },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  typeIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  doneText: { color: colors.textMuted, textDecorationLine: 'line-through' },
  time: { fontSize: 12.5, fontWeight: '800', color: colors.forest },
  status: { fontSize: 12, fontWeight: '600' },
  note: { fontSize: 12, color: colors.forestLight },
  action: { minWidth: 80 },
});
