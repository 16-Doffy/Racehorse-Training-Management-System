import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import Icon from '../components/Icon';
import CompleteTaskModal from '../components/CompleteTaskModal';
import NotDoneModal from '../components/NotDoneModal';
import DoseDetailSheet from '../components/DoseDetailSheet';
import RestockSheet from '../components/RestockSheet';
import HistorySheet from '../components/HistorySheet';
import YesterdayRecap from '../components/YesterdayRecap';
import { Badge, Button, ChipRow, EmptyState, HorseAvatar, IconButton, LoadError, Loading, Row, Sheet } from '../components/ui';
import { CareFrame, DoneMark, EXPIRY_TONE, FilterTabs, MetaChip, MoreMark, Notice, StallTag, SummaryCard, TimeLead, UseFirstCard, WorkGroup, WorkRow, rowAction } from '../components/CareKit';
import { useInventory, useRefreshAll, useStableOverview, useTasks, useTreatments } from '../hooks/useGroomData';
import {
  CARE_TYPES,
  MEDICATION_ROUTE,
  doseSlots,
  expiryDaysText,
  expiryOf,
  formatDate,
  formatTime,
  isSameDay,
  missingSupplies,
  needsAction,
  primaryAction,
  refId,
  restockRequestFor,
  stallCodeOf,
  stateRank,
  taskState,
  useFirstItems,
  weekdayShort,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

// The prescriptions of the horses I look after: all of them, or those whose training is locked.
const FILTERS = [
  { value: 'mine', label: 'Tất cả toa' },
  { value: 'locked', label: 'Đang khóa tập' },
];

// A dose has its hour; a watch order ("chườm lạnh sáng và chiều") is for the whole day, and the time
// on its task is only when the order came in — so it shows no clock and sorts after the doses.
const timeOf = (task) => task?.dueTime || (task?.taskType === 'monitoring' ? null : task?.scheduledDate ? formatTime(task.scheduledDate) : null);
const clockKey = (entry) => entry.time || '99:99';

/**
 * The vet's orders for the day, as the groom carries them out. The summary counts the day's doses and
 * says when the next one is; the tabs are "Làm ngay" (now, late, missed or blocked), "Sắp tới" (not time
 * yet) and "Đã xong". Each part is grouped by horse — the groom gives one horse its medicines, then the
 * next — and each line is the hour, the medicine as the vet wrote it and the one button it needs
 * ("Cho dùng", "Quên ghi", "Xin kho"). The prescriptions behind them open from the header, read-only. A
 * dose is given through a confirmation of horse, medicine, dose, route and time.
 */
export default function TreatmentsScreen({ navigation, segments }) {
  const [part, setPart] = useState(null);
  const [filter, setFilter] = useState('mine');
  const [ordersOpen, setOrdersOpen] = useState(false);
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
  const { myHorseIds, assignmentByHorseId } = useStableOverview();
  const refreshAll = useRefreshAll();
  const ctx = useMemo(() => ({ inventory }), [inventory]);

  // Today's doses and watch orders — the groom's own worklist, whoever the horse belongs to.
  const careTasks = useMemo(() => tasks.filter((t) => CARE_TYPES.includes(t.taskType) && isSameDay(t.scheduledDate, new Date())), [tasks]);
  const doseHistory = useMemo(() => tasks.filter((t) => CARE_TYPES.includes(t.taskType)), [tasks]);
  const ongoing = useMemo(() => treatments.filter((t) => t.status === 'ongoing'), [treatments]);
  // The prescriptions a groom reads: those of the horses they look after.
  const myOrders = useMemo(() => ongoing.filter((t) => myHorseIds.has(refId(t.horse))), [ongoing, myHorseIds]);

  // Which prescription line each of today's tasks carries out, so its row can name the medicine,
  // the dose and the route, and its detail can show the order in full.
  const lineOf = useMemo(() => {
    const map = new Map();
    for (const treatment of ongoing) {
      const mine = myHorseIds.has(refId(treatment.horse));
      for (const medication of treatment.medications || []) {
        const slots = doseSlots(treatment, medication, careTasks, { mine });
        slots.forEach((slot) => slot.task && map.set(slot.task._id, { treatment, medication, slots }));
      }
      const care = careTasks.find((t) => refId(t.treatment) === treatment._id && t.taskType === 'monitoring' && t.note === treatment.careInstructions);
      if (care) map.set(care._id, { treatment, isCare: true });
    }
    return map;
  }, [ongoing, careTasks, myHorseIds]);

  const entries = careTasks.map((task) => {
    const line = lineOf.get(task._id) || { treatment: ongoing.find((t) => t._id === refId(task.treatment)), isCare: task.taskType !== 'medication' };
    return { task, time: timeOf(task), state: taskState(task, ctx), ...line };
  });
  const partOf = (e) => (!needsAction(e.task, ctx) ? 'done' : e.state?.key === 'upcoming' ? 'later' : 'now');
  const counts = { now: 0, later: 0, done: 0 };
  entries.forEach((e) => {
    counts[partOf(e)] += 1;
  });
  // The part to open with: what can be done now, else what comes next.
  const shown = part || (counts.now ? 'now' : counts.later ? 'later' : 'done');
  const urgent = entries.some((e) => ['missed', 'late', 'blocked'].includes(e.state?.key));
  // The next dose whose time has not come yet.
  const next = entries.filter((e) => e.time && partOf(e) === 'later').sort((a, b) => clockKey(a).localeCompare(clockKey(b)))[0];

  // The chosen part, one group per horse, the horse with the earliest dose first.
  const groups = [];
  entries
    .filter((e) => partOf(e) === shown)
    .sort((a, b) => clockKey(a).localeCompare(clockKey(b)) || stateRank(a.state) - stateRank(b.state))
    .forEach((e) => {
      const key = refId(e.task.horse);
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, horse: e.task.horse, items: [] }));
      g.items.push(e);
    });

  // Medicine to use first: what the prescriptions take whose next lot expires soon, and what waits unused.
  const prescribed = new Set(myOrders.flatMap((t) => (t.medications || []).map((m) => String(refId(m.inventoryItem) || ''))).filter(Boolean));
  const useFirst = useFirstItems(inventory, 'medicine', prescribed).slice(0, 5);

  const visibleOrders = myOrders.filter((t) => (filter === 'locked' ? t.isTrainingLocked : true));

  const reportNotDone = (task, reason = '') => {
    setNotDoneReason(reason);
    setNotDone(task);
  };
  const openEntry = (e) =>
    e.medication
      ? setOpenDose({ medication: e.medication, treatment: e.treatment, slots: e.slots, focus: e.task.dueTime || null, inventory, ctx })
      : setOpenDose({ isCare: e.isCare, title: e.task.note, task: e.task, treatment: e.treatment, inventory, ctx });
  const act = (e) => {
    const action = primaryAction(e.task, ctx);
    if (!action) return openEntry(e);
    if (action.key === 'complete') return setCompleting({ task: e.task, medication: e.medication });
    if (action.key === 'late') return setCompleting({ task: e.task, medication: e.medication, late: true });
    if (action.key === 'restock') return setRestock(restockRequestFor({ missing: missingSupplies(e.task), task: e.task, inventory }));
    return reportNotDone(e.task, action.reason);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const failed = isError || tasksFailed;
  const retry = () => {
    refetch();
    refetchTasks();
  };
  const left = counts.now + counts.later;

  const summary = (
    <SummaryCard
      done={counts.done}
      total={entries.length || null}
      label={entries.length ? 'liều thuốc / y lệnh đã làm' : 'Hôm nay không có liều thuốc nào'}
      note={entries.length ? (left ? `Còn ${left}: ${counts.now} làm ngay · ${counts.later} sắp tới` : 'Đã làm hết y lệnh hôm nay') : `${myOrders.length} toa thuốc đang áp dụng`}
      alert={urgent}
      right={
        urgent ? (
          <MetaChip icon="warning" text="Có liều trễ" tone={colors.red} bg={colors.redSoft} />
        ) : next ? (
          <MetaChip icon="clock" text={`Tiếp theo ${next.time}`} />
        ) : null
      }
      progress={entries.length ? (counts.done / entries.length) * 100 : null}
    />
  );

  const filters = (
    <FilterTabs
      value={shown}
      onChange={setPart}
      options={[
        { value: 'now', label: 'Làm ngay', sub: `${counts.now} liều/việc`, alert: urgent },
        { value: 'later', label: 'Sắp tới', sub: next ? `${counts.later} · từ ${next.time}` : `${counts.later} liều/việc` },
        { value: 'done', label: 'Đã xong', sub: `${counts.done} liều/việc` },
      ]}
    />
  );

  const overlays = (
    <>
      {/* The prescriptions behind the doses: read here, written by the vet. */}
      <Sheet visible={ordersOpen} onClose={() => setOrdersOpen(false)} title={`Toa thuốc đang áp dụng (${myOrders.length})`}>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <ChipRow options={FILTERS} value={filter} onChange={setFilter} size="sm" />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xs, gap: spacing.md }}>
          {visibleOrders.length === 0 ? (
            <EmptyState icon="treatment" text={filter === 'locked' ? 'Không có ngựa nào đang khóa tập' : 'Ngựa của bạn không có toa thuốc nào'} />
          ) : (
            visibleOrders.map((treatment) => (
              <OrderCard
                key={treatment._id}
                treatment={treatment}
                tasks={careTasks}
                mine
                ctx={ctx}
                onOpenMedication={(medication, slots) => {
                  setOrdersOpen(false);
                  setOpenDose({ medication, treatment, slots, focus: null, inventory, ctx });
                }}
              />
            ))
          )}
          <Button
            title="Xem thuốc trong kho"
            icon="supplies"
            variant="ghost"
            size="sm"
            onPress={() => {
              setOrdersOpen(false);
              navigation.navigate('Kho');
            }}
          />
        </ScrollView>
      </Sheet>

      <DoseDetailSheet
        dose={openDose}
        visible={!!openDose}
        onClose={() => setOpenDose(null)}
        onAskSupply={(entry, task) => {
          setOpenDose(null);
          setRestock(restockRequestFor({ entry, missing: missingSupplies(task), task, inventory }));
        }}
        onComplete={(task) => {
          const medication = openDose?.medication;
          setOpenDose(null);
          setCompleting({ task, medication });
        }}
        onRecordLate={(task) => {
          const medication = openDose?.medication;
          setOpenDose(null);
          setCompleting({ task, medication, late: true });
        }}
        onNotDone={(task, reason) => {
          setOpenDose(null);
          reportNotDone(task, reason);
        }}
      />

      {/* `completing` = { task, medication?, late? }: the medicine line gives the route to confirm. */}
      <CompleteTaskModal
        task={completing?.task}
        medication={completing?.medication}
        late={!!completing?.late}
        visible={!!completing}
        onClose={() => setCompleting(null)}
        onShortage={(missing, task) => setRestock(restockRequestFor({ missing, task, inventory }))}
      />
      <NotDoneModal task={notDone} visible={!!notDone} initialReason={notDoneReason} onClose={() => setNotDone(null)} />
      <RestockSheet request={restock} visible={!!restock} onClose={() => setRestock(null)} />
      <HistorySheet visible={historyOpen} onClose={() => setHistoryOpen(false)} title="Lịch sử cho thuốc" tasks={doseHistory} emptyText="Chưa có liều nào được ghi nhận trong khoảng này" />
    </>
  );

  return (
    <CareFrame
      subtitle={`Hôm nay · ${weekdayShort(new Date())} ${formatDate(new Date()).slice(0, 5)}`}
      right={
        <>
          <IconButton icon="treatment" label={`Toa thuốc đang áp dụng (${myOrders.length})`} onPress={() => setOrdersOpen(true)} />
          <IconButton icon="history" label="Lịch sử cho thuốc" onPress={() => setHistoryOpen(true)} />
        </>
      }
      segments={segments}
      summary={summary}
      filters={filters}
      refreshing={refreshing}
      onRefresh={onRefresh}
      overlays={overlays}
    >
      {isLoading ? (
        <Loading />
      ) : failed ? (
        <LoadError text={isError ? 'Không tải được toa thuốc' : 'Không tải được danh sách liều thuốc'} onRetry={retry} />
      ) : entries.length === 0 ? (
        <WorkGroup>
          <EmptyState icon="treatment" text="Hôm nay không có liều thuốc nào" hint="Bác sĩ kê toa; mỗi giờ dùng thuốc thành một liều cần cho dùng trong ngày." />
        </WorkGroup>
      ) : groups.length === 0 ? (
        shown === 'now' && !left ? (
          <Notice tone="success" icon="checkCircle" title="Đã cho dùng hết thuốc" text="hôm nay." />
        ) : (
          <WorkGroup>
            <EmptyState icon={shown === 'done' ? 'empty' : 'checkCircle'} text={shown === 'now' ? 'Chưa có liều nào cần làm ngay' : shown === 'later' ? 'Không còn liều nào sắp tới' : 'Chưa ghi nhận liều nào hôm nay'} />
          </WorkGroup>
        )
      ) : (
        groups.map((g) => (
          <WorkGroup
            key={g.key}
            variant="horse"
            lead={<StallTag code={stallCodeOf(assignmentByHorseId.get(g.key))} name={g.horse?.name} />}
            title={g.horse?.name || 'Ngựa'}
            meta={`${g.items.length} liều/việc`}
          >
            {g.items.map((e) => (
              <DoseRow key={e.task._id} entry={e} ctx={ctx} onOpen={() => openEntry(e)} onAct={() => act(e)} />
            ))}
          </WorkGroup>
        ))
      )}

      <UseFirstCard entries={useFirst} kind="medicine" onOpenStore={() => navigation.navigate('Kho')} />

      {!isLoading && !failed ? <YesterdayRecap tasks={doseHistory} noun="liều/việc" onPress={() => setHistoryOpen(true)} /> : null}
    </CareFrame>
  );
}

