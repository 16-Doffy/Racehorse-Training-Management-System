import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Segmented, Select, Tag, Empty, Spin, Button } from 'antd';
import { AppleOutlined, CheckCircleFilled, ClockCircleOutlined, FieldTimeOutlined, CarryOutOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useFeedingSchedules, useStableOverview } from '../stable/useGroomData';
import { HEALTH_STATUS_CONFIG, MEAL_CONFIG, MEAL_ORDER, getFeedTypeLabel, getNextMeal, refId } from '../stable/groomConfig';
import { GroomPageHeader, StatCard, HorseAvatar } from '../stable/GroomUI';

// Groom view of the approved rations (grain, hay, vitamins...) per horse per meal.
// Rations are authored by the Head Trainer / Manager; this screen is read-only.
export default function FeedingPage() {
  const navigate = useNavigate();
  const [scope, setScope] = useState('mine');
  const [horseFilter, setHorseFilter] = useState(null);

  const { horses, myHorseIds, assignmentByHorseId, isLoading: stableLoading } = useStableOverview();
  const { feedings, isLoading: feedingLoading } = useFeedingSchedules();

  const nextMeal = getNextMeal(dayjs());

  // horseId -> { morning: [schedule...], noon: [...], evening: [...] }
  const rationsByHorse = useMemo(() => {
    const map = new Map();
    feedings.forEach((f) => {
      const id = refId(f.horse);
      if (!map.has(id)) map.set(id, { morning: [], noon: [], evening: [] });
      map.get(id)[f.mealTime]?.push(f);
    });
    return map;
  }, [feedings]);

  const scopedHorses = horses
    .filter((h) => scope === 'all' || myHorseIds.has(h._id))
    .filter((h) => !horseFilter || h._id === horseFilter)
    .sort((a, b) =>
      (assignmentByHorseId.get(a._id)?.stableBlock || '~').localeCompare(assignmentByHorseId.get(b._id)?.stableBlock || '~', 'vi', { numeric: true })
    );

  const scopedSchedules = scopedHorses.flatMap((h) => MEAL_ORDER.flatMap((m) => rationsByHorse.get(h._id)?.[m] || []));
  const approvedCount = scopedSchedules.filter((f) => f.approvedBy).length;
  const horsesWithRations = scopedHorses.filter((h) => rationsByHorse.has(h._id)).length;
  const nextMealHorses = scopedHorses.filter((h) => (rationsByHorse.get(h._id)?.[nextMeal.key] || []).length > 0);

  const minutesLeft = nextMeal.at.diff(dayjs(), 'minute');
  const countdown = nextMeal.isNow
    ? 'Đang trong giờ ăn'
    : minutesLeft >= 60
      ? `Còn ${Math.floor(minutesLeft / 60)} giờ ${minutesLeft % 60} phút`
      : `Còn ${minutesLeft} phút`;

  const isLoading = stableLoading || feedingLoading;

  return (
    <div className="max-w-[1400px] mx-auto">
      <GroomPageHeader
        icon={<AppleOutlined />}
        title="Khẩu phần Ăn"
        subtitle="Khẩu phần ngũ cốc, cỏ khô, vitamin đã được duyệt cho từng bữa trong ngày."
        extra={
          <>
            <Segmented
              value={scope}
              onChange={(v) => {
                setScope(v);
                setHorseFilter(null);
              }}
              options={[
                { value: 'mine', label: '⭐ Ngựa tôi phụ trách' },
                { value: 'all', label: '🐴 Tất cả' },
              ]}
            />
            <Select
              allowClear
              placeholder="Chọn ngựa"
              value={horseFilter}
              onChange={setHorseFilter}
              style={{ minWidth: 180 }}
              options={horses
                .filter((h) => scope === 'all' || myHorseIds.has(h._id))
                .map((h) => ({ value: h._id, label: h.name }))}
            />
          </>
        }
      />

      {/* Next meal banner — same treatment as the Owner dashboard's telemetry banner. */}
      <div className="bg-[#022c22] rounded-xl p-5 mb-6 shadow-xl flex flex-col md:flex-row items-start md:items-center gap-5 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-l from-[#064e3b] to-transparent pointer-events-none" />
        <div className="bg-[#eab308]/20 p-3 rounded-xl text-3xl leading-none">{nextMeal.emoji}</div>
        <div className="flex-1 relative z-10">
          <div className="text-[#eab308] text-[10px] font-bold tracking-widest uppercase mb-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#eab308] animate-ping" />
            {nextMeal.isNow ? 'Bữa ăn hiện tại' : 'Bữa ăn tiếp theo'}
          </div>
          <h3 className="text-white font-medium text-lg mb-1">
            {nextMeal.label} • {nextMeal.time}
            {!nextMeal.at.isSame(dayjs(), 'day') && ' (ngày mai)'}
          </h3>
          <p className="text-gray-300 text-sm mb-0">
            <FieldTimeOutlined className="mr-1" /> {countdown} —{' '}
            {nextMealHorses.length > 0 ? (
              <>
                cần chuẩn bị khẩu phần cho <strong className="text-white">{nextMealHorses.length}</strong> ngựa:{' '}
                <span className="text-[#eab308]">{nextMealHorses.map((h) => h.name).join(', ')}</span>
              </>
            ) : (
              'chưa có khẩu phần nào được thiết lập cho bữa này.'
            )}
          </p>
        </div>
        <Button
          icon={<CarryOutOutlined />}
          onClick={() => navigate('/stable/my-tasks')}
          className="!bg-[#eab308] hover:!bg-yellow-400 !text-[#022c22] !border-none !font-bold relative z-10"
        >
          Xác nhận đã cho ăn
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard icon={<AppleOutlined />} label="Ngựa có khẩu phần" value={horsesWithRations} suffix={`/ ${scopedHorses.length}`} />
        <StatCard
          icon={<CheckCircleFilled />}
          label="Khẩu phần đã duyệt"
          value={approvedCount}
          accent="border-t-green-500"
          iconClass="bg-green-50 text-green-500"
        />
        <StatCard
          icon={<ClockCircleOutlined />}
          label="Chờ duyệt"
          value={scopedSchedules.length - approvedCount}
          accent="border-t-[#eab308]"
          iconClass="bg-yellow-50 text-[#eab308]"
        />
      </div>

      {isLoading ? (
        <div className="premium-card p-10 flex justify-center">
          <Spin />
        </div>
      ) : scopedHorses.length === 0 ? (
        <div className="premium-card p-10">
          <Empty description={scope === 'mine' ? 'Bạn chưa được phân công phụ trách ngựa nào' : 'Chưa có ngựa nào'} />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {scopedHorses.map((horse) => (
            <HorseRationCard
              key={horse._id}
              horse={horse}
              stableBlock={assignmentByHorseId.get(horse._id)?.stableBlock}
              rations={rationsByHorse.get(horse._id)}
              nextMealKey={nextMeal.key}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HorseRationCard({ horse, stableBlock, rations, nextMealKey }) {
  const health = HEALTH_STATUS_CONFIG[horse.healthStatus];
  return (
    <div className="premium-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <HorseAvatar name={horse.name} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-[#022c22] m-0">{horse.name}</h3>
            {health && (
              <Tag color={health.color} className="!m-0 rounded-full">
                {health.label}
              </Tag>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {stableBlock ? `📍 ${stableBlock}` : 'Chưa xếp chuồng'} {horse.weightKg ? `• ${horse.weightKg} kg` : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {MEAL_ORDER.map((mealKey) => {
          const meal = MEAL_CONFIG[mealKey];
          const schedules = rations?.[mealKey] || [];
          const isNext = mealKey === nextMealKey;
          return (
            <div
              key={mealKey}
              className={`rounded-xl p-4 border ${isNext ? 'border-[#eab308] bg-yellow-50/40' : 'border-gray-100 bg-[#fdfbf7]'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-[#022c22]">
                  {meal.emoji} {meal.label}
                </span>
                <span className="text-[10px] bg-white border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded">{meal.time}</span>
              </div>
              {schedules.length === 0 ? (
                <div className="text-xs text-gray-400 py-2">Chưa thiết lập khẩu phần</div>
              ) : (
                schedules.map((s) => (
                  <div key={s._id} className={s.approvedBy ? '' : 'opacity-70'}>
                    <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                      {(s.items || []).map((item, idx) => {
                        const feed = getFeedTypeLabel(item.type);
                        return (
                          <li key={idx} className="flex justify-between text-sm">
                            <span className="text-gray-600">
                              {feed.emoji} {feed.label}
                            </span>
                            <span className="font-semibold text-gray-800">{item.quantity}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      {s.approvedBy ? (
                        <span className="text-[11px] text-green-700">
                          <CheckCircleFilled /> Duyệt bởi {s.approvedBy.name || 'HLV'}
                        </span>
                      ) : (
                        <Tag color="gold" className="!m-0">
                          Chờ duyệt
                        </Tag>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
