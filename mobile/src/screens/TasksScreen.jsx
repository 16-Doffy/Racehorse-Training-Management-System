import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import CompleteTaskModal from '../components/CompleteTaskModal';
import IncidentModal from '../components/IncidentModal';
import NotDoneModal from '../components/NotDoneModal';
import TaskDetailSheet from '../components/TaskDetailSheet';
import RestockSheet from '../components/RestockSheet';
import { Badge, ChipGroup, EmptyState, IconButton, LoadError, Loading, Row } from '../components/ui';
import { CareFrame, DayPicker, DoneMark, FilterTabs, IconLead, MoreMark, Notice, StallTag, SummaryCard, ToggleChip, WorkGroup, WorkRow, rowAction } from '../components/CareKit';
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
import { colors, spacing } from '../theme';

// Meals live on "Cho ăn" and doses on "Thuốc", where the ration and the prescription are. This tab
// is the stable work itself — mucking out, washing, icing, hooves and whatever else the trainer
// assigns ("Việc khác") — which is what a groom means by "việc chuồng".

/**
 * The day's stable work. The summary counts the day's chores done and holds the day picker; the tabs
 * are "Cần làm" (late, then now, then later), "Đã xong" and "Tất cả", and the jobs of the day narrow
 * them further. The list groups by horse — the groom walks stall to stall — or by job, to muck out
 * every stall in one round. Earlier work still open carries over and is offered from today. The detail
 * sheet holds every action (acknowledge, can't do it, report an incident, ask for supplies).
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
  const lateNow = todoAll.some((t) => ['late', 'missed', 'blocked'].includes(taskState(t, ctx)?.key));

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

  const dayShort = `${weekdayShort(day)} ${formatDate(day).slice(0, 5)}`;
  const summary = (
    <SummaryCard
      done={doneCount}
      total={planned.length || null}
      label={planned.length ? 'việc đã xong' : 'Không có việc nào'}
      note={planned.length ? (todoAll.length ? `Còn ${todoAll.length} việc cần làm` : 'Đã xong hết') : 'Vệ sinh · tắm · ngâm chân · móng · việc khác'}
      alert={lateNow}
      right={
        <DayPicker
          label={isToday(day) ? 'Hôm nay' : dayShort}
          hint={isToday(day) ? dayShort : 'về hôm nay'}
          onPrev={() => setDay((d) => addDays(d, -1))}
          onNext={() => setDay((d) => addDays(d, 1))}
          onToday={() => setDay(startOfDay(new Date()))}
        />
      }
      progress={planned.length ? percent : null}
    />
  );

  const filters = (
    <>
      <FilterTabs
        value={view}
        onChange={setView}
        options={[
          { value: 'todo', label: 'Cần làm', sub: `${todoAll.length} việc`, alert: lateNow },
          { value: 'done', label: 'Đã xong', sub: `${doneAll.length} việc` },
          { value: 'all', label: 'Tất cả', sub: `${dayTasks.length} việc` },
        ]}
      />
      {dayTasks.length > 0 ? (
        <Row style={{ gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {typeChips.length > 2 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <ChipGroup options={typeChips} value={type} onChange={setType} size="sm" />
              </ScrollView>
            ) : null}
          </View>
          <ToggleChip
            icon={groupBy === 'horse' ? 'stall' : 'tasks'}
            label={groupBy === 'horse' ? 'Theo ngựa' : 'Theo việc'}
            a11y={groupBy === 'horse' ? 'Đang nhóm theo ngựa, chạm để nhóm theo việc' : 'Đang nhóm theo việc, chạm để nhóm theo ngựa'}
            onPress={() => setGroupBy((g) => (g === 'horse' ? 'type' : 'horse'))}
          />
        </Row>
      ) : null}
    </>
  );

  const overlays = (
    <>
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
    </>
  );

  return (
    <CareFrame
      subtitle={`Hôm nay · ${weekdayShort(new Date())} ${formatDate(new Date()).slice(0, 5)}`}
      right={<IconButton icon="warning" label="Báo cáo sự cố" onPress={() => navigation?.navigate('Incidents')} />}
      segments={segments}
      summary={summary}
      filters={filters}
      refreshing={refreshing}
      onRefresh={onRefresh}
      overlays={overlays}
    >
      {overdue.length > 0 && isToday(day) ? (
        <Notice
          tone="warning"
          icon="clock"
          title={`${overdue.length} việc hôm trước`}
          text="chưa xong — vẫn làm được."
          action="Xem"
          onAction={() => setDay(startOfDay(overdue[overdue.length - 1].scheduledDate))}
        />
      ) : null}

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <LoadError text="Không tải được danh sách việc" onRetry={() => refetch()} />
      ) : groups.length === 0 ? (
        view === 'todo' && dayTasks.length > 0 && type === 'all' ? (
          <Notice tone="success" icon="checkCircle" title="Xong hết việc chuồng" text={isToday(day) ? 'hôm nay.' : 'ngày này.'} />
        ) : (
          <WorkGroup>
            <EmptyState icon={dayTasks.length ? 'search' : 'empty'} text={dayTasks.length ? 'Không có việc nào ở mục này' : `Không có việc nào ${isToday(day) ? 'hôm nay' : 'vào ngày này'}`} />
          </WorkGroup>
        )
      ) : (
        groups.map(({ key, items }) => {
          const done = items.filter((t) => t.status === 'completed').length;
          if (groupBy === 'horse') {
            const horse = horseById.get(key) || items[0].horse;
            const health = horse?.healthStatus && horse.healthStatus !== 'eligible' ? HEALTH_STATUS[horse.healthStatus] : null;
            return (
              <WorkGroup
                key={key}
                variant="horse"
                lead={<StallTag code={stallOf(key)} name={horse?.name} />}
                title={horse?.name || 'Không rõ ngựa'}
                meta={
                  <>
                    {health ? `${health.label} · ` : ''}
                    {done}/{items.length}
                  </>
                }
              >
                {items.map((task) => (
                  <ChoreRow key={task._id} task={task} ctx={ctx} schedules={schedulesFor(refId(task.horse))} onOpen={() => setDetail(task)} onAct={() => act(task)} />
                ))}
              </WorkGroup>
            );
          }
          const cfg = TASK_CONFIG[key] || TASK_CONFIG.other;
          return (
            <WorkGroup key={key} variant="horse" lead={<IconLead icon={cfg.icon} color={cfg.color} bg={cfg.bg} />} title={cfg.label} meta={`${done}/${items.length} ngựa`}>
              {items.map((task) => (
                <ChoreRow
                  key={task._id}
                  task={task}
                  ctx={ctx}
                  schedules={schedulesFor(refId(task.horse))}
                  horseName={task.horse?.name}
                  stall={stallOf(refId(task.horse))}
                  onOpen={() => setDetail(task)}
                  onAct={() => act(task)}
                />
              ))}
            </WorkGroup>
          );
        })
      )}
    </CareFrame>
  );
}

/**
 * One chore: what it is (or, grouped by job, which horse), when and how it stands, with its one button.
 */
