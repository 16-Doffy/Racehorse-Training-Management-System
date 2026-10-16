import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Badge, Button, Card, DataRow, HorseAvatar, Row, Sheet } from './ui';
import SupplyShortage from './SupplyShortage';
import { API_ORIGIN } from '../api/client';
import {
  EATEN_OPTIONS,
  INCIDENT_CATEGORY,
  SEVERITY,
  canCompleteTask,
  describeSupplies,
  missingSupplies,
  TASK_SOURCE,
  describeTask,
  formatDate,
  formatDateTime,
  formatTime,
  taskState,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const APPETITE_LABELS = { full: 'Ăn hết', partial: 'Ăn dở', refused: 'Bỏ ăn' };
const MANURE_LABELS = { normal: 'Bình thường', dry: 'Khô', loose: 'Lỏng', none: 'Không thấy' };
const WATER_LABELS = { normal: 'Bình thường', high: 'Uống nhiều', low: 'Uống ít' };

/**
 * Everything about one task, opened from a compact list row: who asked for it, when it may be
 * done, what blocks it, what was observed, and every action — so the list itself can stay short.
 */
export default function TaskDetailSheet({ task, ctx, schedules = [], visible, onClose, onComplete, onNotDone, onReport, onAcknowledge, acknowledging, onAskSupply }) {
  if (!task) return <Sheet visible={visible} onClose={onClose} title="Chi tiết công việc" />;

  const info = describeTask(task, schedules);
  const state = taskState(task, ctx);
  const timing = task.timing || {};
  const source = TASK_SOURCE[task.source];
  const isPending = task.status === 'pending';
  const missing = missingSupplies(task);
  const canComplete = canCompleteTask(task, ctx);
  const issued = describeSupplies(task.supplies);
  const otherBlockers = (state?.blockers || []).filter((b) => b.code !== 'SHORT_OF_STOCK');
  const observation = task.observation || {};
  const eaten = EATEN_OPTIONS.find((o) => o.value === observation.amountEatenPercent);
  const hasObservation = observation.appetite || observation.manure || observation.waterIntake || observation.behaviourNote || eaten;

  return (
    <Sheet visible={visible} onClose={onClose} title="Chi tiết công việc">
      <ScrollView contentContainerStyle={styles.body}>
        <Row style={{ gap: spacing.md }}>
          <View style={[styles.icon, { backgroundColor: info.bg }]}>
            <Icon name={info.icon} size={22} color={info.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.h2}>{info.label}</Text>
            <Row style={{ gap: spacing.sm, flexWrap: 'wrap', marginTop: 4 }}>
              {state ? <Badge label={state.label} color={state.color} bg={state.bg} /> : null}
              {source && task.source !== 'system' ? <Badge label={source.label} color={source.color} bg={source.bg} /> : null}
            </Row>
          </View>
        </Row>

        {timing.reason && isPending ? (
          <Card style={[styles.note, { backgroundColor: colors.orangeSoft, borderColor: colors.orangeSoft }]}>
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="clock" size={15} color={colors.orange} />
              <Text style={[font.small, { flex: 1, color: colors.orange }]}>{timing.reason}</Text>
            </Row>
          </Card>
        ) : null}

        {/* No supplies, no meal: the groom asks the Manager instead of ticking it off. */}
        <SupplyShortage missing={missing} onAskSupply={onAskSupply} />

        {otherBlockers.map((b) => (
          <Card key={b.code} style={[styles.note, { backgroundColor: colors.redSoft, borderColor: colors.redSoft }]}>
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="block" size={15} color={colors.red} />
              <Text style={[font.small, { flex: 1, color: colors.red }]}>{b.message}</Text>
            </Row>
          </Card>
        ))}

        {task.dueTime ? (
          <Card style={styles.note}>
            <Row style={{ gap: spacing.sm }}>
              <Icon name="clock" size={15} color={colors.forestLight} />
              <Text style={[font.body, { flex: 1 }]}>
                {task.source === 'vet' ? 'Giờ theo y lệnh' : 'Giờ hẹn làm'}: {task.dueTime}
              </Text>
            </Row>
          </Card>
        ) : null}

        {task.note ? (
          <Card style={[styles.note, task.source === 'vet' && { backgroundColor: colors.redSoft, borderColor: colors.redSoft }]}>
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name={task.source === 'vet' ? 'vet' : 'note'} size={15} color={task.source === 'vet' ? colors.red : colors.forestLight} />
              <View style={{ flex: 1 }}>
                <Text style={font.tiny}>{task.source === 'vet' ? 'Bác sĩ dặn' : 'HLV dặn'}</Text>
                <Text style={font.body}>{task.note}</Text>
              </View>
            </Row>
          </Card>
        ) : null}

        <Card>
          <Row style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <HorseAvatar name={task.horse?.name} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={font.h3}>{task.horse?.name}</Text>
              <Text style={font.small}>Ngày {formatDate(task.scheduledDate)}</Text>
            </View>
          </Row>
          {info.time ? <DataRow label="Giờ thực hiện" value={info.time} /> : null}
          {issued ? <DataRow label={task.status === 'completed' ? 'Đã xuất kho' : 'Xuất kho khi xong'} value={issued} valueStyle={styles.wrapValue} /> : null}
          {task.acknowledgedAt ? <DataRow label="Đã nhận việc" value={formatDateTime(task.acknowledgedAt)} /> : null}
          {task.completedAt ? <DataRow label="Hoàn thành" value={formatDateTime(task.completedAt)} /> : null}
          {task.recordedLate ? <DataRow label="Gửi lên" value="Muộn hơn lúc làm" valueStyle={{ color: colors.orange }} /> : null}
          {task.status === 'skipped' ? (
            <DataRow
              label={state?.key === 'cancelled' ? 'HLV cho bỏ qua' : 'Không thực hiện'}
              value={task.skipReason || '—'}
              valueStyle={{ color: colors.orange, flex: 1, textAlign: 'right' }}
            />
          ) : null}
          {timing.closesAt && isPending ? <DataRow label="Hạn ghi nhận" value={formatTime(timing.closesAt)} /> : null}
        </Card>

        {hasObservation ? (
          <Card>
            <Text style={[font.tiny, { marginBottom: spacing.sm }]}>Ghi nhận khi làm</Text>
            {observation.appetite ? <DataRow label="Ăn uống" value={APPETITE_LABELS[observation.appetite]} /> : null}
            {eaten ? <DataRow label="Ăn được" value={eaten.label} /> : null}
            {observation.manure ? <DataRow label="Phân" value={MANURE_LABELS[observation.manure]} /> : null}
            {observation.waterIntake ? <DataRow label="Uống nước" value={WATER_LABELS[observation.waterIntake]} /> : null}
            {observation.behaviourNote ? <DataRow label="Ghi chú" value={observation.behaviourNote} /> : null}
          </Card>
        ) : null}

        {task.incidentReport ? <IncidentCard report={task.incidentReport} /> : null}
      </ScrollView>

      <View style={styles.actions}>
        {isPending && !task.acknowledgedAt && state?.key !== 'missed' ? (
          <Button title="Đã nhận việc" icon="thumb" variant="subtle" loading={acknowledging} onPress={onAcknowledge} />
        ) : null}
        <Row style={{ gap: spacing.sm }}>
          {canComplete ? <Button title="Hoàn thành" icon="check" style={{ flex: 2 }} onPress={onComplete} /> : null}
          {/* Still offered after the window closes: the server accepts it and the trainer is told. */}
          {isPending ? (
            <Button title="Không làm được" icon="block" variant="ghost" style={{ flex: 2 }} onPress={onNotDone} />
          ) : null}
          <Button
            title={task.incidentReport ? 'Báo lại' : 'Sự cố'}
            icon="warning"
            variant="ghost"
            style={{ flex: 1 }}
            onPress={onReport}
          />
        </Row>
      </View>
    </Sheet>
  );
}

function IncidentCard({ report }) {
  const severity = SEVERITY[report.severity] || SEVERITY.medium;
  return (
    <Card style={{ backgroundColor: colors.redSoft, borderColor: colors.redSoft }}>
      <Row style={{ gap: spacing.sm }}>
        <Icon name="warning" size={15} color={severity.color} />
        <Badge label={severity.label} color={severity.color} bg={colors.white} />
        {INCIDENT_CATEGORY[report.category] ? <Badge label={INCIDENT_CATEGORY[report.category].label} bg={colors.white} /> : null}
        {report.occurredAt || report.reportedAt ? (
          <Text style={font.small}>{formatDateTime(report.occurredAt || report.reportedAt)}</Text>
        ) : null}
      </Row>
      <Text style={[font.body, { marginTop: spacing.sm }]}>{report.description}</Text>
      {report.images?.length > 0 ? (
        <Row style={{ gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' }}>
          {report.images.map((src) => (
            <Image key={src} source={{ uri: `${API_ORIGIN}${src}` }} style={styles.thumb} />
          ))}
        </Row>
      ) : null}
      {report.response ? (
        <View style={styles.vetReply}>
          <Text style={font.tiny}>Bác sĩ trả lời</Text>
          <Text style={font.body}>{report.response}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  note: { padding: spacing.md, backgroundColor: colors.forestSoft, borderColor: colors.forestSoft },
  actions: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.white,
  },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.graySoft },
  wrapValue: { flex: 1, textAlign: 'right' },
  vetReply: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.white },
});
