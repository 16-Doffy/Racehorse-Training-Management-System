import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import NotDoneModal from '../components/NotDoneModal';
import DoseDetailSheet from '../components/DoseDetailSheet';
import StockCard from '../components/StockCard';
import RestockSheet from '../components/RestockSheet';
import HistorySheet from '../components/HistorySheet';
import {
  Badge,
  Button,
  Card,
  ChipRow,
  EmptyState,
  HorseAvatar,
  IconButton,
  Loading,
  Row,
  SectionTitle,
} from '../components/ui';
import { taskApi } from '../api/endpoints';
import { useInventory, useRefreshAll, useStableOverview, useTasks, useTreatments } from '../hooks/useGroomData';
import {
  TIMING_STATE,
  canCompleteTask,
  findStock,
  formatDate,
  formatTime,
  isSameDay,
  missingSupplies,
  refId,
  restockRequestFor,
  shortageFromError,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const FILTERS = [
  { value: 'mine', label: 'Ngựa của tôi' },
  { value: 'all', label: 'Tất cả' },
  { value: 'locked', label: 'Đang khóa tập' },
];

/** The note the server writes for a medication task: "Tên thuốc — Liều — Tần suất". */
const noteFor = (medication) => [medication.name, medication.dosage, medication.frequency].filter(Boolean).join(' — ');

export default function TreatmentsScreen({ navigation, segments }) {
  const [filter, setFilter] = useState('mine');
  const [openDose, setOpenDose] = useState(null);
  const [notDone, setNotDone] = useState(null);
  const [restock, setRestock] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { treatments, isLoading } = useTreatments();
  const { tasks } = useTasks();
  const { items: inventory } = useInventory();
  const { myHorseIds } = useStableOverview();
  const refreshAll = useRefreshAll();
  const queryClient = useQueryClient();

  // The task itself is the variable, so a refusal can say which dose it was.
  const complete = useMutation({
    mutationFn: (task) => taskApi.complete(task._id, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err, task) => {
      const missing = shortageFromError(err);
      if (missing.length) {
        setRestock(restockRequestFor({ missing, task, inventory }));
        return;
      }
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

  // Doses already given or missed, for the handover and for the vet's questions.
  const doseHistory = useMemo(
    () =>
      tasks.filter(
        (t) => ['medication', 'monitoring'].includes(t.taskType) && (filter === 'all' || myHorseIds.has(refId(t.horse)))
      ),
    [tasks, filter, myHorseIds]
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
        right={<IconButton icon="history" label="Lịch sử cho thuốc" onPress={() => setHistoryOpen(true)} />}
      />

      {segments}

      <View style={styles.toolbar}>
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} size="sm" />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {/* The whole medicine store, not just what today's prescriptions call for. */}
        <StockCard
          title="Thuốc còn trong kho"
          category="medicine"
          items={inventory}
          onOpenSupplies={() => navigation.navigate('Kho')}
          emptyText="Kho chưa có mặt hàng thuốc nào. Quản lý CLB là người tạo danh mục."
        />

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
                        completing={complete.isPending && complete.variables?._id === task?._id}
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
      </ScrollView>

      <DoseDetailSheet
        dose={openDose}
        visible={!!openDose}
        onClose={() => setOpenDose(null)}
        onAskSupply={(entry) => {
          const task = openDose?.task;
          setOpenDose(null);
          setRestock(restockRequestFor({ entry, missing: missingSupplies(task), task, inventory }));
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

      <RestockSheet request={restock} visible={!!restock} onClose={() => setRestock(null)} />

      <HistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Lịch sử cho thuốc"
        tasks={doseHistory}
        emptyText="Chưa có liều nào được ghi nhận trong khoảng này"
      />
    </SafeAreaView>
  );
}

/** One line of the prescription. The dose, the stock and the record live in the detail sheet. */
function DoseRow({ title, dosage, frequency, task, onOpen, onComplete, completing, icon = 'medication' }) {
  const done = task?.status === 'completed';
  const skipped = task?.status === 'skipped';
  const timing = task?.timing || {};
  const timingCfg = TIMING_STATE[timing.state];
  const canComplete = canCompleteTask(task);
  const short = missingSupplies(task).length > 0;

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
          <Text style={[font.h3, done && styles.doneText]} numberOfLines={2}>
            {title}
          </Text>
          <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
            {task?.dueTime ? <Text style={[font.small, { fontWeight: '700', color: colors.forest }]}>{task.dueTime}</Text> : null}
            {dosage ? <Text style={font.small}>Liều {dosage}</Text> : null}
            {frequency ? <Text style={font.small}>· {frequency}</Text> : null}
          </Row>
          <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
            {done && task?.completedAt ? (
              <Text style={[font.small, { color: colors.green }]}>Đã cho dùng {formatTime(task.completedAt)}</Text>
            ) : null}
            {skipped ? <Text style={[font.small, { color: colors.orange }]}>Không thực hiện</Text> : null}
            {!done && !skipped && timingCfg && task ? (
              <Badge label={timingCfg.label} color={timingCfg.color} bg={timingCfg.bg} />
            ) : null}
            {short ? <Badge label="Thiếu thuốc trong kho" color={colors.red} bg={colors.redSoft} /> : null}
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
