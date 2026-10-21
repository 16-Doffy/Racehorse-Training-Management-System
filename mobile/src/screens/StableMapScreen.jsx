import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import { Badge, Card, ChipRow, EmptyState, LoadError, Loading, ProgressBar, Row, SearchInput, Segments } from '../components/ui';
import { useRefreshAll, useStableOverview, useStalls, useTasks, useTreatments } from '../hooks/useGroomData';
import {
  HEALTH_STATUS,
  STALL_TYPES,
  TRAINING_LEVEL,
  formatDate,
  getUpcomingCare,
  groupZones,
  isSameDay,
  matchesSearch,
  refId,
  stallState,
  taskState,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const HEALTH_FILTERS = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'eligible', label: 'Đủ điều kiện' },
  { value: 'monitoring', label: 'Cần theo dõi' },
  { value: 'injured', label: 'Chấn thương' },
  { value: 'quarantined', label: 'Cách ly' },
];

const GRID_GAP = 8;

/**
 * The stable as the Manager laid it out (GET /stable/stalls). "Chuồng của tôi" is the groom's working
 * list: each stall they look after, by zone, with what the horse in it needs today. "Khu của tôi" is
 * the map of the zones they work in, every stall of them (empty, under maintenance, a colleague's), so
 * the groom knows who stands next door; the rest of the stable only gets a line. Only the Manager
 * places horses and gives stalls; this screen only shows.
 */
