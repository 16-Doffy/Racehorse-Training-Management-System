import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Row, Col, List, Tag, Empty, Typography, Divider, Button } from 'antd';
import {
  HeartOutlined,
  CalendarOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  FilePdfOutlined,
  BellFilled,
  PlayCircleFilled,
  TrophyOutlined,
  SoundOutlined,
  RiseOutlined,
  InfoCircleOutlined,
  SafetyCertificateFilled,
} from '@ant-design/icons';
import { trainingSessionApi } from '../../features/training/trainingApi';
import { financeApi } from '../../features/finance/financeApi';
import { notificationsApi } from '../../features/alerts/notificationsApi';
import dayjs from 'dayjs';
import { useSelector } from 'react-redux';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';

const { Text } = Typography;

const SESSION_STATUS_LABELS = {
  scheduled: 'Đã lên lịch',
  in_progress: 'Đang diễn ra',
  completed: 'Hoàn thành',
  cancelled: 'Đã huỷ',
};

// Mock data for realtime telemetry chart
const telemetryData = [
  { time: '0m', hr: 90, speed: 45 },
  { time: '200m', hr: 120, speed: 60 },
  { time: '400m', hr: 152, speed: 70 },
  { time: '600m Đích', hr: 183.5, speed: 75.7 },
  { time: '+Hạ nhiệt', hr: 130, speed: 30 },
];

import { horsesApi } from '../../features/horses/horsesApi';

