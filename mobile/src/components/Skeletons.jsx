import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

// Grey shapes where the content will be, pulsing softly: the screen shows its layout at once and
// fills in, instead of a spinner on an empty page. (Facebook, YouTube, Grab all load this way.)

const PULSE_MS = 750;

/** One shared pulse for every shape on screen, so they breathe together instead of flickering. */
const pulse = new Animated.Value(0.55);
let users = 0;
let loop = null;

function usePulse() {
  useEffect(() => {
    users += 1;
    if (users === 1) {
      const native = Platform.OS !== 'web';
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, useNativeDriver: native }),
          Animated.timing(pulse, { toValue: 0.55, duration: PULSE_MS, useNativeDriver: native }),
        ])
      );
      loop.start();
    }
    return () => {
      users -= 1;
      if (users === 0 && loop) {
        loop.stop();
        loop = null;
      }
    };
  }, []);
  return pulse;
}

export function Skeleton({ width = '100%', height = 14, radius: r = 8, tone = 'light', style }) {
  const opacity = usePulse();
  const bg = tone === 'dark' ? 'rgba(255,255,255,0.18)' : colors.border;
  return <Animated.View style={[{ width, height, borderRadius: r, backgroundColor: bg, opacity }, style]} />;
}

/** A list card: avatar, two lines, then a few rows. Stands in for a horse's or a task's card. */
function SkeletonCard({ rows = 2 }) {
  return (
    <View style={[styles.card, shadow.card]}>
      <View style={styles.cardHead}>
        <Skeleton width={44} height={44} radius={14} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="55%" height={16} />
          <Skeleton width="35%" height={12} />
        </View>
      </View>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={32} height={32} radius={10} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width={i % 2 ? '60%' : '75%'} height={14} />
            <Skeleton width="30%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ListSkeleton({ cards = 3 }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Đang tải" style={{ gap: spacing.md }}>
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} rows={i === 0 ? 3 : 2} />
      ))}
    </View>
  );
}

/** The home screen's shape: the "next up" card, three counters, the day plan. */
export function DashboardSkeleton() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Đang tải" style={{ gap: spacing.lg }}>
      <View style={[styles.hero]}>
        <Skeleton tone="dark" width="30%" height={12} />
        <View style={styles.cardHead}>
          <Skeleton tone="dark" width={44} height={44} radius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton tone="dark" width="60%" height={18} />
            <Skeleton tone="dark" width="40%" height={12} />
          </View>
          <Skeleton tone="dark" width={64} height={24} />
        </View>
        <Skeleton tone="dark" height={8} radius={8} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.tile, shadow.card]}>
            <Skeleton width={34} height={34} radius={10} />
            <Skeleton width={36} height={26} />
            <Skeleton width="70%" height={12} />
          </View>
        ))}
      </View>
      <SkeletonCard rows={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  hero: { backgroundColor: colors.forest, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  tile: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.md, gap: 8 },
});
