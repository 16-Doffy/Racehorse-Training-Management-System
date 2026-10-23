import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import { ChipRow, EmptyState, LoadError, Loading, ProgressBar, Row, SearchInput, Segments } from '../components/ui';
import { useRefreshAll, useStableOverview, useStalls, useTasks, useTreatments } from '../hooks/useGroomData';
import { HEALTH_STATUS, STALL_TYPES, TRAINING_LEVEL, getUpcomingCare, isSameDay, matchesSearch, refId, stallState, taskState } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const GAP = 10;

/**
 * The groom's stalls (GET /stable/stalls), as the Manager laid them out. "Chuồng của tôi" is a grid of
 * the stalls they look after, by zone — each tile the horse in it, how it is, how far today's work
 * on it has got, and what to watch (a treatment, a training limit, care due) — with the ones that
 * need attention one tap away. "Sơ đồ khu" is the map of the zones they work in, every stall, so they
 * know who stands next door. Only the Manager places horses and gives stalls; this screen only shows.
 */
export default function StableMapScreen({ navigation }) {
  const [view, setView] = useState('mine');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [width, setWidth] = useState(0);

  const { stalls, zones, myStalls, myUnplaced, isLoading, isError, refetch } = useStalls();
  const { horseById, lockedHorseIds } = useStableOverview();
  const { tasks } = useTasks();
  const { treatments } = useTreatments();
  const refreshAll = useRefreshAll();

  // Today's work per horse: how much is done of what is planned, and how much of it is the vet's.
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

  // Every horse of mine as one entry: on the map (its stall) or not yet (a hand-written stall).
  const entries = useMemo(
    () => [
      ...myStalls.map((s) => ({ key: s._id, stall: s, horse: s.occupant?.horse || null, zone: s.zone, zoneName: s.zoneName, code: s.code })),
      ...myUnplaced.map((u) => ({ key: u.assignment || refId(u.horse), stall: null, horse: u.horse, zone: '~', zoneName: 'Chưa có trên sơ đồ', code: null, written: u.stableBlock })),
    ],
    [myStalls, myUnplaced]
  );

  const facts = (horse) => {
    const id = refId(horse);
    const info = horseById.get(id);
    const clearance = info?.trainingClearance;
    return {
      info,
      treatment: treatmentByHorse.get(id),
      restricted: clearance?.restricted ? TRAINING_LEVEL[clearance.level] : null,
      locked: lockedHorseIds.has(id),
      care: getUpcomingCare(info, 7)[0],
      work: todayByHorse.get(id),
    };
  };
  const needsCare = (horse) => {
    if (!horse) return false;
    const f = facts(horse);
    return (horse.healthStatus && horse.healthStatus !== 'eligible') || !!f.restricted || f.locked || (f.care && f.care.daysLeft <= 0);
  };

  const horses = entries.filter((e) => e.horse);
  const attention = horses.filter((e) => needsCare(e.horse)).length;
  const treating = horses.filter((e) => treatmentByHorse.has(refId(e.horse))).length;
  const workLeft = horses.reduce((sum, e) => sum + (todayByHorse.get(refId(e.horse))?.open || 0), 0);

  const shown = entries.filter((e) => {
    if (filter === 'attention' && !needsCare(e.horse)) return false;
    if (filter === 'treatment' && !(e.horse && treatmentByHorse.has(refId(e.horse)))) return false;
    if (filter === 'empty' && e.horse) return false;
    return matchesSearch(`${e.horse?.name || ''} ${e.code || ''} ${e.zoneName || ''} ${e.written || ''}`, search);
  });
  const groups = [];
  for (const e of shown) {
    let g = groups.find((x) => x.key === e.zone);
    if (!g) groups.push((g = { key: e.zone, name: e.zoneName || `Khu ${e.zone}`, items: [] }));
    g.items.push(e);
  }

  const myStallIds = useMemo(() => new Set(myStalls.map((s) => s._id)), [myStalls]);
  const myHorseIds = useMemo(() => new Set(horses.map((e) => refId(e.horse))), [horses]);
  const myZoneList = zones.filter((z) => z.stalls.some((s) => myStallIds.has(s._id)));
  const otherZones = zones.filter((z) => !myZoneList.includes(z));
  const shownZones = zoneFilter === 'all' ? myZoneList : myZoneList.filter((z) => z.key === zoneFilter);

  const openHorse = (horse) => horse?._id && navigation.navigate('HorseDetail', { horseId: horse._id, name: horse.name });
  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const tileWidth = width ? Math.floor((width - GAP) / 2) : '48%';
  // The zone map sits in a padded panel: its tiles share what is left inside it.
  const columns = width >= 560 ? 5 : width >= 400 ? 4 : 3;
  const mapTile = width ? Math.floor((width - spacing.md * 2 - 2 - 8 * (columns - 1)) / columns) : '31%';
  const emptyCount = entries.length - horses.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="Chuồng của tôi"
        subtitle={`${horses.length} ngựa · ${entries.length} chuồng${myZoneList.length ? ` · ${myZoneList.map((z) => z.name).join(', ')}` : ''}`}
      />

      <View style={styles.toolbar}>
        <Row style={{ gap: spacing.sm }}>
          <Stat label="Ngựa" value={horses.length} icon="stable" />
          <Stat label="Cần chú ý" value={attention} icon="warning" tone={attention ? colors.red : colors.green} active={filter === 'attention'} onPress={() => { setView('mine'); setFilter((f) => (f === 'attention' ? 'all' : 'attention')); }} />
          <Stat label="Việc còn lại" value={workLeft} icon="care" tone={workLeft ? colors.orange : colors.green} onPress={() => navigation.navigate('Chăm sóc', { segment: 'chores', at: Date.now() })} />
        </Row>
        <Segments
          options={[
            { value: 'mine', label: 'Chuồng của tôi', icon: 'stall' },
            { value: 'map', label: 'Sơ đồ khu', icon: 'stable' },
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'mine' ? (
          <>
            {entries.length > 6 ? <SearchInput value={search} onChange={setSearch} placeholder="Tìm ngựa, mã chuồng..." /> : null}
            <ChipRow
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Tất cả', count: entries.length },
                { value: 'attention', label: 'Cần chú ý', count: attention },
                { value: 'treatment', label: 'Đang điều trị', count: treating },
                ...(emptyCount ? [{ value: 'empty', label: 'Chuồng trống', count: emptyCount }] : []),
              ]}
            />
          </>
        ) : myZoneList.length > 1 ? (
          <ChipRow
            size="sm"
            value={zoneFilter}
            onChange={setZoneFilter}
            options={[{ value: 'all', label: 'Mọi khu của tôi' }, ...myZoneList.map((z) => ({ value: z.key, label: z.name, count: z.stalls.length }))]}
          />
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width - spacing.lg * 2))}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <LoadError text="Không tải được sơ đồ chuồng" onRetry={refetch} />
        ) : view === 'mine' ? (
          groups.length === 0 ? (
            <View style={styles.panel}>
              <EmptyState
                icon="stall"
                text={entries.length ? 'Không có chuồng nào khớp' : 'Bạn chưa được phân công chuồng nào'}
                hint={entries.length ? 'Thử bỏ bộ lọc hoặc xoá từ khoá.' : 'Quản lý CLB là người xếp chuồng và người phụ trách.'}
              />
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.key} style={{ gap: spacing.sm }}>
                <Row style={styles.zoneHead}>
                  <Text style={styles.zoneName}>{g.name}</Text>
                  <Text style={font.small}>{g.items.length} chuồng</Text>
                </Row>
                {g.key === '~' ? <Text style={[font.small, { paddingHorizontal: 2 }]}>Chuồng ghi tay từ trước khi có sơ đồ — Quản lý CLB sẽ xếp lại vào chuồng có mã.</Text> : null}
                <View style={styles.grid}>
                  {g.items.map((e) =>
                    e.horse ? (
                      <HorseTile key={e.key} entry={e} facts={facts(e.horse)} width={tileWidth} onPress={() => openHorse(e.horse)} />
                    ) : (
                      <EmptyTile key={e.key} stall={e.stall} width={tileWidth} />
                    )
                  )}
                </View>
              </View>
            ))
          )
        ) : myZoneList.length === 0 ? (
          <View style={styles.panel}>
            <EmptyState
              icon="stall"
              text={stalls.length ? 'Bạn chưa được giao chuồng nào trên sơ đồ' : 'Trại chưa có sơ đồ chuồng'}
              hint={stalls.length ? 'Quản lý CLB giao từng chuồng cho bạn trên web.' : 'Quản lý CLB lập các khu và chuồng trên web.'}
            />
          </View>
        ) : (
          <>
            <Row style={styles.legend}>
              {[...Object.values(HEALTH_STATUS), { label: 'Trống', color: colors.textFaint }, { label: 'Bảo trì', color: '#b45309' }].map((s) => (
                <Row key={s.label} style={{ gap: 4 }}>
                  <View style={[styles.dot, { backgroundColor: s.color }]} />
                  <Text style={styles.legendText}>{s.label}</Text>
                </Row>
              ))}
              <Row style={{ gap: 4 }}>
                <View style={styles.mineSwatch} />
                <Text style={styles.legendText}>Của tôi</Text>
              </Row>
            </Row>
            {shownZones.map((zone) => (
              <View key={zone.key} style={[styles.panel, { padding: spacing.md, gap: spacing.md }]}>
                <Row style={{ justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text style={styles.zoneName} numberOfLines={1}>
                    {zone.name}
                    {zone.purpose ? <Text style={font.small}> · {zone.purpose}</Text> : null}
                  </Text>
                  <Text style={font.small}>
                    {zone.stalls.filter((s) => myStallIds.has(s._id)).length}/{zone.stalls.length} của tôi
                  </Text>
                </Row>
                <View style={[styles.grid, { gap: 8 }]}>
                  {zone.stalls.map((stall) => (
                    <MapTile
                      key={stall._id}
                      stall={stall}
                      width={mapTile}
                      mine={myStallIds.has(stall._id) || (!!stall.occupant?.horse && myHorseIds.has(refId(stall.occupant.horse)))}
                      locked={lockedHorseIds.has(refId(stall.occupant?.horse))}
                      onPress={() => openHorse(stall.occupant?.horse)}
                    />
                  ))}
                </View>
              </View>
            ))}
            {zoneFilter === 'all' && otherZones.length > 0 ? (
              <Text style={[font.small, { textAlign: 'center', paddingHorizontal: spacing.lg }]}>
                Trại còn {otherZones.length} khu khác ({otherZones.map((z) => z.name).join(', ')}) do người khác phụ trách.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, icon, tone = colors.forest, active, onPress }) {
  const body = (
    <>
      <Row style={{ gap: 5 }}>
        <Icon name={icon} size={14} color={tone} />
        <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
      </Row>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  if (!onPress) return <View style={styles.stat}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={({ pressed }) => [styles.stat, active && styles.statOn, pressed && { opacity: 0.7 }]}>
      {body}
    </Pressable>
  );
}

/** One of my horses in its stall: health at the top edge, what to watch, and today's work on it. */
function HorseTile({ entry, facts, width, onPress }) {
  const { horse, code, written } = entry;
  const status = HEALTH_STATUS[horse.healthStatus] || HEALTH_STATUS.eligible;
  const { info, treatment, restricted, locked, care, work } = facts;
  const tags = [
    restricted ? { icon: 'lock', label: restricted.label, color: restricted.color } : locked ? { icon: 'lock', label: 'Khóa tập', color: colors.red } : null,
    treatment ? { icon: 'medication', label: `Điều trị${treatment.medications?.length ? ` · ${treatment.medications.length} thuốc` : ''}`, color: colors.purple } : null,
    care ? { icon: care.icon, label: `${care.label} ${care.daysLeft < 0 ? 'quá hạn' : care.daysLeft === 0 ? 'hôm nay' : `${care.daysLeft} ngày`}`, color: care.daysLeft <= 0 ? colors.red : colors.textMuted } : null,
  ].filter(Boolean);
  const percent = work?.total ? Math.round((work.done / work.total) * 100) : 0;
  const type = STALL_TYPES[entry.stall?.type];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${horse.name}, chuồng ${code || written || 'chưa có'}, ${status.label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width }, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.tileTop, { backgroundColor: status.color }]} />
      <Row style={{ justifyContent: 'space-between', gap: 6 }}>
        <View style={[styles.plate, !code && styles.plateLoose]}>
          <Text style={[styles.plateText, !code && { color: colors.textMuted }]} numberOfLines={1}>
            {code || 'Ghi tay'}
          </Text>
        </View>
        <View style={[styles.health, { backgroundColor: status.bg }]}>
          <Text style={[styles.healthText, { color: status.color }]} numberOfLines={1}>
            {status.label}
          </Text>
        </View>
      </Row>
      <Text style={styles.tileName} numberOfLines={1}>
        {horse.name}
      </Text>
      <Text style={styles.tileMeta} numberOfLines={1}>
        {[type?.color ? type.label : null, info?.breed, info?.weightKg ? `${info.weightKg} kg` : null].filter(Boolean).join(' · ') || (written ? `Chuồng: ${written}` : ' ')}
      </Text>
      <View style={styles.tags}>
        {tags.slice(0, 2).map((t) => (
          <Row key={t.label} style={{ gap: 4 }}>
            <Icon name={t.icon} size={12} color={t.color} />
            <Text style={[styles.tagText, { color: t.color }]} numberOfLines={1}>
              {t.label}
            </Text>
          </Row>
        ))}
        {tags.length === 0 ? <Text style={[styles.tagText, { color: colors.textFaint }]}>Không có gì cần lưu ý</Text> : null}
      </View>
      <View style={{ gap: 4, marginTop: 'auto' }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={styles.workLabel}>Việc hôm nay</Text>
          <Text style={[styles.workValue, work?.open ? { color: colors.orange } : null]}>{work?.total ? `${work.done}/${work.total}` : '—'}</Text>
        </Row>
        <ProgressBar percent={percent} tint={colors.green} track={colors.graySoft} height={5} />
      </View>
    </Pressable>
  );
}

/** A stall given to me with no horse in it yet, or under maintenance: kept ready, nothing to do. */
function EmptyTile({ stall, width }) {
  const maintenance = stall?.status === 'maintenance';
  return (
    <View style={[styles.tile, styles.tileEmpty, { width }]}>
      <View style={[styles.plate, styles.plateLoose]}>
        <Text style={[styles.plateText, { color: colors.forest }]} numberOfLines={1}>
          {stall?.code || '—'}
        </Text>
      </View>
      <Text style={[styles.tileName, { color: colors.textMuted }]}>{maintenance ? 'Đang bảo trì' : 'Chuồng trống'}</Text>
      <Text style={styles.tileMeta} numberOfLines={3}>
        {maintenance ? stall.maintenanceNote || 'Chưa xếp ngựa được cho tới khi sửa xong.' : 'Ngựa xếp vào đây sẽ do bạn chăm sóc.'}
      </Text>
    </View>
  );
}

/** A stall on the zone map: its code, who is in it, the health colour down its side; mine in gold. */
function MapTile({ stall, width, mine, locked, onPress }) {
  const state = stallState(stall);
  const horse = stall.occupant?.horse;
  const maintenance = state.key === 'maintenance';
  const name = horse?.name || (stall.occupied ? 'Có ngựa' : maintenance ? 'Bảo trì' : 'Trống');
  return (
    <Pressable
      accessibilityRole={horse ? 'button' : undefined}
      accessibilityLabel={`Chuồng ${stall.code}: ${name}${horse ? `, ${state.label}` : ''}${mine ? ', của tôi' : ''}`}
      disabled={!horse}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mapTile,
        { width },
        maintenance && styles.mapTileMaintenance,
        !stall.occupied && !maintenance && styles.mapTileEmpty,
        mine && styles.mapTileMine,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.mapStripe, { backgroundColor: state.color }]} />
      <Row style={{ justifyContent: 'space-between', gap: 4 }}>
        <Text style={styles.mapCode} numberOfLines={1}>
          {stall.code}
        </Text>
        {locked ? <Icon name="lock" size={11} color={colors.red} /> : null}
      </Row>
      <Text style={[styles.mapName, !horse && { color: colors.textFaint, fontWeight: '600' }]} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  toolbar: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  panel: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft },
  stat: { flex: 1, minWidth: 0, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.cream, gap: 1 },
  statOn: { borderColor: colors.red, backgroundColor: colors.redSoft },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11.5, fontWeight: '600', color: colors.textMuted },
  zoneHead: { justifyContent: 'space-between', paddingHorizontal: 2 },
  zoneName: { fontSize: 15, fontWeight: '800', color: colors.forest, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    minHeight: 168,
    padding: spacing.md,
    paddingTop: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.white,
    overflow: 'hidden',
    gap: 4,
  },
  tileTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  tileEmpty: { borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.cream, minHeight: 120 },
  plate: { minWidth: 48, height: 28, paddingHorizontal: 8, borderRadius: 7, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  plateLoose: { backgroundColor: colors.goldSoft },
  plateText: { color: colors.gold, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 },
  health: { flexShrink: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  healthText: { fontSize: 10.5, fontWeight: '800' },
  tileName: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  tileMeta: { fontSize: 11.5, color: colors.textMuted },
  tags: { gap: 3, marginTop: 2 },
  tagText: { fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  workLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  workValue: { fontSize: 12, fontWeight: '800', color: colors.forest },
  legend: { flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: 2 },
  legendText: { fontSize: 11.5, color: colors.textMuted },
  dot: { width: 9, height: 9, borderRadius: 5 },
  mineSwatch: { width: 14, height: 10, borderRadius: 3, borderWidth: 2, borderColor: colors.gold },
  mapTile: { minHeight: 52, paddingVertical: 7, paddingLeft: 11, paddingRight: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, overflow: 'hidden', gap: 2 },
  mapTileEmpty: { backgroundColor: colors.graySoft, borderColor: colors.borderSoft },
  mapTileMaintenance: { backgroundColor: '#fef3c7', borderColor: '#f59e0b', borderStyle: 'dashed' },
  mapTileMine: { borderColor: colors.gold, borderWidth: 2 },
  mapStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  mapCode: { fontSize: 12.5, fontWeight: '800', color: colors.forest, letterSpacing: 0.3 },
  mapName: { fontSize: 11.5, fontWeight: '700', color: colors.text },
});
