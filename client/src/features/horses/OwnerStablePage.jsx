import { useState, useMemo } from 'react';
import { Select, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { stableAssignmentApi, dailyTaskApi } from '../stable/stableApi';
import { feedingApi } from '../feeding/feedingApi';
import { parseStableBlock, MEAL_ORDER, MEAL_CONFIG, getFeedTypeLabel, TASK_CONFIG, TASK_STATUS_CONFIG } from '../stable/groomConfig';
import dayjs from 'dayjs';
import PageHeroBanner from '../../components/common/PageHeroBanner';

const CARD = 'bg-white border border-gray-200 rounded-xl p-[20px]';

// What the groom noted after the task, only the parts that were filled in.
const observationText = (o) =>
  o ? [o.appetite && `Khẩu vị ${o.appetite}`, o.manure && `Phân ${o.manure}`, o.waterIntake && `Nước ${o.waterIntake}`].filter(Boolean).join('  ·  ') : '';

function SectionTitle({ children, extra }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div role="heading" aria-level={2} className="text-sm font-semibold text-gray-900">{children}</div>
      {extra}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400 uppercase font-semibold tracking-wider mb-1">{label}</div>
      {children}
    </div>
  );
}

export default function OwnerStablePage() {
  const [selectedHorse, setSelectedHorse] = useState(null);

  const { data: horsesData, isLoading: horsesLoading } = useQuery({
    queryKey: ['horses'],
    queryFn: () => horsesApi.list(),
  });

  const { data: assignmentsData } = useQuery({
    queryKey: ['stable-assignments'],
    queryFn: () => stableAssignmentApi.list(),
  });

  const { data: tasksData } = useQuery({
    queryKey: ['daily-tasks'],
    queryFn: () => dailyTaskApi.list(),
  });

  const { data: feedingsData } = useQuery({
    queryKey: ['feeding-schedules'],
    queryFn: () => feedingApi.list(),
  });

  const myHorses = horsesData?.data || [];
  const allAssignments = assignmentsData?.data || [];
  const allTasks = tasksData?.data || [];
  const allFeedings = feedingsData?.data || [];

  const assignmentByHorseId = useMemo(() => {
    const map = new Map();
    allAssignments.forEach((a) => map.set(a.horse?._id || a.horse, a));
    return map;
  }, [allAssignments]);

  // Open on the owner's first horse, so the page is never an empty prompt.
  const activeHorseId = selectedHorse || myHorses[0]?._id || null;
  const selectedHorseObj = myHorses.find((h) => h._id === activeHorseId);
  const stableAssignment = selectedHorseObj ? assignmentByHorseId.get(selectedHorseObj._id) : null;
  const { block, stall } = parseStableBlock(stableAssignment?.stableBlock);

  // Daily Tasks for selected horse
  const horseTasks = activeHorseId
    ? allTasks.filter((t) => (t.horse?._id === activeHorseId || t.horse === activeHorseId) && dayjs(t.taskDate || t.date).isSame(dayjs(), 'day'))
    : [];

  // Feeding Schedule for selected horse
  const horseFeedings = activeHorseId
    ? allFeedings.filter((f) => f.horse?._id === activeHorseId || f.horse === activeHorseId)
    : [];

  const caretaker = stableAssignment?.assignedCaretaker?.name;

  return (
    <div className="light-surface-box text-gray-800 font-sans">
      <PageHeroBanner eyebrow="TEAM 8 • CHUỒNG TRẠI & CHĂM SÓC" roleLabel="Horse Owner" title="Chuồng Trại & Chăm Sóc" subtitle="Theo dõi vị trí chuồng, thông tin người chăm sóc, khẩu phần ăn và lịch trình hàng ngày." />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="font-medium text-gray-500 text-sm">Chiến mã</span>
        <Select
          placeholder="Chọn chiến mã"
          value={activeHorseId}
          onChange={setSelectedHorse}
          options={myHorses.map((h) => ({ value: h._id, label: h.name }))}
          className="min-w-[220px]"
          loading={horsesLoading}
        />
      </div>

      {!selectedHorseObj ? (
        <div className="flex justify-center items-center py-12 text-gray-400 border border-dashed border-gray-300 rounded-xl bg-gray-50">
          {horsesLoading ? 'Đang tải…' : 'Bạn chưa có chiến mã nào'}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Vị trí & người chăm sóc */}
            <div className={CARD}>
              <SectionTitle>Vị trí & người chăm sóc</SectionTitle>
              <div className="flex flex-col gap-4">
                <Field label="Khu vực chuồng">
                  <div className="text-base font-semibold text-gray-900">
                    {stableAssignment ? `${block} – ${stall}` : <span className="text-gray-400 font-normal">Chưa được xếp chuồng</span>}
                  </div>
                </Field>
                <Field label="Nhân viên phụ trách">
                  {caretaker ? (
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold flex items-center justify-center">
                        {caretaker.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-gray-900">{caretaker}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400">Chưa phân công</span>
                  )}
                </Field>
              </div>
            </div>

            {/* Công việc chăm sóc hôm nay */}
            <div className={`lg:col-span-2 ${CARD}`}>
              <SectionTitle extra={<span className="text-xs text-gray-400">Hôm nay, {dayjs().format('DD/MM/YYYY')}</span>}>
                Công việc chăm sóc
              </SectionTitle>

              {horseTasks.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Hôm nay chưa có công việc chăm sóc nào" />
              ) : (
                <ul className="list-none m-0 p-0 divide-y divide-gray-100">
                  {horseTasks.map((task) => {
                    const tCfg = TASK_CONFIG[task.taskType] || { label: task.taskType };
                    const sCfg = TASK_STATUS_CONFIG[task.status] || { label: task.status, color: 'default' };
                    const done = sCfg.color === 'green';
                    return (
                      <li key={task._id} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 font-medium text-gray-900">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-emerald-500' : 'bg-blue-400'}`} />
                            {tCfg.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                            {sCfg.label}
                          </span>
                        </div>
                        {task.notes && <div className="text-sm text-gray-500 mt-1 ml-4">{task.notes}</div>}
                        {task.status === 'completed' && observationText(task.observation) && (
                          <div className="text-xs text-gray-500 mt-1 ml-4">{observationText(task.observation)}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Khẩu phần ăn */}
          <div className={CARD}>
            <SectionTitle>Khẩu phần ăn</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-gray-100">
              {MEAL_ORDER.map((mealKey) => {
                const meal = MEAL_CONFIG[mealKey];
                const mealsForSlot = horseFeedings.filter((f) => f.mealTime === mealKey);

                return (
                  <div key={mealKey} className="py-3 md:py-0 md:px-[20px] first:md:pl-0 last:md:pr-0 border-t border-gray-100 md:border-t-0 first:border-t-0">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="font-semibold text-gray-900">{meal.label}</span>
                      <span className="text-xs text-gray-400 tabular-nums">{meal.time}</span>
                    </div>

                    {mealsForSlot.length === 0 ? (
                      <div className="text-sm text-gray-400 py-2">Chưa thiết lập khẩu phần</div>
                    ) : (
                      mealsForSlot.map((s) => (
                        <div key={s._id} className="mb-3 last:mb-0">
                          <div>
                            {(s.items || []).map((item, idx) => {
                              const feed = getFeedTypeLabel(item.type);
                              return (
                                <div key={idx} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0 text-sm">
                                  <span className="text-gray-600">{feed.label}</span>
                                  <span className="font-semibold text-gray-900 tabular-nums">{item.quantity}</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                            <span className={`w-1.5 h-1.5 rounded-full ${s.approvedBy ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                            {s.approvedBy ? `Đã duyệt bởi ${s.approvedBy.name}` : 'Chờ duyệt'}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
