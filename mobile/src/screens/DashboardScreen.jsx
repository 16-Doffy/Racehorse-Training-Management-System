import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { NotificationBell } from '../components/AppHeader';
import { Badge, EmptyState, ProgressBar, Row, StallPlate } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useCarePlan, useFeedings, useInventory, useRefreshAll, useStableOverview, useToday } from '../hooks/useGroomData';
import {
  CARE_TYPES,
  CHORE_TYPES,
  HEALTH_STATUS,
  MEAL_CONFIG,
  describeDaysLeft,
  formatDate,
  formatDateTime,
  getUpcomingCare,
  levelOf,
  nextMealSlot,
  parseStableBlock,
  refId,
  stallCodeOf,
} from '../utils/groom';
import { colors, font, radius, shadow, spacing } from '../theme';

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
const segmentOf = (task) => (task.taskType === 'feeding' ? 'feeding' : CARE_TYPES.includes(task.taskType) ? 'medication' : 'chores');
const SEGMENT_WORDS = { feeding: 'bữa ăn', medication: 'liều thuốc / y lệnh', chores: 'việc chuồng' };

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** "Thứ Năm · 23/10" */
const todayLabel = (now = new Date()) => `${WEEKDAYS[now.getDay()]} · ${formatDate(now).slice(0, 5)}`;

/** A groom is greeted for the part of the day the shift is in. */
function greeting(now = new Date()) {
  const h = now.getHours();
  return `Chào buổi ${h < 11 ? 'sáng' : h < 14 ? 'trưa' : h < 18 ? 'chiều' : 'tối'},`;
}
/** The letter on the avatar: the name a Vietnamese is called by is the last word of it. */
const initialOf = (name) => (String(name || '').trim().split(/\s+/).pop()?.[0] || '?').toUpperCase();

/**
 * Home: the shift in one screen, from what matters now to what comes later. The day's progress with
 * the one thing to do next (and the button that goes there), the three parts of the job and the
 * incident report as four big tiles, everything that needs attention in one card, the groom's
 * horses (the ones to watch first), and what is coming up — the vet's visits and routine care.
 * Detail lives in the tabs; this screen points at them.
 */
