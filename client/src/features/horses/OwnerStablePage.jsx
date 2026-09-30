import { useState, useMemo } from 'react';
import { Typography, Row, Col, Select, Timeline, Empty } from 'antd';
import { HomeOutlined, AppleOutlined, UserOutlined, CarryOutOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { stableAssignmentApi, dailyTaskApi } from '../stable/stableApi';
import { feedingApi } from '../feeding/feedingApi';
import { parseStableBlock, MEAL_ORDER, MEAL_CONFIG, getFeedTypeLabel, TASK_CONFIG, TASK_STATUS_CONFIG } from '../stable/groomConfig';
import dayjs from 'dayjs';

export default function OwnerStablePage() {
  const [selectedHorse, setSelectedHorse] = useState(null);

  const { data: horsesData, isLoading: horsesLoading } = useQuery({ 
    queryKey: ['horses'], 
    queryFn: () => horsesApi.list() 
  });
  
  const { data: assignmentsData } = useQuery({
    queryKey: ['stable-assignments'],
    queryFn: () => stableAssignmentApi.list()
  });

  const { data: tasksData } = useQuery({
    queryKey: ['daily-tasks'],
    queryFn: () => dailyTaskApi.list()
  });

  const { data: feedingsData } = useQuery({
    queryKey: ['feeding-schedules'],
    queryFn: () => feedingApi.list()
  });

  const myHorses = horsesData?.data || [];
  const allAssignments = assignmentsData?.data || [];
  const allTasks = tasksData?.data || [];
  const allFeedings = feedingsData?.data || [];

  const assignmentByHorseId = useMemo(() => {
    const map = new Map();
    allAssignments.forEach(a => map.set(a.horse?._id || a.horse, a));
    return map;
  }, [allAssignments]);

  const selectedHorseObj = myHorses.find(h => h._id === selectedHorse);
  const stableAssignment = selectedHorseObj ? assignmentByHorseId.get(selectedHorseObj._id) : null;
  const { block, stall } = parseStableBlock(stableAssignment?.stableBlock);

  // Daily Tasks for selected horse
  const horseTasks = selectedHorse 
    ? allTasks.filter(t => (t.horse?._id === selectedHorse || t.horse === selectedHorse) && dayjs(t.taskDate || t.date).isSame(dayjs(), 'day'))
    : [];

  // Feeding Schedule for selected horse
  const horseFeedings = selectedHorse
    ? allFeedings.filter(f => f.horse?._id === selectedHorse || f.horse === selectedHorse)
    : [];

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-800 p-4 md:px-8 md:pb-8 md:pt-4 font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 m-0 mb-1 tracking-tight">Chuồng trại & Chăm sóc</h1>
        <p className="text-sm text-gray-500 m-0">
          Theo dõi vị trí chuồng, thông tin người chăm sóc, khẩu phần ăn và lịch trình hàng ngày.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="font-medium text-gray-500 text-sm">Chọn chiến mã:</span>
          <Select
            placeholder="Tất cả ngựa"
            allowClear
            value={selectedHorse}
            onChange={setSelectedHorse}
            options={myHorses.map((h) => ({ value: h._id, label: h.name }))}
            className="min-w-[200px]"
            size="middle"
            loading={horsesLoading}
          />
        </div>
      </div>

      {!selectedHorseObj ? (
        <div className="mt-6 flex justify-center items-center py-12 text-gray-400 border border-dashed border-gray-300 rounded-xl bg-gray-50">
          Vui lòng chọn một chiến mã để xem chi tiết chuồng trại & chăm sóc
        </div>
      ) : (
        <div className="flex flex-col gap-6 animate-fade-in">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Vị trí & Quản lý */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 h-full relative overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-semibold text-gray-900 m-0 flex items-center gap-2">
                  <HomeOutlined className="text-blue-500" /> Vị trí & Quản lý
                </h2>
              </div>
              
              <div className="mb-6">
                <div className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Khu vực Chuồng</div>
                <div className="text-lg font-semibold text-gray-800">
                  {stableAssignment ? `${block} - ${stall}` : 'Chưa được xếp chuồng'}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Nhân viên Phụ trách (Groom)</div>
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
                    <UserOutlined />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800">
                      {stableAssignment?.assignedCaretaker?.name || 'Chưa phân công'}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase">Chuyên viên chăm sóc</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Công việc chăm sóc hôm nay */}
            <div className="md:col-span-2 bg-white border border-gray-200 rounded-xl p-6 h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-semibold text-gray-900 m-0 flex items-center gap-2">
                  <CarryOutOutlined className="text-emerald-500" /> Công việc hôm nay
                </h2>
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                  {dayjs().format('DD/MM/YYYY')}
                </span>
              </div>
              
              {horseTasks.length === 0 ? (
                <Empty description="Không có công việc chăm sóc nào trong hôm nay" />
              ) : (
                <Timeline
                  className="mt-4 custom-timeline"
                  items={horseTasks.map(task => {
                    const tCfg = TASK_CONFIG[task.taskType] || { label: task.taskType, emoji: '📌', color: 'default' };
                    const sCfg = TASK_STATUS_CONFIG[task.status] || { label: task.status, color: 'default' };
                    return {
                      color: sCfg.color === 'green' ? '#10b981' : '#3b82f6',
                      children: (
                        <div className="mb-4 bg-gray-50 border border-gray-100 rounded-lg p-3 -mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-800">{tCfg.emoji} {tCfg.label}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${sCfg.color === 'green' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'}`}>
                              {sCfg.label}
                            </span>
                          </div>
                          {task.notes && <div className="text-sm text-gray-500 mt-1">{task.notes}</div>}
                          {task.status === 'completed' && task.observation && (
                            <div className="text-xs text-gray-400 mt-2 p-2 bg-white rounded border border-gray-100">
                              <span className="mr-3">🍴 Khẩu vị: <strong className="text-gray-600">{task.observation.appetite}</strong></span>
                              <span className="mr-3">💩 Phân: <strong className="text-gray-600">{task.observation.manure}</strong></span>
                              <span>💧 Nước: <strong className="text-gray-600">{task.observation.waterIntake}</strong></span>
                            </div>
                          )}
                        </div>
                      )
                    };
                  })}
                />
              )}
            </div>
          </div>

          {/* Khẩu phần Ăn */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-gray-900 m-0 flex items-center gap-2">
                <AppleOutlined className="text-red-500" /> Khẩu phần Ăn (Ration Plan)
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {MEAL_ORDER.map(mealKey => {
                const meal = MEAL_CONFIG[mealKey];
                const mealsForSlot = horseFeedings.filter(f => f.mealTime === mealKey);
                
                return (
                  <div key={mealKey} className="bg-gray-50 border border-gray-100 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-3">
                      <span className="font-semibold text-gray-900 flex items-center gap-2">
                        {meal.emoji} {meal.label}
                      </span>
                      <span className="text-xs bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                        {meal.time}
                      </span>
                    </div>
                    
                    {mealsForSlot.length === 0 ? (
                      <div className="text-sm text-gray-400 py-4 italic text-center">Chưa thiết lập khẩu phần</div>
                    ) : (
                      mealsForSlot.map(s => (
                        <div key={s._id} className="mb-3 last:mb-0">
                          <div className="flex flex-col gap-2">
                            {(s.items || []).map((item, idx) => {
                              const feed = getFeedTypeLabel(item.type);
                              return (
                                <div key={idx} className="flex justify-between items-center bg-white p-2 px-3 rounded-lg border border-gray-100 shadow-sm">
                                  <span className="text-gray-600 text-sm font-medium">
                                    {feed.emoji} {feed.label}
                                  </span>
                                  <span className="font-bold text-gray-900">{item.quantity}</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-3 text-[10px] text-gray-400 text-right font-medium">
                            {s.approvedBy ? (
                              <span className="text-emerald-600">✓ Đã duyệt bởi {s.approvedBy.name}</span>
                            ) : (
                              <span className="text-yellow-600">⏳ Chờ duyệt</span>
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

        </div>
      )}
    </div>
  );
}
