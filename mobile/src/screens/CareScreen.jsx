import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Segments } from '../components/ui';
import FeedingScreen from './FeedingScreen';
import TreatmentsScreen from './TreatmentsScreen';
import TasksScreen from './TasksScreen';
import { useToday } from '../hooks/useGroomData';
import { colors, spacing } from '../theme';

const CHORE_TYPES = ['cleaning', 'bathing', 'icing'];
const CARE_TYPES = ['medication', 'monitoring'];

const SEGMENTS = [
  { key: 'feeding', label: 'Cho ăn', icon: 'rations', Screen: FeedingScreen },
  { key: 'medication', label: 'Thuốc', icon: 'medication', Screen: TreatmentsScreen },
  { key: 'chores', label: 'Việc chuồng', icon: 'tasks', Screen: TasksScreen },
];

/**
 * The three kinds of daily work under one tab.
 *
 * They stay three separate screens — a meal is not a dose and neither is mucking out — but a phone
 * can only carry so many tabs, so the switch between them lives at the top of this one instead.
 */
export default function CareScreen({ navigation, route }) {
  const [active, setActive] = useState(route.params?.segment || 'feeding');
  const { pending, overdue } = useToday();

  // Opening this tab from elsewhere ("3 bữa chưa cho ăn") must land on the right part of the job.
  useEffect(() => {
    if (route.params?.segment) setActive(route.params.segment);
  }, [route.params?.segment, route.params?.at]);

  const open = [...pending, ...overdue];
  const counts = {
    feeding: open.filter((t) => t.taskType === 'feeding').length,
    medication: open.filter((t) => CARE_TYPES.includes(t.taskType)).length,
    chores: open.filter((t) => CHORE_TYPES.includes(t.taskType)).length,
  };

  const bar = (
    <View style={styles.barWrap}>
      <Segments
        options={SEGMENTS.map((segment) => ({ ...segment, value: segment.key, count: counts[segment.key] }))}
        value={active}
        onChange={setActive}
      />
    </View>
  );

  const { Screen } = SEGMENTS.find((s) => s.key === active) || SEGMENTS[0];
  return <Screen navigation={navigation} segments={bar} />;
}

const styles = StyleSheet.create({
  barWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.cream },
});
