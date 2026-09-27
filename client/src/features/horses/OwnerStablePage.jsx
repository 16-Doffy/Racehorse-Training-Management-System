import { useState, useMemo } from 'react';
import { Typography, Row, Col, Tag, Select, Empty, Timeline, Card } from 'antd';
import { HomeOutlined, AppleOutlined, UserOutlined, CalendarOutlined, CarryOutOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { stableAssignmentApi, dailyTaskApi } from '../stable/stableApi';
import { feedingApi } from '../feeding/feedingApi';
import { parseStableBlock, MEAL_ORDER, MEAL_CONFIG, getFeedTypeLabel, TASK_CONFIG, TASK_STATUS_CONFIG } from '../stable/groomConfig';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function OwnerStablePage() {
  const [selectedHorse, setSelectedHorse] = useState(null);

  const { data: horsesData, isLoading: horsesLoading } = useQuery({ 
    queryKey: ['horses'], 
    queryFn: () => horsesApi.list() 
  });
  
  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['stable-assignments'],
    queryFn: () => stableAssignmentApi.list()
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['daily-tasks'],
    queryFn: () => dailyTaskApi.list()
  });

  const { data: feedingsData, isLoading: feedingsLoading } = useQuery({
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
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
        <div>
          <Title level={3} className="!font-semibold !mb-2 !text-[#022c22]" style={{ fontFamily: 'Georgia, serif' }}>
            <HomeOutlined className="mr-2 text-[#eab308]" />
            Chuồng trại & Chăm sóc
          </Title>
          <Text className="block text-gray-500">
            Theo dõi vị trí chuồng, người chăm sóc, khẩu phần ăn và các công việc hằng ngày của ngựa.
          </Text>
        </div>
        
        <div className="bg-white p-2 rounded-lg shadow-sm border flex items-center">
          <span className="text-sm text-gray-500 mr-2 ml-1">Chọn ngựa:</span>
          <Select
            placeholder="Chọn một chiến mã"
            style={{ width: 200 }}
            value={selectedHorse}
            onChange={setSelectedHorse}
            options={myHorses.map(h => ({ value: h._id, label: h.name }))}
            loading={horsesLoading}
          />
        </div>
      </div>

      {!selectedHorseObj ? (
        <div className="premium-card p-12 flex justify-center items-center">
          <Empty description="Vui lòng chọn một con ngựa để xem chi tiết chuồng trại & chăm sóc" />
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <div className="premium-card p-5 h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#022c22]/5 rounded-bl-full pointer-events-none" />
              <h4 className="font-bold text-[#022c22] mb-4 border-b pb-2">
                <HomeOutlined className="mr-2 text-blue-500" />
                Vị trí & Quản lý
              </h4>
              
              <div className="mb-4">
                <Text className="text-gray-500 text-xs uppercase font-bold tracking-wider">Khu vực Chuồng</Text>
                <div className="text-lg font-semibold text-gray-800 mt-1">
                  {stableAssignment ? `${block} - ${stall}` : 'Chưa được xếp chuồng'}
                </div>
              </div>

              <div>
                <Text className="text-gray-500 text-xs uppercase font-bold tracking-wider">Nhân viên Phụ trách (Groom)</Text>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                    <UserOutlined />
                  </div>
                  <span className="font-semibold text-gray-800">
                    {stableAssignment?.assignedCaretaker?.name || 'Chưa phân công'}
                  </span>
                </div>
              </div>
            </div>
          </Col>

          <Col xs={24} md={16}>
            <div className="premium-card p-5 h-full">
              <h4 className="font-bold text-[#022c22] mb-4 border-b pb-2">
                <CarryOutOutlined className="mr-2 text-green-500" />
                Công việc chăm sóc hôm nay
              </h4>
              
              {horseTasks.length === 0 ? (
                <Empty description="Không có công việc chăm sóc nào trong hôm nay" />
              ) : (
                <Timeline
                  className="mt-4"
                  items={horseTasks.map(task => {
                    const tCfg = TASK_CONFIG[task.taskType] || { label: task.taskType, emoji: '📌', color: 'default' };
                    const sCfg = TASK_STATUS_CONFIG[task.status] || { label: task.status, color: 'default' };
                    return {
                      color: sCfg.color === 'green' ? 'green' : 'blue',
                      children: (
                        <div className="mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">{tCfg.emoji} {tCfg.label}</span>
                            <Tag color={sCfg.color} className="!m-0 rounded-full">{sCfg.label}</Tag>
                          </div>
                          {task.notes && <div className="text-sm text-gray-500 mt-1">{task.notes}</div>}
                          {task.status === 'completed' && task.observation && (
                            <div className="text-xs text-gray-400 mt-1 italic">
                              Khẩu vị: {task.observation.appetite} • Phân: {task.observation.manure} • Nước: {task.observation.waterIntake}
                            </div>
                          )}
                        </div>
                      )
                    };
                  })}
                />
              )}
            </div>
          </Col>

          <Col xs={24}>
            <div className="premium-card p-5">
              <h4 className="font-bold text-[#022c22] mb-4 border-b pb-2">
                <AppleOutlined className="mr-2 text-red-500" />
                Khẩu phần Ăn (Ration Plan)
              </h4>
              
              <Row gutter={[12, 12]}>
                {MEAL_ORDER.map(mealKey => {
                  const meal = MEAL_CONFIG[mealKey];
                  const mealsForSlot = horseFeedings.filter(f => f.mealTime === mealKey);
                  
                  return (
                    <Col xs={24} md={8} key={mealKey}>
                      <div className="bg-gray-50 border rounded-xl p-4 h-full">
                        <div className="flex items-center justify-between mb-3 border-b border-gray-200 pb-2">
                          <span className="font-semibold text-[#022c22]">
                            {meal.emoji} {meal.label}
                          </span>
                          <span className="text-xs bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">{meal.time}</span>
                        </div>
                        
                        {mealsForSlot.length === 0 ? (
                          <div className="text-sm text-gray-400 py-2 italic text-center">Chưa thiết lập khẩu phần</div>
                        ) : (
                          mealsForSlot.map(s => (
                            <div key={s._id} className="mb-2 last:mb-0">
                              <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
                                {(s.items || []).map((item, idx) => {
                                  const feed = getFeedTypeLabel(item.type);
                                  return (
                                    <li key={idx} className="flex justify-between text-sm items-center bg-white p-1.5 px-2 rounded border border-gray-100">
                                      <span className="text-gray-600 flex items-center gap-1">
                                        {feed.emoji} {feed.label}
                                      </span>
                                      <span className="font-bold text-[#022c22]">{item.quantity}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                              <div className="mt-2 text-[10px] text-gray-400 text-right">
                                {s.approvedBy ? `✓ Đã duyệt bởi ${s.approvedBy.name}` : '⏳ Chờ duyệt'}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </div>
          </Col>
        </Row>
      )}
    </div>
  );
}
