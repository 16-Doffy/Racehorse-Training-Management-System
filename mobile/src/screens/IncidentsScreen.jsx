import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import DragSheet from '../components/DragSheet';
import { Badge, Button, Card, ChipRow, EmptyState, HorseAvatar, IconButton, Loading, Row } from '../components/ui';
import IncidentModal from '../components/IncidentModal';
import { useIncidents, useRefreshAll, useStableOverview, useTasks } from '../hooks/useGroomData';
import { API_ORIGIN } from '../api/client';
import {
  INCIDENT_STATUS,
  SEVERITY,
  TASK_CONFIG,
  describeTask,
  formatDate,
  formatDateTime,
  isToday,
  parseStableBlock,
  refId,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

// Mirrors the ?status= values the incidents endpoint accepts.
const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'open', label: 'Chờ bác sĩ' },
  { value: 'acknowledged', label: 'Đang xử lý' },
  { value: 'resolved', label: 'Đã xử lý' },
];

export default function IncidentsScreen() {
  const [filter, setFilter] = useState('all');
  const [picking, setPicking] = useState(false);
  const [reporting, setReporting] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { tasks } = useTasks();
  const { incidents, isLoading } = useIncidents(filter === 'all' ? undefined : filter);
  const { assignmentByHorseId } = useStableOverview();
  const refreshAll = useRefreshAll();

  const visible = useMemo(
    () => [...incidents].sort((a, b) => new Date(b.incidentReport?.reportedAt || 0) - new Date(a.incidentReport?.reportedAt || 0)),
    [incidents]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={font.small}>Ngựa bỏ ăn, đau bụng/sốt, móng bị xước… Chụp ảnh thực tế; bác sĩ thú y nhận thông báo ngay.</Text>
        <Button title="Báo cáo sự cố mới" icon="warning" variant="danger" onPress={() => setPicking(true)} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} />

        {isLoading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="note"
              text={filter === 'all' ? 'Bạn chưa gửi báo cáo sự cố nào' : 'Không có báo cáo nào ở trạng thái này'}
            />
          </Card>
        ) : (
          visible.map((task) => {
            const report = task.incidentReport;
            const severity = SEVERITY[report.severity] || SEVERITY.medium;
            const state = INCIDENT_STATUS[report.status] || INCIDENT_STATUS.open;
            const cfg = TASK_CONFIG[task.taskType] || { label: task.taskType, icon: 'note' };
            const isResolved = report.status === 'resolved';
            return (
              <Card key={task._id} style={{ borderLeftWidth: 4, borderLeftColor: severity.color, gap: spacing.sm }}>
                <Row style={{ gap: spacing.md }}>
                  <HorseAvatar name={task.horse?.name} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{task.horse?.name}</Text>
                    <Text style={font.small}>
                      {assignmentByHorseId.get(refId(task.horse))?.stableBlock || 'Chưa xếp chuồng'} • {cfg.label} •{' '}
                      {formatDate(task.scheduledDate)}
                    </Text>
                  </View>
                  <Badge label={severity.label} color={severity.color} bg={severity.bg} />
                </Row>

                <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
                  <Badge label={state.label} color={state.color} bg={state.bg} />
                  {report.reportedAt ? <Text style={font.small}>Gửi lúc {formatDateTime(report.reportedAt)}</Text> : null}
                </Row>

                <Text style={font.body}>{report.description}</Text>

                {report.images?.length > 0 && (
                  <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
                    {report.images.map((src) => (
                      <Image key={src} source={{ uri: `${API_ORIGIN}${src}` }} style={styles.thumb} />
                    ))}
                  </Row>
                )}

                {/* What the vet did with it — the half of the loop the groom could not see before. */}
                {report.response || report.handledBy || report.healthRecord ? (
                  <View style={styles.vetBox}>
                    <Text style={font.tiny}>Bác sĩ thú y</Text>
                    {report.response ? <Text style={font.body}>{report.response}</Text> : null}
                    {report.healthRecord?.diagnosis ? (
                      <Text style={font.small}>Chẩn đoán: {report.healthRecord.diagnosis}</Text>
                    ) : null}
                    <Text style={font.small}>
                      {report.handledBy?.name ? `${report.handledBy.name}` : 'Đã tiếp nhận'}
                      {report.resolvedAt ? ` • ${formatDateTime(report.resolvedAt)}` : ''}
                    </Text>
                  </View>
                ) : null}

                {!isResolved ? (
                  <Button title="Cập nhật báo cáo" variant="ghost" size="sm" onPress={() => setReporting(task)} />
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>

      <TaskPicker
        visible={picking}
        tasks={tasks}
        onClose={() => setPicking(false)}
        onPick={(task) => {
          setPicking(false);
          setReporting(task);
        }}
      />
      <IncidentModal task={reporting} visible={!!reporting} onClose={() => setReporting(null)} />
    </SafeAreaView>
  );
}

/**
 * The API stores an incident on a daily task, so a new report starts by choosing which task it
 * belongs to. Tasks are grouped under their horse, today's first, instead of one long list of
 * near-identical rows.
 */
function TaskPicker({ visible, tasks, onClose, onPick }) {
  const groups = useMemo(() => {
    const sorted = [...tasks]
      .sort((x, y) => (isToday(x.scheduledDate) ? 0 : 1) - (isToday(y.scheduledDate) ? 0 : 1) || new Date(y.scheduledDate) - new Date(x.scheduledDate))
      .slice(0, 30);
    const byHorse = new Map();
    sorted.forEach((task) => {
      const id = refId(task.horse);
      if (!byHorse.has(id)) byHorse.set(id, { horse: task.horse, tasks: [] });
      byHorse.get(id).tasks.push(task);
    });
    return [...byHorse.values()];
  }, [tasks]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <DragSheet onClose={onClose} style={styles.sheet}>
          <Row style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={font.h2}>Sự cố của ngựa nào?</Text>
              <Text style={font.small}>Chọn công việc liên quan đến sự cố.</Text>
            </View>
            <IconButton icon="close" label="Đóng" onPress={onClose} />
          </Row>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
            {groups.length === 0 ? (
              <EmptyState icon="empty" text="Bạn chưa có công việc nào" hint="Sự cố cần gắn với một công việc được giao." />
            ) : (
              groups.map((group) => (
                <Card key={refId(group.horse)} style={styles.pickGroup}>
                  <Row style={{ gap: spacing.md, paddingBottom: spacing.xs }}>
                    <HorseAvatar name={group.horse?.name} size={36} />
                    <Text style={font.h3}>{group.horse?.name}</Text>
                  </Row>
                  {group.tasks.map((task) => {
                    const info = describeTask(task);
                    return (
                      <Pressable key={task._id} style={({ pressed }) => [styles.pickTask, pressed && { opacity: 0.7 }]} onPress={() => onPick(task)}>
                        <Icon name={info.icon} size={18} color={info.color} />
                        <View style={{ flex: 1 }}>
                          <Text style={font.body} numberOfLines={2}>
                            {info.label}
                          </Text>
                          <Text style={font.small}>{isToday(task.scheduledDate) ? 'Hôm nay' : formatDate(task.scheduledDate)}</Text>
                        </View>
                        {task.incidentReport ? <Badge label="Đã có báo cáo" color={colors.red} bg={colors.redSoft} /> : null}
                        <Icon name="chevronRight" size={16} color={colors.textFaint} />
                      </Pressable>
                    );
                  })}
                </Card>
              ))
            )}
          </ScrollView>
        </DragSheet>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.graySoft },
  vetBox: { backgroundColor: colors.blueSoft, borderRadius: radius.sm, padding: spacing.md, gap: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%' },
  sheetHeader: {
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  pickGroup: { padding: spacing.md, gap: spacing.xs },
  pickTask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
});
