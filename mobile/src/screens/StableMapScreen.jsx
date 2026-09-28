import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Card, ChipGroup, EmptyState, HorseAvatar, Loading, Row } from '../components/ui';
import { useRefreshAll, useStableOverview, useTasks } from '../hooks/useGroomData';
import { HEALTH_STATUS, isSameDay, parseStableBlock, refId } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const SCOPES = [
  { value: 'mine', label: '⭐ Của tôi' },
  { value: 'all', label: '🏠 Toàn trại' },
];

export default function StableMapScreen({ navigation }) {
  const [scope, setScope] = useState('mine');
  const [refreshing, setRefreshing] = useState(false);
  const { assignments, myAssignments, myHorseIds, horseById, lockedHorseIds, isLoading } = useStableOverview();
  const { tasks } = useTasks();
  const refreshAll = useRefreshAll();

  const todayTaskCount = useMemo(() => {
    const map = new Map();
    tasks
      .filter((t) => isSameDay(t.scheduledDate, new Date()))
      .forEach((t) => {
        const id = refId(t.horse);
        const entry = map.get(id) || { total: 0, done: 0 };
        entry.total += 1;
        if (t.status === 'completed') entry.done += 1;
        map.set(id, entry);
      });
    return map;
  }, [tasks]);

  const blocks = useMemo(() => {
    const source = scope === 'mine' ? myAssignments : assignments;
    const map = new Map();
    source.forEach((a) => {
      const { block } = parseStableBlock(a.stableBlock);
      map.set(block, [...(map.get(block) || []), a]);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'vi', { numeric: true }))
      .map(([block, stalls]) => ({
        block,
        stalls: stalls.sort((x, y) => x.stableBlock.localeCompare(y.stableBlock, 'vi', { numeric: true })),
      }));
  }, [scope, assignments, myAssignments]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Sơ đồ Chuồng trại</Text>
        <ChipGroup options={SCOPES} value={scope} onChange={setScope} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
      >
        <Card style={styles.legend}>
          <Text style={font.tiny}>Chú thích</Text>
          <Row style={{ flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm }}>
            {Object.values(HEALTH_STATUS).map((s) => (
              <Row key={s.label} style={{ gap: 4 }}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <Text style={font.small}>{s.label}</Text>
              </Row>
            ))}
            <Row style={{ gap: 4 }}>
              <Text style={font.small}>🔒 Đang khóa huấn luyện</Text>
            </Row>
          </Row>
        </Card>

        {isLoading ? (
          <Loading />
        ) : blocks.length === 0 ? (
          <Card>
            <EmptyState
              emoji="🏠"
              text={scope === 'mine' ? 'Bạn chưa được phân công chuồng nào' : 'Chưa có chuồng nào được xếp'}
              hint="Quản lý CLB là người xếp chuồng và người phụ trách."
            />
          </Card>
        ) : (
          blocks.map(({ block, stalls }) => (
            <View key={block} style={{ gap: spacing.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={font.h2}>Khu {block}</Text>
                <Text style={font.small}>{stalls.length} chuồng</Text>
              </Row>
              {stalls.map((a) => {
                const horseId = refId(a.horse);
                const horse = horseById.get(horseId);
                const health = HEALTH_STATUS[horse?.healthStatus] || HEALTH_STATUS.eligible;
                const mine = myHorseIds.has(horseId);
                const counts = todayTaskCount.get(horseId);
                return (
                  <Card
                    key={a._id}
                    style={[styles.stall, mine && styles.stallMine]}
                    onPress={() => navigation.navigate('HorseDetail', { horseId, name: a.horse?.name })}
                  >
                    <Row style={{ gap: spacing.md }}>
                      <HorseAvatar name={a.horse?.name} size={42} />
                      <View style={{ flex: 1 }}>
                        <Row style={{ gap: spacing.sm }}>
                          <Text style={font.h3}>{a.horse?.name || 'Không rõ'}</Text>
                          {lockedHorseIds.has(horseId) ? <Text>🔒</Text> : null}
                          {mine ? <Badge label="Của tôi" color={colors.forest} bg={colors.yellowSoft} /> : null}
                        </Row>
                        <Text style={font.small}>
                          {parseStableBlock(a.stableBlock).stall}
                          {horse?.breed ? ` • ${horse.breed}` : ''}
                          {horse?.weightKg ? ` • ${horse.weightKg}kg` : ''}
                        </Text>
                        <Text style={font.small}>👤 {a.assignedCaretaker?.name || 'Chưa phân công'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={[styles.dot, { backgroundColor: health.color }]} />
                        {counts ? (
                          <Text style={font.small}>
                            {counts.done}/{counts.total} việc
                          </Text>
                        ) : null}
                      </View>
                    </Row>
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
  header: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  title: { ...font.h1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  legend: { padding: spacing.md },
  dot: { width: 12, height: 12, borderRadius: 6 },
  stall: { padding: spacing.md },
  stallMine: { borderColor: colors.gold, borderWidth: 2, borderRadius: radius.md },
});
