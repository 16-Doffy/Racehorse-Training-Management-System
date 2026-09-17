import { useMemo, useState } from 'react';
import { Button, DatePicker, Segmented, Progress, Popconfirm, Tag, Empty, Alert, Spin, message } from 'antd';
import {
  CheckOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  WarningOutlined,
  LeftOutlined,
  RightOutlined,
  UnorderedListOutlined,
  CarryOutOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { dailyTaskApi } from './stableApi';
import { useMyTasks, useStableOverview } from './useGroomData';
import { HEALTH_STATUS_CONFIG, TASK_CONFIG, TASK_STATUS_CONFIG, formatViDate, isSameDay, parseStableBlock, refId } from './groomConfig';
import { GroomPageHeader, StatCard, HorseAvatar, IncidentBox } from './GroomUI';
import IncidentReportModal from './IncidentReportModal';

const TASK_TYPE_ORDER = Object.keys(TASK_CONFIG);

export default function DailyTaskPage() {
  const [day, setDay] = useState(() => dayjs());
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('horse');
  const [incidentTask, setIncidentTask] = useState(null);
  const queryClient = useQueryClient();

  const { tasks, isLoading } = useMyTasks();
  const { assignmentByHorseId, horseById } = useStableOverview();

  const completeMutation = useMutation({
    mutationFn: (id) => dailyTaskApi.complete(id),
    onSuccess: () => {
      message.success('Đã đánh dấu hoàn thành.');
      queryClient.invalidateQueries({ queryKey: ['my-daily-tasks'] });
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });

  const dayTasks = useMemo(() => tasks.filter((t) => isSameDay(t.scheduledDate, day)), [tasks, day]);
  const overdueTasks = useMemo(
    () => tasks.filter((t) => t.status === 'pending' && dayjs(t.scheduledDate).isBefore(dayjs(), 'day')),
    [tasks]
  );

  const doneCount = dayTasks.filter((t) => t.status === 'completed').length;
  const pendingCount = dayTasks.filter((t) => t.status === 'pending').length;
  const incidentCount = dayTasks.filter((t) => t.incidentReport).length;
  const percent = dayTasks.length ? Math.round((doneCount / dayTasks.length) * 100) : 0;

  const visibleTasks = useMemo(
    () => dayTasks.filter((t) => statusFilter === 'all' || t.status === statusFilter),
    [dayTasks, statusFilter]
  );

  const groups = useMemo(() => {
    const map = new Map();
    visibleTasks.forEach((t) => {
      const key = groupBy === 'horse' ? refId(t.horse) : t.taskType;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    const list = [...map.entries()].map(([key, items]) => ({
      key,
      items: items.sort((a, b) => TASK_TYPE_ORDER.indexOf(a.taskType) - TASK_TYPE_ORDER.indexOf(b.taskType)),
    }));
    return groupBy === 'horse'
      ? list.sort((a, b) =>
          (assignmentByHorseId.get(a.key)?.stableBlock || '~').localeCompare(assignmentByHorseId.get(b.key)?.stableBlock || '~', 'vi', { numeric: true })
        )
      : list.sort((a, b) => TASK_TYPE_ORDER.indexOf(a.key) - TASK_TYPE_ORDER.indexOf(b.key));
  }, [visibleTasks, groupBy, assignmentByHorseId]);

  const isToday = day.isSame(dayjs(), 'day');

  return (
    <div className="max-w-[1400px] mx-auto">
      <GroomPageHeader
        icon={<CarryOutOutlined />}
        title="Công việc Hàng ngày"
        subtitle="Đánh dấu hoàn thành công việc chăm sóc (cho ăn, vệ sinh chuồng, tắm rửa, ngâm chân nước đá) và báo cáo sự cố."
        extra={
          <>
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
              <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => setDay((d) => d.subtract(1, 'day'))} />
              <DatePicker
                variant="borderless"
                value={day}
                onChange={(v) => v && setDay(v)}
                format={formatViDate}
                allowClear={false}
                className="!w-[190px]"
              />
              <Button type="text" size="small" icon={<RightOutlined />} onClick={() => setDay((d) => d.add(1, 'day'))} />
            </div>
            {!isToday && (
              <Button onClick={() => setDay(dayjs())} className="!rounded-full">
                Hôm nay
              </Button>
            )}
          </>
        }
      />

      {overdueTasks.length > 0 && (
        <Alert
          type="warning"
          showIcon
          className="!mb-6 !rounded-xl"
          title={
            <span>
              Bạn còn {overdueTasks.length} công việc chưa hoàn thành từ những ngày trước.{' '}
              <Button
                type="link"
                size="small"
                className="!p-0 !h-auto"
                onClick={() => setDay(dayjs(overdueTasks[overdueTasks.length - 1].scheduledDate))}
              >
                Xem ngày cũ nhất →
              </Button>
            </span>
          }
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<UnorderedListOutlined />} label="Tổng công việc" value={dayTasks.length} iconClass="bg-gray-50 text-[#022c22]" />
        <StatCard icon={<CheckCircleFilled />} label="Đã hoàn thành" value={doneCount} accent="border-t-green-500" iconClass="bg-green-50 text-green-500" />
        <StatCard icon={<ClockCircleOutlined />} label="Còn lại" value={pendingCount} accent="border-t-[#eab308]" iconClass="bg-yellow-50 text-[#eab308]" />
        <StatCard icon={<WarningOutlined />} label="Sự cố đã báo" value={incidentCount} accent="border-t-red-500" iconClass="bg-red-50 text-red-500" />
      </div>

      <div className="premium-card p-5 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-semibold text-[#022c22]">Tiến độ {isToday ? 'hôm nay' : day.format('DD/MM/YYYY')}</span>
              <span className="text-gray-500">
                {doneCount}/{dayTasks.length} công việc
              </span>
            </div>
            <Progress percent={percent} strokeColor={{ from: '#eab308', to: '#022c22' }} showInfo={false} />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Segmented
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: `Tất cả (${dayTasks.length})` },
                { value: 'pending', label: `Chưa xong (${pendingCount})` },
                { value: 'completed', label: `Hoàn thành (${doneCount})` },
              ]}
            />
            <Segmented
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: 'horse', label: '🐴 Theo ngựa' },
                { value: 'type', label: '📋 Theo công việc' },
              ]}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="premium-card p-10 flex justify-center">
          <Spin />
        </div>
      ) : groups.length === 0 ? (
        <div className="premium-card p-10">
          <Empty
            description={
              dayTasks.length === 0
                ? `Không có công việc nào được phân công ${isToday ? 'hôm nay' : 'vào ngày này'}`
                : 'Không có công việc nào khớp bộ lọc'
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {groups.map((group) => (
            <TaskGroupCard
              key={group.key}
              group={group}
              groupBy={groupBy}
              horse={horseById.get(group.key)}
              assignment={assignmentByHorseId.get(group.key)}
              assignmentByHorseId={assignmentByHorseId}
              onComplete={(id) => completeMutation.mutate(id)}
              completingId={completeMutation.isPending ? completeMutation.variables : null}
              onReport={setIncidentTask}
            />
          ))}
        </div>
      )}

      <IncidentReportModal task={incidentTask} open={!!incidentTask} onClose={() => setIncidentTask(null)} />
    </div>
  );
}

