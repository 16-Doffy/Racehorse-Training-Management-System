import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Icon from './Icon';
import { Badge, Button, Card, DataRow, HorseAvatar, Row, Sheet } from './ui';
import { API_ORIGIN } from '../api/client';
import {
  SEVERITY,
  TASK_SOURCE,
  TASK_STATUS,
  TIMING_STATE,
  describeTask,
  formatDate,
  formatDateTime,
  formatTime,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const APPETITE_LABELS = { full: 'Ăn hết', partial: 'Ăn dở', refused: 'Bỏ ăn' };
const MANURE_LABELS = { normal: 'Bình thường', dry: 'Khô', loose: 'Lỏng', none: 'Không thấy' };
const WATER_LABELS = { normal: 'Bình thường', high: 'Uống nhiều', low: 'Uống ít' };

/**
 * Everything about one task, opened from a compact list row: who asked for it, when it may be
 * done, what was observed, and every action — so the list itself can stay short.
 */
export default function TaskDetailSheet({ task, schedules = [], visible, onClose, onComplete, onNotDone, onReport, onAcknowledge, acknowledging }) {
  if (!task) return <Sheet visible={visible} onClose={onClose} title="Chi tiết công việc" />;

  const info = describeTask(task, schedules);
  const status = TASK_STATUS[task.status] || TASK_STATUS.pending;
  const timing = task.timing || {};
  const timingCfg = TIMING_STATE[timing.state];
  const source = TASK_SOURCE[task.source];
  const isPending = task.status === 'pending';
  const canComplete = isPending && timing.canComplete !== false;
  const observation = task.observation || {};
  const hasObservation = observation.appetite || observation.manure || observation.waterIntake || observation.behaviourNote;

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
              <Badge label={status.label} color={status.color} bg={status.bg} />
              {isPending && timingCfg ? <Badge label={timingCfg.label} color={timingCfg.color} bg={timingCfg.bg} /> : null}
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
          {task.acknowledgedAt ? <DataRow label="Đã nhận việc" value={formatDateTime(task.acknowledgedAt)} /> : null}
          {task.completedAt ? <DataRow label="Hoàn thành" value={formatDateTime(task.completedAt)} /> : null}
          {task.skipReason ? <DataRow label="Không thực hiện" value={task.skipReason} valueStyle={{ color: colors.orange }} /> : null}
          {timing.closesAt && isPending ? <DataRow label="Hạn ghi nhận" value={formatTime(timing.closesAt)} /> : null}
        </Card>

        {hasObservation ? (
          <Card>
            <Text style={[font.tiny, { marginBottom: spacing.sm }]}>Ghi nhận khi làm</Text>
            {observation.appetite ? <DataRow label="Ăn uống" value={APPETITE_LABELS[observation.appetite]} /> : null}
            {observation.manure ? <DataRow label="Phân" value={MANURE_LABELS[observation.manure]} /> : null}
            {observation.waterIntake ? <DataRow label="Uống nước" value={WATER_LABELS[observation.waterIntake]} /> : null}
            {observation.behaviourNote ? <DataRow label="Ghi chú" value={observation.behaviourNote} /> : null}
          </Card>
        ) : null}

        {task.incidentReport ? <IncidentCard report={task.incidentReport} /> : null}
      </ScrollView>

      <View style={styles.actions}>
        {isPending && !task.acknowledgedAt && timing.state !== 'missed' ? (
          <Button title="Đã nhận việc" icon="thumb" variant="subtle" loading={acknowledging} onPress={onAcknowledge} />
        ) : null}
        <Row style={{ gap: spacing.sm }}>
          {canComplete ? <Button title="Hoàn thành" icon="check" style={{ flex: 2 }} onPress={onComplete} /> : null}
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
        {report.reportedAt ? <Text style={font.small}>{formatDateTime(report.reportedAt)}</Text> : null}
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
  vetReply: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.white },
});
