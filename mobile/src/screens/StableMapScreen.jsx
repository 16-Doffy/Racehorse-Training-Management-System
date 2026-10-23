import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import { EmptyState, IconButton, LoadError, Loading, ProgressBar, Row, SearchInput, Sheet } from '../components/ui';
import { useRefreshAll, useStableOverview, useStalls, useTasks, useTreatments } from '../hooks/useGroomData';
import { HEALTH_STATUS, TRAINING_LEVEL, getUpcomingCare, isSameDay, matchesSearch, refId, stallState, taskState } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const LOOSE_ZONE = '~';

/**
 * The groom's stalls (GET /stable/stalls), as the Manager laid them out, made to hold a working day of
 * 60–90 horses without scrolling for the last one: a dense grid (three or four small tiles a row) —
 * each the stall, the horse, its health down its edge, today's work, and an icon for what to watch (a
 * treatment, a training limit, care overdue). The zones are buttons with their counts and fold under
 * their titles (only the first starts open), the search finds a horse or a stall, and "Cần chú ý"
 * keeps only the horses to watch. "Cả khu" on a zone shows every stall of it in the map's order —
 * colleagues' and empty ones faded — so the groom knows who stands next door, without a second map.
 * Only the Manager places horses and gives stalls; this screen only shows.
 */
