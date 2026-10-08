import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader, { LogoutButton } from '../components/AppHeader';
import { Badge, Banner, Button, Card, EmptyState, HorseAvatar, ProgressBar, Row, SectionTitle } from '../components/ui';
import TodaySchedule from '../components/TodaySchedule';
import { DashboardSkeleton } from '../components/Skeletons';
import { useAuth } from '../auth/AuthContext';
import { useFeedings, useInventory, useRefreshAll, useSessions, useStableOverview, useToday } from '../hooks/useGroomData';
import {
  CHORE_TYPES,
  HEALTH_STATUS,
  MEAL_CONFIG,
  buildFeedCoverage,
  describeDaysLeft,
  getStockLevel,
  getUpcomingCare,
  nextMealSlot,
  parseStableBlock,
  refId,
} from '../utils/groom';
import { buildSchedule } from '../utils/schedule';
import { colors, font, radius, spacing } from '../theme';

const CARE_TYPES = ['medication', 'monitoring'];

const greeting = (hour) => (hour < 11 ? 'Chào buổi sáng' : hour < 13 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối');
// "Thứ Năm, 09/10" — the day first, because a groom opens this to see which day's work is on screen.
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const dayLine = (d) => `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * The shift at a glance, top to bottom in the order a groom needs it: who and when, what to do
 * next, what is waiting in each part of the job, anything that is wrong, the day plan, the stalls.
 * Detail lives in the tabs — this screen only points at them.
 */
export default function DashboardScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const refreshAll = useRefreshAll();
  const [refreshing, setRefreshing] = useState(false);

  const { todayTasks, done, pending, overdue, isLoading } = useToday();
  const { myAssignments, myHorseIds, myBlocks, horseById, lockedHorseIds } = useStableOverview();
  const { feedings } = useFeedings();
  const { items } = useInventory();
  const { sessions } = useSessions();

  const meals = pending.filter((t) => t.taskType === 'feeding');
  const doses = pending.filter((t) => CARE_TYPES.includes(t.taskType));
  const chores = pending.filter((t) => CHORE_TYPES.includes(t.taskType));
  const lowStock = items.filter((i) => getStockLevel(i.quantity).key !== 'ok');
  const percent = todayTasks.length ? Math.round((done.length / todayTasks.length) * 100) : 0;

  const schedule = useMemo(
    () => buildSchedule({ tasks: todayTasks, sessions, feedings, myHorseIds, horseById }),
    [todayTasks, sessions, feedings, myHorseIds, horseById]
  );

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

  const openHorse = (horseId, name) => horseId && navigation.navigate('HorseDetail', { horseId, name });
  const now = new Date();
  const next = schedule.next;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        eyebrow={`${greeting(now.getHours())} · ${dayLine(now)}`}
        title={user?.name || 'Nhân viên chăm sóc'}
        subtitle={`${myAssignments.length} chiến mã${myBlocks.length ? ` · ${myBlocks.join(', ')}` : ''}`}
        right={<LogoutButton onPress={signOut} />}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* One card answers "what do I do now?" and "how far along am I?" */}
            <Card style={styles.hero}>
              <Text style={styles.heroLabel}>{next?.live ? 'Đang diễn ra' : next?.late ? 'Việc trễ giờ' : 'Việc tiếp theo'}</Text>
              {next ? (
                <Pressable
                  style={({ pressed }) => [styles.nextRow, pressed && { opacity: 0.8 }]}
                  onPress={() => (next.count > 1 ? navigation.navigate(next.tab) : openHorse(next.horseId, next.horseName))}
                >
                  <View style={styles.nextIcon}>
                    <Icon name={next.icon} size={22} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nextTitle} numberOfLines={2}>
                      {next.title}
                    </Text>
                    {next.subtitle ? (
                      <Text style={styles.nextSub} numberOfLines={1}>
                        {next.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.nextTime, next.late && { color: '#fdba74' }]}>{next.time || 'Cả ngày'}</Text>
                </Pressable>
              ) : (
                <Row style={styles.nextRow}>
                  <View style={styles.nextIcon}>
                    <Icon name="checkCircle" size={22} color={colors.gold} />
                  </View>
                  <Text style={[styles.nextTitle, { flex: 1 }]}>{todayTasks.length ? 'Đã xong mọi việc hôm nay' : 'Hôm nay chưa có việc nào'}</Text>
                </Row>
              )}

              <View style={styles.heroDivider} />

              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.heroMeta}>
                  Đã xong <Text style={styles.heroStrong}>{done.length}/{todayTasks.length}</Text> việc
                </Text>
                <Text style={styles.heroMeta}>{percent}%</Text>
              </Row>
              <ProgressBar percent={percent} height={8} />
              <Text style={styles.heroMeal}>
                {meal.tomorrow ? 'Bữa đầu ngày mai' : MEAL_CONFIG[meal.slot].label} lúc <Text style={styles.heroStrong}>{meal.time}</Text>
              </Text>
            </Card>

            {/* What is waiting, split the way the tabs are. */}
            <Row style={{ gap: spacing.sm }}>
              <WorkTile icon="rations" label="Bữa ăn" value={meals.length} tint={colors.gold} bg={colors.goldSoft} onPress={() => navigation.navigate('Cho ăn')} />
              <WorkTile icon="medication" label="Thuốc" value={doses.length} tint={colors.red} bg={colors.redSoft} onPress={() => navigation.navigate('Thuốc')} />
              <WorkTile icon="tasks" label="Việc chuồng" value={chores.length} tint={colors.green} bg={colors.greenSoft} onPress={() => navigation.navigate('Việc')} />
            </Row>

            {overdue.length > 0 ? (
              <Banner tone="warning">
                <Row style={{ gap: spacing.sm }}>
                  <Icon name="clock" size={18} color={colors.orange} />
                  <Text style={[font.body, { flex: 1 }]}>{overdue.length} việc quá hạn chưa hoàn thành.</Text>
                  <Pressable onPress={() => navigation.navigate('Việc')} hitSlop={8}>
                    <Text style={styles.link}>Xem →</Text>
                  </Pressable>
                </Row>
              </Banner>
            ) : null}

            {shortages.length > 0 ? (
              <Banner tone={shortages.some((s) => s.level === 'critical') ? 'danger' : 'warning'}>
                <Row style={{ gap: spacing.sm }}>
                  <Icon name="feed" size={18} color={colors.orange} />
                  <Text style={[font.body, { flex: 1 }]}>Sắp thiếu {shortages.map((s) => s.kind).join(', ')}.</Text>
                  <Pressable onPress={() => navigation.navigate('Vật tư')} hitSlop={8}>
                    <Text style={styles.link}>Xin thêm →</Text>
                  </Pressable>
                </Row>
              </Banner>
            ) : null}

            {lowStock.length > 0 && shortages.length === 0 ? (
              <Banner tone="info">
                <Row style={{ gap: spacing.sm }}>
                  <Icon name="supplies" size={18} color={colors.blue} />
                  <Text style={[font.body, { flex: 1 }]}>{lowStock.length} vật tư sắp hết trong kho.</Text>
                  <Pressable onPress={() => navigation.navigate('Vật tư')} hitSlop={8}>
                    <Text style={styles.link}>Xem →</Text>
                  </Pressable>
                </Row>
              </Banner>
            ) : null}

            <TodaySchedule schedule={schedule} onOpenHorse={openHorse} onOpenTab={(tab) => navigation.navigate(tab)} />

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
                      style={({ pressed }) => [styles.stallRow, pressed && { opacity: 0.7 }]}
                      onPress={() => openHorse(horseId, a.horse?.name)}
                    >
                      <HorseAvatar name={a.horse?.name} size={44} />
                      <View style={{ flex: 1 }}>
                        <Row style={{ gap: 6 }}>
                          <Text style={font.h3}>{a.horse?.name}</Text>
                          {lockedHorseIds.has(horseId) ? <Icon name="lock" size={14} color={colors.red} /> : null}
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
                <Text style={[font.small, { textAlign: 'center', paddingTop: spacing.sm }]}>và {myAssignments.length - 4} chuồng khác</Text>
              ) : null}
            </Card>

            {care.length > 0 ? (
              <Card>
                <SectionTitle>Nhắc lịch chăm sóc</SectionTitle>
                {care.slice(0, 3).map((c) => (
                  <Row key={`${c.horse?._id}-${c.key}`} style={styles.careRow}>
                    <Icon name={c.icon} size={16} color={colors.forestLight} />
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

          </>
        )}
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

/** One counter per part of the job: a coloured icon, the number still open, the name. */
function WorkTile({ icon, label, value, tint, bg, onPress }) {
  return (
    <Card style={styles.workTile} onPress={onPress}>
      <View style={[styles.workIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={18} color={tint} />
      </View>
      <Text style={[styles.workValue, { color: value ? colors.text : colors.textFaint }]}>{value}</Text>
      <Text style={font.small} numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  hero: { backgroundColor: colors.forest, borderColor: colors.forest, gap: spacing.md, padding: spacing.lg },
  heroLabel: { ...font.tiny, color: colors.gold },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nextIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTitle: { color: colors.white, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  nextSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18 },
  nextTime: { color: colors.gold, fontSize: 22, fontWeight: '700' },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  heroStrong: { color: colors.white, fontWeight: '700' },
  heroMeal: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 14 },
  workTile: { flex: 1, padding: spacing.md, gap: 2 },
  workIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  workValue: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  stallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  careRow: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft, gap: spacing.sm },
});
