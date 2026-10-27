import { useEffect } from 'react';
import { notification as antdNotification } from '../../lib/antdStatic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../../lib/socket';
import { notificationsApi } from './notificationsApi';

// Vietnamese title shown on the AntD popup, and the label/icon AlertBell renders per row — kept
// here (not duplicated in AlertBell) so both places agree on how each notification type reads.
export const TYPE_LABELS = {
  fitness_alert: 'Cảnh báo thể lực',
  injury_lock: 'Khóa huấn luyện khẩn cấp',
  vaccination_due: 'Nhắc lịch tiêm phòng',
  deworming_due: 'Nhắc lịch tẩy giun',
  farrier_due: 'Nhắc lịch kiểm tra móng',
  exam_due: 'Nhắc lịch khám định kỳ',
  incident_report: 'Báo cáo sự cố',
  exam_request: 'Yêu cầu khám bệnh',
  restock_decision: 'Kết quả duyệt vật tư',
  restock_request: 'Đề xuất vật tư',
  low_stock: 'Vật tư sắp hết',
  stock_update: 'Kho vật tư',
  training_restricted: 'Hạn chế tập luyện (hồi phục)',
  horse_assigned: 'Phân công ngựa',
  session_completed: 'Buổi tập hoàn thành',
  readiness_override: 'Ghi đè cảnh báo sẵn sàng',
  training_unlocked: 'Đã gỡ khóa huấn luyện',
  task_assigned: 'Công việc chăm sóc',
  care_order: 'Y lệnh của bác sĩ',
  session_scheduled: 'Buổi tập sắp tới',
  race_result: 'Kết quả giải đua',
  race_decision: 'Quyết định dự giải',
  race_review: 'Cần xem lại quyết định dự giải',
  incident_update: 'Cập nhật sự cố',
  meal_missed: 'Bữa ăn bị lỡ',
  ration_review: 'Cần xác nhận lại lịch ăn',
  system: 'Thông báo hệ thống',
};

export const SEVERITY_TO_ANTD = { critical: 'error', warning: 'warning', info: 'info' };

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

    // A watcher's round sends many at once (every missed meal of every horse): they are gathered for a
    // moment and shown as one pop-up, which the next round replaces instead of stacking another column.
    // Each one is still in the bell, where it opens its own page.
    let batch = [];
    let timer = null;
    const show = () => {
      const items = batch;
      batch = [];
      timer = null;
      const worst = items.some((n) => n.severity === 'critical') ? 'critical' : items.some((n) => n.severity === 'warning') ? 'warning' : 'info';
      if (items.length === 1) {
        const [n] = items;
        antdNotification[SEVERITY_TO_ANTD[n.severity] || 'info']({ key: 'realtime', title: TYPE_LABELS[n.type] || TYPE_LABELS.system, description: n.message, placement: 'topRight' });
        return;
      }
      const byType = new Map();
      for (const n of items) byType.set(n.type, [...(byType.get(n.type) || []), n]);
      const lines = [...byType.entries()].map(([type, list]) => {
        const names = [...new Set(list.map((n) => n.horse?.name).filter(Boolean))];
        const who = names.length ? `: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` và ${names.length - 3} ngựa khác` : ''}` : '';
        return `${list.length} ${(TYPE_LABELS[type] || TYPE_LABELS.system).toLowerCase()}${who}`;
      });
      antdNotification[SEVERITY_TO_ANTD[worst]]({
        key: 'realtime',
        title: `${items.length} thông báo mới`,
        description: `${lines.join('. ')}. Mở chuông để xem từng thông báo.`,
        placement: 'topRight',
      });
    };
    // Something happened elsewhere (another role, the groom's app, a watcher): whatever this page shows
    // is reloaded, not just the bell — the meal just given, the exam just filed, the session just
    // stopped appear without a reload. Gathered for a moment, so a burst reloads once; only the lists
    // on screen are fetched again, the others are marked old.
    let refreshTimer = null;
    const refreshPage = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'notifications' });
      }, 1500);
    };
    const handleNotification = (notification) => {
      batch.push(notification);
      if (!timer) timer = setTimeout(show, 1200);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      refreshPage();
    };

    // Stock changed somewhere (a delivery, a new item, a meal or dose taking it out): the storeroom
    // and anything showing stock reload now rather than on their next visit — and a meal or a dose
    // given is news for the rest of the page too.
    const handleInventory = () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-forecast'] });
      refreshPage();
    };

    socket.on('notification:new', handleNotification);
    socket.on('inventory:changed', handleInventory);

    return () => {
      clearTimeout(timer);
      clearTimeout(refreshTimer);
      socket.off('notification:new', handleNotification);
      socket.off('inventory:changed', handleInventory);
    };
  }, [queryClient]);

  const markOneRead = async (id) => {
    await notificationsApi.markRead(id);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    await notificationsApi.markAllRead();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return { notifications, unreadCount, markAllRead, markOneRead };
}