/**
 * One dose (or watch order) of a horse: its hour as the lead, the medicine with its dose and route, and
 * its one button. The vet's instructions and everything else are in the detail, one tap away.
 */
function DoseRow({ entry, ctx, onOpen, onAct }) {
  const { task, medication, isCare, state, time } = entry;
  const action = primaryAction(task, ctx);
  const button = action
    ? { ...rowAction(action.key, { complete: isCare ? 'Đã làm' : 'Cho dùng' }), ...(action.reason ? { title: 'Báo' } : {}), onPress: onAct }
    : null;
  const finished = task.status === 'completed';
  const route = MEDICATION_ROUTE[medication?.route];
  const title = medication ? medication.name : isCare ? 'Theo dõi' : task.note || 'Y lệnh';
  const facts = medication ? [medication.dosage, route].filter(Boolean).join(' · ') : isCare ? task.note : null;
  const stockItem = medication?.inventoryItem ? (ctx.inventory || []).find((i) => String(i._id) === String(refId(medication.inventoryItem))) : null;
  const expiry = stockItem && !finished ? expiryOf(stockItem) : null;

  // One short line of where it stands, only when it is not simply "do it now".
  let status = null;
  let tone = state?.color || colors.textMuted;
  if (finished) {
    status = `${isCare ? 'Đã làm' : 'Đã cho dùng'} ${formatTime(task.completedAt)}${task.recordedLate ? ' (ghi muộn)' : ''}`;
    tone = colors.green;
  } else if (task.status === 'skipped') status = state?.key === 'cancelled' ? 'Đã hủy y lệnh' : `Không làm được: ${task.skipReason || '—'}`;
  else if (state?.key !== 'ready') status = state?.key === 'upcoming' ? state.label : state?.reason || state?.label;

  const lead = finished ? (
    <TimeLead time={time} icon="check" tone={colors.green} bg={colors.greenSoft} />
  ) : isCare ? (
    <TimeLead time={time} icon="monitoring" tone={colors.purple} bg={colors.purpleSoft} />
  ) : (
    <TimeLead time={time} icon="medication" tone={colors.red} bg={colors.redSoft} />
  );

  return (
    <WorkRow
      lead={lead}
      title={title}
      label={`${task.horse?.name || ''} ${title}`}
      tags={
        // The vet left instructions: they are in the detail.
        medication?.instructions && !finished ? <Icon name="info" size={14} color={colors.forestLight} /> : null
      }
      detail={facts}
      detailLines={isCare ? 2 : 1}
      body={
        expiry ? (
          <Text style={[styles.lot, { color: EXPIRY_TONE[expiry.tone].fg }]} numberOfLines={1}>
            Lấy lô {expiry.label}
            {expiry.tone !== 'ok' ? ` · ${expiryDaysText(expiry.days)}` : ''}
          </Text>
        ) : null
      }
      status={status}
      statusTone={tone}
      action={button}
      trailing={finished ? <DoneMark /> : <MoreMark />}
      done={finished}
      onPress={onOpen}
    />
  );
}

