import { useMemo, useState } from 'react';
import { Button, Segmented, Select, Modal, Radio, Empty, Spin, Tag, Alert } from 'antd';
import { WarningOutlined, AlertFilled, CalendarOutlined, FireOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMyTasks, useStableOverview } from './useGroomData';
import { HEADING_FONT, SEVERITY_CONFIG, TASK_CONFIG, TASK_STATUS_CONFIG, refId } from './groomConfig';
import { GroomPageHeader, StatCard, HorseAvatar, IncidentBox } from './GroomUI';
import IncidentReportModal from './IncidentReportModal';

const SEVERITY_BAR = { low: 'bg-blue-400', medium: 'bg-orange-400', high: 'bg-red-500' };

export default function IncidentReportsPage() {
  const [severityFilter, setSeverityFilter] = useState('all');
  const [horseFilter, setHorseFilter] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [incidentTask, setIncidentTask] = useState(null);

  const { tasks, isLoading } = useMyTasks();
  const { assignmentByHorseId } = useStableOverview();

  const reported = useMemo(
    () =>
      tasks
        .filter((t) => t.incidentReport)
        .sort((a, b) => new Date(b.incidentReport.reportedAt || b.updatedAt) - new Date(a.incidentReport.reportedAt || a.updatedAt)),
    [tasks]
  );

  const visible = reported
    .filter((t) => severityFilter === 'all' || t.incidentReport.severity === severityFilter)
    .filter((t) => !horseFilter || refId(t.horse) === horseFilter);

  const weekAgo = dayjs().subtract(7, 'day');
  const lastWeek = reported.filter((t) => dayjs(t.incidentReport.reportedAt).isAfter(weekAgo)).length;
  const highCount = reported.filter((t) => t.incidentReport.severity === 'high').length;
  const horseOptions = uniqueHorses(tasks).map((h) => ({ value: h._id, label: h.name }));

  return (
    <div className="max-w-[1400px] mx-auto">
      <GroomPageHeader
        icon={<WarningOutlined />}
        title="Báo cáo Sự cố"
        subtitle="Gửi báo cáo sự cố đột xuất tại chuồng (ngựa bỏ ăn, đau bụng/sốt, móng bị xước...) kèm hình ảnh thực tế. Bác sĩ thú y nhận thông báo ngay."
        extra={
          <Button type="primary" danger size="large" icon={<PlusOutlined />} onClick={() => setPickerOpen(true)} className="!rounded-lg shadow-lg">
            Báo cáo sự cố mới
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<AlertFilled />} label="Tổng báo cáo" value={reported.length} accent="border-t-red-500" iconClass="bg-red-50 text-red-500" />
        <StatCard icon={<FireOutlined />} label="Nghiêm trọng" value={highCount} accent="border-t-red-700" iconClass="bg-red-100 text-red-700" />
        <StatCard icon={<CalendarOutlined />} label="7 ngày qua" value={lastWeek} accent="border-t-[#eab308]" iconClass="bg-yellow-50 text-[#eab308]" />
        <StatCard icon={<WarningOutlined />} label="Ngựa liên quan" value={uniqueHorses(reported).length} />
      </div>

      <div className="premium-card p-4 mb-6 flex flex-wrap items-center gap-4">
        <span className="font-medium text-gray-700">Lọc:</span>
        <Segmented
          value={severityFilter}
          onChange={setSeverityFilter}
          options={[
            { value: 'all', label: 'Tất cả' },
            ...Object.entries(SEVERITY_CONFIG)
              .reverse()
              .map(([value, cfg]) => ({ value, label: cfg.label })),
          ]}
        />
        <Select allowClear placeholder="Tất cả ngựa" value={horseFilter} onChange={setHorseFilter} options={horseOptions} style={{ minWidth: 180 }} />
        <span className="text-sm text-gray-500 ml-auto">
          Hiển thị <strong className="text-gray-800">{visible.length}</strong> báo cáo
        </span>
      </div>

      {isLoading ? (
        <div className="premium-card p-10 flex justify-center">
          <Spin />
        </div>
      ) : visible.length === 0 ? (
        <div className="premium-card p-10">
          <Empty description={reported.length === 0 ? 'Bạn chưa gửi báo cáo sự cố nào' : 'Không có báo cáo nào khớp bộ lọc'} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {visible.map((task) => {
            const cfg = TASK_CONFIG[task.taskType] || { label: task.taskType, emoji: '📋' };
            return (
              <div key={task._id} className="premium-card overflow-hidden flex">
                <div className={`w-1.5 shrink-0 ${SEVERITY_BAR[task.incidentReport.severity] || SEVERITY_BAR.medium}`} />
                <div className="p-5 flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <HorseAvatar name={task.horse?.name} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#022c22]">{task.horse?.name || 'Không rõ ngựa'}</div>
                      <div className="text-xs text-gray-500">
                        📍 {assignmentByHorseId.get(refId(task.horse))?.stableBlock || 'Chưa xếp chuồng'} • {cfg.emoji} {cfg.label} •{' '}
                        {dayjs(task.scheduledDate).format('DD/MM/YYYY')}
                      </div>
                    </div>
                    <Button size="small" className="!rounded-full" onClick={() => setIncidentTask(task)}>
                      Cập nhật
                    </Button>
                  </div>
                  <IncidentBox report={task.incidentReport} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskPickerModal
        open={pickerOpen}
        tasks={tasks}
        onClose={() => setPickerOpen(false)}
        onPick={(task) => {
          setPickerOpen(false);
          setIncidentTask(task);
        }}
      />
      <IncidentReportModal task={incidentTask} open={!!incidentTask} onClose={() => setIncidentTask(null)} />
    </div>
  );
}

function uniqueHorses(tasks) {
  const map = new Map();
  tasks.forEach((t) => t.horse && map.set(refId(t.horse), t.horse));
  return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * An incident is recorded on one of the groom's assigned tasks (that is where the API stores it),
 * so a new report starts by choosing the horse and the related task — today's tasks first.
 */
function TaskPickerModal({ open, tasks, onClose, onPick }) {
  const [horseId, setHorseId] = useState(null);
  const [taskId, setTaskId] = useState(null);

  const horses = uniqueHorses(tasks);
  const horseTasks = tasks
    .filter((t) => refId(t.horse) === horseId)
    .sort((a, b) => {
      const aToday = dayjs(a.scheduledDate).isSame(dayjs(), 'day') ? 0 : 1;
      const bToday = dayjs(b.scheduledDate).isSame(dayjs(), 'day') ? 0 : 1;
      return aToday - bToday || new Date(b.scheduledDate) - new Date(a.scheduledDate);
    })
    .slice(0, 8);

  const close = () => {
    setHorseId(null);
    setTaskId(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={close}
      title={<span style={{ fontFamily: HEADING_FONT }}>Báo cáo sự cố mới</span>}
      okText="Tiếp tục"
      cancelText="Huỷ"
      okButtonProps={{ disabled: !taskId, danger: true }}
      onOk={() => {
        const task = tasks.find((t) => t._id === taskId);
        setHorseId(null);
        setTaskId(null);
        onPick(task);
      }}
    >
      <div className="flex flex-col gap-4 py-2">
        <div>
          <div className="font-medium mb-2">1. Chọn ngựa gặp sự cố</div>
          <Select
            className="w-full"
            placeholder="Chọn ngựa"
            value={horseId}
            onChange={(v) => {
              setHorseId(v);
              const first = tasks.find((t) => refId(t.horse) === v && dayjs(t.scheduledDate).isSame(dayjs(), 'day'));
              setTaskId(first?._id || null);
            }}
            options={horses.map((h) => ({ value: h._id, label: h.name }))}
            notFoundContent="Bạn chưa được giao công việc nào"
          />
        </div>

        {horseId && (
          <div>
            <div className="font-medium mb-2">2. Công việc liên quan</div>
            {horseTasks.length === 0 ? (
              <Alert type="info" showIcon title="Chưa có công việc nào với ngựa này." />
            ) : (
              <Radio.Group value={taskId} onChange={(e) => setTaskId(e.target.value)} className="w-full">
                <div className="flex flex-col gap-2">
                  {horseTasks.map((t) => {
                    const cfg = TASK_CONFIG[t.taskType] || { label: t.taskType, emoji: '📋' };
                    const status = TASK_STATUS_CONFIG[t.status] || TASK_STATUS_CONFIG.pending;
                    const isToday = dayjs(t.scheduledDate).isSame(dayjs(), 'day');
                    return (
                      <Radio key={t._id} value={t._id} className="!border !border-gray-100 !rounded-lg !px-3 !py-2 !m-0 w-full">
                        <span className="text-sm">
                          {cfg.emoji} {cfg.label} • {isToday ? 'Hôm nay' : dayjs(t.scheduledDate).format('DD/MM/YYYY')}
                        </span>
                        <Tag color={status.color} className="!ml-2">
                          {status.label}
                        </Tag>
                        {t.incidentReport && <Tag color="red">Đã có báo cáo</Tag>}
                      </Radio>
                    );
                  })}
                </div>
              </Radio.Group>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
