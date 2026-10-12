import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import CompleteTaskModal from '../components/CompleteTaskModal';
import NotDoneModal from '../components/NotDoneModal';
import DoseDetailSheet from '../components/DoseDetailSheet';
import StockCard from '../components/StockCard';
import RestockSheet from '../components/RestockSheet';
import HistorySheet from '../components/HistorySheet';
import YesterdayRecap from '../components/YesterdayRecap';
import {
  Badge,
  Card,
  ChipRow,
  EmptyState,
  HorseAvatar,
  IconButton,
  LoadError,
  Loading,
  Row,
  SectionTitle,
} from '../components/ui';
import { useInventory, useRefreshAll, useStableOverview, useTasks, useTreatments } from '../hooks/useGroomData';
import {
  CARE_TYPES,
  canCompleteTask,
  describeTask,
  doseSlots,
  formatDate,
  formatTime,
  isSameDay,
  missingSupplies,
  refId,
  restockRequestFor,
  taskState,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const FILTERS = [
  { value: 'mine', label: 'Ngựa của tôi' },
  { value: 'all', label: 'Tất cả' },
  { value: 'locked', label: 'Đang khóa tập' },
];

/**
 * The vet's orders for the day. A prescription is the vet's (read here, never changed); each time
 * of day a medicine is given is its own dose with its own record, so giving the 08:00 dose leaves
 * the 16:00 one open. A dose is recorded through a confirmation of horse, medicine, dose and time.
 */
export default function TreatmentsScreen({ navigation, segments }) {
  const [filter, setFilter] = useState('mine');
  const [openDose, setOpenDose] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [notDone, setNotDone] = useState(null);
  const [notDoneReason, setNotDoneReason] = useState('');
  const [restock, setRestock] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { treatments, isLoading, isError, refetch } = useTreatments();
  const { tasks, isError: tasksFailed, refetch: refetchTasks } = useTasks();
  const { items: inventory } = useInventory();
  const { myHorseIds } = useStableOverview();
  const refreshAll = useRefreshAll();
  const ctx = useMemo(() => ({ inventory }), [inventory]);

  // Today's care tasks: the doses and the watching the vet ordered.
  const todayCareTasks = useMemo(
    () => tasks.filter((t) => t.treatment && isSameDay(t.scheduledDate, new Date()) && CARE_TYPES.includes(t.taskType)),
    [tasks]
  );

  // Doses already given or missed, for the handover and for the vet's questions.
  const doseHistory = useMemo(
    () => tasks.filter((t) => CARE_TYPES.includes(t.taskType) && (filter === 'all' || myHorseIds.has(refId(t.horse)))),
    [tasks, filter, myHorseIds]
  );

  const visible = treatments
    .filter((t) => t.status === 'ongoing')
    .filter((t) => (filter === 'mine' ? myHorseIds.has(refId(t.horse)) : true))
    .filter((t) => (filter === 'locked' ? t.isTrainingLocked : true));

  const careTaskFor = (treatment) =>
    todayCareTasks.find(
      (t) => refId(t.treatment) === treatment._id && t.taskType === 'monitoring' && t.note === treatment.careInstructions
    );

  // Every care task of today shown under its prescription; any the lists above could not place
  // (an order changed since the task was made) still appears, so no dose goes unseen.
  const placed = new Set(
    visible.flatMap((treatment) => [
      ...(treatment.medications || []).flatMap((m) =>
        doseSlots(treatment, m, todayCareTasks).map((slot) => slot.task?._id).filter(Boolean)
      ),
      careTaskFor(treatment)?._id,
    ])
  );
  const unplaced = todayCareTasks.filter(
    (t) => !placed.has(t._id) && (filter !== 'mine' || myHorseIds.has(refId(t.horse)))
  );

  const pendingDoses = todayCareTasks.filter((t) => taskState(t, ctx)?.open).length;

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const reportNotDone = (task, reason = '') => {
    setNotDoneReason(reason);
    setNotDone(task);
  };

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
        <YesterdayRecap tasks={doseHistory} noun="liều/việc" onPress={() => setHistoryOpen(true)} />

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
        ) : isError || tasksFailed ? (
          <LoadError
            text={isError ? 'Không tải được toa thuốc' : 'Không tải được danh sách liều thuốc'}
            onRetry={() => {
              refetch();
              refetchTasks();
            }}
          />
        ) : visible.length === 0 && unplaced.length === 0 ? (
          <Card>
            <EmptyState
              icon="treatment"
              text="Không có toa thuốc nào đang áp dụng"
              hint="Bác sĩ thú y kê toa; mỗi giờ dùng thuốc sẽ thành một liều cần cho dùng trong ngày."
            />
          </Card>
        ) : (
          visible.map((treatment) => {
            const medications = treatment.medications || [];
            const mine = myHorseIds.has(refId(treatment.horse));
            const careTask = careTaskFor(treatment);
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
                    const slots = doseSlots(treatment, medication, todayCareTasks, { mine });
                    const open = (time) => setOpenDose({ medication, treatment, slots, focus: time, inventory, ctx });
                    return (
                      <MedicationBlock
                        key={`${medication.name}-${index}`}
                        medication={medication}
                        slots={slots}
                        ctx={ctx}
                        onOpen={open}
                        onComplete={setCompleting}
                      />
                    );
                  })
                )}

                {treatment.careInstructions ? (
                  <>
                    <SectionTitle style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>Hướng dẫn chăm sóc</SectionTitle>
                    <CareRow
                      title={treatment.careInstructions}
                      task={careTask}
                      mine={mine}
                      ctx={ctx}
                      onOpen={() => setOpenDose({ isCare: true, title: treatment.careInstructions, task: careTask, treatment, inventory, ctx })}
                      onComplete={setCompleting}
                    />
                  </>
                ) : null}

                {treatment.notes ? <Text style={styles.notes}>{treatment.notes}</Text> : null}
              </Card>
            );
          })
        )}

        {unplaced.length > 0 ? (
          <Card style={styles.card}>
            <SectionTitle style={{ marginBottom: spacing.sm }}>Y lệnh khác hôm nay</SectionTitle>
            <Text style={[font.small, { marginBottom: spacing.sm }]}>
              Việc từ y lệnh không còn khớp với toa hiện tại — mở để xem; nếu bị từ chối, bác sĩ đã đổi y lệnh.
            </Text>
            {unplaced.map((task) => (
              <CareRow
                key={task._id}
                title={`${task.horse?.name || 'Ngựa'} · ${describeTask(task).label}`}
                subtitle={task.note}
                task={task}
                mine
                ctx={ctx}
                onOpen={() => setOpenDose({ isCare: task.taskType !== 'medication', title: task.note, task, inventory, ctx })}
                onComplete={setCompleting}
              />
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <DoseDetailSheet
        dose={openDose}
        visible={!!openDose}
        onClose={() => setOpenDose(null)}
        onAskSupply={(entry, task) => {
          setOpenDose(null);
          setRestock(restockRequestFor({ entry, missing: missingSupplies(task), task, inventory }));
        }}
        onComplete={(task) => {
          setOpenDose(null);
          setCompleting(task);
        }}
        onNotDone={(task, reason) => {
          setOpenDose(null);
          reportNotDone(task, reason);
        }}
      />

      <CompleteTaskModal
        task={completing}
        visible={!!completing}
        onClose={() => setCompleting(null)}
        onShortage={(missing, task) => setRestock(restockRequestFor({ missing, task, inventory }))}
      />

      <NotDoneModal task={notDone} visible={!!notDone} initialReason={notDoneReason} onClose={() => setNotDone(null)} />

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

/**
 * One medicine of the prescription: its name and dose, then one line per time of day it is given
 * today. Each line is its own dose; the round button opens the confirmation for that dose only.
 */
function MedicationBlock({ medication, slots, ctx, onOpen, onComplete }) {
  const states = slots.map((slot) => taskState(slot.task, ctx));
  const allDone = slots.length > 0 && slots.every((slot) => slot.task?.status === 'completed');

  return (
    <View style={[styles.dose, allDone && styles.doseDone]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Chi tiết ${medication.name}`}
        onPress={() => onOpen(null)}
        style={({ pressed }) => [styles.doseMain, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.doseIcon, { backgroundColor: allDone ? colors.greenSoft : colors.redSoft }]}>
          <Icon name={allDone ? 'check' : 'medication'} size={16} color={allDone ? colors.green : colors.red} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[font.h3, allDone && styles.doneText]} numberOfLines={2}>
            {medication.name}
          </Text>
          <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
            {medication.dosage ? <Text style={font.small}>Liều {medication.dosage}</Text> : null}
            {medication.frequency ? <Text style={font.small}>· {medication.frequency}</Text> : null}
          </Row>
          {medication.instructions ? (
            <Text style={[font.small, { color: colors.forestLight }]} numberOfLines={2}>
              Dặn dò: {medication.instructions}
            </Text>
          ) : null}
        </View>
        <Icon name="chevronRight" size={16} color={colors.textFaint} />
      </Pressable>

      {slots.map((slot, index) => (
        <DoseSlotRow
          key={slot.time || `once-${index}`}
          slot={slot}
          state={states[index]}
          ctx={ctx}
          onOpen={() => onOpen(slot.time)}
          onComplete={() => onComplete(slot.task)}
        />
      ))}
    </View>
  );
}

/** One dose at one time: how it stands, and the button that opens its confirmation. */
function DoseSlotRow({ slot, state, ctx, onOpen, onComplete }) {
  const { task } = slot;
  const canComplete = canCompleteTask(task, ctx);
  const done = task?.status === 'completed';

  return (
    <Row style={styles.slot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Liều ${slot.time || 'trong ngày'}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.slotMain, pressed && { opacity: 0.7 }]}
      >
        <Badge label={slot.time || 'Trong ngày'} color={colors.forest} bg={colors.forestSoft} />
        <View style={{ flex: 1, gap: 2 }}>
          {done && task.completedAt ? (
            <Text style={[font.small, { color: colors.green }]}>Đã cho dùng {formatTime(task.completedAt)}</Text>
          ) : state ? (
            <Badge label={state.label} color={state.color} bg={state.bg} style={{ alignSelf: 'flex-start' }} />
          ) : null}
          {!task ? <Text style={font.small}>{slot.reason}</Text> : null}
          {task && state?.key === 'blocked' ? (
            <Text style={[font.small, { color: colors.red }]} numberOfLines={2}>
              {state.reason}
            </Text>
          ) : null}
          {task?.status === 'skipped' && task.skipReason ? (
            <Text style={[font.small, { color: colors.orange }]} numberOfLines={2}>
              {task.skipReason}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {canComplete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Cho dùng liều ${slot.time || 'trong ngày'}`}
          onPress={onComplete}
          style={({ pressed }) => [styles.quickDone, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <Icon name="check" size={18} color={colors.white} />
        </Pressable>
      ) : null}
    </Row>
  );
}

/** The vet's care instructions (watch the swelling, box rest): one task a day. */
function CareRow({ title, subtitle, task, mine, ctx, onOpen, onComplete }) {
  const state = taskState(task, ctx);
  const done = task?.status === 'completed';
  const canComplete = canCompleteTask(task, ctx);

  return (
    <Row style={[styles.dose, done && styles.doseDone]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onOpen}
        style={({ pressed }) => [styles.doseMain, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.doseIcon, { backgroundColor: done ? colors.greenSoft : colors.purpleSoft }]}>
          <Icon name={done ? 'check' : 'monitoring'} size={16} color={done ? colors.green : colors.purple} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[font.h3, done && styles.doneText]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={font.small} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
          <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
            {done && task?.completedAt ? (
              <Text style={[font.small, { color: colors.green }]}>Đã làm {formatTime(task.completedAt)}</Text>
            ) : state ? (
              <Badge label={state.label} color={state.color} bg={state.bg} />
            ) : (
              <Text style={font.small}>{mine ? 'Hôm nay chưa có việc' : 'Không phải ngựa bạn phụ trách'}</Text>
            )}
          </Row>
        </View>
      </Pressable>
      {canComplete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Đã làm: ${title}`}
          onPress={() => onComplete(task)}
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
  slot: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  slotMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
});
