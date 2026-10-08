import { useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';

const CLOSE_DISTANCE = 110; // pulled down this far, it closes
const CLOSE_VELOCITY = 0.9; // or flicked down faster than this
const OFFSCREEN = 900;

/**
 * The panel of a bottom sheet: grab the handle and pull down to close it, like every sheet on a
 * phone. Let go early and it springs back. Only the handle moves it, so scrolling the content
 * inside never fights the drag.
 *
 *   handle="inline"   the handle takes its own strip at the top (the shared Sheet)
 *   handle="overlay"  the handle floats over the top edge of a sheet that draws its own header
 */
export default function DragSheet({ onClose, style, handle = 'inline', children }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const native = Platform.OS !== 'web';

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        // Pulling up past the top has nowhere to go: stop at the resting position.
        translateY.setValue(Math.max(0, g.dy));
      },
      // Nothing else should take the gesture over halfway down.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) {
          Animated.timing(translateY, { toValue: OFFSCREEN, duration: 170, useNativeDriver: native }).start(() => {
            onCloseRef.current?.();
            translateY.setValue(0);
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: native, bounciness: 6 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: native }).start();
      },
    })
  ).current;

  const zoneStyle = [handle === 'overlay' ? styles.zoneOverlay : styles.zoneInline, Platform.OS === 'web' && styles.webZone];

  return (
    <Animated.View style={[style, { transform: [{ translateY }] }]}>
      <View
        {...pan.panHandlers}
        style={zoneStyle}
        accessibilityRole="adjustable"
        accessibilityLabel="Kéo xuống để đóng"
      >
        <View style={styles.bar} />
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 32 px tall: a comfortable thumb target, much taller than the 4 px bar it carries.
  zoneInline: { alignItems: 'center', paddingTop: spacing.md, height: 32 },
  zoneOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 32, alignItems: 'center', paddingTop: 8, zIndex: 10 },
  // On the web, a mouse drag over text starts a text selection, and the responder system cancels the
  // gesture when that happens: the handle must not be selectable.
  webZone: { touchAction: 'none', cursor: 'grab', userSelect: 'none' },
  bar: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
});
