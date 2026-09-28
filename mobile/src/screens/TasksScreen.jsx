import { useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Banner, Button, Card, ChipGroup, EmptyState, HorseAvatar, Loading, Row, StatTile } from '../components/ui';
import CompleteTaskModal from '../components/CompleteTaskModal';
import IncidentModal from '../components/IncidentModal';
import { useFeedings, useRefreshAll, useStableOverview, useTasks } from '../hooks/useGroomData';
import { API_ORIGIN } from '../api/client';
import {
  HEALTH_STATUS,
  SEVERITY,
  TASK_STATUS,
  addDays,
  describeTask,
  formatDayLabel,
  formatTime,
  isSameDay,
  isToday,
  parseStableBlock,
  refId,
  startOfDay,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chưa xong' },
  { value: 'completed', label: 'Xong' },
];

export default function TasksScreen() {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [filter, setFilter] = useState('all');
  const [completing, setCompleting] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { tasks, isLoading } = useTasks();
  const { feedings } = useFeedings();
  const { assignmentByHorseId, horseById } = useStableOverview();
  const refreshAll = useRefreshAll();

  const dayTasks = useMemo(() => tasks.filter((t) => isSameDay(t.scheduledDate, day)), [tasks, day]);
  const overdue = useMemo(
    () => tasks.filter((t) => t.status === 'pending' && new Date(t.scheduledDate) < startOfDay(new Date())),
    [tasks]
  );
  const done = dayTasks.filter((t) => t.status === 'completed');
  const pending = dayTasks.filter((t) => t.status === 'pending');

  const visible = dayTasks.filter((t) => filter === 'all' || t.status === filter);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const schedulesFor = (horseId) => feedings.filter((f) => refId(f.horse) === horseId);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.dayBar}>
        <Pressable onPress={() => setDay((d) => addDays(d, -1))} style={styles.dayNav} hitSlop={8}>
          <Text style={styles.dayNavText}>‹</Text>
        </Pressable>
        <Pressable onPress={() => setDay(startOfDay(new Date()))} style={{ flex: 1 }}>
          <Text style={styles.dayLabel}>{formatDayLabel(day)}</Text>
          {!isToday(day) ? <Text style={styles.dayHint}>Chạm để về hôm nay</Text> : null}
        </Pressable>
        <Pressable onPress={() => setDay((d) => addDays(d, 1))} style={styles.dayNav} hitSlop={8}>
          <Text style={styles.dayNavText}>›</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <Row style={{ gap: spacing.md }}>
          <StatTile label="Tổng việc" value={dayTasks.length} />
          <StatTile label="Đã xong" value={done.length} tint={colors.green} />
          <StatTile label="Còn lại" value={pending.length} tint={colors.gold} />
        </Row>

        {overdue.length > 0 && isToday(day) && (
          <Banner tone="warning">
            <Text style={font.body}>⚠️ {overdue.length} việc quá hạn chưa hoàn thành.</Text>
            <Button
              title="Xem ngày cũ nhất"
              variant="subtle"
              size="sm"
              style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}
              onPress={() => setDay(startOfDay(overdue[overdue.length - 1].scheduledDate))}
            />
          </Banner>
        )}

        <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />

        {isLoading ? (
          <Loading />
        ) : groups.length === 0 ? (
          <Card>
            <EmptyState
              emoji={dayTasks.length ? '🔍' : '📭'}
              text={dayTasks.length ? 'Không có việc nào khớp bộ lọc' : `Không có việc nào ${isToday(day) ? 'hôm nay' : 'vào ngày này'}`}
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
                    <Text style={font.h3}>{items[0].horse?.name || 'Không rõ ngựa'}</Text>
                    <Text style={font.small}>
                      {assignment ? parseStableBlock(assignment.stableBlock).stall : 'Chưa xếp chuồng'}
                    </Text>
                  </View>
                  {health ? <Badge label={health.label} color={health.color} bg={health.bg} /> : null}
                  <Text style={styles.groupCount}>
                    {doneCount}/{items.length}
                  </Text>
                </Row>

                {items.map((task) => (
                  <TaskRow
                    key={task._id}
                    task={task}
                    schedules={schedulesFor(horseId)}
                    onComplete={() => setCompleting(task)}
                    onReport={() => setReporting(task)}
                  />
                ))}
              </Card>
            );
          })
        )}
      </ScrollView>

      <CompleteTaskModal
        task={completing}
        schedules={completing ? schedulesFor(refId(completing.horse)) : []}
        visible={!!completing}
        onClose={() => setCompleting(null)}
      />
      <IncidentModal task={reporting} visible={!!reporting} onClose={() => setReporting(null)} />
    </SafeAreaView>
  );
}