function ChoreRow({ task, ctx, schedules, horseName, stall, onOpen, onAct }) {
  const info = describeTask(task, schedules);
  const state = taskState(task, ctx);
  const action = primaryAction(task, ctx);
  const button = action ? { ...rowAction(action.key, { complete: 'Xong', notDone: 'Báo' }), onPress: onAct } : null;
  const finished = task.status === 'completed';
  const vet = task.source === 'vet';
  const late = !isToday(task.scheduledDate) && state?.open;

  let status = state?.label;
  let tone = state?.color || colors.textMuted;
  if (finished) {
    status = `Xong ${formatTime(task.completedAt)}`;
    tone = colors.green;
  } else if (task.status === 'skipped') status = state?.key === 'cancelled' ? 'HLV cho bỏ qua' : `Không làm được: ${task.skipReason || '—'}`;
  // Ready: the button says it. Not time yet: the hour is on the line already.
  else if (state?.key === 'ready' || state?.key === 'upcoming') status = null;
  else if (state?.key === 'blocked') status = state.reason || state.label;
  if (late && !finished) status = `Từ ${formatDate(task.scheduledDate).slice(0, 5)} · ${status}`;

  // The when, and what the trainer or vet asked: one line.
  const detail = [info.time, task.note && task.taskType !== 'other' && !finished ? `${vet ? 'BS dặn' : 'HLV dặn'}: ${task.note}` : null].filter(Boolean).join(' · ');

  return (
    <WorkRow
      lead={
        horseName ? (
          <StallTag code={stall} name={horseName} />
        ) : finished ? (
          <IconLead icon="check" color={colors.green} bg={colors.greenSoft} />
        ) : (
          <IconLead icon={info.icon} color={info.color} bg={info.bg} />
        )
      }
      title={horseName || info.label}
      label={`${info.label} — ${task.horse?.name || ''}`}
      tags={
        <>
          {vet ? <Badge label="Y lệnh" color={colors.red} bg={colors.redSoft} /> : null}
          {task.incidentReport ? <Icon name="warning" size={13} color={colors.orange} /> : null}
          {task.status === 'pending' && task.acknowledgedAt ? <Icon name="thumb" size={13} color={colors.green} /> : null}
        </>
      }
      detail={detail || null}
      status={status}
      statusTone={tone}
      action={button}
      trailing={finished ? <DoneMark /> : <MoreMark />}
      done={finished}
      accent={vet && task.status === 'pending' ? colors.red : null}
      onPress={onOpen}
    />
  );
}