export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const refreshAll = useRefreshAll();
  const [refreshing, setRefreshing] = useState(false);

  const { todayTasks, completed, planned, open, overdue, blocked, missed, stateOf } = useToday();
  const { myAssignments, myHorseIds, horseById, lockedHorseIds } = useStableOverview();
  const { feedings } = useFeedings();
  const { items } = useInventory();
  const { sheets } = useCarePlan();

  // Still to do, today or carried over from an earlier day — what each tile counts.
  const meals = open.filter((t) => t.taskType === 'feeding');
  const doses = open.filter((t) => CARE_TYPES.includes(t.taskType));
  const chores = open.filter((t) => CHORE_TYPES.includes(t.taskType));
  const lowStock = items.filter((i) => levelOf(i).short);
  const percent = planned ? Math.round((completed.length / planned) * 100) : 0;
  const go = (segment) => navigation.navigate('Chăm sóc', { segment, at: Date.now() });

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

  // The vet's visits for the groom's horses (open exam requests), the booked ones first.
  const exams = useMemo(
    () =>
      sheets
        .flatMap((sheet) => (sheet.exams || []).map((e) => ({ ...e, horse: sheet.horse })))
        .sort((a, b) => (a.scheduledFor ? new Date(a.scheduledFor) : Infinity) - (b.scheduledFor ? new Date(b.scheduledFor) : Infinity)),
    [sheets]
  );

  const meal = useMemo(() => nextMealSlot(feedings.filter((f) => myHorseIds.has(refId(f.horse)))), [feedings, myHorseIds]);

  // The one thing to do next: what is overdue first, then what is due now (a vet's order before a
  // meal before a chore), else the next meal.
  const dueNow = open.filter((t) => ['ready', 'late'].includes(stateOf(t)?.key));
  const nowSegment = ['medication', 'feeding', 'chores'].find((s) => dueNow.some((t) => segmentOf(t) === s));
  const next = missed.length
    ? { tone: 'bad', icon: 'clock', title: `${missed.length} bữa/liều quá giờ chưa ghi nhận`, hint: 'Báo "quên ghi" hoặc "không làm được"', action: 'Xử lý', segment: segmentOf(missed[0]) }
    : nowSegment
      ? {
          tone: 'now',
          icon: nowSegment === 'medication' ? 'medication' : nowSegment === 'feeding' ? 'rations' : 'tasks',
          title: `Tới giờ: ${dueNow.filter((t) => segmentOf(t) === nowSegment).length} ${SEGMENT_WORDS[nowSegment]}`,
          hint: dueNow.length > dueNow.filter((t) => segmentOf(t) === nowSegment).length ? `Tổng ${dueNow.length} việc làm được bây giờ` : 'Làm được ngay bây giờ',
          action: 'Làm ngay',
          segment: nowSegment,
        }
      : open.length
        ? { tone: 'later', icon: MEAL_CONFIG[meal.slot].icon, title: `${meal.tomorrow ? 'Bữa đầu ngày mai' : MEAL_CONFIG[meal.slot].label} · ${meal.time}`, hint: `Còn ${open.length} việc trong ngày`, action: 'Xem', segment: 'feeding' }
        : null;

  // Everything that needs the groom's attention, one line each.
  const alerts = [
    blocked.length && { key: 'blocked', tone: colors.red, icon: 'block', text: `${blocked.length} việc bị chặn — ${describeBlocked(blocked, stateOf)}`, onPress: () => go(segmentOf(blocked[0])) },
    overdue.length && { key: 'overdue', tone: colors.orange, icon: 'clock', text: `${overdue.length} việc từ hôm trước chưa hoàn thành`, onPress: () => go(segmentOf(overdue[0])) },
    shortages.length && {
      key: 'short',
      tone: colors.red,
      icon: 'supplies',
      text: `Kho không đủ cho một ngày: ${shortages.map((s) => `${s.name} (thiếu ${s.short} ${s.unit})`).join(', ')}`,
      onPress: () => navigation.navigate('Kho'),
    },
    !shortages.length && lowStock.length && { key: 'low', tone: colors.blue, icon: 'supplies', text: `${lowStock.length} vật tư sắp hết trong kho`, onPress: () => navigation.navigate('Kho') },
  ].filter(Boolean);

  // My horses, the ones to watch first: hurt or restricted, then by stall.
  const horses = myAssignments
    .map((a) => {
      const id = refId(a.horse);
      const horse = horseById.get(id) || a.horse;
      const tasks = todayTasks.filter((t) => refId(t.horse) === id);
      const watch = (horse?.healthStatus && horse.healthStatus !== 'eligible') || lockedHorseIds.has(id) || horse?.trainingClearance?.restricted;
      return { id, horse, stall: stallCodeOf(a) || parseStableBlock(a.stableBlock).stall, total: tasks.length, done: tasks.filter((t) => t.status === 'completed').length, watch };
    })
    .sort((a, b) => Number(b.watch) - Number(a.watch) || String(a.stall).localeCompare(String(b.stall), 'vi', { numeric: true }));
  const watching = horses.filter((h) => h.watch).length;

  const upcoming = [
    ...exams.slice(0, 3).map((e) => ({ key: `exam-${e._id}`, icon: 'exam', tone: colors.purple, text: `Bác sĩ khám · ${e.horse?.name || ''}`, badge: e.scheduledFor ? formatDateTime(e.scheduledFor) : 'Chờ hẹn giờ', urgent: false, horse: e.horse })),
    ...care.slice(0, 3).map((c) => ({ key: `${c.horse?._id}-${c.key}`, icon: c.icon, tone: colors.forestLight, text: `${c.label} · ${c.horse?.name || ''}`, badge: describeDaysLeft(c.daysLeft), urgent: c.daysLeft <= 0, horse: c.horse })),
  ];

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Who is on shift and the day in three chips; the avatar opens the profile. */}
      <View style={styles.header}>
        <Row style={{ gap: spacing.md }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Hồ sơ của tôi" onPress={() => navigation.navigate('Profile')} style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.8 }]}>
            <Text style={styles.avatarText}>{initialOf(user?.name)}</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.hello}>{greeting()}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {user?.name || 'Nhân viên chăm sóc'}
            </Text>
          </View>
          <NotificationBell />
        </Row>
        <Row style={styles.chips}>
          <View style={styles.chip}>
            <Icon name="calendar" size={13} color={colors.forestLight} />
            <Text style={styles.chipText}>{todayLabel()}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Chuồng')} style={styles.chip}>
            <Icon name="stable" size={13} color={colors.forestLight} />
            <Text style={styles.chipText}>{myAssignments.length} ngựa</Text>
          </Pressable>
          {watching ? (
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Chuồng')} style={[styles.chip, styles.chipWarn]}>
              <Icon name="warning" size={13} color={colors.red} />
              <Text style={[styles.chipText, { color: colors.red }]}>{watching} cần chú ý</Text>
            </Pressable>
          ) : null}
        </Row>
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}>
        {/* The shift: how far it has got, and what to do next. */}
        <View style={[styles.hero, shadow.raised]}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={styles.heroLabel}>Ca hôm nay</Text>
              <Text style={styles.heroCount}>
                {completed.length}
                <Text style={styles.heroOf}>/{planned} việc đã xong</Text>
              </Text>
            </View>
            <Text style={styles.heroPercent}>{percent}%</Text>
          </Row>
          <ProgressBar percent={percent} height={8} />
          {todayTasks.length !== planned ? <Text style={styles.heroNote}>{todayTasks.length - planned} việc HLV cho bỏ qua hôm nay</Text> : null}

          {next ? (
            // The whole box is the button; the arrow and its word say so.
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${next.action}: ${next.title}`}
              onPress={() => go(next.segment)}
              style={({ pressed }) => [styles.next, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.nextIcon, next.tone === 'bad' && { backgroundColor: 'rgba(220,38,38,0.25)' }]}>
                <Icon name={next.icon} size={18} color={next.tone === 'bad' ? '#fca5a5' : colors.gold} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.nextLabel}>{next.tone === 'bad' ? 'Cần làm trước' : next.tone === 'now' ? 'Việc tiếp theo' : 'Sắp tới'}</Text>
                <Text style={styles.nextTitle} numberOfLines={2}>
                  {next.title}
                </Text>
                <Text style={styles.nextHint} numberOfLines={1}>
                  {next.hint}
                </Text>
              </View>
              <View style={{ alignItems: 'center', gap: 3 }}>
                <View style={[styles.nextAction, next.tone === 'bad' && { backgroundColor: colors.red }]}>
                  <Icon name="arrowRight" size={18} color={next.tone === 'bad' ? colors.white : colors.forest} />
                </View>
                <Text style={styles.nextActionText}>{next.action}</Text>
              </View>
            </Pressable>
          ) : (
            <Row style={styles.allDone}>
              <Icon name="checkCircle" size={18} color={colors.gold} />
              <Text style={styles.nextTitle}>Đã xong hết việc hôm nay</Text>
            </Row>
          )}
        </View>

        {/* The job in four tiles: the three parts of the work, and reporting a problem. */}
        <View style={styles.tiles}>
          <Tile icon="rations" label="Cho ăn" value={meals.length} unit="bữa còn lại" tint={colors.orange} onPress={() => go('feeding')} />
          <Tile icon="medication" label="Thuốc" value={doses.length} unit="liều / y lệnh" tint={colors.red} onPress={() => go('medication')} />
          <Tile icon="tasks" label="Việc chuồng" value={chores.length} unit="việc còn lại" tint={colors.green} onPress={() => go('chores')} />
          <Tile icon="warning" label="Báo sự cố" hint="Ngựa bất thường, tai nạn tại chuồng" tint={colors.red} onPress={() => navigation.navigate('Incidents')} danger />
        </View>

        <Section title="Cần chú ý" count={alerts.length}>
          {alerts.length === 0 ? (
            <Row style={styles.calm}>
              <Icon name="checkCircle" size={18} color={colors.green} />
              <Text style={[font.body, { flex: 1, color: colors.textMuted }]}>Không có gì bị chặn hay thiếu kho.</Text>
            </Row>
          ) : (
            alerts.map((a) => (
              <Pressable key={a.key} accessibilityRole="button" onPress={a.onPress} style={({ pressed }) => [styles.line, pressed && { backgroundColor: colors.cream }]}>
                <View style={[styles.lineIcon, { backgroundColor: `${a.tone}1f` }]}>
                  <Icon name={a.icon} size={16} color={a.tone} />
                </View>
                <Text style={styles.lineText} numberOfLines={2}>
                  {a.text}
                </Text>
                <Icon name="chevronRight" size={16} color={colors.textFaint} />
              </Pressable>
            ))
          )}
        </Section>

        <Section
          title="Ngựa của tôi"
          count={horses.length}
          right={
            <Pressable onPress={() => navigation.navigate('Chuồng')} hitSlop={8}>
              <Text style={styles.link}>Tất cả →</Text>
            </Pressable>
          }
          bare
        >
          {horses.length === 0 ? (
            <View style={styles.card}>
              <EmptyState icon="stall" text="Bạn chưa được phân công ngựa nào" hint="Quản lý CLB là người xếp chuồng." />
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horseRow}>
              {horses.slice(0, 12).map((h) => {
                const health = HEALTH_STATUS[h.horse?.healthStatus] || HEALTH_STATUS.eligible;
                return (
                  <Pressable
                    key={h.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${h.horse?.name}, ${health.label}`}
                    onPress={() => navigation.navigate('HorseDetail', { horseId: h.id, name: h.horse?.name })}
                    style={({ pressed }) => [styles.horse, pressed && { opacity: 0.85 }]}
                  >
                    <View style={[styles.horseTop, { backgroundColor: health.color }]} />
                    <Row style={{ justifyContent: 'space-between' }}>
                      <StallPlate code={h.stall} name={h.horse?.name} size="sm" />
                      {lockedHorseIds.has(h.id) ? <Icon name="lock" size={14} color={colors.red} /> : null}
                    </Row>
                    <Text style={styles.horseName} numberOfLines={1}>
                      {h.horse?.name || 'Ngựa'}
                    </Text>
                    <Row style={{ gap: 4 }}>
                      <View style={[styles.dot, { backgroundColor: health.color }]} />
                      <Text style={[styles.horseHealth, { color: health.color }]} numberOfLines={1}>
                        {health.label}
                      </Text>
                    </Row>
                    <View style={{ gap: 3, marginTop: 'auto' }}>
                      <Text style={styles.horseWork}>{h.total ? `${h.done}/${h.total} việc hôm nay` : 'Không có việc hôm nay'}</Text>
                      <ProgressBar percent={h.total ? (h.done / h.total) * 100 : 0} tint={colors.green} track={colors.graySoft} height={4} />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Section>

        {upcoming.length > 0 ? (
          <Section title="Sắp tới" count={upcoming.length}>
            {upcoming.map((u) => (
              <Pressable
                key={u.key}
                accessibilityRole="button"
                onPress={() => u.horse?._id && navigation.navigate('HorseDetail', { horseId: u.horse._id, name: u.horse.name })}
                style={({ pressed }) => [styles.line, pressed && { backgroundColor: colors.cream }]}
              >
                <View style={[styles.lineIcon, { backgroundColor: `${u.tone}1f` }]}>
                  <Icon name={u.icon} size={16} color={u.tone} />
                </View>
                <Text style={styles.lineText} numberOfLines={1}>
                  {u.text}
                </Text>
                <Badge label={u.badge} color={u.urgent ? colors.red : u.icon === 'exam' ? colors.purple : colors.textMuted} bg={u.urgent ? colors.redSoft : u.icon === 'exam' ? colors.purpleSoft : colors.graySoft} />
              </Pressable>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A section of home: its title and count, and its lines in one card (or bare, for a carousel). */
function Section({ title, count, right, bare = false, children }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 2 }}>
        <Row style={{ gap: 6 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {count ? (
            <View style={styles.count}>
              <Text style={styles.countText}>{count}</Text>
            </View>
          ) : null}
        </Row>
        {right}
      </Row>
      {bare ? children : <View style={styles.card}>{children}</View>}
    </View>
  );
}

/** One big tile: a part of the job with what is left of it, or reporting a problem. */
function Tile({ icon, label, value, unit, hint, tint, onPress, danger = false }) {
  const idle = value === 0;
  return (
    <View style={styles.tileCell}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value !== undefined ? `${label}: ${value} ${unit}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, danger && styles.tileDanger, pressed && { opacity: 0.85 }]}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={[styles.tileIcon, { backgroundColor: `${tint}1f` }]}>
          <Icon name={icon} size={18} color={tint} />
        </View>
        {value !== undefined ? <Text style={[styles.tileValue, { color: idle ? colors.textFaint : tint }]}>{idle ? '✓' : value}</Text> : <Icon name="chevronRight" size={18} color={tint} />}
      </Row>
      <View>
        <Text style={[styles.tileLabel, danger && { color: colors.red }]}>{label}</Text>
        <Text style={styles.tileUnit} numberOfLines={2}>
          {value !== undefined ? (idle ? 'Đã xong hết' : unit) : hint}
        </Text>
      </View>
    </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.gold },
  avatarText: { color: colors.gold, fontWeight: '800', fontSize: 19 },
  hello: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  name: { fontSize: 20, fontWeight: '800', color: colors.forest, letterSpacing: -0.3 },
  chips: { gap: 6, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderSoft },
  chipWarn: { backgroundColor: colors.redSoft, borderColor: colors.redSoft },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.forest },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  hero: { backgroundColor: colors.forest, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heroLabel: { ...font.tiny, color: colors.gold },
  heroCount: { color: colors.white, fontWeight: '800', fontSize: 26, marginTop: 2 },
  heroOf: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  heroPercent: { color: colors.gold, fontWeight: '800', fontSize: 22 },
  heroNote: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  next: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  nextIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: 'rgba(234,179,8,0.18)', alignItems: 'center', justifyContent: 'center' },
  nextLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' },
  nextTitle: { fontSize: 15, fontWeight: '800', color: colors.white },
  nextHint: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  nextAction: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  nextActionText: { fontSize: 10.5, fontWeight: '800', color: colors.gold },
  allDone: { gap: spacing.sm, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.08)' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', margin: -5 },
  // Two tiles a row: each cell is half the row, the gap is the cells' own padding.
  tileCell: { width: '50%', padding: 5 },
  tile: {
    flexGrow: 1,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  tileDanger: { backgroundColor: '#fff5f5', borderColor: colors.redSoft },
  tileIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 24, fontWeight: '800' },
  tileLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  tileUnit: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.forest },
  count: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.graySoft, alignItems: 'center' },
  countText: { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  calm: { gap: spacing.sm, padding: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.borderSoft, marginTop: -1 },
  lineIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  lineText: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 19 },
  horseRow: { gap: spacing.sm, paddingRight: spacing.lg },
  horse: {
    width: 148,
    minHeight: 138,
    padding: spacing.md,
    paddingTop: spacing.md + 2,
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  horseTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  horseName: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  horseHealth: { fontSize: 11.5, fontWeight: '800', flexShrink: 1 },
  horseWork: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
});
