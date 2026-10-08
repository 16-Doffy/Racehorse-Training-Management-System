import { useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import CompleteTaskModal from '../components/CompleteTaskModal';
import IncidentModal from '../components/IncidentModal';
import NotDoneModal from '../components/NotDoneModal';
import TaskDetailSheet from '../components/TaskDetailSheet';
import WeekStrip from '../components/WeekStrip';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  FilterBar,
  FilterSheet,
  HorseAvatar,
  Loading,
  PendingBadge,
  ProgressBar,
  Row,
} from '../components/ui';
import { useFeedings, useRefreshAll, useStableOverview, useTasks } from '../hooks/useGroomData';
import { API_ORIGIN } from '../api/client';
import { useOutbox } from '../offline/OutboxContext';
import {
  HEALTH_STATUS,
  SEVERITY,
  CHORE_TYPES,
  TASK_CONFIG,
  TASK_SOURCE,
  TASK_STATUS,
  TASK_TYPE_ORDER,
  TIMING_STATE,
  describeTask,
  formatTime,
  isSameDay,
  isToday,
  matchesSearch,
  parseStableBlock,
  refId,
  startOfDay,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

// Meals live on "Cho ăn" and doses on "Thuốc", where the ration and the prescription are. This
// tab is the stable work itself, which is what a groom means by "việc chuồng".

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chưa xong' },
  { value: 'completed', label: 'Đã xong' },
  { value: 'skipped', label: 'Không làm được' },
];

