import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import Icon from '../components/Icon';
import { API_ORIGIN, TOKEN_KEY } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { NOTIFICATION_TYPE } from '../utils/groom';
import { colors, radius, shadow, spacing } from '../theme';

// What shows stock, or work that waits on it: reloaded whenever stock changes.
const STOCK_QUERIES = [['inventory'], ['inventory-forecast'], ['tasks'], ['care-plan']];
const STOCK_TYPES = ['stock_update', 'restock_decision'];
const SHOW_MS = 6000;
const TONE = { critical: colors.red, warning: colors.orange, info: colors.gold };

/**
 * The live line to the server (Socket.io, the same events the web app listens to): a notification
 * arrives the moment it is sent — the bell updates and a banner shows it at the top for a few
 * seconds — and when stock changes (the Manager adds an item or counts a delivery in) the supplies
 * list and any meal or dose waiting on it reload at once. The bell still checks every minute, for
 * whatever came in while the line was down. `onOpen(notification)`: tapping the banner.
 */
export default function LiveUpdates({ onOpen }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const slide = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  }, [slide]);

  const show = useCallback(
    (notification) => {
      clearTimeout(timer.current);
      setToast(notification);
      Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, SHOW_MS);
    },
    [slide, hide]
  );

  useEffect(() => {
    if (!user?._id) return undefined;
    let socket = null;
    let closed = false;
    const reloadStock = () => STOCK_QUERIES.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));

    (async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token || closed) return;
      // WebSocket only: a phone has no use for the long-polling fallback, and it breaks behind some proxies.
      socket = io(API_ORIGIN, { auth: { token }, transports: ['websocket'] });
      socket.on('notification:new', (notification) => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        if (STOCK_TYPES.includes(notification?.type)) reloadStock();
        if (notification?.message) show(notification);
      });
      socket.on('inventory:changed', reloadStock);
    })();

    return () => {
      closed = true;
      clearTimeout(timer.current);
      socket?.disconnect();
    };
  }, [user?._id, queryClient, show]);

  if (!toast) return null;
  const kind = NOTIFICATION_TYPE[toast.type];
  const tone = TONE[toast.severity] || TONE.info;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { top: insets.top + spacing.sm },
        { opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Thông báo mới: ${toast.message}`}
        onPress={() => {
          hide();
          onOpen?.(toast);
        }}
        style={({ pressed }) => [styles.toast, shadow.raised, { borderLeftColor: tone }, pressed && { opacity: 0.9 }]}
      >
        <View style={[styles.icon, { backgroundColor: `${tone}26` }]}>
          <Icon name={kind?.icon || 'bellActive'} size={18} color={tone} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {kind?.label || 'Thông báo mới'}
          </Text>
          <Text style={styles.message} numberOfLines={3}>
            {toast.message}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo" onPress={hide} hitSlop={10}>
          <Icon name="close" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 100, elevation: 100 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    backgroundColor: colors.forest,
  },
  icon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, fontWeight: '800', color: colors.gold },
  message: { fontSize: 13.5, lineHeight: 18, color: colors.white, marginTop: 1 },
});
