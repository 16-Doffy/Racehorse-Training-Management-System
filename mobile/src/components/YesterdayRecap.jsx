import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Row } from './ui';
import { addDays, isSameDay, taskState } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

/**
 * How yesterday went, in one line, opening the history: "Hôm qua: 5/6 bữa đã ghi nhận · 1 bỏ lỡ".
 *
 * Meals and doses get no day picker. The server only makes today's tasks, so a later day would
 * always look empty, and an earlier one can't be made up — it is only there to be read, which the
 * history sheet already does. This line is the handover question asked at the start of a shift.
 */
export default function YesterdayRecap({ tasks = [], noun = 'việc', onPress }) {
  const recap = useMemo(() => {
    const yesterday = addDays(new Date(), -1);
    const states = tasks.filter((t) => isSameDay(t.scheduledDate, yesterday)).map((t) => taskState(t)?.key);
    const planned = states.filter((key) => key !== 'cancelled');
    return {
      planned: planned.length,
      done: planned.filter((key) => key === 'completed').length,
      unable: planned.filter((key) => key === 'unable').length,
      missed: planned.filter((key) => key === 'missed').length,
    };
  }, [tasks]);

  if (!recap.planned) return null;
  const allDone = recap.done === recap.planned;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Hôm qua ${recap.done} trên ${recap.planned} ${noun} đã ghi nhận, mở lịch sử`}
      onPress={onPress}
      style={({ pressed }) => [styles.line, pressed && { opacity: 0.7 }]}
    >
      <Row style={{ gap: spacing.sm }}>
        <Icon name="history" size={15} color={allDone ? colors.green : colors.orange} />
        <View style={{ flex: 1 }}>
          <Text style={font.small}>
            <Text style={styles.strong}>Hôm qua: </Text>
            {recap.done}/{recap.planned} {noun} đã ghi nhận
            {recap.unable ? ` · ${recap.unable} không thực hiện được` : ''}
            {recap.missed ? <Text style={{ color: colors.red }}>{` · ${recap.missed} bỏ lỡ`}</Text> : null}
          </Text>
        </View>
        <Icon name="chevronRight" size={14} color={colors.textFaint} />
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.white,
  },
  strong: { fontWeight: '700', color: colors.text },
});
