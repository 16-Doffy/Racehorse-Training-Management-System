import { useState } from 'react';
import { Button, Empty, Spin, Tag, Tooltip, Typography } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { feedingApi } from '../feeding/feedingApi';
import { WEEK_DAYS, mondayOf } from '../training/trainingVocab';
import { MEAL_STATUS_META as MEAL_STATUS } from '../../constants/care';

const { Text } = Typography;

const SLOT_LABELS = { morning: 'Sáng', noon: 'Trưa', evening: 'Chiều' };
const amount = (n) => Number(n).toLocaleString('vi-VN');
const itemsText = (items) => (items || []).map((i) => `${amount(i.amount)} ${i.unit} ${i.name}`).join(', ');

function MealCell({ meal, isToday }) {
  if (!meal?.status) return <span className="block py-1 pl-1 text-[11px] text-gray-400">—</span>;
  const meta = MEAL_STATUS[meal.status] || MEAL_STATUS.upcoming;
  const makeUp = meal.makeUp && (MEAL_STATUS[meal.makeUp.status] || MEAL_STATUS.upcoming);
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 text-left ${meal.status === 'planned' ? 'border-dashed border-gray-300' : 'border-gray-200 bg-white'} ${
        isToday && meal.status !== 'planned' ? 'shadow-xs' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold tabular-nums text-gray-800">{meal.time}</span>
        <Tag color={meta.color} className="!m-0 !px-1.5 !text-[10px] !leading-4">
          {meta.label}
        </Tag>
      </div>
      {meal.status === 'fed' && meal.doneAt && (
        <div className="mt-0.5 text-[11px] text-gray-600">
          {meal.doneBy || 'Nhân viên'} · {dayjs(meal.doneAt).format('HH:mm')}
        </div>
      )}
      {meal.status === 'skipped' && (
        <div className="mt-0.5 text-[11px] text-orange-700">{meal.reason ? `NV báo: ${meal.reason}` : meal.doneBy ? `${meal.doneBy} cho bỏ bữa` : 'Đã bỏ bữa'}</div>
      )}
      {makeUp && (
        <div className="mt-0.5 text-[11px] text-gray-600">
          Cho ăn bù {meal.makeUp.time}: <span className={meal.makeUp.status === 'fed' ? 'text-green-700' : ''}>{makeUp.label.toLowerCase()}</span>
          {meal.makeUp.status === 'fed' && meal.makeUp.doneAt ? ` · ${meal.makeUp.doneBy || 'NV'} ${dayjs(meal.makeUp.doneAt).format('HH:mm')}` : ''}
        </div>
      )}
      {meal.items?.length > 0 && (
        <Tooltip title={itemsText(meal.items)}>
          <div className="mt-0.5 truncate text-[11px] text-gray-500">{itemsText(meal.items)}</div>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * One horse's feeding week, like the training week: a column per day, a row per meal. Each meal says
 * what it is and what happened (who fed it and when, missed, skipped, made up); days ahead show the
 * meals planned from the confirmed feeding calendar or the standing ration.
 */
export default function FeedingTimetable({ horseId }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(dayjs()));
  const week = weekStart.format('YYYY-MM-DD');
  const { data, isLoading } = useQuery({
    queryKey: ['feeding-timetable', horseId, week],
    queryFn: () => feedingApi.timetable(horseId, week),
    enabled: Boolean(horseId),
    refetchInterval: 60 * 1000,
  });
  const timetable = data?.data;
  const days = WEEK_DAYS.map((w, i) => ({ ...w, date: weekStart.add(i, 'day') }));
  const isThisWeek = weekStart.isSame(mondayOf(dayjs()), 'day');
  const mealOf = (date, slot) => timetable?.days?.find((d) => d.date === date.format('YYYY-MM-DD'))?.meals.find((m) => m.slot === slot);

  return (
    <section aria-label="Thời khóa biểu cho ăn">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Text strong className="!text-sm">
            Thời khóa biểu cho ăn
          </Text>
          {timetable && (
            <Text type="secondary" className="!text-xs">
              {timetable.caretaker ? `· Nhân viên chăm sóc: ${timetable.caretaker.name}` : '· Chưa có nhân viên chăm sóc: bữa sẽ không được giao'}
            </Text>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="small" icon={<LeftOutlined />} aria-label="Tuần trước" onClick={() => setWeekStart(weekStart.subtract(7, 'day'))} />
          <Button size="small" icon={<RightOutlined />} aria-label="Tuần sau" onClick={() => setWeekStart(weekStart.add(7, 'day'))} />
          <Text className="px-1 !text-xs tabular-nums">
            {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
          </Text>
          {!isThisWeek && (
            <Button size="small" type="link" className="!px-1 !text-xs" onClick={() => setWeekStart(mondayOf(dayjs()))}>
              Về tuần này
            </Button>
          )}
        </div>
      </div>
      {isLoading ? (
        <div className="py-8 text-center">
          <Spin />
        </div>
      ) : !timetable ? (
        <Empty description="Chưa tải được thời khóa biểu." />
      ) : (
        <div className="light-surface-box overflow-x-auto rounded-xl border border-gray-200/80 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200/80 bg-gray-50/80">
                <th className="w-[64px] px-2 py-2 text-left text-xs font-semibold text-gray-700">Bữa</th>
                {days.map((d) => {
                  const today = d.date.isSame(dayjs(), 'day');
                  return (
                    <th key={d.day} className={`px-1.5 py-2 text-left text-xs font-semibold ${today ? 'bg-emerald-50 text-emerald-950' : 'text-gray-600'}`}>
                      {d.short} <span className="font-normal tabular-nums text-gray-500">{d.date.format('DD/MM')}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(SLOT_LABELS).map(([slot, label]) => (
                <tr key={slot} className="align-top">
                  <td className="px-2 py-2 text-xs font-semibold text-gray-700">{label}</td>
                  {days.map((d) => {
                    const today = d.date.isSame(dayjs(), 'day');
                    return (
                      <td key={d.day} className={`px-1 py-1.5 ${today ? 'bg-emerald-50/30' : ''}`}>
                        <MealCell meal={mealOf(d.date, slot)} isToday={today} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Text type="secondary" className="mt-1 block !text-[11px]">
        Hôm nay và trước đó: bữa trong danh sách việc của nhân viên và kết quả. Ngày tới: bữa dự kiến theo lịch cho ăn đã xác nhận, nếu chưa có thì theo khẩu phần đang áp dụng.
      </Text>
    </section>
  );
}