function TaskRow({ task, schedules, onComplete, onReport }) {
  const info = describeTask(task, schedules);
  const status = TASK_STATUS[task.status] || TASK_STATUS.pending;
  const isDone = task.status === 'completed';
  const isSkipped = task.status === 'skipped';

  return (
    <View style={styles.taskRow}>
      <Row style={{ gap: spacing.md, alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 22 }}>{isDone ? '✅' : info.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.taskLabel, isDone && styles.taskLabelDone]}>{info.label}</Text>
          <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
            {info.time ? <Text style={font.small}>🕐 {info.time}</Text> : null}
            {isDone && task.completedAt ? <Text style={font.small}>Xong lúc {formatTime(task.completedAt)}</Text> : null}
            {!isDone ? <Badge label={status.label} color={status.color} bg={status.bg} /> : null}
            {task.trainingSession ? <Badge label="Sau buổi tập" color={colors.blue} bg={colors.blueSoft} /> : null}
          </Row>
          {task.note ? <Text style={styles.trainerNote}>📋 HLV dặn: {task.note}</Text> : null}
          {task.incidentReport ? <IncidentBox report={task.incidentReport} /> : null}
        </View>
      </Row>

      <Row style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        {task.status === 'pending' && (
          <Button title="Hoàn thành" icon="✓" size="sm" style={{ flex: 1 }} onPress={onComplete} />
        )}
        {isSkipped ? <Badge label="HLV cho bỏ qua" color={colors.orange} bg={colors.orangeSoft} /> : null}
        <Button
          title={task.incidentReport ? 'Báo lại' : 'Sự cố'}
          icon="⚠️"
          variant="ghost"
          size="sm"
          style={{ flex: task.status === 'pending' ? 1 : 2 }}
          onPress={onReport}
        />
      </Row>
    </View>
  );
}

function IncidentBox({ report }) {
  const severity = SEVERITY[report.severity] || SEVERITY.medium;
  return (
    <View style={styles.incidentBox}>
      <Row style={{ gap: spacing.sm }}>
        <Badge label={severity.label} color={severity.color} bg={severity.bg} />
        <Text style={font.small}>{report.reportedAt ? formatTime(report.reportedAt) : ''}</Text>
      </Row>
      <Text style={[font.body, { marginTop: 4 }]}>{report.description}</Text>
      {report.images?.length > 0 && (
        <Row style={{ gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' }}>
          {report.images.map((src) => (
            <Image key={src} source={{ uri: `${API_ORIGIN}${src}` }} style={styles.incidentThumb} />
          ))}
        </Row>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  dayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.forest,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  dayNav: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  dayNavText: { color: colors.white, fontSize: 22, lineHeight: 24 },
  dayLabel: { color: colors.white, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  dayHint: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'center' },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  groupCount: { ...font.h3, color: colors.forest },
  taskRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: spacing.md },
  taskLabel: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  taskLabelDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  trainerNote: { ...font.small, color: colors.forestLight, marginTop: spacing.sm },
  incidentBox: { backgroundColor: colors.redSoft, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.sm },
  incidentThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.graySoft },
});
