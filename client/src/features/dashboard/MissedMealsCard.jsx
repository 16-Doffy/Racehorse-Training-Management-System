import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Tag, Button, Typography } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { dailyTaskApi } from '../stable/stableApi';
import { useFirst } from './useFirst';

const { Text } = Typography;
const MEAL_SHORT = { morning: 'Sáng', noon: 'Trưa', evening: 'Chiều' };
const hhmm = (d) => dayjs(d).format('HH:mm');

/**
 * Today's meals that were not given: the window closed with nobody recording it, or the groom
 * reported it could not be given. The horse may not have eaten — harder work is blocked until it has
 * (readiness check) — so the trainer or manager can ask the groom to feed it now ("cho ăn bù").
 * One line per horse, its missed meals side by side, one button for all of them; hidden when nothing
 * was missed.
 */
export default function MissedMealsCard() {
  const today = dayjs().format('YYYY-MM-DD');
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['daily-tasks', 'missed-meals', today],
    queryFn: () => dailyTaskApi.list({ date: today }),
    refetchInterval: 60000,
  });
  const tasks = data?.data || [];
  const makeUps = new Map(tasks.filter((t) => t.makeUpOf).map((t) => [String(t.makeUpOf), t]));
  const missed = tasks
    .filter((t) => t.taskType === 'feeding' && t.mealSlot && !t.makeUpOf)
    .filter((t) => (t.status === 'pending' && t.timing?.state === 'missed') || t.status === 'skipped')
    .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));

  // Per horse, in the order of its first missed meal.
  const horses = [];
  const byHorse = new Map();
  for (const t of missed) {
    const id = String(t.horse?._id || t.horse);
    if (!byHorse.has(id)) {
      const row = { id, name: t.horse?.name || 'Ngựa', meals: [] };
      byHorse.set(id, row);
      horses.push(row);
    }
    byHorse.get(id).meals.push(t);
  }
  const [shown, more] = useFirst(horses, 4);

  const makeUp = useMutation({
    mutationFn: ({ ids }) => Promise.all(ids.map((id) => dailyTaskApi.makeUpMeal(id))),
    onSuccess: () => {
      message.success('Đã báo nhân viên cho ăn bù. Khi họ ghi nhận, kiểm tra lại buổi tập (nhớ chờ đủ thời gian tiêu hóa).');
      queryClient.invalidateQueries({ queryKey: ['daily-tasks'] });
    },
    onError: (err) => message.error(err.message || 'Không báo được.'),
  });

  if (!missed.length) return null;

  /** Where the horse's make-up stands: the button while a meal is not yet asked for, else its state. */
  const action = (row) => {
    const open = row.meals.filter((m) => !makeUps.get(String(m._id)));
    if (open.length) {
      return (
        <Button
          size="small"
          type="primary"
          icon={<SendOutlined />}
          loading={makeUp.isPending && makeUp.variables?.horse === row.id}
          onClick={() => makeUp.mutate({ horse: row.id, ids: open.map((m) => m._id) })}
          className="!h-7 !px-2.5 !text-xs font-semibold"
        >
          Báo cho ăn bù
        </Button>
      );
    }
    const done = row.meals.map((m) => makeUps.get(String(m._id)));
    if (done.some((d) => d.status === 'pending')) {
      return (
        <Tag color="blue" icon={<ClockCircleOutlined />} className="!m-0 text-xs">
          Đã báo, chờ nhân viên
        </Tag>
      );
    }
    if (done.every((d) => d.status === 'completed')) {
      return (
        <Tag color="green" icon={<CheckCircleOutlined />} className="!m-0 text-xs">
          Đã ăn bù {hhmm(done[done.length - 1].completedAt)}
        </Tag>
      );
    }
    const why = done.find((d) => d.status === 'skipped')?.skipReason;
    return (
      <Tag className="!m-0 text-xs" title={why}>
        Không bù được
      </Tag>
    );
  };

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] bg-[#FFFDF8] rounded-xl overflow-hidden"
      styles={{
        title: { whiteSpace: 'normal', overflow: 'visible', padding: '12px 16px' },
        body: { padding: '4px 16px 10px 16px' },
      }}
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-0.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-[15px]">Bữa ăn bị bỏ lỡ</span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-800 border border-rose-200 shrink-0 tabular-nums">
              {missed.length} bữa · {horses.length} ngựa
            </span>
          </div>
          <span className="text-[11px] font-medium text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">Chặn bài tập nặng</span>
        </div>
      }
    >
      <div className="flex flex-col divide-y divide-gray-100">
        {shown.map((row) => {
          const meals = row.meals.map((m) => `${MEAL_SHORT[m.mealSlot] || 'Bữa'} ${hhmm(m.scheduledDate)}${m.status === 'skipped' ? ' (báo bỏ)' : ''}`).join(' · ');
          const reasons = row.meals.filter((m) => m.skipReason).map((m) => `${MEAL_SHORT[m.mealSlot]}: ${m.skipReason}`).join('; ');
          return (
            <div key={row.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <Link to={`/horses/${row.id}`} className="block truncate text-sm font-semibold">
                  {row.name}
                </Link>
                <Text type="danger" className="block truncate !text-xs tabular-nums" title={reasons ? `${meals} — ${reasons}` : meals}>
                  {meals}
                </Text>
              </div>
              <div className="shrink-0">{action(row)}</div>
            </div>
          );
        })}
      </div>
      {more}
    </Card>
  );
}
