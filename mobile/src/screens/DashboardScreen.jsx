import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import { Badge, Banner, Button, Card, EmptyState, HorseAvatar, IconButton, ProgressBar, Row, SectionTitle } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useCarePlan, useFeedings, useInventory, useRefreshAll, useStableOverview, useToday } from '../hooks/useGroomData';
import {
  CARE_TYPES,
  CHORE_TYPES,
  HEALTH_STATUS,
  MEAL_CONFIG,
  describeDaysLeft,
  formatDayLabel,
  getUpcomingCare,
  levelOf,
  nextMealSlot,
  parseStableBlock,
  refId,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const BLOCKER_WORDS = {
  SHORT_OF_STOCK: 'thiếu vật tư',
  NO_APPROVED_RATION: 'chưa có khẩu phần',
  EXPIRED_SUPPLY: 'vật tư hết hạn',
};

/** "thiếu vật tư, chưa có khẩu phần" — the reasons behind the blocked tasks, each once. */
function describeBlocked(tasks, stateOf) {
  const codes = new Set(tasks.flatMap((task) => (stateOf(task)?.blockers || []).map((b) => b.code)));
  return [...codes].map((code) => BLOCKER_WORDS[code] || code).join(', ');
}

/** Which part of the "Chăm sóc" tab a task lives on. */
const segmentOf = (task) =>
  task.taskType === 'feeding' ? 'feeding' : CARE_TYPES.includes(task.taskType) ? 'medication' : 'chores';

/**
 * The shift at a glance: how far along the day is, what is waiting in each part of the job, and
 * the stalls this groom looks after. Detail lives in the tabs — this screen only points at them.
 */
export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const refreshAll = useRefreshAll();
  const [refreshing, setRefreshing] = useState(false);

  const { todayTasks, completed, planned, open, overdue, blocked, missed, stateOf } = useToday();
  const { myAssignments, myHorseIds, myBlocks, horseById, lockedHorseIds } = useStableOverview();
  const { feedings } = useFeedings();
  const { items } = useInventory();
  const { sheets } = useCarePlan();

  // Still to do, today or carried over from an earlier day — what each tile counts.
  const meals = open.filter((t) => t.taskType === 'feeding');
  const doses = open.filter((t) => CARE_TYPES.includes(t.taskType));
  const chores = open.filter((t) => CHORE_TYPES.includes(t.taskType));
  const lowStock = items.filter((i) => levelOf(i).short);
  const percent = planned ? Math.round((completed.length / planned) * 100) : 0;

  // What the store can't cover for one day of this groom's horses, as the server counts it from the
  // rations and prescriptions linked to stock (GET /stable/my-care-plan).
  const shortages = useMemo(() => {
    const byItem = new Map();
    sheets.forEach((sheet) =>
      (sheet.shortages || []).forEach((m) => {
        const key = String(m.inventoryItem);
        const entry = byItem.get(key) || { ...m, short: 0, horses: [] };
        entry.short = Math.round((entry.short + (m.short || 0)) * 1000) / 1000;
        entry.horses.push(sheet.horse?.name);
        byItem.set(key, entry);
      })
    );
    return [...byItem.values()];
  }, [sheets]);

  const care = useMemo(
    () =>
      [...myHorseIds]
        .flatMap((id) => getUpcomingCare(horseById.get(id), 7).map((c) => ({ ...c, horse: horseById.get(id) })))
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [myHorseIds, horseById]
  );

  const meal = useMemo(() => nextMealSlot(feedings.filter((f) => myHorseIds.has(refId(f.horse)))), [feedings, myHorseIds]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        eyebrow={formatDayLabel(new Date())}
        title={user?.name || 'Nhân viên chăm sóc'}
        subtitle={`${myAssignments.length} chiến mã${myBlocks.length ? ` · ${myBlocks.join(', ')}` : ''}`}
        right={<IconButton icon="person" label="Hồ sơ của tôi" onPress={() => navigation.navigate('Profile')} />}
        bell
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <Card style={styles.hero}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.heroLabel}>Tiến độ hôm nay</Text>
            <Text style={styles.heroCount}>
              {completed.length}/{planned}
            </Text>
          </Row>
          <ProgressBar percent={percent} />
          {missed.length > 0 ? (
            <Text style={styles.heroNote}>
              {missed.length} việc đã quá hạn ghi nhận hôm nay
              {todayTasks.length !== planned ? ` · ${todayTasks.length - planned} việc HLV cho bỏ qua` : ''}
            </Text>
          ) : null}
          <Row style={{ gap: 6, marginTop: spacing.md }}>
            <Icon name={MEAL_CONFIG[meal.slot].icon} size={15} color={colors.gold} />
            <Text style={styles.heroMeal}>
              {meal.tomorrow ? 'Bữa đầu ngày mai' : MEAL_CONFIG[meal.slot].label} ·{' '}
              <Text style={{ color: colors.gold, fontWeight: '800' }}>{meal.time}</Text>
            </Text>
          </Row>
        </Card>

        {/* What is waiting, split the way the tabs are. */}
        <Row style={{ gap: spacing.sm }}>
          <WorkTile icon="rations" label="Bữa ăn" value={meals.length} tint={colors.gold} onPress={() => navigation.navigate('Chăm sóc', { segment: 'feeding', at: Date.now() })} />
          <WorkTile icon="medication" label="Thuốc" value={doses.length} tint={colors.red} onPress={() => navigation.navigate('Chăm sóc', { segment: 'medication', at: Date.now() })} />
          <WorkTile icon="tasks" label="Việc chuồng" value={chores.length} tint={colors.green} onPress={() => navigation.navigate('Chăm sóc', { segment: 'chores', at: Date.now() })} />
        </Row>

        {/* Work that can't go ahead: short of stock, no approved ration, an expired item. */}
        {blocked.length > 0 ? (
          <Banner tone="danger">
            <Row style={{ gap: spacing.sm }}>
              <Icon name="block" size={17} color={colors.red} />
              <Text style={[font.body, { flex: 1 }]}>
                {blocked.length} việc bị chặn — {describeBlocked(blocked, stateOf)}.
              </Text>
              <Pressable
                onPress={() => navigation.navigate('Chăm sóc', { segment: segmentOf(blocked[0]), at: Date.now() })}
                hitSlop={6}
              >
                <Text style={styles.link}>Xem →</Text>
              </Pressable>
            </Row>
          </Banner>
        ) : null}

        {overdue.length > 0 ? (
          <Banner tone="warning">
            <Row style={{ gap: spacing.sm }}>
              <Icon name="clock" size={17} color={colors.orange} />
              <Text style={[font.body, { flex: 1 }]}>{overdue.length} việc từ hôm trước chưa hoàn thành.</Text>
              <Pressable onPress={() => navigation.navigate('Chăm sóc', { segment: segmentOf(overdue[0]), at: Date.now() })} hitSlop={6}>
                <Text style={styles.link}>Xem →</Text>
              </Pressable>
            </Row>
          </Banner>
        ) : null}

        {shortages.length > 0 ? (
          <Banner tone="danger">
            <Row style={{ gap: spacing.sm }}>
              <Icon name="supplies" size={17} color={colors.red} />
              <Text style={[font.body, { flex: 1 }]}>
                Kho không đủ cho một ngày: {shortages.map((s) => `${s.name} (thiếu ${s.short} ${s.unit})`).join(', ')}.
              </Text>
              <Pressable onPress={() => navigation.navigate('Kho')} hitSlop={6}>
                <Text style={styles.link}>Xin thêm →</Text>
              </Pressable>
            </Row>
          </Banner>
        ) : null}

        {lowStock.length > 0 && shortages.length === 0 ? (
          <Banner tone="info">
            <Row style={{ gap: spacing.sm }}>
              <Icon name="supplies" size={17} color={colors.blue} />
              <Text style={[font.body, { flex: 1 }]}>{lowStock.length} vật tư sắp hết trong kho.</Text>
              <Pressable onPress={() => navigation.navigate('Kho')} hitSlop={6}>
                <Text style={styles.link}>Xem →</Text>
              </Pressable>
            </Row>
          </Banner>
        ) : null}

        {/* The stalls this groom is responsible for; tap one for its daily routine. */}
        <Card>
          <SectionTitle
            right={
              <Pressable onPress={() => navigation.navigate('Chuồng')} hitSlop={8}>
                <Text style={styles.link}>Sơ đồ →</Text>
              </Pressable>
            }
          >
            Chuồng phụ trách
          </SectionTitle>
          {myAssignments.length === 0 ? (
            <EmptyState icon="stall" text="Bạn chưa được phân công chuồng nào" hint="Quản lý CLB là người xếp chuồng." />
          ) : (
            myAssignments.slice(0, 4).map((a) => {
              const horseId = refId(a.horse);
              const horse = horseById.get(horseId);
              const health = HEALTH_STATUS[horse?.healthStatus] || HEALTH_STATUS.eligible;
              const horseTasks = todayTasks.filter((t) => refId(t.horse) === horseId);
              const doneCount = horseTasks.filter((t) => t.status === 'completed').length;
              return (
                <Pressable
                  key={a._id}
                  style={styles.stallRow}
                  onPress={() => navigation.navigate('HorseDetail', { horseId, name: a.horse?.name })}
                >
                  <HorseAvatar name={a.horse?.name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Row style={{ gap: 6 }}>
                      <Text style={font.h3}>{a.horse?.name}</Text>
                      {lockedHorseIds.has(horseId) ? <Icon name="lock" size={12} color={colors.red} /> : null}
                    </Row>
                    <Text style={font.small}>
                      {parseStableBlock(a.stableBlock).stall}
                      {horseTasks.length ? ` · ${doneCount}/${horseTasks.length} việc` : ''}
                    </Text>
                  </View>
                  <Badge label={health.label} color={health.color} bg={health.bg} dot />
                </Pressable>
              );
            })
          )}
          {myAssignments.length > 4 ? (
            <Text style={[font.small, { textAlign: 'center', paddingTop: spacing.sm }]}>
              và {myAssignments.length - 4} chuồng khác
            </Text>
          ) : null}
        </Card>

        {care.length > 0 ? (
          <Card style={{ marginBottom: spacing.lg }}>
            <SectionTitle>Nhắc lịch chăm sóc</SectionTitle>
            {care.slice(0, 3).map((c) => (
              <Row key={`${c.horse?._id}-${c.key}`} style={styles.careRow}>
                <Icon name={c.icon} size={15} color={colors.forestLight} />
                <Text style={[font.body, { flex: 1 }]} numberOfLines={1}>
                  {c.label} · {c.horse?.name}
                </Text>
                <Badge
                  label={describeDaysLeft(c.daysLeft)}
                  color={c.daysLeft <= 0 ? colors.red : colors.textMuted}
                  bg={c.daysLeft <= 0 ? colors.redSoft : colors.graySoft}
                />
              </Row>
            ))}
          </Card>
        ) : null}

        <Button
          title="Báo sự cố tại chuồng"
          icon="warning"
          variant="danger"
          style={{ marginBottom: spacing.xl }}
          onPress={() => navigation.navigate('Incidents')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Compact counter: one per part of the job, replacing a wall of stat cards. */
function WorkTile({ icon, label, value, tint, onPress }) {
  return (
    <Card style={styles.workTile} onPress={onPress}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Icon name={icon} size={16} color={tint} />
        <Text style={[styles.workValue, { color: value ? tint : colors.textFaint }]}>{value}</Text>
      </Row>
      <Text style={font.tiny} numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  hero: { backgroundColor: colors.forest, borderColor: colors.forest, gap: spacing.sm, padding: spacing.md },
  heroLabel: { ...font.tiny, color: colors.gold },
  heroCount: { color: colors.white, fontWeight: '800', fontSize: 15 },
  heroMeal: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  heroNote: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 13 },
  workTile: { flex: 1, padding: spacing.md, gap: 2 },
  workValue: { fontSize: 20, fontWeight: '800' },
  stallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  careRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft, gap: spacing.sm },
});
