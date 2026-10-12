import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Table, Tag, Button, Typography } from 'antd';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { dailyTaskApi } from '../stable/stableApi';

const { Text } = Typography;
const MEAL_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
const hhmm = (d) => dayjs(d).format('HH:mm');

/**
 * Today's meals that were not given: the window closed with nobody recording it, or the groom
 * reported it could not be given. The horse may not have eaten — harder work is blocked until it has
 * (readiness check) — so the trainer or manager can ask the groom to feed it now ("cho ăn bù").
 * Hidden when nothing was missed.
 */
export default function MissedMealsCard() {
  const today = dayjs().format('YYYY-MM-DD');
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['daily-tasks', 'missed-meals', today], queryFn: () => dailyTaskApi.list({ date: today }), refetchInterval: 60000 });
  const tasks = data?.data || [];
  const makeUps = new Map(tasks.filter((t) => t.makeUpOf).map((t) => [String(t.makeUpOf), t]));
  const missed = tasks
    .filter((t) => t.taskType === 'feeding' && t.mealSlot && !t.makeUpOf)
    .filter((t) => (t.status === 'pending' && t.timing?.state === 'missed') || t.status === 'skipped')
    .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));

  const makeUp = useMutation({
    mutationFn: (id) => dailyTaskApi.makeUpMeal(id),
    onSuccess: () => {
      message.success('Đã báo nhân viên cho ăn bù. Khi họ ghi nhận, kiểm tra lại buổi tập (nhớ chờ đủ thời gian tiêu hóa).');
      queryClient.invalidateQueries({ queryKey: ['daily-tasks'] });
    },
    onError: (err) => message.error(err.message || 'Không báo được.'),
  });

  if (!missed.length) return null;
  return (
    <Card
      className="mt-6"
      title={
        <span>
          Bữa bị bỏ lỡ hôm nay{' '}
          <Text type="secondary" className="!text-xs font-normal">
            ngựa có thể chưa ăn — bài trung bình/nặng bị chặn cho tới khi được cho ăn
          </Text>
        </span>
      }
    >
      <Table
        size="small"
        rowKey="_id"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={missed}
        columns={[
          { title: 'Ngựa', key: 'horse', render: (_, t) => <Link to={`/horses/${t.horse?._id || t.horse}`}>{t.horse?.name || 'Ngựa'}</Link> },
          { title: 'Bữa', key: 'meal', render: (_, t) => `${MEAL_LABELS[t.mealSlot]} ${hhmm(t.scheduledDate)}` },
          {
            title: 'Tình trạng',
            key: 'state',
            render: (_, t) =>
              t.status === 'skipped' ? (
                <span>
                  <Tag color="orange" className="!m-0">Nhân viên báo không cho ăn</Tag>
                  {t.skipReason && <Text type="secondary" className="!text-xs ml-2">{t.skipReason}</Text>}
                </span>
              ) : (
                <Tag color="red" className="!m-0">Quá hạn, chưa ghi nhận</Tag>
              ),
          },
          {
            title: 'Cho ăn bù',
            key: 'makeUp',
            render: (_, t) => {
              const done = makeUps.get(String(t._id));
              if (done?.status === 'completed') return <Tag color="green" className="!m-0">Đã cho ăn bù lúc {hhmm(done.completedAt)}</Tag>;
              if (done?.status === 'pending') return <Tag color="blue" className="!m-0">Đã báo — chờ nhân viên</Tag>;
              if (done?.status === 'skipped') return <Tag className="!m-0">Không cho ăn bù được{done.skipReason ? `: ${done.skipReason}` : ''}</Tag>;
              return (
                <Button size="small" type="primary" loading={makeUp.isPending && makeUp.variables === t._id} onClick={() => makeUp.mutate(t._id)}>
                  Báo nhân viên cho ăn bù
                </Button>
              );
            },
          },
        ]}
      />
    </Card>
  );
}
