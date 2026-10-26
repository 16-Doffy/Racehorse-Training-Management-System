import { useState } from 'react';
import { Button, Spin, Tag, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined, ClockCircleOutlined, CheckCircleOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { feedingApi } from '../feeding/feedingApi';
import { WEEK_DAYS, mondayOf } from '../training/trainingVocab';
import { MEAL_STATUS_META as MEAL_STATUS } from '../../constants/care';

const SLOT_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
const amount = (n) => Number(n).toLocaleString('vi-VN');
const itemsText = (items) => (items || []).map((i) => `${amount(i.amount)} ${i.unit} ${i.name}`).join(', ');

function MealCell({ meal, isToday }) {
  if (!meal?.status) {
    return (
      <div className="py-3 text-center text-gray-300 select-none text-xs font-mono">
        —
      </div>
    );
  }

  const meta = MEAL_STATUS[meal.status] || MEAL_STATUS.upcoming;
  const makeUp = meal.makeUp && (MEAL_STATUS[meal.makeUp.status] || MEAL_STATUS.upcoming);
  const isPlanned = meal.status === 'planned';
  const isFed = meal.status === 'fed';

  return (
    <div
      className={`rounded-xl border p-2 text-left transition-all ${
        isPlanned
          ? 'border-dashed border-gray-200/90 bg-[#FAF7F0]/40'
          : isFed
          ? 'border-emerald-200 bg-white shadow-2xs'
          : 'border-gray-200 bg-white shadow-2xs'
      } ${isToday ? 'ring-1 ring-emerald-500/30' : ''}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold tabular-nums text-gray-900 flex items-center gap-1">
          <ClockCircleOutlined className="text-[10px] text-gray-400" />
          {meal.time}
        </span>
        <Tag
          color={meta.color}
          className="!m-0 !px-1.5 !text-[10px] !leading-4 !font-medium rounded-full"
        >
          {meta.label}
        </Tag>
      </div>

      {isFed && meal.doneAt && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-800 font-medium truncate">
          <CheckCircleOutlined className="text-[10px] text-emerald-600 shrink-0" />
          <span className="truncate">{meal.doneBy || 'Nhân viên'}</span>
          <span className="tabular-nums font-mono text-[10px] text-emerald-700 shrink-0">
            {dayjs(meal.doneAt).format('HH:mm')}
          </span>
        </div>
      )}

      {meal.status === 'skipped' && (
        <div className="mt-1 text-[11px] text-orange-800 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200/60 truncate">
          {meal.reason ? `NV báo: ${meal.reason}` : meal.doneBy ? `${meal.doneBy} cho bỏ` : 'Đã bỏ bữa'}
        </div>
      )}

      {makeUp && (
        <div className="mt-1 text-[11px] text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded">
          Bù {meal.makeUp.time}:{' '}
          <span className={meal.makeUp.status === 'fed' ? 'text-emerald-700 font-medium' : ''}>
            {makeUp.label.toLowerCase()}
          </span>
          {meal.makeUp.status === 'fed' && meal.makeUp.doneAt ? ` (${dayjs(meal.makeUp.doneAt).format('HH:mm')})` : ''}
        </div>
      )}

      {meal.items?.length > 0 && (
        <Tooltip title={itemsText(meal.items)}>
          <div className="mt-1 truncate text-[11px] text-gray-600 font-medium bg-[#FAF7F0] px-1.5 py-0.5 rounded border border-[#EFE8DA]">
            {itemsText(meal.items)}
          </div>
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
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['feeding-timetable', horseId, week],
    queryFn: () => feedingApi.timetable(horseId, week),
    enabled: Boolean(horseId),
    refetchInterval: 60 * 1000,
  });
  const timetable = data?.data;
  const days = WEEK_DAYS.map((w, i) => ({ ...w, date: weekStart.add(i, 'day') }));
  const isThisWeek = weekStart.isSame(mondayOf(dayjs()), 'day');
  const mealOf = (date, slot) =>
    timetable?.days?.find((d) => d.date === date.format('YYYY-MM-DD'))?.meals.find((m) => m.slot === slot);

  return (
    <section aria-label="Thời khóa biểu cho ăn" className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#FAF7F0] p-3 rounded-xl border border-[#E5DEC9]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm">Thời khóa biểu cho ăn</span>
          {timetable?.caretaker ? (
            <span title="Nhân viên chăm sóc" className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-900 border border-emerald-200">
              <UserOutlined className="text-[10px] text-emerald-700" />
              {timetable.caretaker.name}
            </span>
          ) : (
            <span className="text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Chưa phân công người chăm sóc
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="small"
            icon={<LeftOutlined />}
            aria-label="Tuần trước"
            onClick={() => setWeekStart(weekStart.subtract(7, 'day'))}
          />
          <Button
            size="small"
            icon={<RightOutlined />}
            aria-label="Tuần sau"
            onClick={() => setWeekStart(weekStart.add(7, 'day'))}
          />
          <span className="px-2 text-xs font-semibold tabular-nums text-gray-800">
            {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
          </span>
          {!isThisWeek && (
            <Button
              size="small"
              type="link"
              className="!px-1.5 !text-xs !text-[#0F5A43] font-semibold"
              onClick={() => setWeekStart(mondayOf(dayjs()))}
            >
              Về tuần này
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center bg-white rounded-xl border border-gray-200/80">
          <Spin />
        </div>
      ) : !timetable ? (
        <div className="light-surface-box flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
          Chưa tải được thời khóa biểu.
          <Button size="small" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      ) : (
        <div className="light-surface-box overflow-x-auto rounded-xl border border-[#E5DEC9] bg-white shadow-xs">
          <table className="w-full min-w-[840px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E5DEC9] bg-[#FAF7F0]">
                <th className="w-[84px] px-3 py-2.5 text-left text-xs font-semibold text-gray-700">
                  Bữa
                </th>
                {days.map((d) => {
                  const today = d.date.isSame(dayjs(), 'day');
                  return (
                    <th
                      key={d.day}
                      className={`px-2 py-2 text-left text-xs font-semibold ${
                        today ? 'bg-[#0F5A43]/10 text-[#0F5A43] font-bold' : 'text-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span>{d.short}</span>
                        <span className="font-normal tabular-nums text-gray-500">{d.date.format('DD/MM')}</span>
                        {today && <span className="h-1.5 w-1.5 rounded-full bg-[#0F5A43] inline-block shrink-0" />}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.entries(SLOT_LABELS).map(([slot, label]) => (
                <tr key={slot} className="align-top hover:bg-gray-50/30 transition-colors">
                  <td className="px-3 py-3 text-xs font-semibold text-gray-800">
                    {label}
                  </td>
                  {days.map((d) => {
                    const today = d.date.isSame(dayjs(), 'day');
                    return (
                      <td key={d.day} className={`px-1.5 py-2 ${today ? 'bg-emerald-50/20' : ''}`}>
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

      <p className="text-[11px] text-gray-500 m-0 px-1 leading-relaxed">
        Hôm nay và trước đó: bữa trong danh sách việc của nhân viên và kết quả thực tế. Ngày tới: bữa dự kiến theo lịch cho ăn đã xác nhận hoặc theo khẩu phần áp dụng.
      </p>
    </section>
  );
}