const SLOT_TONE = (state) => {
  if (!state) return { color: colors.textFaint, bg: colors.graySoft };
  if (state.key === 'completed') return { color: colors.green, bg: colors.greenSoft };
  return { color: state.color, bg: state.bg };
};

/** A prescription as the vet wrote it, one line per medicine with how each of today's doses stands. */
function OrderCard({ treatment, tasks, mine, ctx, onOpenMedication }) {
  const medications = treatment.medications || [];
  return (
    <View style={styles.order}>
      <Row style={styles.orderHead}>
        <HorseAvatar name={treatment.horse?.name} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.orderTitle} numberOfLines={1}>
            {treatment.horse?.name}
          </Text>
          <Text style={font.small} numberOfLines={1}>
            BS {treatment.prescribedBy?.name || '—'} · từ {formatDate(treatment.startDate)}
            {treatment.endDate ? ` đến ${formatDate(treatment.endDate)}` : ''}
          </Text>
        </View>
        {treatment.isTrainingLocked ? <Badge label="Khóa tập" color={colors.red} bg={colors.redSoft} /> : null}
      </Row>

      {medications.length === 0 ? <Text style={[font.small, styles.orderLine]}>Toa không kê thuốc, chỉ có hướng dẫn chăm sóc.</Text> : null}
      {medications.map((medication, index) => {
        const slots = doseSlots(treatment, medication, tasks, { mine });
        return (
          <Pressable
            key={`${medication.name}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Chi tiết ${medication.name}`}
            onPress={() => onOpenMedication(medication, slots)}
            style={({ pressed }) => [styles.orderLine, pressed && { opacity: 0.7 }]}
          >
            <Icon name="medication" size={16} color={colors.red} />
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <Text style={font.h3} numberOfLines={1}>
                {medication.name}
                <Text style={styles.facts}>
                  {medication.dosage ? ` · ${medication.dosage}` : ''}
                  {MEDICATION_ROUTE[medication.route] ? ` · ${MEDICATION_ROUTE[medication.route]}` : ''}
                </Text>
              </Text>
              <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                {slots.map((slot, i) => {
                  const tone = SLOT_TONE(slot.task ? taskState(slot.task, ctx) : null);
                  return <Badge key={slot.time || `once-${i}`} label={`${slot.time || 'Trong ngày'}${slot.task?.status === 'completed' ? ' ✓' : ''}`} color={tone.color} bg={tone.bg} />;
                })}
              </Row>
            </View>
            <Icon name="chevronRight" size={15} color={colors.textFaint} />
          </Pressable>
        );
      })}
      {treatment.careInstructions ? (
        <Row style={styles.orderLine}>
          <Icon name="monitoring" size={16} color={colors.purple} />
          <Text style={[font.small, { flex: 1, color: colors.text }]}>{treatment.careInstructions}</Text>
        </Row>
      ) : null}
      {treatment.notes ? <Text style={[font.small, styles.orderLine]}>{treatment.notes}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  order: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  orderHead: { gap: spacing.md, padding: spacing.md },
  // A one-word name longer than the line breaks inside the word rather than running under the badge.
  orderTitle: { flexShrink: 1, minWidth: 0, fontSize: 14.5, fontWeight: '800', color: colors.text, ...(Platform.OS === 'web' ? { wordBreak: 'break-word' } : null) },
  facts: { fontSize: 12.5, color: colors.text, fontWeight: '600' },
  lot: { fontSize: 11.5, fontWeight: '700' },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
});
