import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Tag, Button } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { dailyTaskApi } from '../stable/stableApi';

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

  const makeUp = useMutation({
    mutationFn: (id) => dailyTaskApi.makeUpMeal(id),
    onSuccess: () => {
      message.success(
        'Đã báo nhân viên cho ăn bù. Khi họ ghi nhận, kiểm tra lại buổi tập (nhớ chờ đủ thời gian tiêu hóa).'
      );
      queryClient.invalidateQueries({ queryKey: ['daily-tasks'] });
    },
    onError: (err) => message.error(err.message || 'Không báo được.'),
  });

  if (!missed.length) return null;

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] bg-[#FFFDF8] rounded-xl overflow-hidden"
      styles={{
        title: { whiteSpace: 'normal', overflow: 'visible', padding: '12px 16px' },
        body: { padding: '12px 16px 16px 16px' },
      }}
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-0.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-[15px]">Bữa ăn bị bỏ lỡ</span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-800 border border-rose-200 shrink-0 tabular-nums">
              {missed.length} bữa
            </span>
          </div>
          <span className="text-[11px] font-medium text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
            Chặn bài tập nặng
          </span>
        </div>
      }
    >
      <div className="space-y-2.5">
        {missed.map((t) => {
          const horseId = t.horse?._id || t.horse;
          const horseName = t.horse?.name || 'Ngựa';
          const done = makeUps.get(String(t._id));
          const isSkipped = t.status === 'skipped';

          return (
            <div
              key={t._id}
              className="p-3 rounded-lg border border-rose-100 bg-rose-50/20 hover:bg-rose-50/40 transition-colors flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/horses/${horseId}`}
                    className="font-semibold text-emerald-950 hover:text-emerald-700 text-sm truncate block"
                  >
                    {horseName}
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-600">
                    <ClockCircleOutlined className="text-gray-400 text-[11px]" />
                    <span className="font-medium text-gray-800">
                      {MEAL_LABELS[t.mealSlot] || 'Bữa ăn'}
                    </span>
                    <span className="tabular-nums font-semibold text-rose-700">
                      {hhmm(t.scheduledDate)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  {isSkipped ? (
                    <Tag color="orange" className="!m-0 text-[11px]">
                      Báo bỏ bữa
                    </Tag>
                  ) : (
                    <Tag color="red" className="!m-0 text-[11px]">
                      Quá hạn
                    </Tag>
                  )}
                </div>
              </div>

              {isSkipped && t.skipReason && (
                <p className="text-xs text-amber-900 bg-amber-50/80 px-2 py-1 rounded border border-amber-200/60 m-0">
                  Lý do: {t.skipReason}
                </p>
              )}

              <div className="pt-1 flex items-center justify-between gap-2 border-t border-rose-100/60">
                <div className="text-[11px] text-gray-500">
                  {done ? 'Trạng thái bù:' : 'Yêu cầu hành động:'}
                </div>

                <div>
                  {done?.status === 'completed' && (
                    <Tag color="green" icon={<CheckCircleOutlined />} className="!m-0 text-xs font-medium">
                      Đã ăn bù lúc {hhmm(done.completedAt)}
                    </Tag>
                  )}
                  {done?.status === 'pending' && (
                    <Tag color="blue" icon={<ClockCircleOutlined />} className="!m-0 text-xs font-medium">
                      Đã báo — chờ nhân viên
                    </Tag>
                  )}
                  {done?.status === 'skipped' && (
                    <Tag className="!m-0 text-xs text-gray-600">
                      Không bù được{done.skipReason ? `: ${done.skipReason}` : ''}
                    </Tag>
                  )}
                  {!done && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<SendOutlined />}
                      loading={makeUp.isPending && makeUp.variables === t._id}
                      onClick={() => makeUp.mutate(t._id)}
                      className="!h-7 !px-2.5 !text-xs font-semibold !bg-[#0F5A43] hover:!bg-[#157356] !border-[#0F5A43]"
                    >
                      Báo cho ăn bù
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
