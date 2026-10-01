import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import AppHeader from '../components/AppHeader';
import { Badge, Card, ChipRow, EmptyState, HorseAvatar, Loading, ProgressBar, Row, SearchInput } from '../components/ui';
import { useRefreshAll, useStableOverview, useTasks, useTreatments } from '../hooks/useGroomData';
import { HEALTH_STATUS, TRAINING_LEVEL, getUpcomingCare, isSameDay, matchesSearch, parseStableBlock, refId } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const SCOPES = [
  { value: 'mine', label: 'Chuồng của tôi' },
  { value: 'all', label: 'Toàn trại' },
];

const HEALTH_FILTERS = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'eligible', label: 'Đủ điều kiện' },
  { value: 'monitoring', label: 'Cần theo dõi' },
  { value: 'injured', label: 'Chấn thương' },
  { value: 'quarantined', label: 'Cách ly' },
];

export default function StableMapScreen({ navigation }) {
  const [scope, setScope] = useState('mine');
  const [health, setHealth] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { assignments, myAssignments, myHorseIds, horseById, lockedHorseIds, isLoading } = useStableOverview();
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
        entry.total += 1;
        if (t.status === 'completed') entry.done += 1;
        if (t.source === 'vet' && t.status === 'pending') entry.vet += 1;
        map.set(id, entry);
      });
    return map;
  }, [tasks]);

  const treatmentByHorse = useMemo(() => {
    const map = new Map();
    treatments.filter((t) => t.status === 'ongoing').forEach((t) => map.set(refId(t.horse), t));
    return map;
  }, [treatments]);

  const source = scope === 'mine' ? myAssignments : assignments;
  const filtered = source
    .filter((a) => {
      const horse = horseById.get(refId(a.horse));
      if (health !== 'all' && horse?.healthStatus !== health) return false;
      return matchesSearch(`${a.horse?.name || ''} ${a.stableBlock || ''} ${a.assignedCaretaker?.name || ''}`, search);
    })
    .sort((a, b) => a.stableBlock.localeCompare(b.stableBlock, 'vi', { numeric: true }));

  const blocks = useMemo(() => {
    const map = new Map();
    filtered.forEach((a) => {
      const { block } = parseStableBlock(a.stableBlock);
      map.set(block, [...(map.get(block) || []), a]);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [filtered]);

  const attention = myAssignments.filter((a) => {
    const horse = horseById.get(refId(a.horse));
    return horse && horse.healthStatus !== 'eligible';
  }).length;

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="Sơ đồ chuồng trại"
        subtitle={`${myAssignments.length} chuồng của tôi · ${assignments.length} toàn trại${attention ? ` · ${attention} cần chú ý` : ''}`}
      />

      <View style={styles.toolbar}>
        <SearchInput value={search} onChange={setSearch} placeholder="Tìm ngựa, ô chuồng, người phụ trách..." />
        <ChipRow options={SCOPES} value={scope} onChange={setScope} size="sm" />
        <ChipRow options={HEALTH_FILTERS} value={health} onChange={setHealth} size="sm" />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
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
              <Icon name="lock" size={13} color={colors.red} />
              <Text style={font.small}>Đang khóa huấn luyện</Text>
            </Row>
          </Row>
        </Card>

        {isLoading ? (
          <Loading />
        ) : blocks.length === 0 ? (
          <Card>
            <EmptyState
              icon="stall"
              text={search || health !== 'all' ? 'Không có chuồng nào khớp bộ lọc' : 'Bạn chưa được phân công chuồng nào'}
              hint="Quản lý CLB là người xếp chuồng và người phụ trách."
            />
          </Card>
        ) : (
          blocks.map(([block, stalls]) => (
            <View key={block} style={{ gap: spacing.sm }}>
              <Row style={{ justifyContent: 'space-between', paddingHorizontal: spacing.xs }}>
                <Row style={{ gap: 6 }}>
                  <Icon name="stall" size={16} color={colors.forestLight} />
                  <Text style={font.h2}>Khu {block}</Text>
                </Row>
                <Text style={font.small}>{stalls.length} chuồng</Text>
              </Row>

              {stalls.map((a) => {
                const horseId = refId(a.horse);
                const horse = horseById.get(horseId);
                const status = HEALTH_STATUS[horse?.healthStatus] || HEALTH_STATUS.eligible;
                const mine = myHorseIds.has(horseId);
                const counts = todayByHorse.get(horseId);
                const treatment = treatmentByHorse.get(horseId);
                const care = getUpcomingCare(horse, 7)[0];
                const clearance = horse?.trainingClearance;
                const clearanceCfg = clearance?.restricted ? TRAINING_LEVEL[clearance.level] : null;
                const percent = counts?.total ? Math.round((counts.done / counts.total) * 100) : 0;

                return (
                  <Card
                    key={a._id}
                    style={[styles.stall, mine && styles.stallMine]}
                    onPress={() => navigation.navigate('HorseDetail', { horseId, name: a.horse?.name })}
                  >
                    <Row style={{ gap: spacing.md, alignItems: 'flex-start' }}>
                      <HorseAvatar name={a.horse?.name} size={46} tone={mine ? 'forest' : 'gold'} />
                      <View style={{ flex: 1, gap: 3 }}>
                        <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                          <Text style={font.h2}>{a.horse?.name || 'Không rõ'}</Text>
                          {mine ? <Badge label="Của tôi" color={colors.forest} bg={colors.goldSoft} /> : null}
                          {lockedHorseIds.has(horseId) ? <Icon name="lock" size={14} color={colors.red} /> : null}
                        </Row>

                        <Text style={font.small}>
                          {parseStableBlock(a.stableBlock).stall}
                          {horse?.breed ? ` · ${horse.breed}` : ''}
                          {horse?.weightKg ? ` · ${horse.weightKg}kg` : ''}
                        </Text>

                        <Row style={{ gap: 5 }}>
                          <Icon name="person" size={12} color={colors.textFaint} />
                          <Text style={font.small}>{a.assignedCaretaker?.name || 'Chưa phân công'}</Text>
                        </Row>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <Badge label={status.label} color={status.color} bg={status.bg} dot />
                        <Icon name="chevronRight" size={16} color={colors.textFaint} />
                      </View>
                    </Row>

                    {/* What is happening with this horse today, without opening it. */}
                    {(counts || treatment || care) && (
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
                          {clearanceCfg ? (
                            <Badge label={clearanceCfg.label} color={clearanceCfg.color} bg={clearanceCfg.bg} />
                          ) : null}
                          {counts?.vet ? (
                            <Badge label={`${counts.vet} y lệnh`} color={colors.red} bg={colors.redSoft} />
                          ) : null}
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
              })}
            </View>
          ))
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
  stall: { padding: spacing.md },
  stallMine: { borderColor: colors.gold, borderWidth: 2 },
  stallFooter: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft },
});
