import { useEffect, useState } from 'react';
import { notification as antdNotification } from 'antd';
import { getSocket } from '../../lib/socket';

/**
 * Connects to the realtime channel and surfaces `fitness:alert` events as AntD notifications,
 * keeping a running unread count for the header bell. Safe to mount once per authenticated layout.
 */
export function useRealtimeAlerts() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    socket.connect();

    const handleAlert = ({ notification }) => {
      antdNotification.warning({
        message: 'Cảnh báo thể lực',
        description: notification?.message,
        placement: 'topRight',
      });
      setUnreadCount((c) => c + 1);
    };

    socket.on('fitness:alert', handleAlert);

    return () => {
      socket.off('fitness:alert', handleAlert);
    };
  }, []);

  return { unreadCount, resetUnreadCount: () => setUnreadCount(0) };
}
