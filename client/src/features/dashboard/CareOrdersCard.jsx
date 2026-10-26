import { useState } from 'react';
import { Button, Card, Progress, Tag, Typography } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { treatmentApi } from '../health/healthApi';
import { TASK_TYPE_LABELS } from '../../constants/care';
import { TRAINING_LEVEL_META } from '../../constants/health';
import QuietCard from './QuietCard';
import { useFirst } from './useFirst';

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
 * This is what the trainer and manager follow after a vet prescribes. One line per horse (how far its
 * doses are, how many were missed); its doses open under it.
 */
export default function CareOrdersCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['care-orders'],
    queryFn: () => treatmentApi.careOrders(),
    refetchInterval: 60 * 1000,
  });
  const rows = data?.data || [];
  const [shown, more] = useFirst(rows, 3);
  const [opened, setOpened] = useState(() => new Set());
  const toggle = (id) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  if (!isLoading && !rows.length) return <QuietCard title="Y lệnh bác sĩ hôm nay">Không có ngựa nào cần theo dõi y lệnh</QuietCard>;
  const open = rows.reduce((sum, r) => sum + r.progress.waiting + r.progress.acknowledged, 0);

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl overflow-hidden"
      styles={{ title: { whiteSpace: 'normal', overflow: 'visible' }, header: { height: 'auto', whiteSpace: 'normal' }, body: { padding: '4px 16px 10px 16px' } }}
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
      <div className="flex flex-col divide-y divide-gray-100">
        {shown.map((r) => {
          const { total, done } = r.progress;
          const missed = r.tasks.filter((t) => taskState(t).color === 'red').length;
          const expanded = opened.has(r._id);
          return (
            <div key={r._id} className="py-2">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <Link to={`/horses/${r.horse?._id}`} className="truncate font-medium">
                    {r.horse?.name || 'Ngựa'}
                  </Link>
                  {r.trainingLevel && r.trainingLevel !== 'high' && (
                    <Tag color={TRAINING_LEVEL_META[r.trainingLevel]?.color} className="!m-0">
                      {TRAINING_LEVEL_META[r.trainingLevel]?.short}
                    </Tag>
                  )}
                  {missed > 0 && (
                    <Tag color="red" className="!m-0">
                      {missed} bỏ lỡ
                    </Tag>
                  )}
                  {r.tasks.length === 0 && (
                    <Text type="secondary" className="!text-xs">
                      chưa có việc hôm nay
                    </Text>
                  )}
                </div>
                <Progress percent={total ? Math.round((done / total) * 100) : 0} size="small" showInfo={false} className="!m-0 !w-16 shrink-0" />
                <Text className="!text-xs tabular-nums whitespace-nowrap">
                  {done}/{total}
                </Text>
                <Button
                  type="text"
                  size="small"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'Thu gọn' : 'Xem'} y lệnh của ${r.horse?.name || 'ngựa'}`}
                  icon={<DownOutlined rotate={expanded ? 180 : 0} className="!text-[10px]" />}
                  onClick={() => toggle(r._id)}
                />
              </div>
              {expanded && (
                <div className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-gray-100 pl-3">
                  <Text type="secondary" className="!text-xs">
                    Bác sĩ {r.prescribedBy?.name || '—'} · từ {dayjs(r.startDate).format('DD/MM')}
                    {r.careInstructions ? ` · Y lệnh: ${r.careInstructions}` : ''}
                  </Text>
                  {r.tasks.length === 0 ? (
                    <Text type="secondary" className="!text-xs">
                      Chưa có việc nào hôm nay — ngựa có thể chưa có nhân viên chăm sóc phụ trách.
                    </Text>
                  ) : (
                    r.tasks.map((t) => {
                      const state = taskState(t);
                      return (
                        <div key={t._id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                          {t.dueTime && (
                            <Tag color="purple" className="!m-0">
                              {t.dueTime}
                            </Tag>
                          )}
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
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {more}
    </Card>
  );
}
