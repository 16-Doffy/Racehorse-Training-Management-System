import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Badge, ChipRow, EmptyState, Row, Sheet } from './ui';
import {
  MEAL_CONFIG,
  TASK_CONFIG,
  TASK_STATUS,
  describeObservation,
  formatDayLabel,
  formatTime,
  startOfDay,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const RANGES = [
  { value: 7, label: '7 ngày' },
  { value: 30, label: '30 ngày' },
  { value: 0, label: 'Tất cả' },
];

/**
 * What was already recorded, newest first.
 *
 * Today's screens only show today, which answers "what do I still have to do" but not "did anyone
 * feed him yesterday, and how did he eat?" — the question a groom gets asked at handover, and the
 * one the vet asks after a colic. Grouped by day so a week reads at a glance.
 */
export default function HistorySheet({ visible, onClose, title, tasks = [], emptyText }) {
  const [days, setDays] = useState(7);

  const sections = useMemo(() => {
    const today = startOfDay(new Date());
    const from = days ? new Date(today.getTime() - (days - 1) * 86400000) : null;
    const records = tasks
      .filter((t) => t.status !== 'pending' || new Date(t.scheduledDate) < today)
      .filter((t) => !from || new Date(t.scheduledDate) >= from)
      .sort((a, b) => new Date(b.scheduledDate) - new Date(a.scheduledDate));

    const byDay = new Map();
    records.forEach((task) => {
      const key = startOfDay(task.scheduledDate).getTime();
      byDay.set(key, [...(byDay.get(key) || []), task]);
    });

    return [...byDay.entries()]
      .sort(([a], [b]) => b - a)
      .map(([key, data]) => ({
        key,
        title: formatDayLabel(new Date(key)),
        done: data.filter((t) => t.status === 'completed').length,
        data: data.sort((a, b) => (a.mealSlot || '').localeCompare(b.mealSlot || '')),
      }));
  }, [tasks, days]);

  const total = sections.reduce((sum, s) => sum + s.data.length, 0);
  const done = sections.reduce((sum, s) => sum + s.done, 0);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.tools}>
        <ChipRow options={RANGES} value={days} onChange={setDays} size="sm" />
        <Text style={font.small}>
          {total === 0 ? 'Chưa có ghi nhận nào' : `${done}/${total} lần đã ghi nhận`}
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(task) => task._id}
        style={styles.list}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
        stickySectionHeadersEnabled={false}
        initialNumToRender={10}
        renderSectionHeader={({ section }) => (
          <Row style={styles.dayHeader}>
            <Text style={[font.h3, { flex: 1 }]}>{section.title}</Text>
            <Badge
              label={`${section.done}/${section.data.length}`}
              color={section.done === section.data.length ? colors.green : colors.orange}
              bg={section.done === section.data.length ? colors.greenSoft : colors.orangeSoft}
            />
          </Row>
        )}
        renderItem={({ item: task }) => <HistoryRow task={task} />}
        ListEmptyComponent={<EmptyState icon="history" text={emptyText || 'Chưa có ghi nhận nào trong khoảng này'} />}
      />
    </Sheet>
  );
}

function HistoryRow({ task }) {
  const status = TASK_STATUS[task.status] || TASK_STATUS.pending;
  const meal = MEAL_CONFIG[task.mealSlot];
  const kind = meal?.label || TASK_CONFIG[task.taskType]?.label;
  const observation = describeObservation(task.observation);
  const missed = task.status === 'pending';

  return (
    <Row style={styles.row}>
      <View style={[styles.icon, { backgroundColor: missed ? colors.graySoft : status.bg }]}>
        <Icon
          name={task.status === 'completed' ? 'check' : missed ? 'clock' : 'block'}
          size={15}
          color={missed ? colors.textFaint : status.color}
        />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ gap: 6, flexWrap: 'wrap' }}>
          <Text style={font.h3}>{task.horse?.name || 'Ngựa'}</Text>
          {kind ? <Text style={font.small}>{kind}</Text> : null}
        </Row>
        {task.note ? <Text style={font.small} numberOfLines={1}>{task.note}</Text> : null}
        {observation ? <Text style={font.small}>{observation}</Text> : null}
        {task.notes ? <Text style={font.small}>“{task.notes}”</Text> : null}
        {task.skipReason ? <Text style={[font.small, { color: colors.orange }]}>{task.skipReason}</Text> : null}
      </View>

      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        {task.completedAt ? <Text style={styles.time}>{formatTime(task.completedAt)}</Text> : null}
        <Badge
          label={missed ? 'Bỏ lỡ' : status.label}
          color={missed ? colors.textMuted : status.color}
          bg={missed ? colors.graySoft : status.bg}
        />
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  tools: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  list: { maxHeight: 460 },
  dayHeader: { paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  row: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    marginBottom: 2,
  },
  icon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  time: { ...font.small, fontWeight: '700', color: colors.forest },
});
