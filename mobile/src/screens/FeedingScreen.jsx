import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import CompleteTaskModal from '../components/CompleteTaskModal';
import MealDetailSheet from '../components/MealDetailSheet';
import StockCard from '../components/StockCard';
import NotDoneModal from '../components/NotDoneModal';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  FilterBar,
  FilterSheet,
  HorseAvatar,
  Loading,
  PendingBadge,
  Row,
  SectionTitle,
} from '../components/ui';
import { useFeedings, useInventory, useRefreshAll, useStableOverview, useTasks } from '../hooks/useGroomData';
import {
  HEALTH_STATUS,
  MEAL_CONFIG,
  MEAL_ORDER,
  TIMING_STATE,
  buildFeedCoverage,
  findStock,
  formatDays,
  formatTime,
  getFeedTypeLabel,
  isSameDay,
  matchesSearch,
  mealSlotOf,
  mealTimeOf,
  nextMealSlot,
  parseStableBlock,
  refId,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const SCOPES = [
  { value: 'mine', label: 'Ngựa của tôi' },
  { value: 'all', label: 'Tất cả ngựa' },
];

const APPROVAL = [
  { value: 'all', label: 'Mọi khẩu phần' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'pending', label: 'Chờ duyệt' },
];

const LEVEL_TONE = {
  critical: { color: colors.red, bg: colors.redSoft, label: 'Sắp hết' },
  low: { color: colors.orange, bg: colors.orangeSoft, label: 'Còn ít' },
  ok: { color: colors.green, bg: colors.greenSoft, label: 'Đủ dùng' },
  unknown: { color: colors.textMuted, bg: colors.graySoft, label: 'Chưa có trong kho' },
};

/**
 * Feeding in one place: the approved ration for each meal, what the store has left of it, and the
 * button that records the meal as given — the feeding task itself lives here rather than mixed in
 * with stable chores.
 */
export default function FeedingScreen({ navigation }) {
  const [scope, setScope] = useState('mine');
  const [mealFilter, setMealFilter] = useState('all');
  const [approval, setApproval] = useState('all');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openMeal, setOpenMeal] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [notDone, setNotDone] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { feedings, isLoading } = useFeedings();
  const { items: inventory } = useInventory();
  const { tasks } = useTasks();
  const { horses, myHorseIds, assignmentByHorseId } = useStableOverview();
  const refreshAll = useRefreshAll();

  // Today's meals to record, indexed by horse and slot.
  const feedingTasks = useMemo(
    () => tasks.filter((t) => t.taskType === 'feeding' && isSameDay(t.scheduledDate, new Date())),
    [tasks]
  );
  const taskFor = (horseId, slot) =>
    feedingTasks.find((t) => refId(t.horse) === horseId && mealSlotOf(t) === slot);
  const pendingMeals = feedingTasks.filter((t) => t.status === 'pending').length;

  const rationsByHorse = useMemo(() => {
    const map = new Map();
    feedings.forEach((f) => {
      const id = refId(f.horse);
      map.set(id, [...(map.get(id) || []), f]);
    });
    return map;
  }, [feedings]);

  const scopedHorses = horses
    .filter((h) => scope === 'all' || myHorseIds.has(h._id))
    .filter((h) => matchesSearch(`${h.name} ${assignmentByHorseId.get(h._id)?.stableBlock || ''}`, search))
    .sort((a, b) =>
      (assignmentByHorseId.get(a._id)?.stableBlock || '~').localeCompare(
        assignmentByHorseId.get(b._id)?.stableBlock || '~',
        'vi',
        { numeric: true }
      )
    );

  const scopedSchedules = scopedHorses.flatMap((h) => rationsByHorse.get(h._id) || []);
  const approved = scopedSchedules.filter((f) => f.approvedBy).length;
  const scopeIds = scope === 'all' ? null : myHorseIds;

  // "How many days of feed do I have left" — the question a stable hand actually asks.
  const coverage = useMemo(
    () => buildFeedCoverage({ feedings, horseIds: scopeIds, inventory }),
    [feedings, scopeIds, inventory]
  );
  const shortages = coverage.filter((c) => c.level === 'critical' || c.level === 'low');

  const meal = useMemo(() => nextMealSlot(scopedSchedules), [scopedSchedules]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const mealFilters = [
    { value: 'all', label: 'Cả ngày' },
    ...MEAL_ORDER.map((slot) => ({ value: slot, label: MEAL_CONFIG[slot].label })),
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="Cho ăn"
        subtitle={pendingMeals ? `Còn ${pendingMeals} bữa chưa ghi nhận hôm nay` : 'Đã ghi nhận hết các bữa hôm nay'}
      />

      <View style={styles.toolbar}>
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Tìm theo tên ngựa, chuồng..."
          activeCount={(scope !== 'mine' ? 1 : 0) + (mealFilter !== 'all' ? 1 : 0) + (approval !== 'all' ? 1 : 0)}
          onOpenFilters={() => setFiltersOpen(true)}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {/* Next meal + the state of the feed store, side by side at the top. */}
        <Card style={styles.hero}>
          <Row style={{ gap: spacing.md }}>
            <View style={styles.heroIcon}>
              <Icon name={MEAL_CONFIG[meal.slot].icon} size={20} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>{meal.tomorrow ? 'Bữa đầu ngày mai' : 'Bữa tiếp theo'}</Text>
              <Text style={styles.heroTitle}>
                {MEAL_CONFIG[meal.slot].label} · {meal.time}
              </Text>
            </View>
          </Row>
        </Card>

        {shortages.length > 0 ? (
          <Banner tone={shortages.some((s) => s.level === 'critical') ? 'danger' : 'warning'}>
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="warning" size={18} color={shortages.some((s) => s.level === 'critical') ? colors.red : colors.orange} />
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: '700' }]}>Thức ăn sắp không đủ cho ngựa</Text>
                <Text style={font.small}>
                  {shortages
                    .map((s) => `${s.kind}: còn ${s.stock} ${s.unit}${s.comparable && s.daysLeft !== null ? ` (~${formatDays(s.daysLeft)})` : ''}`)
                    .join(' · ')}
                </Text>
                <Button
                  title="Xin bổ sung vật tư"
                  icon="plus"
                  variant="danger"
                  size="sm"
                  style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}
                  onPress={() => navigation.navigate('Vật tư')}
                />
              </View>
            </Row>
          </Banner>
        ) : null}

        <Text style={styles.summaryLine}>
          {scopedHorses.filter((h) => rationsByHorse.has(h._id)).length}/{scopedHorses.length} ngựa có khẩu phần ·{' '}
          {approved} đã duyệt · {scopedSchedules.length - approved} chờ duyệt
        </Text>

        {isLoading ? (
          <Loading />
        ) : scopedHorses.length === 0 ? (
          <Card>
            <EmptyState icon="stable" text="Không tìm thấy ngựa nào" hint="Thử xoá từ khoá hoặc chọn 'Tất cả ngựa'." />
          </Card>
        ) : (
          scopedHorses.map((horse) => (
            <HorseRations
              key={horse._id}
              horse={horse}
              stableBlock={assignmentByHorseId.get(horse._id)?.stableBlock}
              schedules={rationsByHorse.get(horse._id) || []}
              mealFilter={mealFilter}
              approval={approval}
              inventory={inventory}
              nextSlot={meal.slot}
              taskFor={taskFor}
              onOpenMeal={(payload) => setOpenMeal({ ...payload, inventory })}
              onComplete={setCompleting}
              onNotDone={setNotDone}
            />
          ))
        )}

        {/* The store as it stands, after the meals: a shortage is already called out by the banner above. */}
        <StockCard
          title="Thức ăn còn trong kho"
          category="feed"
          items={inventory}
          onOpenSupplies={() => navigation.navigate('Vật tư')}
          emptyText="Kho chưa có mặt hàng thức ăn nào. Quản lý CLB là người tạo danh mục."
        />
      </ScrollView>

      <MealDetailSheet
        meal={openMeal}
        visible={!!openMeal}
        onClose={() => setOpenMeal(null)}
        onAskSupply={() => {
          setOpenMeal(null);
          navigation.navigate('Vật tư');
        }}
        onComplete={() => {
          const task = openMeal?.task;
          setOpenMeal(null);
          setCompleting(task);
        }}
        onNotDone={() => {
          const task = openMeal?.task;
          setOpenMeal(null);
          setNotDone(task);
        }}
      />

      <CompleteTaskModal
        task={completing}
        schedules={completing ? feedings.filter((f) => refId(f.horse) === refId(completing.horse)) : []}
        visible={!!completing}
        onClose={() => setCompleting(null)}
      />
      <NotDoneModal task={notDone} visible={!!notDone} onClose={() => setNotDone(null)} />

      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setScope('mine');
          setMealFilter('all');
          setApproval('all');
        }}
        groups={[
          { title: 'Phạm vi', options: SCOPES, value: scope, onChange: setScope },
          { title: 'Bữa ăn', options: mealFilters, value: mealFilter, onChange: setMealFilter },
          { title: 'Duyệt', options: APPROVAL, value: approval, onChange: setApproval },
        ]}
      />
    </SafeAreaView>
  );
}

