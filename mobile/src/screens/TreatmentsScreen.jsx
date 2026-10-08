import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import NotDoneModal from '../components/NotDoneModal';
import DoseDetailSheet from '../components/DoseDetailSheet';
import StockCard from '../components/StockCard';
import { Badge, Button, Card, ChipRow, EmptyState, HorseAvatar, Loading, PendingBadge, Row, SectionTitle } from '../components/ui';
import { useOutbox } from '../offline/OutboxContext';
import { hapticSuccess, hapticWarning } from '../utils/haptics';
import { useInventory, useRefreshAll, useStableOverview, useTasks, useTreatments } from '../hooks/useGroomData';
import { TIMING_STATE, findStock, formatDate, formatTime, isSameDay, refId } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const FILTERS = [
  { value: 'mine', label: 'Ngựa của tôi' },
  { value: 'all', label: 'Tất cả' },
  { value: 'locked', label: 'Đang khóa tập' },
];

/** The note the server writes for a medication task: "Tên thuốc — Liều — Tần suất". */
const noteFor = (medication) => [medication.name, medication.dosage, medication.frequency].filter(Boolean).join(' — ');

export default function TreatmentsScreen({ navigation }) {
  const [filter, setFilter] = useState('mine');
  const [openDose, setOpenDose] = useState(null);
  const [notDone, setNotDone] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { treatments, isLoading } = useTreatments();
  const { tasks } = useTasks();
  const { items: inventory } = useInventory();
  const { myHorseIds } = useStableOverview();
  const refreshAll = useRefreshAll();
  const queryClient = useQueryClient();

  const { submit: send } = useOutbox();
  const complete = useMutation({
    mutationFn: (task) =>
      send(
        'complete',
        { taskId: task._id, payload: { performedAt: new Date().toISOString() } },
        { taskId: task._id, label: 'Cho dùng thuốc', horseName: task.horse?.name }
      ),
    onSuccess: (res) => {
      hapticSuccess();
      if (!res.queued) queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => {
      hapticWarning();
      Alert.alert('Chưa ghi nhận được', err?.message || 'Thử lại sau.');
    },
  });

  // Today's care tasks, indexed by the treatment and note they were created from.
  const todayCareTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.treatment && isSameDay(t.scheduledDate, new Date()) && ['medication', 'monitoring'].includes(t.taskType)
      ),
    [tasks]
  );

  const taskFor = (treatmentId, note, taskType) =>
    todayCareTasks.find((t) => refId(t.treatment) === treatmentId && t.taskType === taskType && t.note === note);

  const visible = treatments
    .filter((t) => t.status === 'ongoing')
    .filter((t) => (filter === 'mine' ? myHorseIds.has(refId(t.horse)) : true))
    .filter((t) => (filter === 'locked' ? t.isTrainingLocked : true));

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const pendingDoses = todayCareTasks.filter((t) => t.status === 'pending').length;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader
        title="Thuốc & y lệnh"
        subtitle={pendingDoses ? `Còn ${pendingDoses} liều/việc theo dõi hôm nay` : 'Đã làm hết y lệnh hôm nay'}
      />

      <View style={styles.toolbar}>
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} size="sm" />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {isLoading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="treatment"
              text="Không có toa thuốc nào đang áp dụng"
              hint="Bác sĩ thú y kê toa; mỗi loại thuốc sẽ thành một việc cho uống trong ngày."
            />
          </Card>
        ) : (
          visible.map((treatment) => {
            const medications = treatment.medications || [];
            return (
              <Card key={treatment._id} style={styles.card}>
                <Row style={{ gap: spacing.md }}>
                  <HorseAvatar name={treatment.horse?.name} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={font.h2}>{treatment.horse?.name}</Text>
                    <Text style={font.small}>
                      BS {treatment.prescribedBy?.name || '—'} · từ {formatDate(treatment.startDate)}
                      {treatment.endDate ? ` đến ${formatDate(treatment.endDate)}` : ''}
                    </Text>
                  </View>
                  {treatment.isTrainingLocked ? (
                    <Badge label="Khóa tập" color={colors.red} bg={colors.redSoft} />
                  ) : null}
                </Row>

                <SectionTitle style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>Thuốc theo toa</SectionTitle>
                {medications.length === 0 ? (
                  <Text style={font.small}>Toa này không kê thuốc, chỉ có hướng dẫn chăm sóc.</Text>
                ) : (
                  medications.map((medication, index) => {
                    const task = taskFor(treatment._id, noteFor(medication), 'medication');
                    return (
                      <DoseRow
                        key={`${medication.name}-${index}`}
                        title={medication.name}
                        dosage={medication.dosage}
                        frequency={medication.frequency}
                        task={task}
                        onOpen={() =>
                          setOpenDose({
                            title: medication.name,
                            dosage: medication.dosage,
                            frequency: medication.frequency,
                            task,
                            treatment,
                            inventory,
                          })
                        }
                        onComplete={() => complete.mutate(task)}
                        completing={complete.isPending && complete.variables === task?._id}
                      />
                    );
                  })
                )}

                {treatment.careInstructions ? (
                  <>
                    <SectionTitle style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>Hướng dẫn chăm sóc</SectionTitle>
                    <DoseRow
                      title={treatment.careInstructions}
                      icon="monitoring"
                      task={taskFor(treatment._id, treatment.careInstructions, 'monitoring')}
                      onOpen={() =>
                        setOpenDose({
                          title: treatment.careInstructions,
                          task: taskFor(treatment._id, treatment.careInstructions, 'monitoring'),
                          treatment,
                          inventory,
                          isCare: true,
                        })
                      }
                      onComplete={() => {
                        const task = taskFor(treatment._id, treatment.careInstructions, 'monitoring');
                        if (task) complete.mutate(task);
                      }}
                    />
                  </>
                ) : null}

                {treatment.notes ? <Text style={styles.notes}>{treatment.notes}</Text> : null}
              </Card>
            );
          })
        )}

        {/* The whole medicine store, after the doses: the day's work comes first. */}
        <StockCard
          title="Thuốc còn trong kho"
          category="medicine"
          items={inventory}
          onOpenSupplies={() => navigation.navigate('Vật tư')}
          emptyText="Kho chưa có mặt hàng thuốc nào. Quản lý CLB là người tạo danh mục."
        />
      </ScrollView>

      <DoseDetailSheet
        dose={openDose}
        visible={!!openDose}
        onClose={() => setOpenDose(null)}
        onAskSupply={() => {
          setOpenDose(null);
          navigation.navigate('Vật tư');
        }}
        onComplete={() => {
          const task = openDose?.task;
          setOpenDose(null);
          if (task) complete.mutate(task);
        }}
        onNotDone={() => {
          const task = openDose?.task;
          setOpenDose(null);
          setNotDone(task);
        }}
      />

      <NotDoneModal task={notDone} visible={!!notDone} onClose={() => setNotDone(null)} />
    </SafeAreaView>
  );
}