export default function StableMapScreen({ navigation }) {
  const [zone, setZone] = useState('all');
  const [pickingZone, setPickingZone] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [search, setSearch] = useState('');
  // Zones the groom opened or closed by hand; by default only the first is open.
  const [toggled, setToggled] = useState(() => new Set());
  // Zones shown whole: every stall of the zone, not only the groom's.
  const [whole, setWhole] = useState(() => new Set());
  const [refreshing, setRefreshing] = useState(false);
  // How many tiles a row holds depends on the width; each tile takes its share of the row, so a web
  // scrollbar or a rounding never pushes one down a row.
  const [gridWidth, setGridWidth] = useState(0);

  const { zones, myStalls, myUnplaced, isLoading, isError, refetch } = useStalls();
  const { horseById, lockedHorseIds } = useStableOverview();
  const { tasks } = useTasks();
  const { treatments } = useTreatments();
  const refreshAll = useRefreshAll();

  // Today's work per horse: how much is done of what is planned, and how much is still open.
  const todayByHorse = useMemo(() => {
    const map = new Map();
    tasks
      .filter((t) => isSameDay(t.scheduledDate, new Date()))
      .forEach((t) => {
        const id = refId(t.horse);
        const entry = map.get(id) || { total: 0, done: 0, open: 0 };
        const state = taskState(t);
        // Work the trainer called off is not part of the day; a missed dose is no longer "to do".
        if (state?.key !== 'cancelled') entry.total += 1;
        if (t.status === 'completed') entry.done += 1;
        if (state?.open) entry.open += 1;
        map.set(id, entry);
      });
    return map;
  }, [tasks]);

  const treatmentByHorse = useMemo(() => {
    const map = new Map();
    treatments.filter((t) => t.status === 'ongoing').forEach((t) => map.set(refId(t.horse), t));
    return map;
  }, [treatments]);

  // Every stall of mine as one entry, with what its tile shows worked out once.
  const entries = useMemo(() => {
    const factsOf = (horse) => {
      if (!horse) return null;
      const id = refId(horse);
      const info = horseById.get(id);
      const clearance = info?.trainingClearance;
      const care = getUpcomingCare(info, 7)[0];
      const restricted = clearance?.restricted ? TRAINING_LEVEL[clearance.level] : null;
      const locked = lockedHorseIds.has(id);
      const facts = { treatment: treatmentByHorse.get(id), restricted, locked, care, work: todayByHorse.get(id) };
      facts.watch = (horse.healthStatus && horse.healthStatus !== 'eligible') || !!restricted || locked || (!!care && care.daysLeft <= 0);
      return facts;
    };
    return [
      ...myStalls.map((s) => ({ key: s._id, stall: s, horse: s.occupant?.horse || null, zone: s.zone, zoneName: s.zoneName || `Khu ${s.zone}`, code: s.code })),
      ...myUnplaced.map((u) => ({ key: u.assignment || refId(u.horse), stall: null, horse: u.horse, zone: LOOSE_ZONE, zoneName: 'Chuồng ghi tay', code: null, written: u.stableBlock })),
    ].map((e) => ({ ...e, facts: factsOf(e.horse) }));
  }, [myStalls, myUnplaced, horseById, lockedHorseIds, treatmentByHorse, todayByHorse]);

  const horses = entries.filter((e) => e.horse);
  const attention = horses.filter((e) => e.facts.watch).length;
  const workLeft = horses.reduce((sum, e) => sum + (e.facts.work?.open || 0), 0);
  const entryByStall = new Map(entries.filter((e) => e.stall).map((e) => [e.stall._id, e]));
  const mapZoneByKey = new Map(zones.map((z) => [z.key, z]));

  // My zones, in the map's order, each with how many horses and how many to watch.
  const myZones = [];
  for (const e of entries) {
    let z = myZones.find((x) => x.key === e.zone);
    if (!z) myZones.push((z = { key: e.zone, name: e.zoneName, all: [], horses: 0, watch: 0 }));
    z.all.push(e);
    if (e.horse) z.horses += 1;
    if (e.facts?.watch) z.watch += 1;
  }
  const pickedZone = zone === 'all' ? null : myZones.find((z) => z.key === zone) || null;
  const q = search.trim();
  const filtering = !!q || attentionOnly;
  const keep = (e) => (!attentionOnly || e.facts?.watch) && (!q || matchesSearch(`${e.horse?.name || ''} ${e.code || ''} ${e.written || ''}`, q));
  const shownZones = myZones
    .filter((z) => zone === 'all' || z.key === zone)
    .map((z) => ({ ...z, items: z.all.filter(keep), map: mapZoneByKey.get(z.key) }))
    .filter((z) => z.items.length > 0);

  // With every zone shown, only the first starts open — a day of 60–90 horses reads as a list of
  // zones. One zone chosen, a search or the attention filter opens what it shows, so nothing it
  // finds is hidden under a fold.
  const isFolded = (key, index) => {
    if (filtering || zone !== 'all') return false;
    return index === 0 ? toggled.has(key) : !toggled.has(key);
  };
  const flip = (set) => (key) =>
    set((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const fold = flip(setToggled);
  const flipWhole = flip(setWhole);

  const openHorse = (horse) => horse?._id && navigation.navigate('HorseDetail', { horseId: horse._id, name: horse.name });
  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const cell = `${100 / (gridWidth >= 460 ? 4 : 3)}%`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="Chuồng của tôi"
        subtitle={`${horses.length} ngựa · ${entries.length} chuồng · ${myZones.length} khu${attention ? ` · ${attention} cần chú ý` : ''}`}
        right={<IconButton icon="care" label={`Việc còn lại hôm nay: ${workLeft}`} badge={workLeft} onPress={() => navigation.navigate('Chăm sóc', { segment: 'chores', at: Date.now() })} />}
      />

      <View style={styles.toolbar}>
        <Row style={{ gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Tìm ngựa hoặc mã chuồng..." />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: attentionOnly }}
            accessibilityLabel={`Chỉ ngựa cần chú ý: ${attention}`}
            onPress={() => setAttentionOnly((v) => !v)}
            style={({ pressed }) => [styles.watchToggle, attentionOnly && styles.watchToggleOn, pressed && { opacity: 0.8 }]}
          >
            <Icon name="warning" size={15} color={attentionOnly ? colors.white : colors.red} />
            <Text style={[styles.watchText, attentionOnly && { color: colors.white }]}>{attention}</Text>
          </Pressable>
        </Row>
        {/* One button for the zone, however many there are; the list behind it is searchable. */}
        {myZones.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Đang xem ${pickedZone ? pickedZone.name : 'mọi khu'}, chạm để chọn khu`}
            onPress={() => setPickingZone(true)}
            style={({ pressed }) => [styles.zonePick, pressed && { opacity: 0.8 }]}
          >
            <Icon name="stable" size={16} color={colors.forest} />
            <Text style={styles.zonePickText} numberOfLines={1}>
              {pickedZone ? pickedZone.name : `Mọi khu · ${myZones.length} khu`}
            </Text>
            <Text style={styles.zonePickCount}>{pickedZone ? pickedZone.horses : horses.length} ngựa</Text>
            <Icon name="chevronDown" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {/* What the icons on a tile mean, where the groom sees it before the tiles. */}
        <Row style={styles.legend}>
          <Legend icon="medication" color={colors.purple} label="Đang điều trị" />
          <Legend icon="lock" color={colors.orange} label="Hạn chế tập" />
          <Legend icon="clock" color={colors.red} label="Quá hạn chăm sóc" />
        </Row>
      </View>

      <ZonePicker
        visible={pickingZone}
        zones={myZones}
        total={horses.length}
        value={zone}
        onClose={() => setPickingZone(false)}
        onPick={(key) => {
          setZone(key);
          setPickingZone(false);
        }}
      />

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}>
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <LoadError text="Không tải được sơ đồ chuồng" onRetry={refetch} />
        ) : shownZones.length === 0 ? (
          <View style={styles.panel}>
            <EmptyState
              icon={attentionOnly && !q ? 'checkCircle' : 'stall'}
              text={entries.length ? (attentionOnly && !q ? 'Không có ngựa nào cần chú ý' : 'Không tìm thấy ngựa hay chuồng nào') : 'Bạn chưa được phân công chuồng nào'}
              hint={entries.length ? undefined : 'Quản lý CLB là người xếp chuồng và người phụ trách.'}
            />
          </View>
        ) : (
          <>
            {shownZones.map((z, index) => {
              const closed = isFolded(z.key, index);
              // Others' stalls in this zone: what "Cả khu" adds.
              const others = z.map ? z.map.stalls.filter((s) => !entryByStall.has(s._id)).length : 0;
              const showWhole = !filtering && whole.has(z.key) && !!z.map;
              const tiles = showWhole ? z.map.stalls.map((s) => entryByStall.get(s._id) || { key: s._id, other: s }) : z.items;
              return (
                <View key={z.key} style={styles.zone}>
                  <View style={[styles.zoneHead, closed && styles.zoneHeadClosed]}>
                    <Pressable accessibilityRole="button" accessibilityState={{ expanded: !closed }} onPress={() => fold(z.key)} style={styles.zoneTitle} hitSlop={4}>
                      <Icon name={closed ? 'chevronRight' : 'chevronDown'} size={16} color={colors.forestLight} />
                      <Text style={styles.zoneName} numberOfLines={1}>
                        {z.name}
                      </Text>
                      <Text style={font.small}>{z.horses} ngựa</Text>
                      {z.watch ? (
                        <View style={styles.zoneWatch}>
                          <Text style={styles.zoneWatchText}>{z.watch} cần chú ý</Text>
                        </View>
                      ) : null}
                    </Pressable>
                    {!closed && others > 0 && !filtering ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: showWhole }}
                        accessibilityLabel={showWhole ? `Chỉ chuồng của tôi trong ${z.name}` : `Xem cả ${z.name}: thêm ${others} chuồng khác`}
                        onPress={() => flipWhole(z.key)}
                        style={[styles.wholeToggle, showWhole && styles.wholeToggleOn]}
                        hitSlop={6}
                      >
                        <Icon name="stable" size={13} color={showWhole ? colors.white : colors.forestLight} />
                        <Text style={[styles.wholeText, showWhole && { color: colors.white }]}>{showWhole ? 'Chỉ của tôi' : 'Cả khu'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {z.key === LOOSE_ZONE && !closed ? (
                    <Text style={[font.small, { paddingHorizontal: 2 }]}>Chuồng ghi tay từ trước khi có sơ đồ — Quản lý CLB sẽ xếp lại vào chuồng có mã.</Text>
                  ) : null}
                  {!closed ? (
                    <View style={styles.grid} onLayout={(ev) => setGridWidth(Math.floor(ev.nativeEvent.layout.width))}>
                      {tiles.map((e) => (
                        <View key={e.key} style={[styles.cell, { width: cell }]}>
                          {e.other ? <OtherMini stall={e.other} onPress={() => openHorse(e.other.occupant?.horse)} /> : e.horse ? <MiniTile entry={e} onPress={() => openHorse(e.horse)} /> : <EmptyMini stall={e.stall} />}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The zones to look at, as a list behind one button: "Mọi khu" first, then each zone with its horses
 * and how many to watch. A search narrows it once there are more than a handful.
 */
function ZonePicker({ visible, zones, total, value, onClose, onPick }) {
  const [query, setQuery] = useState('');
  const shown = zones.filter((z) => matchesSearch(z.name, query));
  const row = (key, title, sub, watch) => {
    const on = value === key;
    return (
      <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onPick(key)} style={({ pressed }) => [styles.pickRow, on && styles.pickRowOn, pressed && { opacity: 0.8 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.pickTitle, on && { color: colors.forest }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={font.small}>{sub}</Text>
        </View>
        {watch ? (
          <View style={styles.zoneWatch}>
            <Text style={styles.zoneWatchText}>{watch} cần chú ý</Text>
          </View>
        ) : null}
        {on ? <Icon name="check" size={18} color={colors.forest} /> : null}
      </Pressable>
    );
  };
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      title="Chọn khu"
    >
      {zones.length > 6 ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <SearchInput value={query} onChange={setQuery} placeholder="Tìm khu..." />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 6 }} keyboardShouldPersistTaps="handled">
        {!query ? row('all', 'Mọi khu', `${zones.length} khu · ${total} ngựa`, zones.reduce((n, z) => n + z.watch, 0)) : null}
        {shown.map((z) => row(z.key, z.name, `${z.horses} ngựa · ${z.all.length} chuồng`, z.watch))}
        {shown.length === 0 ? <EmptyState icon="search" text="Không có khu nào khớp" /> : null}
      </ScrollView>
    </Sheet>
  );
}

function Legend({ icon, color, label }) {
  return (
    <Row style={{ gap: 4 }}>
      <Icon name={icon} size={12} color={color} />
      <Text style={styles.legendText}>{label}</Text>
    </Row>
  );
}

/**
 * One of my horses, small enough for three or four a row: the stall and the watch icons, the name, its
 * health (also the colour down its edge), and today's work. Everything else is on the horse's page.
 */
function MiniTile({ entry, onPress }) {
  const { horse, code, written, facts } = entry;
  const status = HEALTH_STATUS[horse.healthStatus] || HEALTH_STATUS.eligible;
  const { treatment, restricted, locked, care, work } = facts;
  const overdue = care && care.daysLeft <= 0;
  const percent = work?.total ? Math.round((work.done / work.total) * 100) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${horse.name}, chuồng ${code || written || 'chưa có'}, ${status.label}${work?.total ? `, ${work.done} trên ${work.total} việc` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.mini, facts.watch && styles.miniWatch, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.miniEdge, { backgroundColor: status.color }]} />
      <Row style={{ justifyContent: 'space-between', gap: 2 }}>
        <Text style={[styles.miniCode, !code && { color: colors.textMuted }]} numberOfLines={1}>
          {code || 'Ghi tay'}
        </Text>
        <Row style={{ gap: 2 }}>
          {treatment ? <Icon name="medication" size={12} color={colors.purple} /> : null}
          {restricted || locked ? <Icon name="lock" size={12} color={restricted?.color || colors.red} /> : null}
          {overdue ? <Icon name="clock" size={12} color={colors.red} /> : null}
        </Row>
      </Row>
      <Text style={styles.miniName} numberOfLines={1}>
        {horse.name}
      </Text>
      <Text style={[styles.miniHealth, { color: status.color }]} numberOfLines={1}>
        {status.label}
      </Text>
      <View style={{ gap: 3, marginTop: 'auto' }}>
        <Text style={[styles.miniWork, work?.open ? { color: colors.orange } : null]} numberOfLines={1}>
          {work?.total ? `${work.done}/${work.total} việc` : 'Không có việc'}
        </Text>
        <ProgressBar percent={percent} tint={colors.green} track={colors.graySoft} height={3} />
      </View>
    </Pressable>
  );
}

/** A stall of mine with no horse yet, or under maintenance: in its place in the zone, faded. */
function EmptyMini({ stall }) {
  const maintenance = stall?.status === 'maintenance';
  return (
    <View style={[styles.mini, styles.miniEmpty]} accessibilityLabel={`Chuồng ${stall?.code || ''} của tôi ${maintenance ? 'đang bảo trì' : 'trống'}`}>
      <Text style={[styles.miniCode, { color: colors.textMuted }]} numberOfLines={1}>
        {stall?.code || '—'}
      </Text>
      <Text style={[styles.miniName, { color: colors.textFaint }]} numberOfLines={1}>
        {maintenance ? 'Bảo trì' : 'Trống'}
      </Text>
      <Text style={styles.miniOwner}>Của tôi</Text>
    </View>
  );
}

/** A colleague's stall (or an empty one) shown with the whole zone: faded, the horse in it if any. */
function OtherMini({ stall, onPress }) {
  const state = stallState(stall);
  const horse = stall.occupant?.horse;
  const maintenance = state.key === 'maintenance';
  return (
    <Pressable
      accessibilityRole={horse ? 'button' : undefined}
      accessibilityLabel={`Chuồng ${stall.code}: ${horse?.name || (maintenance ? 'bảo trì' : stall.occupied ? 'có ngựa' : 'trống')}, người khác phụ trách`}
      disabled={!horse}
      onPress={onPress}
      style={({ pressed }) => [styles.mini, styles.miniOther, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.miniEdge, { backgroundColor: state.color, opacity: 0.5 }]} />
      <Text style={[styles.miniCode, { color: colors.textMuted }]} numberOfLines={1}>
        {stall.code}
      </Text>
      <Text style={[styles.miniName, { color: horse ? colors.textMuted : colors.textFaint, fontWeight: horse ? '700' : '600' }]} numberOfLines={1}>
        {horse?.name || (stall.occupied ? 'Có ngựa' : maintenance ? 'Bảo trì' : 'Trống')}
      </Text>
      <Text style={styles.miniOwner} numberOfLines={1}>
        {stall.caretaker?.name ? stall.caretaker.name : horse || stall.occupied ? 'Người khác' : 'Chưa giao'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  panel: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft },
  watchToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.redSoft, backgroundColor: colors.redSoft },
  watchToggleOn: { backgroundColor: colors.red, borderColor: colors.red },
  watchText: { fontSize: 14, fontWeight: '800', color: colors.red },
  zone: { gap: spacing.sm },
  zoneHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 2, paddingVertical: 2 },
  // A folded zone is one tappable bar: its name, its horses, how many to watch.
  zoneHeadClosed: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.white },
  zoneTitle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zoneName: { fontSize: 15, fontWeight: '800', color: colors.forest, flexShrink: 1 },
  zoneWatch: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.redSoft },
  zoneWatchText: { fontSize: 11, fontWeight: '800', color: colors.red },
  wholeToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  wholeToggleOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  wholeText: { fontSize: 12, fontWeight: '700', color: colors.forestLight },
  // Three (or four) tiles a row: each cell is its share of the row, the gap is the cells' own padding.
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -3 },
  cell: { padding: 3 },
  mini: {
    flexGrow: 1,
    minHeight: 92,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.white,
    overflow: 'hidden',
    gap: 1,
  },
  miniWatch: { borderColor: '#fecaca' },
  miniEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  miniEmpty: { borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.cream },
  miniOther: { backgroundColor: colors.graySoft, borderColor: colors.borderSoft },
  miniCode: { fontSize: 12, fontWeight: '800', color: colors.forest, letterSpacing: 0.3, flexShrink: 1 },
  miniName: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  miniHealth: { fontSize: 11, fontWeight: '700' },
  miniWork: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  miniOwner: { fontSize: 10.5, color: colors.textFaint, marginTop: 'auto' },
  legend: { flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: 2 },
  zonePick: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 42, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cream },
  zonePickText: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.forest },
  zonePickCount: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.white },
  pickRowOn: { borderColor: colors.forest, backgroundColor: colors.forestSoft },
  pickTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  legendText: { fontSize: 11.5, color: colors.textMuted },
});