function HorseRations({ horse, stableBlock, schedules, mealFilter, approval, nextSlot, taskFor, onOpenMeal, onComplete, onNotDone }) {
  const health = HEALTH_STATUS[horse.healthStatus];
  const slots = mealFilter === 'all' ? MEAL_ORDER : [mealFilter];

  return (
    <Card style={{ gap: spacing.sm }}>
      <Row style={{ gap: spacing.md }}>
        <HorseAvatar name={horse.name} />
        <View style={{ flex: 1 }}>
          <Text style={font.h2}>{horse.name}</Text>
          <Row style={{ gap: 4 }}>
            <Icon name="stall" size={12} color={colors.textFaint} />
            <Text style={font.small}>
              {stableBlock ? parseStableBlock(stableBlock).stall : 'Chưa xếp chuồng'}
              {horse.weightKg ? ` · ${horse.weightKg} kg` : ''}
            </Text>
          </Row>
        </View>
        {health ? <Badge label={health.label} color={health.color} bg={health.bg} dot /> : null}
      </Row>

      {slots.map((slot) => {
        const meal = MEAL_CONFIG[slot];
        const forSlot = schedules
          .filter((s) => s.mealTime === slot)
          .filter((s) => approval === 'all' || (approval === 'approved' ? s.approvedBy : !s.approvedBy));
        const isNext = slot === nextSlot;
        const task = taskFor?.(horse._id, slot);
        const fed = task?.status === 'completed';
        const timing = task?.timing || {};
        const timingCfg = TIMING_STATE[timing.state];
        const canFeed = task?.status === 'pending' && timing.canComplete !== false;
        const approvedBy = forSlot.find((s) => s.approvedBy)?.approvedBy;

        return (
          <View key={slot} style={[styles.meal, isNext && styles.mealNext, fed && styles.mealDone]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ gap: 6, flex: 1 }}>
                <Icon name={fed ? 'checkCircle' : meal.icon} size={16} color={fed ? colors.green : isNext ? colors.gold : colors.forestLight} />
                <Text style={font.h3}>{meal.label}</Text>
              </Row>
              <Row style={{ gap: 6 }}>
                {task?.pendingSync ? <PendingBadge /> : null}
                {fed ? (
                  <Badge label={`Đã cho ăn ${formatTime(task.completedAt)}`} color={colors.green} bg={colors.greenSoft} />
                ) : task && timingCfg && task.status === 'pending' ? (
                  <Badge label={timingCfg.label} color={timingCfg.color} bg={timingCfg.bg} />
                ) : null}
                <Badge
                  label={mealTimeOf(slot, schedules) || meal.defaultTime}
                  color={isNext ? colors.forest : colors.textMuted}
                  bg={isNext ? colors.goldSoft : colors.graySoft}
                />
              </Row>
            </Row>

            {forSlot.length === 0 ? (
              <Text style={[font.small, { marginTop: 4 }]}>
                {approval === 'all' ? 'Chưa thiết lập khẩu phần' : 'Không có khẩu phần khớp bộ lọc'}
              </Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Chi tiết ${meal.label} của ${horse.name}`}
                onPress={() => onOpenMeal({ horse, slot, schedules: forSlot, task, allSchedules: schedules })}
                style={({ pressed }) => [{ marginTop: spacing.sm }, pressed && { opacity: 0.7 }]}
              >
                {forSlot.flatMap((schedule) => schedule.items || []).map((item, index) => {
                  const feed = getFeedTypeLabel(item.type);
                  return (
                    <Row key={index} style={{ gap: spacing.sm, paddingVertical: 2 }}>
                      <Icon name={feed.icon} size={14} color={colors.forestLight} />
                      <Text style={[font.body, { flex: 1 }]}>{feed.label}</Text>
                      <Text style={styles.qty}>{item.quantity}</Text>
                    </Row>
                  );
                })}
                <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={[font.small, { color: approvedBy ? colors.green : colors.orange }]}>
                    {approvedBy ? `Duyệt bởi ${approvedBy.name || 'HLV'}` : 'Chờ HLV duyệt'}
                  </Text>
                  <Row style={{ gap: 2 }}>
                    <Text style={[font.small, { color: colors.forestLight, fontWeight: '700' }]}>Chi tiết</Text>
                    <Icon name="chevronRight" size={13} color={colors.forestLight} />
                  </Row>
                </Row>
              </Pressable>
            )}

            {task && task.status === 'pending' ? (
              <View style={{ marginTop: spacing.sm, gap: 4 }}>
                {timing.reason ? <Text style={[font.small, { color: colors.orange }]}>{timing.reason}</Text> : null}
                <Row style={{ gap: spacing.sm }}>
                  {canFeed ? (
                    <Button title="Đã cho ăn" icon="check" size="sm" style={{ flex: 2 }} onPress={() => onComplete(task)} />
                  ) : null}
                  <Button
                    title="Không cho ăn được"
                    icon="block"
                    variant="ghost"
                    size="sm"
                    style={{ flex: canFeed ? 2 : 1 }}
                    onPress={() => onNotDone(task)}
                  />
                </Row>
              </View>
            ) : null}
            {task?.status === 'skipped' ? (
              <Text style={[font.small, { color: colors.orange, marginTop: spacing.sm }]}>
                Không cho ăn: {task.skipReason}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { backgroundColor: colors.forest, borderColor: colors.forest, padding: spacing.md },
  heroIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: 'rgba(234,179,8,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroLabel: { ...font.tiny, color: colors.gold },
  heroTitle: { color: colors.white, fontWeight: '700', fontSize: 15 },
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 13 },
  coverageRow: { gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  coverageIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  summaryLine: { fontSize: 12, color: '#6b7280', paddingHorizontal: 4 },
  meal: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.sm, padding: spacing.md, backgroundColor: colors.cream },
  mealNext: { borderColor: colors.gold, backgroundColor: '#fefce8' },
  mealDone: { backgroundColor: colors.forestSoft, borderColor: colors.greenSoft },
  feedRow: { gap: 2 },
  qty: { fontWeight: '800', color: colors.text },
});
