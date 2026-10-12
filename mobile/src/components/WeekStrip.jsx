import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Row } from './ui';
import { addDays, formatDayLabel, isSameDay, isToday, startOfDay, weekdayShort } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

const DAYS_BACK = 14;
const DAYS_FORWARD = 7;

/**
 * Date picker for a stable hand's day: a strip of days you can thumb through, with a dot showing
 * how much is still open on each. Arrows and "Hôm nay" alone meant walking a week back one tap at
 * a time.
 */
export default function WeekStrip({ value, onChange, pendingByDay }) {
  const scroller = useRef(null);
  const [width, setWidth] = useState(0);

  const days = useMemo(() => {
    const start = addDays(startOfDay(new Date()), -DAYS_BACK);
    return Array.from({ length: DAYS_BACK + DAYS_FORWARD + 1 }, (_, i) => addDays(start, i));
  }, []);

  const selectedIndex = days.findIndex((d) => isSameDay(d, value));

  // Keep the chosen day in view when it changes from outside (e.g. "open the oldest overdue day").
  const scrollToSelected = (layoutWidth) => {
    const itemWidth = 58;
    const offset = Math.max(0, selectedIndex * itemWidth - layoutWidth / 2 + itemWidth / 2);
    scroller.current?.scrollTo({ x: offset, animated: true });
  };

  return (
    <View style={styles.wrapper}>
      <Row style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ngày trước"
          onPress={() => onChange(addDays(value, -1))}
          hitSlop={8}
          style={styles.navButton}
        >
          <Icon name="chevronLeft" size={18} color={colors.forest} />
        </Pressable>

        <Pressable style={{ flex: 1 }} onPress={() => onChange(startOfDay(new Date()))}>
          <Text style={styles.dayLabel}>{formatDayLabel(value)}</Text>
          {!isToday(value) ? <Text style={styles.dayHint}>Chạm để về hôm nay</Text> : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ngày sau"
          onPress={() => onChange(addDays(value, 1))}
          hitSlop={8}
          style={styles.navButton}
        >
          <Icon name="chevronRight" size={18} color={colors.forest} />
        </Pressable>
      </Row>

      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        onLayout={(e) => {
          const layoutWidth = e.nativeEvent.layout.width;
          setWidth(layoutWidth);
          scrollToSelected(layoutWidth);
        }}
        onContentSizeChange={() => width && scrollToSelected(width)}
      >
        {days.map((day) => {
          const selected = isSameDay(day, value);
          const today = isToday(day);
          const pending = pendingByDay?.get(startOfDay(day).getTime()) || 0;
          return (
            <Pressable
              key={day.toISOString()}
              accessibilityRole="button"
              accessibilityLabel={formatDayLabel(day)}
              accessibilityState={{ selected }}
              onPress={() => onChange(startOfDay(day))}
              style={[styles.day, selected && styles.daySelected, today && !selected && styles.dayToday]}
            >
              <Text style={[styles.weekday, selected && styles.textSelected]}>{weekdayShort(day)}</Text>
              <Text style={[styles.date, selected && styles.textSelected]}>{day.getDate()}</Text>
              <View style={styles.dotRow}>
                {pending > 0 ? (
                  <View style={[styles.dot, { backgroundColor: selected ? colors.gold : colors.orange }]} />
                ) : (
                  <View style={styles.dotPlaceholder} />
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { backgroundColor: colors.white, paddingBottom: spacing.sm },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.graySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: { ...font.h3, textAlign: 'center' },
  dayHint: { ...font.small, textAlign: 'center', fontSize: 11 },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  day: {
    width: 50,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  daySelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  dayToday: { borderColor: colors.gold },
  weekday: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  date: { fontSize: 17, color: colors.text, fontWeight: '800' },
  textSelected: { color: colors.white },
  dotRow: { height: 6, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotPlaceholder: { width: 6, height: 6 },
});