function TaskGroupCard({ group, groupBy, horse, assignment, assignmentByHorseId, onComplete, completingId, onReport }) {
  const done = group.items.filter((t) => t.status === 'completed').length;
  const byHorse = groupBy === 'horse';
  const first = group.items[0];
  const taskCfg = TASK_CONFIG[group.key];
  const health = HEALTH_STATUS_CONFIG[horse?.healthStatus];

  return (
    <div className="premium-card p-5">
      <div className="flex items-center gap-3 mb-4">
        {byHorse ? (
          <HorseAvatar name={first.horse?.name} size={44} />
        ) : (
          <div className="w-11 h-11 rounded-full bg-[#fdfbf7] border border-gray-100 flex items-center justify-center text-2xl shrink-0">
            {taskCfg?.emoji}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-[#022c22] m-0">{byHorse ? first.horse?.name || 'Không rõ ngựa' : taskCfg?.label || group.key}</h3>
            {byHorse && health && (
              <Tag color={health.color} className="!m-0 rounded-full">
                {health.label}
              </Tag>
            )}
          </div>
          {byHorse && (
            <div className="text-xs text-gray-500">{assignment ? `📍 ${assignment.stableBlock}` : 'Chưa xếp chuồng'}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Tiến độ</div>
          <div className={`text-lg font-bold ${done === group.items.length ? 'text-green-600' : 'text-[#022c22]'}`}>
            {done}/{group.items.length}
          </div>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-gray-100">
        {group.items.map((task) => {
          const cfg = TASK_CONFIG[task.taskType] || { label: task.taskType, emoji: '📋' };
          const status = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.pending;
          const isDone = task.status === 'completed';
          const stall = assignmentByHorseId.get(refId(task.horse));
          return (
            <div key={task._id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 ${
                    isDone ? 'bg-green-50' : 'bg-[#fdfbf7] border border-gray-100'
                  }`}
                >
                  {isDone ? <CheckCircleFilled style={{ color: '#22c55e' }} /> : cfg.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${isDone ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {byHorse ? cfg.label : task.horse?.name || 'Không rõ ngựa'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {isDone && task.completedAt
                      ? `Hoàn thành lúc ${dayjs(task.completedAt).format('HH:mm')}`
                      : byHorse
                        ? status.label
                        : stall
                          ? parseStableBlock(stall.stableBlock).stall
                          : status.label}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {task.status === 'pending' && (
                    <Popconfirm
                      title="Xác nhận hoàn thành?"
                      description={`${cfg.label} — ${task.horse?.name || ''}`}
                      okText="Hoàn thành"
                      cancelText="Huỷ"
                      onConfirm={() => onComplete(task._id)}
                    >
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckOutlined />}
                        loading={completingId === task._id}
                        className="!rounded-full"
                      >
                        Xong
                      </Button>
                    </Popconfirm>
                  )}
                  {task.status === 'skipped' && <Tag color={status.color}>{status.label}</Tag>}
                  <Button
                    size="small"
                    danger
                    icon={<WarningOutlined />}
                    onClick={() => onReport(task)}
                    className="!rounded-full"
                  >
                    {task.incidentReport ? 'Báo lại' : 'Sự cố'}
                  </Button>
                </div>
              </div>
              {task.incidentReport && <IncidentBox report={task.incidentReport} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
