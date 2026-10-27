import { Link } from 'react-router-dom';
import { Button, Card, Progress, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { dailyTaskApi } from '../stable/stableApi';
import QuietCard from './QuietCard';

/** Where a task of today stands for the count: done, missed (skipped or its window closed), late, or still to do. */
function stateOf(task) {
  if (task.status === 'completed') return 'done';
  if (task.status === 'skipped' || task.timing?.state === 'missed') return 'missed';
  if (task.timing?.state === 'late') return 'late';
  return 'open';
}

/**
 * The Manager's view of the grooms' day: each caretaker's tasks today (meals, care, medication), how many
 * are done, and how many were missed or are running late, the ones with misses first; tasks given to no
 * one are a line of their own. The tasks are today's list (the same query as the meal cards).
 */
export default function StaffTodayCard() {
  const today = dayjs().format('YYYY-MM-DD');
  const { data, isLoading } = useQuery({
    queryKey: ['daily-tasks', 'missed-meals', today],
    queryFn: () => dailyTaskApi.list({ date: today }),
    refetchInterval: 60000,
  });
  const tasks = data?.data || [];

  const people = new Map();
  for (const t of tasks) {
    const id = t.assignedTo?._id ? String(t.assignedTo._id) : 'none';
    if (!people.has(id)) people.set(id, { id, name: t.assignedTo?.name || 'Chưa giao cho ai', total: 0, done: 0, missed: 0, late: 0 });
    const p = people.get(id);
    p.total += 1;
    const state = stateOf(t);
    if (state !== 'open') p[state] += 1;
  }
  const rows = [...people.values()].sort((a, b) => Number(a.id === 'none') - Number(b.id === 'none') || b.missed - a.missed || b.late - a.late || a.name.localeCompare(b.name, 'vi'));
  const done = rows.reduce((n, r) => n + r.done, 0);

  if (!isLoading && !tasks.length) return <QuietCard title="Nhân viên chăm sóc hôm nay">Hôm nay chưa có việc chăm sóc nào</QuietCard>;

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl"
      loading={isLoading}
      styles={{ title: { whiteSpace: 'normal' }, body: { padding: '4px 16px 12px' } }}
      title={
        <div className="py-1">
          <span className="font-semibold text-gray-900 text-[15px]">Nhân viên chăm sóc hôm nay</span>
          <p className="m-0 mt-0.5 text-xs font-normal text-gray-600 tabular-nums">
            {done}/{tasks.length} việc đã xong
          </p>
        </div>
      }
      extra={
        <Link to="/admin/stables">
          <Button size="small">Phân công</Button>
        </Link>
      }
    >
      <ul className="m-0 list-none divide-y divide-gray-100 p-0">
        {rows.map((r) => (
          <li key={r.id} className="py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className={`min-w-0 flex-1 truncate font-medium ${r.id === 'none' ? 'text-gray-500' : 'text-gray-900'}`}>{r.name}</span>
              {r.missed > 0 && (
                <Tag color="error" className="!m-0 shrink-0 !text-[11px]">
                  Lỡ {r.missed}
                </Tag>
              )}
              {r.late > 0 && (
                <Tag color="warning" className="!m-0 shrink-0 !text-[11px]">
                  Trễ {r.late}
                </Tag>
              )}
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-gray-600">
                {r.done}/{r.total}
              </span>
            </div>
            <Progress percent={Math.round((r.done / r.total) * 100)} showInfo={false} size="small" strokeColor="#2E7D4F" className="!m-0" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
