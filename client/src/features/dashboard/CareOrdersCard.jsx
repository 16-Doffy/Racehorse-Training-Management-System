import { Card, Empty, Progress, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { treatmentApi } from '../health/healthApi';
import { TASK_TYPE_LABELS } from '../../constants/care';

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
  const open = rows.reduce((sum, r) => sum + r.progress.waiting + r.progress.acknowledged, 0);

  return (
    <Card
      className="!mt-6"
      loading={isLoading}
      title={
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span>Y lệnh của bác sĩ hôm nay</span>
          {open > 0 && (
            <Text type="secondary" className="!text-xs">
              {open} việc chưa thực hiện
            </Text>
          )}
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có ngựa nào đang điều trị theo y lệnh." />
      ) : (
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
                  {r.isTrainingLocked && (
                    <Tag color="red" className="!m-0">
                      Đang khóa huấn luyện
                    </Tag>
                  )}
                  <div className="ml-auto flex items-center gap-2 min-w-[140px]">
                    <Progress percent={total ? Math.round((done / total) * 100) : 0} size="small" showInfo={false} className="!m-0 w-20" />
                    <Text className="!text-xs tabular-nums">
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
                          <span className="font-medium">{TASK_TYPE_LABELS[t.taskType] || t.taskType}</span>
                          {t.taskType === 'medication' && <span className="text-gray-600">{t.note}</span>}
                          <Tag color={state.color} className="!m-0 !whitespace-normal">
                            {state.label}
                          </Tag>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
