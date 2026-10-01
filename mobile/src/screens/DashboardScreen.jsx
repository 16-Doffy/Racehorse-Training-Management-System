import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader, { LogoutButton } from '../components/AppHeader';
import { Badge, Banner, Button, Card, EmptyState, HorseAvatar, ProgressBar, Row, SectionTitle } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useFeedings, useInventory, useRefreshAll, useStableOverview, useToday } from '../hooks/useGroomData';
import {
  HEALTH_STATUS,
  MEAL_CONFIG,
  buildFeedCoverage,
  describeDaysLeft,
  formatDayLabel,
  getStockLevel,
  getUpcomingCare,
  nextMealSlot,
  parseStableBlock,
  refId,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const CHORE_TYPES = ['cleaning', 'bathing', 'icing'];
const CARE_TYPES = ['medication', 'monitoring'];

/**
 * The shift at a glance: how far along the day is, what is waiting in each part of the job, and
 * the stalls this groom looks after. Detail lives in the tabs — this screen only points at them.
 */
export default function DashboardScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const refreshAll = useRefreshAll();
  const [refreshing, setRefreshing] = useState(false);

  const { todayTasks, done, pending, overdue } = useToday();
  const { myAssignments, myHorseIds, myBlocks, horseById, lockedHorseIds } = useStableOverview();
  const { feedings } = useFeedings();
  const { items } = useInventory();

  const meals = pending.filter((t) => t.taskType === 'feeding');
  const doses = pending.filter((t) => CARE_TYPES.includes(t.taskType));
  const chores = pending.filter((t) => CHORE_TYPES.includes(t.taskType));
  const lowStock = items.filter((i) => getStockLevel(i.quantity).key !== 'ok');
  const percent = todayTasks.length ? Math.round((done.length / todayTasks.length) * 100) : 0;

  const shortages = useMemo(
    () => buildFeedCoverage({ feedings, horseIds: myHorseIds, inventory: items }).filter((c) => c.level === 'critical' || c.level === 'low'),
    [feedings, myHorseIds, items]
  );

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
        right={<LogoutButton onPress={signOut} />}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <Card style={styles.hero}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.heroLabel}>Tiến độ hôm nay</Text>
            <Text style={styles.heroCount}>
              {done.length}/{todayTasks.length}
            </Text>
          </Row>
          <ProgressBar percent={percent} />
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
          <WorkTile icon="rations" label="Bữa ăn" value={meals.length} tint={colors.gold} onPress={() => navigation.navigate('Cho ăn')} />
          <WorkTile icon="medication" label="Thuốc" value={doses.length} tint={colors.red} onPress={() => navigation.navigate('Thuốc')} />
          <WorkTile icon="tasks" label="Việc chuồng" value={chores.length} tint={colors.green} onPress={() => navigation.navigate('Việc')} />
        </Row>

        {overdue.length > 0 ? (
          <Banner tone="warning">
            <Row style={{ gap: spacing.sm }}>
              <Icon name="clock" size={17} color={colors.orange} />
              <Text style={[font.body, { flex: 1 }]}>{overdue.length} việc quá hạn chưa hoàn thành.</Text>
              <Pressable onPress={() => navigation.navigate('Việc')} hitSlop={6}>
                <Text style={styles.link}>Xem →</Text>
              </Pressable>
            </Row>
          </Banner>
        ) : null}

        {shortages.length > 0 ? (
          <Banner tone={shortages.some((s) => s.level === 'critical') ? 'danger' : 'warning'}>
            <Row style={{ gap: spacing.sm }}>
              <Icon name="feed" size={17} color={colors.orange} />
              <Text style={[font.body, { flex: 1 }]}>Sắp thiếu {shortages.map((s) => s.kind).join(', ')}.</Text>
              <Pressable onPress={() => navigation.navigate('Vật tư')} hitSlop={6}>
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
              <Pressable onPress={() => navigation.navigate('Vật tư')} hitSlop={6}>
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