/** One line of the prescription. The dose, the stock and the record live in the detail sheet. */
function DoseRow({ title, dosage, frequency, task, onOpen, onComplete, completing, icon = 'medication' }) {
  const done = task?.status === 'completed';
  const skipped = task?.status === 'skipped';
  const timing = task?.timing || {};
  const timingCfg = TIMING_STATE[timing.state];
  const canComplete = task && task.status === 'pending' && timing.canComplete !== false;

  return (
    <Row style={[styles.dose, done && styles.doseDone]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onOpen}
        style={({ pressed }) => [styles.doseMain, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.doseIcon, { backgroundColor: done ? colors.greenSoft : colors.redSoft }]}>
          <Icon name={done ? 'check' : icon} size={16} color={done ? colors.green : colors.red} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[font.h3, done && styles.doneText]} numberOfLines={3}>
            {title}
          </Text>
          {dosage || frequency ? (
            <Text style={font.small}>{[dosage ? `Liều ${dosage}` : null, frequency].filter(Boolean).join(' · ')}</Text>
          ) : null}
          <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
            {done && task?.completedAt ? (
              <Text style={[font.small, { color: colors.green }]}>Đã cho dùng {formatTime(task.completedAt)}</Text>
            ) : null}
            {task?.pendingSync ? <PendingBadge /> : null}
            {skipped ? <Text style={[font.small, { color: colors.orange }]}>Không thực hiện</Text> : null}
            {!done && !skipped && timingCfg && task ? (
              <Badge label={timingCfg.label} color={timingCfg.color} bg={timingCfg.bg} />
            ) : null}
            {!task ? <Text style={font.small}>Hôm nay chưa có việc</Text> : null}
          </Row>
        </View>
      </Pressable>

      {canComplete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Đã cho dùng ${title}`}
          onPress={onComplete}
          style={({ pressed }) => [styles.quickDone, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          {completing ? <Icon name="refresh" size={17} color={colors.white} /> : <Icon name="check" size={18} color={colors.white} />}
        </Pressable>
      ) : (
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      )}
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  toolbar: { padding: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: { gap: spacing.xs },
  dose: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  doseMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  quickDone: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doseDone: { backgroundColor: colors.forestSoft, borderColor: colors.greenSoft },
  doseIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: colors.textMuted, textDecorationLine: 'line-through' },
  notes: { ...font.small, marginTop: spacing.sm },
  askSupply: { ...font.small, color: colors.forestLight, fontWeight: '700', marginTop: 4 },
});
