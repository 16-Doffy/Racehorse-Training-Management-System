import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Icon from './Icon';
import { Badge, Card, EmptyState, Row, SectionTitle } from './ui';
import { colors, font, spacing } from '../theme';

/**
 * Today, hour by hour. Open work first with a "now" line between what has passed and what is
 * ahead; finished work folds away behind one row so what is left stays in view.
 * `schedule` comes from buildSchedule (utils/schedule.js).
 */
export default function TodaySchedule({ schedule, onOpenHorse, onOpenTab }) {
  const [showDone, setShowDone] = useState(false);
  const { all, open, done, nowIndex, clock } = schedule;

  const openRow = (r) => (r.count > 1 ? onOpenTab(r.tab) : onOpenHorse(r.horseId, r.horseName));

  return (
    <Card>
      <SectionTitle>Lịch hôm nay</SectionTitle>
      {all.length === 0 ? (
        <EmptyState icon="clock" text="Hôm nay chưa có việc nào" />
      ) : (
        <>
          {open.length === 0 ? (
            <Row style={styles.allDone}>
              <Icon name="checkCircle" size={18} color={colors.green} />
              <Text style={[font.body, { flex: 1 }]}>Đã xong mọi việc hôm nay.</Text>
            </Row>
          ) : null}
          {open.map((r, i) => (
            <View key={r.key}>
              {i === nowIndex ? <NowLine time={clock} /> : null}
              <ScheduleRow row={r} onPress={() => openRow(r)} />
            </View>
          ))}
          {nowIndex === -1 && open.length > 0 ? <NowLine time={clock} /> : null}

          {done.length > 0 ? (
            <Pressable style={styles.toggle} onPress={() => setShowDone((v) => !v)} hitSlop={6}>
              <Text style={styles.link}>{showDone ? 'Ẩn việc đã xong' : `Xem ${done.length} việc đã xong`}</Text>
              <Icon name={showDone ? 'chevronUp' : 'chevronDown'} size={14} color={colors.forestLight} />
            </Pressable>
          ) : null}
          {showDone ? done.map((r) => <ScheduleRow key={r.key} row={r} onPress={() => openRow(r)} />) : null}
        </>
      )}
    </Card>
  );
}

function ScheduleRow({ row, onPress }) {
  return (
    <Pressable style={({ pressed }) => [styles.row, row.done && { opacity: 0.6 }, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <Text style={[styles.time, row.late && { color: colors.orange }]}>{row.time || 'Cả ngày'}</Text>
      <View style={[styles.iconWrap, { backgroundColor: row.live ? colors.blueSoft : colors.graySoft }]}>
        <Icon name={row.icon} size={16} color={row.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[font.body, { fontWeight: '600' }]} numberOfLines={2}>
          {row.title}
        </Text>
        {row.subtitle ? (
          <Text style={font.small} numberOfLines={1}>
            {row.subtitle}
          </Text>
        ) : null}
      </View>
      {row.badge ? <Badge label={row.badge.label} color={row.badge.color} bg={row.badge.bg} /> : null}
    </Pressable>
  );
}

function NowLine({ time }) {
  return (
    <Row style={styles.nowLine}>
      <Text style={styles.nowText}>Bây giờ {time}</Text>
      <View style={styles.nowRule} />
    </Row>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  time: { width: 52, fontWeight: '700', fontSize: 14, color: colors.forestLight },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nowLine: { gap: spacing.sm, paddingVertical: 4 },
  nowText: { fontSize: 12, fontWeight: '700', color: colors.red },
  nowRule: { flex: 1, height: 1.5, backgroundColor: colors.red, opacity: 0.6 },
  allDone: { gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  link: { color: colors.forestLight, fontWeight: '700', fontSize: 14 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
});
