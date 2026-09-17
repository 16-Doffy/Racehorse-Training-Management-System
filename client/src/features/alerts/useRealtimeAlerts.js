import { useEffect } from 'react';
import { notification as antdNotification } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../lib/socket';
import { notificationsApi } from './notificationsApi';

// Vietnamese title shown on the AntD popup + used as a fallback grouping if a future notification
// type isn't in this map yet.
const TYPE_LABELS = {
  fitness_alert: 'Cảnh báo thể lực',
  injury_lock: 'Khóa huấn luyện khẩn cấp',
  vaccination_due: 'Nhắc lịch tiêm phòng',
  deworming_due: 'Nhắc lịch tẩy giun',
  farrier_due: 'Nhắc lịch kiểm tra móng',
  incident_report: 'Báo cáo sự cố',
  system: 'Thông báo hệ thống',
};

const SEVERITY_TO_ANTD = { critical: 'error', warning: 'warning', info: 'info' };

/**
 * Owns the notification bell's data: the list itself (so AlertBell doesn't run a second, separate
 * query for the same data), realtime updates via the single `notification:new` socket event every
 * notification source now emits, and marking everything read.
 *
 * Unread count comes from the real `isRead` flag on fetched notifications — not just a counter of
 * socket events seen since this component mounted, which used to reset to 0 on every page
 * load/reconnect regardless of how many notifications were actually still unread server-side.
 */
export function useRealtimeAlerts() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(),
    refetchOnWindowFocus: true,
  });

  const notifications = data?.data || [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    socket.connect();

    const handleNotification = (notification) => {
      antdNotification[SEVERITY_TO_ANTD[notification.severity] || 'info']({
        message: TYPE_LABELS[notification.type] || TYPE_LABELS.system,
        description: notification.message,
        placement: 'topRight',
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    socket.on('notification:new', handleNotification);

    return () => {
      socket.off('notification:new', handleNotification);
    };
  }, [queryClient]);

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    await notificationsApi.markAllRead();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return { notifications, unreadCount, markAllRead };
}
