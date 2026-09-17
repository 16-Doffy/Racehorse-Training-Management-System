import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Progress, Popconfirm, Tag, Empty, Timeline, Alert, message } from 'antd';
import {
  CarryOutOutlined,
  CheckOutlined,
  HomeOutlined,
  ShoppingOutlined,
  WarningOutlined,
  CalendarOutlined,
  BellOutlined,
  MedicineBoxOutlined,
  ClockCircleOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { dailyTaskApi } from './stableApi';
import { inventoryApi } from '../inventory/inventoryApi';
import { notificationsApi } from '../alerts/notificationsApi';
import { useFeedingSchedules, useMyTasks, useStableOverview, useTrainingSessions } from './useGroomData';
import {
  HEALTH_STATUS_CONFIG,
  TASK_CONFIG,
  buildDailyRoutine,
  describeDaysLeft,
  HEADING_FONT,
  formatViDate,
  getNextMeal,
  getStockLevel,
  getUpcomingCare,
  isSameDay,
  parseStableBlock,
  refId,
} from './groomConfig';
import { StatCard, HorseAvatar } from './GroomUI';

export default function GroomDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSelector((state) => state.auth);
  const today = dayjs();

  const { tasks } = useMyTasks();
  const { myAssignments, myHorseIds, myBlocks, horseById, lockedHorseIds } = useStableOverview();
  const { feedings } = useFeedingSchedules();
  const { sessions } = useTrainingSessions();
  const { data: inventoryData } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const { data: notiData } = useQuery({ queryKey: ['notifications'], queryFn: () => notificationsApi.list() });

  const completeMutation = useMutation({
    mutationFn: (id) => dailyTaskApi.complete(id),
    onSuccess: () => {
      message.success('Đã đánh dấu hoàn thành.');
      queryClient.invalidateQueries({ queryKey: ['my-daily-tasks'] });
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });

  const todayTasks = tasks.filter((t) => isSameDay(t.scheduledDate, today));
  const doneToday = todayTasks.filter((t) => t.status === 'completed').length;
  const pendingToday = todayTasks.filter((t) => t.status === 'pending');
  const overdue = tasks.filter((t) => t.status === 'pending' && dayjs(t.scheduledDate).isBefore(today, 'day'));
  const percent = todayTasks.length ? Math.round((doneToday / todayTasks.length) * 100) : 0;

  const lowStock = (inventoryData?.data || []).filter((i) => getStockLevel(i.quantity).key !== 'ok');
  const notifications = (notiData?.data || []).slice(0, 5);

  const routine = useMemo(
    () => buildDailyRoutine({ horseIds: myHorseIds, feedings, sessions, day: dayjs() }),
    [myHorseIds, feedings, sessions]
  );
  // Collapse per-horse meal entries into one row per meal slot for the overview timeline.
  const timeline = useMemo(() => {
    const rows = [];
    routine.forEach((e) => {
      const existing = e.kind === 'meal' && rows.find((r) => r.kind === 'meal' && r.time === e.time);
      if (existing) existing.horses.push(e.horse?.name);
      else rows.push({ ...e, horses: [e.horse?.name] });
    });
    return rows;
  }, [routine]);

  const careReminders = [...myHorseIds]
    .flatMap((id) => getUpcomingCare(horseById.get(id), 7).map((c) => ({ ...c, horse: horseById.get(id) })))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const nextMeal = getNextMeal(today);

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Hero */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#022c22] mb-1 tracking-tight" style={{ fontFamily: HEADING_FONT }}>
            Xin chào, {user?.name}
          </h1>
          <p className="text-gray-500 text-sm m-0">
            {formatViDate(today)} — bạn phụ trách <strong className="text-gray-700">{myAssignments.length}</strong> chiến mã
            {myBlocks.length > 0 && <> tại {myBlocks.join(', ')}</>}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button danger icon={<WarningOutlined />} onClick={() => navigate('/stable/incidents')} className="!rounded-lg">
            Báo sự cố
          </Button>
          <Button
            type="primary"
            icon={<CarryOutOutlined />}
            onClick={() => navigate('/stable/my-tasks')}
            className="!bg-[#022c22] hover:!bg-[#064e3b] !border-none shadow-lg !rounded-lg"
          >
            Bắt đầu công việc
          </Button>
        </div>
      </div>

      {/* Progress banner */}
      <div className="bg-[#022c22] rounded-xl p-5 mb-6 shadow-xl flex flex-col md:flex-row items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-l from-[#064e3b] to-transparent pointer-events-none" />
        <Progress
          type="circle"
          percent={percent}
          size={84}
          strokeColor="#eab308"
          railColor="rgba(255,255,255,0.12)"
          format={(p) => <span className="text-white font-bold text-lg">{p}%</span>}
        />
        <div className="flex-1 relative z-10">
          <div className="text-[#eab308] text-[10px] font-bold tracking-widest uppercase mb-1">Tiến độ chăm sóc hôm nay</div>
          <h3 className="text-white font-medium text-lg mb-1">
            {doneToday}/{todayTasks.length} công việc đã hoàn thành
          </h3>
          <p className="text-gray-300 text-sm mb-0">
            {nextMeal.emoji} {nextMeal.isNow ? 'Đang trong giờ' : 'Tiếp theo:'} <strong className="text-white">{nextMeal.label}</strong> lúc{' '}
            <strong className="text-[#eab308]">{nextMeal.time}</strong>
            {pendingToday.length > 0 ? (
              <>
                {' '}
                • còn <strong className="text-white">{pendingToday.length}</strong> việc cần làm
              </>
            ) : todayTasks.length > 0 ? (
              ' • Tuyệt vời, bạn đã xong hết việc hôm nay!'
            ) : null}
          </p>
        </div>
        <Button
          onClick={() => navigate('/feeding')}
          className="!bg-white/10 hover:!bg-white/20 !text-white !border-white/20 relative z-10"
        >
          Xem khẩu phần ăn
        </Button>
      </div>

      {overdue.length > 0 && (
        <Alert
          type="warning"
          showIcon
          className="!mb-6 !rounded-xl"
          title={
            <span>
              Còn {overdue.length} công việc quá hạn từ những ngày trước chưa được hoàn thành.{' '}
              <Button type="link" size="small" className="!p-0 !h-auto" onClick={() => navigate('/stable/my-tasks')}>
                Xử lý →
              </Button>
            </span>
          }
        />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<CarryOutOutlined />}
          label="Việc hôm nay"
          value={doneToday}
          suffix={`/ ${todayTasks.length} xong`}
          accent="border-t-green-500"
          iconClass="bg-green-50 text-green-600"
          onClick={() => navigate('/stable/my-tasks')}
        />
        <StatCard
          icon={<ClockCircleOutlined />}
          label="Còn phải làm"
          value={pendingToday.length + overdue.length}
          suffix={overdue.length ? `(${overdue.length} quá hạn)` : undefined}
          accent="border-t-[#eab308]"
          iconClass="bg-yellow-50 text-[#eab308]"
          onClick={() => navigate('/stable/my-tasks')}
        />
        <StatCard
          icon={<HomeOutlined />}
          label="Chiến mã phụ trách"
          value={myAssignments.length}
          onClick={() => navigate('/stable/map')}
        />
        <StatCard
          icon={<ShoppingOutlined />}
          label="Vật tư sắp hết / hết"
          value={lowStock.length}
          accent="border-t-red-500"
          iconClass="bg-red-50 text-red-500"
          onClick={() => navigate('/stable/supplies')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="premium-card p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <CarryOutOutlined className="text-xl" style={{ color: '#eab308' }} />
                <h2 className="text-lg font-bold text-[#022c22] m-0">Việc cần làm hôm nay</h2>
              </div>
              <Button type="link" className="!p-0" onClick={() => navigate('/stable/my-tasks')}>
                Xem tất cả →
              </Button>
            </div>
            {pendingToday.length === 0 ? (
              <Empty
                image={todayTasks.length ? <CheckCircleFilled className="text-5xl" style={{ color: '#22c55e' }} /> : Empty.PRESENTED_IMAGE_SIMPLE}
                description={todayTasks.length ? 'Đã hoàn thành toàn bộ công việc hôm nay' : 'Chưa có công việc nào được phân công hôm nay'}
              />
            ) : (
              <div className="flex flex-col divide-y divide-gray-100">
                {pendingToday.slice(0, 8).map((task) => {
                  const cfg = TASK_CONFIG[task.taskType] || { label: task.taskType, emoji: '📋' };
                  return (
                    <div key={task._id} className="flex items-center gap-3 py-3 first:pt-0">
                      <div className="w-9 h-9 rounded-full bg-[#fdfbf7] border border-gray-100 flex items-center justify-center text-lg shrink-0">
                        {cfg.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800">{cfg.label}</div>
                        <div className="text-xs text-gray-400">{task.horse?.name}</div>
                      </div>
                      <Popconfirm
                        title="Xác nhận hoàn thành?"
                        description={`${cfg.label} — ${task.horse?.name || ''}`}
                        okText="Hoàn thành"
                        cancelText="Huỷ"
                        onConfirm={() => completeMutation.mutate(task._id)}
                      >
                        <Button
                          size="small"
                          type="primary"
                          icon={<CheckOutlined />}
                          className="!rounded-full"
                          loading={completeMutation.isPending && completeMutation.variables === task._id}
                        >
                          Xong
                        </Button>
                      </Popconfirm>
                    </div>
                  );
                })}
                {pendingToday.length > 8 && (
                  <div className="pt-3 text-xs text-gray-400 text-center">và {pendingToday.length - 8} công việc khác...</div>
                )}
              </div>
            )}
          </div>

          <div className="premium-card p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <HomeOutlined className="text-xl" style={{ color: '#eab308' }} />
                <h2 className="text-lg font-bold text-[#022c22] m-0">Chuồng tôi phụ trách</h2>
              </div>
              <Button type="link" className="!p-0" onClick={() => navigate('/stable/map')}>
                Mở sơ đồ →
              </Button>
            </div>
            {myAssignments.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn chưa được phân công phụ trách chuồng nào" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {myAssignments.map((a) => {
                  const horseId = refId(a.horse);
                  const horse = horseById.get(horseId);
                  const health = HEALTH_STATUS_CONFIG[horse?.healthStatus];
                  const horseTasks = todayTasks.filter((t) => refId(t.horse) === horseId);
                  const done = horseTasks.filter((t) => t.status === 'completed').length;
                  return (
                    <div
                      key={a._id}
                      className="border border-gray-100 rounded-xl p-3 flex items-center gap-3 bg-white hover:border-[#022c22]/20 transition-colors cursor-pointer"
                      onClick={() => navigate('/stable/map')}
                    >
                      <HorseAvatar name={a.horse?.name} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#022c22] truncate">{a.horse?.name}</span>
                          {health && <span className={`w-2 h-2 rounded-full shrink-0 ${health.dot}`} title={health.label} />}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {parseStableBlock(a.stableBlock).stall} • {health?.label || '—'}
                          {lockedHorseIds.has(horseId) && <span className="text-red-500"> • Khóa huấn luyện</span>}
                        </div>
                      </div>
                      {horseTasks.length > 0 && (
                        <Tag color={done === horseTasks.length ? 'green' : 'default'} className="!m-0">
                          {done}/{horseTasks.length}
                        </Tag>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-6">
          <div className="premium-card p-6 border-t-4 border-t-[#022c22]">
            <div className="flex items-center gap-2 mb-4">
              <CalendarOutlined className="text-lg" style={{ color: '#eab308' }} />
              <h3 className="font-bold text-[#022c22] m-0 text-base">Lịch sinh hoạt hôm nay</h3>
            </div>
            {timeline.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có bữa ăn hay buổi tập nào được lên lịch" />
            ) : (
              <Timeline
                items={timeline.map((e) => ({
                  color: e.kind === 'meal' ? '#eab308' : e.status === 'in_progress' ? 'blue' : '#022c22',
                  content: (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{e.time}</span>
                        <span className="font-semibold text-sm text-gray-800">{e.title}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {e.kind === 'meal' ? e.horses.join(', ') : `${e.horse?.name || ''} • ${e.detail}`}
                      </div>
                    </div>
                  ),
                }))}
              />
            )}
          </div>

          <div className="premium-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <MedicineBoxOutlined className="text-lg" style={{ color: '#022c22' }} />
              <h3 className="font-bold text-[#022c22] m-0 text-base">Nhắc lịch chăm sóc (7 ngày)</h3>
            </div>
            {careReminders.length === 0 ? (
              <div className="text-sm text-gray-400">Không có lịch tiêm phòng, tẩy giun hay kiểm tra móng sắp tới.</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {careReminders.map((c) => (
                  <div key={`${c.horse?._id}-${c.key}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {c.emoji} {c.label} • <span className="font-medium">{c.horse?.name}</span>
                    </span>
                    <Tag color={c.daysLeft < 0 ? 'red' : c.daysLeft <= 2 ? 'orange' : 'default'} className="!m-0 shrink-0">
                      {describeDaysLeft(c.daysLeft)}
                    </Tag>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="premium-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <BellOutlined className="text-lg" style={{ color: '#022c22' }} />
              <h3 className="font-bold text-[#022c22] m-0 text-base">Thông báo gần đây</h3>
            </div>
            {notifications.length === 0 ? (
              <div className="text-sm text-gray-400">Không có thông báo mới.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {notifications.map((n) => (
                  <div key={n._id} className={`text-sm ${n.isRead ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>
                    {n.message}
                    <div className="text-[11px] text-gray-400 font-normal">{dayjs(n.createdAt).format('HH:mm DD/MM/YYYY')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
