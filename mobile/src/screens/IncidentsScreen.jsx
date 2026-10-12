import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import { Badge, Button, Card, ChipRow, EmptyState, HorseAvatar, Loading, Row } from '../components/ui';
import IncidentModal from '../components/IncidentModal';
import { useIncidents, useRefreshAll, useStableOverview, useTasks } from '../hooks/useGroomData';
import { API_ORIGIN } from '../api/client';
import {
  INCIDENT_CATEGORY,
  INCIDENT_STATUS,
  SEVERITY,
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
  const { incidents, isLoading, isError, refetch } = useIncidents(filter === 'all' ? undefined : filter);
  const { assignmentByHorseId, myAssignments } = useStableOverview();
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
        <Text style={font.h1}>Báo cáo Sự cố</Text>
        <Text style={font.small}>Ngựa bỏ ăn, đau bụng/sốt, móng bị xước... kèm ảnh thực tế. Bác sĩ thú y nhận thông báo ngay.</Text>
        <Button title="Báo cáo sự cố mới" icon="warning" variant="danger" onPress={() => setPicking(true)} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} />

        {isLoading ? (
          <Loading />
        ) : isError ? (
          <Card>
            <EmptyState
              icon="warning"
              text="Không tải được danh sách sự cố"
              hint="Kiểm tra kết nối mạng rồi thử lại."
              action={<Button title="Thử lại" icon="refresh" variant="ghost" size="sm" onPress={() => refetch()} />}
            />
          </Card>
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
            const cfg = describeTask(task);
            const kind = INCIDENT_CATEGORY[report.category];
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
                  {kind ? <Badge label={kind.label} /> : null}
                  {report.occurredAt ? <Text style={font.small}>Xảy ra {formatDateTime(report.occurredAt)}</Text> : null}
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
        myAssignments={myAssignments}
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
 * A new report starts with the horse — what the groom is looking at — and then the piece of work
 * it happened during, today's first. The API stores an incident on one of the groom's daily tasks,
 * so a horse with no task of theirs can't be reported from here.
 */
function TaskPicker({ visible, tasks, myAssignments = [], onClose, onPick }) {
  const insets = useSafeAreaInsets();
  const [horseId, setHorseId] = useState(null);

  // The groom's horses (their stalls first), plus any horse they have work for.
  const horses = useMemo(() => {
    const byId = new Map();
    myAssignments.forEach((a) => byId.set(refId(a.horse), { id: refId(a.horse), name: a.horse?.name, stall: a.stableBlock, count: 0 }));
    tasks.forEach((t) => {
      const id = refId(t.horse);
      const entry = byId.get(id) || { id, name: t.horse?.name, stall: null, count: 0 };
      entry.count += 1;
      byId.set(id, entry);
    });
    return [...byId.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  }, [myAssignments, tasks]);

  const candidates = useMemo(
    () =>
      tasks
        .filter((t) => refId(t.horse) === horseId)
        .sort((a, b) => {
          const aToday = isToday(a.scheduledDate) ? 0 : 1;
          const bToday = isToday(b.scheduledDate) ? 0 : 1;
          return aToday - bToday || new Date(b.scheduledDate) - new Date(a.scheduledDate);
        })
        .slice(0, 20),
    [tasks, horseId]
  );
  const horse = horses.find((h) => h.id === horseId);

  const close = () => {
    setHorseId(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <Row style={styles.sheetHeader}>
            <Row style={{ gap: spacing.sm, flex: 1 }}>
              {horse ? (
                <Pressable onPress={() => setHorseId(null)} hitSlop={10} accessibilityLabel="Chọn ngựa khác">
                  <Icon name="chevronLeft" size={20} color={colors.forest} />
                </Pressable>
              ) : null}
              <Text style={font.h2} numberOfLines={1}>
                {horse ? `${horse.name} · chọn công việc` : 'Sự cố với ngựa nào?'}
              </Text>
            </Row>
            <Pressable onPress={close} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </Row>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
            {!horse ? (
              horses.length === 0 ? (
                <EmptyState icon="stall" text="Bạn chưa phụ trách ngựa nào" hint="Quản lý CLB là người xếp chuồng." />
              ) : (
                horses.map((h) => (
                  <Card key={h.id} style={styles.pickRow} onPress={() => setHorseId(h.id)}>
                    <Row style={{ gap: spacing.md }}>
                      <HorseAvatar name={h.name} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={font.h3}>{h.name}</Text>
                        <Text style={font.small}>
                          {h.stall ? parseStableBlock(h.stall).stall : 'Chưa xếp chuồng'} · {h.count} công việc
                        </Text>
                      </View>
                      <Icon name="chevronRight" size={16} color={colors.textFaint} />
                    </Row>
                  </Card>
                ))
              )
            ) : candidates.length === 0 ? (
              <EmptyState
                icon="empty"
                text="Bạn chưa có công việc nào với ngựa này"
                hint="Sự cố được gắn với một công việc bạn được giao — hãy báo trực tiếp HLV/bác sĩ."
              />
            ) : (
              candidates.map((task) => {
                const cfg = describeTask(task);
                return (
                  <Card key={task._id} style={styles.pickRow} onPress={() => { setHorseId(null); onPick(task); }}>
                    <Row style={{ gap: spacing.md }}>
                      <Icon name={cfg.icon} size={18} color={cfg.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={font.h3} numberOfLines={1}>{cfg.label}</Text>
                        <Text style={font.small}>
                          {isToday(task.scheduledDate) ? 'Hôm nay' : formatDate(task.scheduledDate)}
                          {cfg.time ? ` · ${cfg.time}` : ''}
                        </Text>
                      </View>
                      {task.incidentReport ? <Badge label="Đã có báo cáo" color={colors.red} bg={colors.redSoft} /> : null}
                    </Row>
                  </Card>
                );
              })
            )}
          </ScrollView>
        </View>
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
  close: { fontSize: 18, color: colors.textMuted, paddingHorizontal: spacing.sm },
  pickRow: { padding: spacing.md },
});
