import { Card, Progress, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { treatmentApi } from '../health/healthApi';
import { TASK_TYPE_LABELS } from '../../constants/care';
import { TRAINING_LEVEL_META } from '../../constants/health';
import QuietCard from './QuietCard';

const { Text } = Typography;

/** Where one of today's care tasks stands, in the words the trainer and manager need. */
function taskState(task) {
  const by = task.skippedBy?.name || task.assignedTo?.name;
  if (task.status === 'completed') {
    return { color: 'green', label: `Đã thực hiện ${dayjs(task.completedAt).format('HH:mm')}${task.assignedTo?.name ? ` — ${task.assignedTo.name}` : ''}` };
  }
  if (task.status === 'skipped') {
    return task.skipReason
      ? { color: 'red', label: `Không thực hiện được${by ? ` (${by})` : ''}: ${task.skipReason}` }
      : { color: 'default', label: 'Đã cho bỏ qua' };
  }
  if (task.timing?.state === 'missed') return { color: 'red', label: 'Bỏ lỡ — hết ngày chưa thực hiện' };
  if (task.acknowledgedAt) {
    return { color: 'blue', label: `Đã tiếp nhận ${dayjs(task.acknowledgedAt).format('HH:mm')}${task.assignedTo?.name ? ` — ${task.assignedTo.name}` : ''}` };
  }
  return { color: 'gold', label: `Chờ ${task.assignedTo?.name || 'nhân viên chăm sóc'} tiếp nhận` };
}

/**
 * The vet's orders being carried out today: for each horse under treatment, every dose and care
 * instruction with whether the groom has taken it on, given it (when, by whom) or could not (why).
 * This is what the trainer and manager follow after a vet prescribes.
 */
export default function CareOrdersCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['care-orders'],
    queryFn: () => treatmentApi.careOrders(),
    refetchInterval: 60 * 1000,
  });
  const rows = data?.data || [];
  if (!isLoading && !rows.length) return <QuietCard title="Y lệnh bác sĩ hôm nay">Không có ngựa nào cần theo dõi y lệnh</QuietCard>;
  const open = rows.reduce((sum, r) => sum + r.progress.waiting + r.progress.acknowledged, 0);

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl overflow-hidden"
      styles={{ title: { whiteSpace: 'normal', overflow: 'visible' }, header: { height: 'auto', whiteSpace: 'normal' } }}
      loading={isLoading}
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900 text-[15px]">Y lệnh bác sĩ hôm nay</span>
            {open > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                {open} chưa làm
              </span>
            )}
          </div>
          <Text type="secondary" className="!text-xs font-normal">
            {open > 0 ? `${open} liều/việc cần cho` : 'Đã hoàn tất các liều'}
          </Text>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {rows.map((r) => {
          const { total, done } = r.progress;
          return (
            <div key={r._id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/horses/${r.horse?._id}`} className="font-medium">
                  {r.horse?.name || 'Ngựa'}
                </Link>
                <Text type="secondary" className="!text-xs">
                  Bác sĩ {r.prescribedBy?.name || '—'} · từ {dayjs(r.startDate).format('DD/MM')}
                </Text>
                {r.trainingLevel && r.trainingLevel !== 'high' && (
                  <Tag color={TRAINING_LEVEL_META[r.trainingLevel]?.color} className="!m-0">
                    {TRAINING_LEVEL_META[r.trainingLevel]?.short}
                  </Tag>
                )}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <Progress percent={total ? Math.round((done / total) * 100) : 0} size="small" showInfo={false} className="!m-0 w-20" />
                  <Text className="!text-xs tabular-nums whitespace-nowrap">
                    {done}/{total} đã làm
                  </Text>
                </div>
              </div>
              {r.careInstructions && (
                <Text type="secondary" className="block !text-xs mt-1">
                  Y lệnh: {r.careInstructions}
                </Text>
              )}
              {r.tasks.length === 0 ? (
                <Text type="secondary" className="block !text-xs mt-2">
                  Chưa có việc nào hôm nay — ngựa có thể chưa có nhân viên chăm sóc phụ trách.
                </Text>
              ) : (
                <div className="flex flex-col gap-1.5 mt-2">
                  {r.tasks.map((t) => {
                    const state = taskState(t);
                    return (
                      <div key={t._id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        {t.dueTime && <Tag color="purple" className="!m-0">{t.dueTime}</Tag>}
                        <span className="font-medium">{TASK_TYPE_LABELS[t.taskType] || t.taskType}</span>
                        {t.taskType === 'medication' && <span className="text-gray-600">{t.note}</span>}
                        <Tag color={state.color} className="!m-0 !whitespace-normal">
                          {state.label}
                        </Tag>
                        {t.status === 'pending' && t.supplyStatus && !t.supplyStatus.ok && (
                          <Tag color="red" className="!m-0 !whitespace-normal">
                            Thiếu {t.supplyStatus.missing.map((m) => `${m.name} (còn ${m.available} ${m.unit})`).join(', ')}
                          </Tag>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