export default function TasksScreen() {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [notDone, setNotDone] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { tasks, isLoading } = useTasks();
  const { feedings } = useFeedings();
  const { assignmentByHorseId, horseById } = useStableOverview();
  const refreshAll = useRefreshAll();
  const queryClient = useQueryClient();

  const { submit: send } = useOutbox();
  const acknowledge = useMutation({
    mutationFn: (task) => send('acknowledge', { taskId: task._id }, { taskId: task._id, label: 'Nhận việc', horseName: task.horse?.name }),
    onSuccess: (res) => {
      if (!res.queued) queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const chores = useMemo(() => tasks.filter((t) => CHORE_TYPES.includes(t.taskType)), [tasks]);
  const dayTasks = useMemo(() => chores.filter((t) => isSameDay(t.scheduledDate, day)), [chores, day]);
  const overdue = useMemo(
    () => chores.filter((t) => t.status === 'pending' && new Date(t.scheduledDate) < startOfDay(new Date())),
    [chores]
  );
  const done = dayTasks.filter((t) => t.status === 'completed');
  const pendingCount = dayTasks.filter((t) => t.status === 'pending').length;
  const percent = dayTasks.length ? Math.round((done.length / dayTasks.length) * 100) : 0;

  // Counts per task type for the filter row, so the groom sees what the day is made of.
  const typeFilters = useMemo(() => {
    const counts = new Map();
    dayTasks.forEach((t) => counts.set(t.taskType, (counts.get(t.taskType) || 0) + 1));
    return [
      { value: 'all', label: 'Mọi việc', count: dayTasks.length },
      ...TASK_TYPE_ORDER.filter((key) => counts.get(key)).map((key) => ({
        value: key,
        label: TASK_CONFIG[key].label,
        count: counts.get(key),
      })),
    ];
  }, [dayTasks]);

  const visible = dayTasks
    .filter((t) => status === 'all' || t.status === status)
    .filter((t) => type === 'all' || t.taskType === type)
    .filter((t) => {
      if (!search) return true;
      const assignment = assignmentByHorseId.get(refId(t.horse));
      const haystack = [t.horse?.name, TASK_CONFIG[t.taskType]?.label, t.note, assignment?.stableBlock].join(' ');
      return matchesSearch(haystack, search);
    });

  // One card per horse, tasks inside ordered by their scheduled time.
  const groups = useMemo(() => {
    const map = new Map();
    visible.forEach((task) => {
      const id = refId(task.horse);
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(task);
    });
    return [...map.entries()]
      .map(([horseId, items]) => ({
        horseId,
        items: items.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate)),
      }))
      .sort((a, b) =>
        (assignmentByHorseId.get(a.horseId)?.stableBlock || '~').localeCompare(
          assignmentByHorseId.get(b.horseId)?.stableBlock || '~',
          'vi',
          { numeric: true }
        )
      );
  }, [visible, assignmentByHorseId]);

  // Dots under the week strip: how much is still open on each day.
  const pendingByDay = useMemo(() => {
    const map = new Map();
    chores
      .filter((t) => t.status === 'pending')
      .forEach((t) => {
        const key = startOfDay(t.scheduledDate).getTime();
        map.set(key, (map.get(key) || 0) + 1);
      });
    return map;
  }, [chores]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const schedulesFor = (horseId) => feedings.filter((f) => refId(f.horse) === horseId);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="Việc chuồng trại"
        subtitle={`Vệ sinh · tắm rửa · ngâm chân — ${done.length}/${dayTasks.length} đã xong`}
      />

      <WeekStrip value={day} onChange={setDay} pendingByDay={pendingByDay} />

      <View style={styles.toolbar}>
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Tìm theo ngựa, việc, ghi chú..."
          activeCount={(type !== 'all' ? 1 : 0) + (status !== 'all' ? 1 : 0)}
          onOpenFilters={() => setFiltersOpen(true)}
        />
        {dayTasks.length > 0 ? (
          <ProgressBar percent={percent} tint={colors.forest} track={colors.graySoft} height={5} />
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {overdue.length > 0 && isToday(day) && (
          <Banner tone="warning">
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="clock" size={18} color={colors.orange} />
              <View style={{ flex: 1 }}>
                <Text style={font.body}>{overdue.length} việc quá hạn chưa hoàn thành.</Text>
                <Pressable onPress={() => setDay(startOfDay(overdue[overdue.length - 1].scheduledDate))} hitSlop={6}>
                  <Text style={styles.link}>Mở ngày cũ nhất →</Text>
                </Pressable>
              </View>
            </Row>
          </Banner>
        )}

        {isLoading ? (
          <Loading />
        ) : groups.length === 0 ? (
          <Card>
            <EmptyState
              icon={dayTasks.length ? 'search' : 'empty'}
              text={dayTasks.length ? 'Không có việc nào khớp bộ lọc' : `Không có việc nào ${isToday(day) ? 'hôm nay' : 'vào ngày này'}`}
              hint={dayTasks.length ? 'Thử bỏ bớt bộ lọc hoặc xoá từ khoá tìm kiếm.' : undefined}
            />
          </Card>
        ) : (
          groups.map(({ horseId, items }) => {
            const assignment = assignmentByHorseId.get(horseId);
            const horse = horseById.get(horseId);
            const health = HEALTH_STATUS[horse?.healthStatus];
            const doneCount = items.filter((t) => t.status === 'completed').length;
            return (
              <Card key={horseId} style={{ gap: spacing.sm }}>
                <Row style={{ gap: spacing.md }}>
                  <HorseAvatar name={items[0].horse?.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={font.h2}>{items[0].horse?.name || 'Không rõ ngựa'}</Text>
                    <Row style={{ gap: 4 }}>
                      <Icon name="stall" size={12} color={colors.textFaint} />
                      <Text style={font.small}>
                        {assignment ? parseStableBlock(assignment.stableBlock).stall : 'Chưa xếp chuồng'}
                      </Text>
                    </Row>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {health ? <Badge label={health.label} color={health.color} bg={health.bg} dot /> : null}
                    <Text style={font.small}>
                      {doneCount}/{items.length} việc
                    </Text>
                  </View>
                </Row>

                {items.map((task) => (
                  <TaskRow
                    key={task._id}
                    task={task}
                    schedules={schedulesFor(horseId)}
                    onOpen={() => setDetail(task)}
                    onComplete={() => setCompleting(task)}
                  />
                ))}
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* The list stays short; the sheet carries the detail and every action. */}
      <TaskDetailSheet
        task={detail}
        schedules={detail ? schedulesFor(refId(detail.horse)) : []}
        visible={!!detail}
        onClose={() => setDetail(null)}
        acknowledging={acknowledge.isPending && acknowledge.variables === detail?._id}
        onAcknowledge={() => acknowledge.mutate(detail)}
        onComplete={() => {
          const task = detail;
          setDetail(null);
          setCompleting(task);
        }}
        onNotDone={() => {
          const task = detail;
          setDetail(null);
          setNotDone(task);
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
      />
      <IncidentModal task={reporting} visible={!!reporting} onClose={() => setReporting(null)} />
      <NotDoneModal task={notDone} visible={!!notDone} onClose={() => setNotDone(null)} />

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setType('all');
          setStatus('all');
        }}
        groups={[
          { title: 'Loại công việc', options: typeFilters, value: type, onChange: setType },
          { title: 'Trạng thái', options: STATUS_FILTERS, value: status, onChange: setStatus },
        ]}
      />
    </SafeAreaView>
  );
}

/**
 * One line per task: what, when, and how it stands. Everything else — the vet's note, the reason
 * it cannot be ticked yet, the incident, the observation — is one tap away in the detail sheet,
 * which keeps a 15-task day readable.
 */
function TaskRow({ task, schedules, onOpen, onComplete }) {
  const info = describeTask(task, schedules);
  const status = TASK_STATUS[task.status] || TASK_STATUS.pending;
  const isDone = task.status === 'completed';
  const isPending = task.status === 'pending';

  const timing = task.timing || {};
  const timingCfg = TIMING_STATE[timing.state];
  const canComplete = isPending && timing.canComplete !== false;
  const isVetOrder = task.source === 'vet';

  // Two separate touch targets side by side, never nested: the row opens the detail, the round
  // button ticks the task off.
  return (
    <Row style={[styles.task, isVetOrder && isPending && styles.taskVet]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${info.label} — ${task.horse?.name || ''}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.taskMain, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.taskIcon, { backgroundColor: isDone ? colors.greenSoft : info.bg }]}>
          <Icon name={isDone ? 'check' : info.icon} size={18} color={isDone ? colors.green : info.color} />
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[font.h3, isDone && styles.doneText]} numberOfLines={2}>
            {info.label}
          </Text>
          <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
            {info.time ? (
              <Row style={{ gap: 3 }}>
                <Icon name="clock" size={11} color={colors.textFaint} />
                <Text style={font.small}>{info.time}</Text>
              </Row>
            ) : null}
            {isDone && task.completedAt ? <Text style={font.small}>Xong {formatTime(task.completedAt)}</Text> : null}
            {task.pendingSync ? <PendingBadge /> : null}
            {isPending && timingCfg ? <Badge label={timingCfg.label} color={timingCfg.color} bg={timingCfg.bg} /> : null}
            {!isDone && !isPending ? <Badge label={status.label} color={status.color} bg={status.bg} /> : null}
            {isVetOrder ? <Badge label="Y lệnh" color={colors.red} bg={colors.redSoft} /> : null}
            {task.incidentReport ? <Icon name="warning" size={13} color={colors.orange} /> : null}
            {isPending && task.acknowledgedAt ? <Icon name="thumb" size={13} color={colors.green} /> : null}
          </Row>
        </View>

      </Pressable>

      {canComplete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Hoàn thành ${info.label}`}
          onPress={onComplete}
          style={({ pressed }) => [styles.quickDone, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <Icon name="check" size={18} color={colors.white} />
        </Pressable>
      ) : (
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      )}
    </Row>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  summary: { padding: spacing.md },
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 13, marginTop: 4 },
  task: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: spacing.md, gap: spacing.sm },
  taskMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  quickDone: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A vet's order is not a chore: it gets a red edge so it reads differently in a long list.
  taskVet: { borderLeftWidth: 3, borderLeftColor: colors.red, paddingLeft: spacing.md, marginLeft: -spacing.sm },
  taskDone: { opacity: 0.75 },
  taskIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: colors.textMuted, textDecorationLine: 'line-through' },
  note: { gap: 6, backgroundColor: colors.forestSoft, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'flex-start' },
  noteVet: { backgroundColor: colors.redSoft },
  reason: { ...font.small, color: colors.orange },
  incidentBox: { backgroundColor: colors.redSoft, borderRadius: radius.sm, padding: spacing.md, marginTop: 4 },
  incidentThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.graySoft },
});