function OwnerDashboard() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const { data: horsesData, isLoading: horsesLoading } = useQuery({
    queryKey: ['horses'],
    queryFn: () => horsesApi.list(),
  });
  const horses = horsesData?.data || [];

  const { data: sessionsData } = useQuery({
    queryKey: ['training-sessions'],
    queryFn: () => trainingSessionApi.list(),
  });
  const allSessions = sessionsData?.data || [];

  const { data: financeData } = useQuery({
    queryKey: ['finance', 'mine'],
    queryFn: () => financeApi.listMine(),
  });
  const financeRecords = financeData?.data || [];

  const { data: notiData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(),
  });
  const notifications = notiData?.data || [];

  // Horse stats
  const statusCounts = horses.reduce(
    (acc, h) => {
      acc[h.healthStatus] = (acc[h.healthStatus] || 0) + 1;
      return acc;
    },
    { eligible: 0, monitoring: 0, injured: 0, quarantined: 0 }
  );

  // Upcoming sessions for owner's horses
  const horseIds = horses.map((h) => h._id);
  const upcomingSessions = allSessions
    .filter(
      (s) =>
        horseIds.includes(s.horse?._id || s.horse) &&
        (s.status === 'scheduled' || s.status === 'in_progress')
    )
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 5);

  // Finance summary
  const totalCost = financeRecords.filter((r) => r.type === 'cost').reduce((sum, r) => sum + r.amount, 0);
  const totalRevenue = financeRecords.filter((r) => r.type === 'revenue').reduce((sum, r) => sum + r.amount, 0);
  const netProfit = totalRevenue - totalCost;

  return (
    <div className="max-w-[1400px] mx-auto animate-fade-in">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#022c22] mb-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
            Xin chào, {user?.name || 'Hoàng Chủ Sở Hữu'}
          </h1>
          <p className="text-gray-500 text-sm">Theo dõi trạng thái thể lực, thành tích thi đấu và lợi tức danh mục chiến mã thuận chứng thời gian thực.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm flex items-center">
            <span className="w-2 h-2 bg-green-500 rounded-full inline-block mr-2 animate-pulse"></span>
            Cập nhật vệ tinh IoT: 12 giây trước
          </div>
          <Button type="primary" className="!bg-[#022c22] hover:!bg-[#064e3b] !border-none flex items-center shadow-lg" icon={<FilePdfOutlined />}>
            Xuất Báo cáo PDF
          </Button>
        </div>
      </div>

      {/* Telemetry Alert Banner */}
      <div className="bg-[#022c22] rounded-xl p-5 mb-6 shadow-xl flex flex-col md:flex-row items-start md:items-center gap-5 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-l from-[#064e3b] to-transparent pointer-events-none"></div>
        <div className="bg-[#eab308]/20 p-3 rounded-xl text-[#eab308]">
          <BellFilled className="text-2xl" />
        </div>
        <div className="flex-1 relative z-10">
          <div className="text-[#eab308] text-[10px] font-bold tracking-widest uppercase mb-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#eab308] animate-ping"></span> Cảnh báo Telemetry Tức thời
          </div>
          <h3 className="text-white font-medium text-base mb-1">08:24 Sáng • Đường Cát ẩm Long Thành</h3>
          <div className="text-white/60 text-xs mb-2">Sensor ID: #GW-9942</div>
          <p className="text-gray-300 text-sm leading-relaxed max-w-2xl mb-0">
            <strong className="text-white">Golden Wind</strong> vừa vượt ngưỡng nhịp tim mục tiêu: <strong className="text-[#eab308]">183.5 bpm</strong> (vận tốc <strong className="text-[#eab308]">75.7 km/h</strong>) trong loạt bứt tốc 600m nước rút cuối. Cần theo dõi giai đoạn hạ nhiệt.
          </p>
        </div>
        <div className="flex flex-col gap-2 relative z-10 w-full md:w-auto mt-2 md:mt-0">
          <button className="bg-[#eab308] hover:bg-yellow-400 text-[#022c22] px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 w-full shadow-lg">
            <HeartOutlined /> Kiểm tra ECG & Phục hồi
          </button>
          <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 border border-white/20 w-full">
            <PlayCircleFilled /> Video phân tích
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="premium-card p-5 relative overflow-hidden cursor-pointer hover:-translate-y-1 transition-transform" onClick={() => navigate('/owner/health')}>
          <div className="absolute top-4 right-4 bg-green-50 text-green-600 text-xs px-2 py-0.5 rounded-full font-semibold border border-green-100 flex items-center gap-1">
            <RiseOutlined /> Tốt (+12%)
          </div>
          <TrophyOutlined className="text-2xl text-gray-400 mb-3" />
          <div className="text-[10px] text-gray-500 font-bold tracking-widest uppercase mb-1">Sẵn sàng thi đấu</div>
          <div className="text-2xl font-bold text-[#022c22] mb-1">
            {statusCounts.eligible} <span className="text-sm font-normal text-gray-400">/ {horses.length} chiến mã</span>
          </div>
          <div className="text-xs text-gray-400 truncate">Silver Arrow, Golden Wind...</div>
        </div>

        <div className="premium-card p-5 relative overflow-hidden cursor-pointer hover:-translate-y-1 transition-transform" onClick={() => navigate('/owner/health')}>
          <div className="absolute top-4 right-4 bg-orange-50 text-orange-600 text-xs px-2 py-0.5 rounded-full font-semibold border border-orange-100 flex items-center gap-1">
            <InfoCircleOutlined /> Lưu ý Y tế
          </div>
          <HeartOutlined className="text-2xl text-gray-400 mb-3" />
          <div className="text-[10px] text-gray-500 font-bold tracking-widest uppercase mb-1">Cần theo dõi y tế</div>
          <div className="text-2xl font-bold text-[#022c22] mb-1">
            {statusCounts.monitoring + statusCounts.injured + statusCounts.quarantined} <span className="text-sm font-normal text-gray-400">chiến mã</span>
          </div>
          <div className="text-xs text-gray-400">Tiến trình hồi phục: <span className="text-green-600 font-medium">85% - Ổn định</span></div>
        </div>

        <div className="premium-card p-5 relative overflow-hidden cursor-pointer hover:-translate-y-1 transition-transform" onClick={() => navigate('/finance')}>
          <div className="absolute top-4 right-4 bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full font-semibold border border-blue-100">
            Lãi ròng 77.5tr
          </div>
          <DollarOutlined className="text-2xl text-gray-400 mb-3" />
          <div className="text-[10px] text-gray-500 font-bold tracking-widest uppercase mb-1">Lợi tức & Thưởng Tháng</div>
          <div className="text-2xl font-bold text-[#022c22] mb-1 text-green-600">
            {totalRevenue.toLocaleString('vi-VN')} <span className="text-sm">đ</span>
          </div>
          <div className="text-xs text-gray-400 flex justify-between">
            <span className="text-green-600 font-medium">+12% MoM</span>
            <span>Đã kết chuyển Ví tín thác</span>
          </div>
        </div>

        <div className="premium-card p-5 relative overflow-hidden cursor-pointer hover:-translate-y-1 transition-transform" onClick={() => navigate('/owner/training')}>
          <div className="absolute top-4 right-4 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium border border-gray-200">
            Hôm nay & Mai
          </div>
          <CalendarOutlined className="text-2xl text-gray-400 mb-3" />
          <div className="text-[10px] text-gray-500 font-bold tracking-widest uppercase mb-1">Lịch tập & Ra sân</div>
          <div className="text-2xl font-bold text-[#022c22] mb-1">
            {upcomingSessions.length} <span className="text-sm font-normal text-gray-400">lượt sát hạch</span>
          </div>
          {upcomingSessions.length > 0 ? (
            <div className="text-xs text-gray-500 flex justify-between">
              <span>{dayjs(upcomingSessions[0].scheduledAt).format('HH:mm')} {upcomingSessions[0].sessionType === 'trial_run' ? 'Race' : 'Train'}</span>
              <span className="font-medium text-[#022c22] truncate ml-2 max-w-[80px]">{upcomingSessions[0].horse?.name || 'N/A'}</span>
            </div>
          ) : (
            <div className="text-xs text-gray-400">Không có lịch sắp tới</div>
          )}
        </div>
      </div>

      {/* Main Grid: Left 2/3, Right 1/3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Detailed Horse List */}
          <div className="premium-card p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <SafetyCertificateFilled className="text-[#eab308] text-xl" />
                <h2 className="text-lg font-bold text-[#022c22] m-0">Danh mục Chiến mã Sở hữu</h2>
              </div>
              <Button type="default" className="text-xs rounded-full border-gray-200" size="small">+ Thêm chỉ định</Button>
            </div>
            
            <div className="flex flex-col gap-4">
              {horses.map((horse, idx) => {
                const isReady = horse.healthStatus === 'eligible';
                const percent = isReady ? (90 + Math.floor(Math.random() * 10)) : (70 + Math.floor(Math.random() * 15));
                return (
                  <div key={horse._id || idx} className="border border-gray-100 rounded-xl p-4 flex flex-col md:flex-row gap-4 hover:border-[#022c22]/20 transition-colors bg-white">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 shrink-0 relative">
                      <img src={horse.photoUrl || `https://api.dicebear.com/9.x/bottts/svg?seed=${horse.name}`} alt={horse.name} className="w-full h-full object-cover" />
                      <div className="absolute top-0 right-0 bg-[#022c22] text-white text-[9px] px-1.5 py-0.5 font-bold rounded-bl-lg">100%</div>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-[#022c22] m-0">{horse.name}</h3>
                            <span className="text-[10px] text-gray-400 uppercase">{horse.breed || 'Thoroughbred'} • {horse.weightKg || '450'}kg</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Sire: <span className="font-medium text-gray-600">{horse.sire?.name || 'Unknown'}</span> × Dam: <span className="font-medium text-gray-600">{horse.dam?.name || 'Unknown'}</span></div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">{isReady ? 'Sẵn sàng' : 'Thể lực hiện tại'}</div>
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xl font-bold text-[#022c22]">{percent}%</span>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${isReady ? 'bg-[#022c22]' : 'bg-[#eab308]'}`}>
                              {isReady ? <TrophyOutlined /> : <SafetyCertificateFilled />}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <Divider className="my-3 border-gray-100" />
                      
                      <div className="flex gap-6 text-sm">
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase">Tốc độ đỉnh:</div>
                          <div className="font-bold text-gray-800">75.7 <span className="text-xs font-normal">km/h</span></div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase">HR Nghỉ:</div>
                          <div className="font-bold text-gray-800">30 <span className="text-xs font-normal">bpm</span></div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 uppercase">Phong độ:</div>
                          <div className="font-bold text-[#eab308]">⭐⭐⭐⭐⭐</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {horses.length === 0 && <Empty description="Chưa có ngựa nào" />}
            </div>
          </div>

          {/* Realtime Chart */}
          <div className="premium-card p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-[#022c22] m-0">Biểu đồ Thể lực & Nhịp tim Realtime</h2>
                <p className="text-xs text-gray-500 mt-1">Loạt nước rút 600m cát ẩm - Chiến mã: <strong className="text-gray-800">Golden Wind</strong></p>
              </div>
              <Button size="small" className="text-xs font-semibold rounded border-gray-200">Chi tiết ECG</Button>
            </div>
            
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <AreaChart data={telemetryData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#022c22" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#022c22" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#eab308" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <Area yAxisId="left" type="monotone" dataKey="hr" stroke="#022c22" strokeWidth={3} fillOpacity={1} fill="url(#colorHr)" />
                  <Area yAxisId="right" type="monotone" dataKey="speed" stroke="#eab308" strokeWidth={3} fillOpacity={1} fill="url(#colorSpeed)" />
                  <ReferenceLine y={180} yAxisId="left" stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Ngưỡng quá tải', fill: '#ef4444', fontSize: 10 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-6">
          
          {/* Trainer Voice Memo */}
          <div className="premium-card p-6 border-t-4 border-t-[#022c22]">
            <div className="flex items-center gap-2 mb-4">
              <SoundOutlined className="text-lg text-[#022c22]" />
              <h3 className="font-bold text-[#022c22] m-0 text-base">Nhật ký HLV Trưởng</h3>
            </div>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=Trainer" alt="Trainer" />
              </div>
              <div>
                <div className="font-bold text-gray-800 text-sm">HLV Nguyễn Thành</div>
                <div className="text-[10px] text-gray-500">Huấn luyện viên Trưởng - 10 năm kinh nghiệm</div>
              </div>
            </div>

            <p className="text-sm text-gray-600 italic leading-relaxed mb-4">
              "Golden Wind đạt vận tốc bứt tốc 400m cuối rất ấn tượng trên nền cát ẩm. Tuy nhiên cơ đùi sau hơi căng do bù lực guốc trượt. Tôi đã chỉ đạo tổ xoa bóp ngâm chân nước đá 20 phút và giãn cơ nhẹ. Yên tâm sẽ sẵn sàng tối đa cho tuần sau."
            </p>

            <div className="bg-[#022c22] rounded-xl p-3 flex items-center gap-3 shadow-inner">
              <button className="w-10 h-10 rounded-full bg-[#eab308] text-[#022c22] flex items-center justify-center hover:bg-yellow-400 transition-colors">
                <PlayCircleFilled className="text-xl" />
              </button>
              <div className="flex-1">
                <div className="flex justify-between text-[10px] text-white/70 mb-1">
                  <span>Ghi chú giọng nói</span>
                  <span>00:48</span>
                </div>
                {/* Fake waveform */}
                <div className="flex items-end gap-0.5 h-6 opacity-80">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className="w-1 bg-[#eab308] rounded-full" style={{ height: `${Math.max(20, Math.random() * 100)}%` }}></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-right text-gray-400 mt-2">Ghi nhận lúc 08:35 Sáng - Đã xác nhận y tế</div>
          </div>

          {/* Finance Overview */}
          <div className="premium-card p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <DollarOutlined className="text-lg text-green-600" />
                <h3 className="font-bold text-[#022c22] m-0 text-base">Chi phí & Doanh thu Tháng 11</h3>
              </div>
              <span className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500 uppercase tracking-wider">Chi tiết</span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Tổng chi phí</div>
                <div className="text-xl font-bold text-gray-800">42.500.000 <span className="text-sm font-normal">đ</span></div>
                <div className="text-[10px] text-gray-400 mt-1">Duy trì 4 chiến mã</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Lợi nhuận ròng</div>
                <div className="text-2xl font-bold text-green-600">+77.500.000 <span className="text-sm font-normal">đ</span></div>
                <div className="text-[10px] text-gray-400 mt-1">Đã tính thưởng giải G1</div>
              </div>
            </div>

            <Divider className="my-3 border-gray-100" />
            
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Dinh dưỡng & Thức ăn cao cấp (52%)</span>
                <span className="font-semibold">22.100.000 đ</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Thú y & Chăm sóc móng (28%)</span>
                <span className="font-semibold">11.900.000 đ</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Bến bãi, Track fee & Dịch vụ (20%)</span>
                <span className="font-semibold">8.500.000 đ</span>
              </div>
            </div>
          </div>

          {/* Timeline / Upcoming Activity */}
          <div className="premium-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <CalendarOutlined className="text-lg text-[#eab308]" />
              <h3 className="font-bold text-[#022c22] m-0 text-base">Lịch trình Hoạt động</h3>
            </div>
            
            <div className="flex flex-col gap-4 relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-100"></div>
              
              {upcomingSessions.map((session, i) => (
                <div key={i} className="flex gap-4 relative z-10">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${i === 0 ? 'bg-[#eab308] text-[#022c22] ring-4 ring-[#eab308]/20' : 'bg-gray-100 text-gray-500'}`}>
                    {dayjs(session.scheduledAt).format('DD')}
                  </div>
                  <div className="bg-white border border-gray-100 rounded-lg p-3 flex-1 shadow-sm hover:border-[#eab308]/50 transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-bold text-sm text-[#022c22]">
                        {session.sessionType === 'trial_run' ? 'Chạy thử' : 'Tập luyện'} {session.horse?.name}
                      </div>
                      <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{dayjs(session.scheduledAt).format('HH:mm')}</span>
                    </div>
                    <div className="text-xs text-gray-500">{SESSION_STATUS_LABELS[session.status] || session.status}</div>
                  </div>
                </div>
              ))}
              
              <div className="flex gap-4 relative z-10">
                <div className="w-8 h-8 rounded-full bg-[#022c22] text-[#eab308] flex items-center justify-center text-lg shrink-0 ring-4 ring-[#022c22]/10">
                  <TrophyOutlined />
                </div>
                <div className="bg-[#022c22] rounded-lg p-3 flex-1 shadow-sm text-white">
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-sm text-[#eab308]">Derby Championship G1</div>
                    <span className="text-[9px] bg-white/20 text-white px-1.5 py-0.5 rounded">28/11</span>
                  </div>
                  <div className="text-xs text-white/70">Golden Wind xuất phát chuồng #4</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default OwnerDashboard;