export default function StableMapScreen({ navigation }) {
  const [view, setView] = useState('mine');
  const [health, setHealth] = useState('all');
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);

  const { stalls, zones, myStalls, myUnplaced, isLoading, isError, refetch } = useStalls();
  const { horseById, lockedHorseIds } = useStableOverview();
  const { tasks } = useTasks();
  const { treatments } = useTreatments();
  const refreshAll = useRefreshAll();

  const todayByHorse = useMemo(() => {
    const map = new Map();
    tasks
      .filter((t) => isSameDay(t.scheduledDate, new Date()))
      .forEach((t) => {
        const id = refId(t.horse);
        const entry = map.get(id) || { total: 0, done: 0, vet: 0 };
        const state = taskState(t);
        // Work the trainer called off is not part of the day; a missed dose is no longer "to do".
        if (state?.key !== 'cancelled') entry.total += 1;
        if (t.status === 'completed') entry.done += 1;
        if (t.source === 'vet' && state?.open) entry.vet += 1;
        map.set(id, entry);
      });
    return map;
  }, [tasks]);

  const treatmentByHorse = useMemo(() => {
    const map = new Map();
    treatments.filter((t) => t.status === 'ongoing').forEach((t) => map.set(refId(t.horse), t));
    return map;
  }, [treatments]);

  const myHorseIds = useMemo(
    () => new Set([...myStalls.map((s) => refId(s.occupant?.horse)), ...myUnplaced.map((u) => refId(u.horse))]),
    [myStalls, myUnplaced]
  );
  const myCount = myStalls.length + myUnplaced.length;
  const attention = [...myStalls.map((s) => s.occupant?.horse), ...myUnplaced.map((u) => u.horse)].filter(
    (h) => h && h.healthStatus && h.healthStatus !== 'eligible'
  ).length;

  // The groom's own stalls on the map: those given to them, empty ones included.
  const myStallIds = useMemo(() => new Set(myStalls.map((s) => s._id)), [myStalls]);

  // The working list: the groom's stalls by zone, narrowed by health and search. An empty stall has no
  // health, so a health filter leaves it out.
  const keep = (horse, text) => {
    if (health !== 'all' && (!horse || (horse.healthStatus || 'eligible') !== health)) return false;
    return matchesSearch(`${horse?.name || ''} ${text}`, search);
  };
  const myZones = groupZones(myStalls.filter((s) => keep(s.occupant?.horse, `${s.code} ${s.zoneName || ''}`)));
  const myLoose = myUnplaced.filter((u) => keep(u.horse, u.stableBlock || ''));

  // "Khu của tôi": only the zones the groom has a stall in, each in full so they know who stands next
  // door. The rest of the stable is someone else's work; it only gets a line.
  const myZoneList = zones.filter((z) => z.stalls.some((s) => myStallIds.has(s._id)));
  const otherZones = zones.filter((z) => !myZoneList.includes(z));
  const shownZones = zoneFilter === 'all' ? myZoneList : myZoneList.filter((z) => z.key === zoneFilter);
  const zoneChips = [
    { value: 'all', label: 'Tất cả khu của tôi' },
    ...myZoneList.map((z) => ({ value: z.key, label: z.name, count: z.stalls.length })),
  ];

  const openHorse = (horse) => {
    if (horse?._id) navigation.navigate('HorseDetail', { horseId: horse._id, name: horse.name });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  const columns = gridWidth >= 560 ? 5 : gridWidth >= 400 ? 4 : 3;
  const tileWidth = gridWidth ? Math.floor((gridWidth - GRID_GAP * (columns - 1)) / columns) : '31%';

  const horseCard = ({ key, horse, plate, place, typeKey }) => {
    const horseId = refId(horse);
    const info = horseById.get(horseId);
    const status = HEALTH_STATUS[horse?.healthStatus] || HEALTH_STATUS.eligible;
    const counts = todayByHorse.get(horseId);
    const treatment = treatmentByHorse.get(horseId);
    const care = getUpcomingCare(info, 7)[0];
    const clearance = info?.trainingClearance;
    const clearanceCfg = clearance?.restricted ? TRAINING_LEVEL[clearance.level] : null;
    const percent = counts?.total ? Math.round((counts.done / counts.total) * 100) : 0;
    const type = STALL_TYPES[typeKey];

    return (
      <Card key={key} style={styles.stall} onPress={() => openHorse(horse)}>
        <Row style={{ gap: spacing.md, alignItems: 'flex-start' }}>
          <View style={[styles.plate, !plate && styles.plateLoose]}>
            {plate ? (
              <Text style={styles.plateCode} numberOfLines={1} adjustsFontSizeToFit>
                {plate}
              </Text>
            ) : (
              <Icon name="stall" size={20} color={colors.textMuted} />
            )}
          </View>

          <View style={{ flex: 1, gap: 3 }}>
            <Row style={{ gap: 6, flexWrap: 'wrap' }}>
              <Text style={font.h2}>{horse?.name || 'Không rõ'}</Text>
              {lockedHorseIds.has(horseId) ? <Icon name="lock" size={14} color={colors.red} /> : null}
            </Row>
            <Text style={font.small} numberOfLines={2}>
              {[place, info?.breed, info?.weightKg ? `${info.weightKg}kg` : null].filter(Boolean).join(' · ')}
            </Text>
            {type?.color ? <Badge label={type.label} color={type.color} bg={type.bg} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>

          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Badge label={status.label} color={status.color} bg={status.bg} dot />
            <Icon name="chevronRight" size={16} color={colors.textFaint} />
          </View>
        </Row>

        {/* What is happening with this horse today, without opening it. */}
        {(counts || treatment || care || clearanceCfg) && (
          <View style={styles.stallFooter}>
            {counts ? (
              <View style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={font.small}>Việc hôm nay</Text>
                  <Text style={[font.small, { fontWeight: '700', color: colors.forest }]}>
                    {counts.done}/{counts.total}
                  </Text>
                </Row>
                <ProgressBar percent={percent} tint={colors.forest} track={colors.graySoft} height={6} />
              </View>
            ) : null}

            <Row style={{ gap: spacing.sm, flexWrap: 'wrap', marginTop: counts ? spacing.sm : 0 }}>
              {clearanceCfg ? <Badge label={clearanceCfg.label} color={clearanceCfg.color} bg={clearanceCfg.bg} /> : null}
              {counts?.vet ? <Badge label={`${counts.vet} y lệnh`} color={colors.red} bg={colors.redSoft} /> : null}
              {treatment ? (
                <Badge
                  label={`Đang điều trị${treatment.medications?.length ? ` · ${treatment.medications.length} thuốc` : ''}`}
                  color={colors.purple}
                  bg={colors.purpleSoft}
                />
              ) : null}
              {care ? (
                <Badge
                  label={`${care.label}: ${care.daysLeft < 0 ? 'quá hạn' : care.daysLeft === 0 ? 'hôm nay' : `${care.daysLeft} ngày`}`}
                  color={care.daysLeft <= 0 ? colors.red : colors.textMuted}
                  bg={care.daysLeft <= 0 ? colors.redSoft : colors.graySoft}
                />
              ) : null}
            </Row>
          </View>
        )}
      </Card>
    );
  };

  // A stall given to the groom with no horse in it yet (or under maintenance): kept ready, nothing to do.
  const emptyStallCard = (stall) => {
    const maintenance = stall.status === 'maintenance';
    const type = STALL_TYPES[stall.type];
    return (
      <Card key={stall._id} style={[styles.stall, styles.stallEmpty]}>
        <Row style={{ gap: spacing.md, alignItems: 'center' }}>
          <View style={[styles.plate, styles.plateEmpty]}>
            <Text style={[styles.plateCode, { color: colors.forest }]} numberOfLines={1} adjustsFontSizeToFit>
              {stall.code}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[font.h3, { color: colors.textMuted }]}>{maintenance ? 'Đang bảo trì' : 'Chuồng trống'}</Text>
            <Text style={font.small} numberOfLines={2}>
              {maintenance
                ? stall.maintenanceNote || 'Không xếp ngựa vào được cho tới khi sửa xong.'
                : 'Bạn phụ trách chuồng này. Ngựa xếp vào đây sẽ do bạn chăm sóc.'}
            </Text>
            {type?.color ? <Badge label={type.label} color={type.color} bg={type.bg} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        </Row>
      </Card>
    );
  };

  const zoneHeader = (zone, right) => (
    <Row style={{ justifyContent: 'space-between', paddingHorizontal: spacing.xs, gap: spacing.sm }}>
      <Row style={{ gap: 6, flex: 1 }}>
        <Icon name="stall" size={16} color={colors.forestLight} />
        <Text style={font.h2} numberOfLines={1}>
          {zone.name}
        </Text>
        {zone.purpose ? (
          <Text style={[font.small, { flexShrink: 1 }]} numberOfLines={1}>
            · {zone.purpose}
          </Text>
        ) : null}
      </Row>
      <Text style={font.small}>{right}</Text>
    </Row>
  );

  const tile = (stall) => {
    const state = stallState(stall);
    const horse = stall.occupant?.horse;
    const mine = myStallIds.has(stall._id) || (!!horse && myHorseIds.has(refId(horse)));
    const type = STALL_TYPES[stall.type];
    const maintenance = state.key === 'maintenance';
    const name = horse?.name || (stall.occupied ? 'Có ngựa' : maintenance ? 'Bảo trì' : 'Trống');
    return (
      <Pressable
        key={stall._id}
        accessibilityRole={horse ? 'button' : undefined}
        accessibilityLabel={`Chuồng ${stall.code}: ${name}${horse ? `, ${state.label}` : ''}${mine ? ', của tôi' : ''}`}
        disabled={!horse}
        onPress={() => openHorse(horse)}
        style={({ pressed }) => [
          styles.tile,
          { width: tileWidth },
          maintenance && styles.tileMaintenance,
          !stall.occupied && !maintenance && styles.tileEmpty,
          mine && styles.tileMine,
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={[styles.tileStripe, { backgroundColor: state.color }]} />
        <Row style={{ justifyContent: 'space-between', gap: 4 }}>
          <Text style={styles.tileCode} numberOfLines={1}>
            {stall.code}
          </Text>
          {lockedHorseIds.has(refId(horse)) ? <Icon name="lock" size={11} color={colors.red} /> : null}
        </Row>
        <Text style={[styles.tileName, !horse && { color: colors.textFaint, fontWeight: '600' }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.tileMeta} numberOfLines={1}>
          {mine ? 'Của tôi' : maintenance ? stall.maintenanceNote || 'Không xếp ngựa' : type?.color ? type.label : horse ? state.label : ' '}
        </Text>
      </Pressable>
    );
  };

  const legend = (
    <Card style={styles.legend}>
      <Text style={font.tiny}>Chú thích</Text>
      <Row style={{ flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm }}>
        {Object.values(HEALTH_STATUS).map((s) => (
          <Row key={s.label} style={{ gap: 5 }}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={font.small}>{s.label}</Text>
          </Row>
        ))}
        <Row style={{ gap: 5 }}>
          <View style={[styles.dot, { backgroundColor: colors.textFaint }]} />
          <Text style={font.small}>Trống</Text>
        </Row>
        <Row style={{ gap: 5 }}>
          <View style={[styles.dot, { backgroundColor: '#b45309' }]} />
          <Text style={font.small}>Bảo trì</Text>
        </Row>
        <Row style={{ gap: 5 }}>
          <View style={styles.mineSwatch} />
          <Text style={font.small}>Chuồng của tôi</Text>
        </Row>
        <Row style={{ gap: 5 }}>
          <Icon name="lock" size={13} color={colors.red} />
          <Text style={font.small}>Khóa huấn luyện</Text>
        </Row>
      </Row>
    </Card>
  );

  const filtersOn = !!search || health !== 'all';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="Chuồng trại"
        subtitle={`${myCount} chuồng của tôi${myZoneList.length ? ` · ${myZoneList.map((z) => z.name).join(', ')}` : ''}${attention ? ` · ${attention} cần chú ý` : ''}`}
      />

      <View style={styles.toolbar}>
        <Segments
          options={[
            { value: 'mine', label: 'Chuồng của tôi', icon: 'stall', count: myCount },
            { value: 'map', label: 'Khu của tôi', icon: 'stable' },
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'mine' ? (
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Tìm ngựa, mã chuồng, khu..." />
            <ChipRow options={HEALTH_FILTERS} value={health} onChange={setHealth} size="sm" />
          </>
        ) : myZoneList.length > 1 ? (
          <ChipRow options={zoneChips} value={zoneFilter} onChange={setZoneFilter} size="sm" />
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <Card>
            <LoadError text="Không tải được sơ đồ chuồng" onRetry={refetch} />
          </Card>
        ) : view === 'mine' ? (
          myZones.length === 0 && myLoose.length === 0 ? (
            <Card>
              <EmptyState
                icon="stall"
                text={filtersOn ? 'Không có chuồng nào khớp bộ lọc' : 'Bạn chưa được phân công chuồng nào'}
                hint="Quản lý CLB là người xếp chuồng và người phụ trách."
              />
            </Card>
          ) : (
            <>
              {myZones.map((zone) => (
                <View key={zone.key} style={{ gap: spacing.sm }}>
                  {zoneHeader(zone, `${zone.stalls.length} chuồng`)}
                  {zone.stalls.map((s) =>
                    s.occupant?.horse
                      ? horseCard({
                          key: s._id,
                          horse: s.occupant.horse,
                          plate: s.code,
                          place: s.occupant.since ? `Ở đây từ ${formatDate(s.occupant.since)}` : null,
                          typeKey: s.type,
                        })
                      : emptyStallCard(s)
                  )}
                </View>
              ))}
              {myLoose.length > 0 && (
                <View style={{ gap: spacing.sm }}>
                  {zoneHeader({ name: 'Chưa có trên sơ đồ', purpose: '' }, `${myLoose.length} ngựa`)}
                  <Text style={[font.small, { paddingHorizontal: spacing.xs }]}>
                    Chuồng ghi tay từ trước khi có sơ đồ. Quản lý CLB sẽ xếp lại vào một chuồng có mã.
                  </Text>
                  {myLoose.map((u) =>
                    horseCard({ key: u.assignment || refId(u.horse), horse: u.horse, plate: null, place: u.stableBlock ? `Chuồng ghi tay: ${u.stableBlock}` : null })
                  )}
                </View>
              )}
            </>
          )
        ) : myZoneList.length === 0 ? (
          <Card>
            <EmptyState
              icon="stall"
              text={stalls.length ? 'Bạn chưa được giao chuồng nào trên sơ đồ' : 'Trại chưa có sơ đồ chuồng'}
              hint={stalls.length ? 'Quản lý CLB giao từng chuồng cho bạn trên web.' : 'Quản lý CLB lập các khu và chuồng trên web.'}
            />
          </Card>
        ) : (
          <>
            {legend}
            {shownZones.map((zone) => (
              <Card key={zone.key} style={styles.zone}>
                {zoneHeader(zone, `${zone.stalls.filter((s) => myStallIds.has(s._id)).length}/${zone.stalls.length} chuồng của tôi`)}
                <View style={styles.grid} onLayout={(e) => setGridWidth(Math.floor(e.nativeEvent.layout.width))}>
                  {zone.stalls.map(tile)}
                </View>
              </Card>
            ))}
            {zoneFilter === 'all' && otherZones.length > 0 && (
              <Text style={[font.small, { textAlign: 'center', paddingHorizontal: spacing.lg }]}>
                Trại còn {otherZones.length} khu khác ({otherZones.map((z) => z.name).join(', ')}) do người khác phụ trách.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
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
  legend: { padding: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mineSwatch: { width: 14, height: 10, borderRadius: 3, borderWidth: 2, borderColor: colors.gold },
  stall: { padding: spacing.md },
  stallFooter: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  plate: {
    width: 58,
    minHeight: 46,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateLoose: { backgroundColor: colors.graySoft },
  plateEmpty: { backgroundColor: colors.goldSoft },
  stallEmpty: { borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.cream },
  plateCode: { color: colors.gold, fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
  zone: { padding: spacing.md, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tile: {
    minHeight: 64,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
    gap: 2,
  },
  tileEmpty: { backgroundColor: colors.graySoft, borderColor: colors.borderSoft },
  tileMaintenance: { backgroundColor: '#fef3c7', borderColor: '#f59e0b', borderStyle: 'dashed' },
  tileMine: { borderColor: colors.gold, borderWidth: 2 },
  tileStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  tileCode: { fontSize: 13, fontWeight: '800', color: colors.forest, letterSpacing: 0.3 },
  tileName: { fontSize: 12, fontWeight: '700', color: colors.text },
  tileMeta: { fontSize: 10.5, color: colors.textMuted },
});
