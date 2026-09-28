import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Card, ChipGroup, EmptyState, HorseAvatar, Loading, Row, StatTile } from '../components/ui';
import { useFeedings, useRefreshAll, useStableOverview } from '../hooks/useGroomData';
import {
  HEALTH_STATUS,
  MEAL_CONFIG,
  MEAL_ORDER,
  getFeedTypeLabel,
  mealTimeOf,
  parseStableBlock,
  refId,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const SCOPES = [
  { value: 'mine', label: '⭐ Ngựa của tôi' },
  { value: 'all', label: '🐴 Tất cả' },
];

/** Read-only view of the rations the Head Trainer approved, grouped per horse and meal. */
export default function FeedingScreen() {
  const [scope, setScope] = useState('mine');
  const [refreshing, setRefreshing] = useState(false);
  const { feedings, isLoading } = useFeedings();
  const { horses, myHorseIds, assignmentByHorseId } = useStableOverview();
  const refreshAll = useRefreshAll();

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
    .sort((a, b) =>
      (assignmentByHorseId.get(a._id)?.stableBlock || '~').localeCompare(
        assignmentByHorseId.get(b._id)?.stableBlock || '~',
        'vi',
        { numeric: true }
      )
    );

  const scoped = scopedHorses.flatMap((h) => rationsByHorse.get(h._id) || []);
  const approved = scoped.filter((f) => f.approvedBy).length;

  // Which meal is happening now or next, based on each ration's own clock time.
  const nextSlot = useMemo(() => {
    const minutesNow = new Date().getHours() * 60 + new Date().getMinutes();
    const slots = MEAL_ORDER.map((slot) => {
      const time = mealTimeOf(slot, scoped) || MEAL_CONFIG[slot].defaultTime;
      const [hh, mm] = time.split(':').map(Number);
      return { slot, time, minutes: hh * 60 + mm };
    });
    return (slots.find((s) => s.minutes + 60 > minutesNow) || slots[0]).slot;
  }, [scoped]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={font.h1}>Khẩu phần Ăn</Text>
        <Text style={font.small}>Khẩu phần đã được HLV Trưởng duyệt cho từng bữa.</Text>
        <ChipGroup options={SCOPES} value={scope} onChange={setScope} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <Row style={{ gap: spacing.md }}>
          <StatTile label="Ngựa có khẩu phần" value={scopedHorses.filter((h) => rationsByHorse.has(h._id)).length} suffix={`/ ${scopedHorses.length}`} />
          <StatTile label="Đã duyệt" value={approved} tint={colors.green} />
          <StatTile label="Chờ duyệt" value={scoped.length - approved} tint={colors.gold} />
        </Row>

        {isLoading ? (
          <Loading />
        ) : scopedHorses.length === 0 ? (
          <Card>
            <EmptyState emoji="🐴" text="Chưa có ngựa nào trong phạm vi của bạn" />
          </Card>
        ) : (
          scopedHorses.map((horse) => {
            const schedules = rationsByHorse.get(horse._id) || [];
            const health = HEALTH_STATUS[horse.healthStatus];
            const assignment = assignmentByHorseId.get(horse._id);
            return (
              <Card key={horse._id} style={{ gap: spacing.sm }}>
                <Row style={{ gap: spacing.md }}>
                  <HorseAvatar name={horse.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{horse.name}</Text>
                    <Text style={font.small}>
                      {assignment ? parseStableBlock(assignment.stableBlock).stall : 'Chưa xếp chuồng'}
                    </Text>
                  </View>
                  {health ? <Badge label={health.label} color={health.color} bg={health.bg} /> : null}
                </Row>

                {MEAL_ORDER.map((slot) => {
                  const meal = MEAL_CONFIG[slot];
                  const forSlot = schedules.filter((s) => s.mealTime === slot);
                  const isNext = slot === nextSlot;
                  return (
                    <View key={slot} style={[styles.meal, isNext && styles.mealNext]}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={font.h3}>
                          {meal.emoji} {meal.label}
                        </Text>
                        <Badge
                          label={mealTimeOf(slot, schedules) || meal.defaultTime}
                          color={isNext ? colors.forest : colors.textMuted}
                          bg={isNext ? colors.yellowSoft : colors.graySoft}
                        />
                      </Row>
                      {forSlot.length === 0 ? (
                        <Text style={font.small}>Chưa thiết lập khẩu phần</Text>
                      ) : (
                        forSlot.map((s) => (
                          <View key={s._id} style={{ marginTop: 4 }}>
                            {(s.items || []).map((item, index) => {
                              const feed = getFeedTypeLabel(item.type);
                              return (
                                <Row key={index} style={{ justifyContent: 'space-between', paddingVertical: 2 }}>
                                  <Text style={font.body}>
                                    {feed.emoji} {feed.label}
                                  </Text>
                                  <Text style={styles.qty}>{item.quantity}</Text>
                                </Row>
                              );
                            })}
                            {s.approvedBy ? (
                              <Text style={styles.approved}>✓ Duyệt bởi {s.approvedBy.name || 'HLV'}</Text>
                            ) : (
                              <Badge label="Chờ duyệt" color={colors.orange} bg={colors.orangeSoft} />
                            )}
                          </View>
                        ))
                      )}
                    </View>
                  );
                })}
              </Card>
            );
          })
        )}

        {!isLoading && scoped.length === 0 && scopedHorses.length > 0 ? (
          <Card>
            <EmptyState
              emoji="🍽️"
              text="Chưa có khẩu phần nào trên hệ thống"
              hint="HLV Trưởng hoặc Quản lý CLB là người lập và duyệt khẩu phần."
            />
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  meal: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radius.sm, padding: spacing.md, backgroundColor: colors.cream },
  mealNext: { borderColor: colors.gold, backgroundColor: '#fefce8' },
  qty: { fontWeight: '700', color: colors.text },
  approved: { ...font.small, color: colors.green },
});
