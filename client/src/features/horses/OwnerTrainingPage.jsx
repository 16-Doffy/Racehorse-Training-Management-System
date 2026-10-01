import { useState } from 'react';
import { Typography, Select, Tag, Table, Descriptions, Segmented } from 'antd';
import {
  CalendarOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  FireOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { trainingPlanApi, trainingSessionApi } from '../training/trainingApi';
import { reportsApi } from '../reports/reportsApi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from 'recharts';
import dayjs from 'dayjs';

const SESSION_TYPE_CONFIG = {
  training: { color: 'blue', label: 'Tập luyện' },
  trial_run: { color: 'orange', label: '🏁 Chạy thử' },
};

const SESSION_STATUS_CONFIG = {
  scheduled: { color: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Đã lên lịch' },
  in_progress: { color: 'bg-blue-50 text-blue-600 border-blue-200', label: 'Đang diễn ra' },
  completed: { color: 'bg-emerald-50 text-emerald-600 border-emerald-200', label: 'Hoàn thành' },
  cancelled: { color: 'bg-red-50 text-red-600 border-red-200', label: 'Đã huỷ' },
};

const PHASE_LABELS = {
  base_building: '🏗️ Xây nền tảng',
  strength: '💪 Sức mạnh',
  speed: '⚡ Tốc độ',
  peak: '🏆 Đỉnh cao',
  recovery: '🔄 Phục hồi',
};

const INTENSITY_CONFIG = {
  light: { color: 'bg-emerald-50 text-emerald-600 border-emerald-200', label: 'Nhẹ' },
  moderate: { color: 'bg-yellow-50 text-yellow-600 border-yellow-200', label: 'Vừa' },
  high: { color: 'bg-red-50 text-red-600 border-red-200', label: 'Cao' },
};

const SURFACE_LABELS = {
  turf: '🌿 Cỏ tự nhiên',
  dirt: '🟤 Đất',
  synthetic: '⬛ Nhân tạo',
  sand: '🏖️ Cát',
};

const PLAN_STATUS_CONFIG = {
  draft: { color: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Nháp' },
  active: { color: 'bg-emerald-50 text-emerald-600 border-emerald-200', label: 'Đang áp dụng' },
  completed: { color: 'bg-blue-50 text-blue-600 border-blue-200', label: 'Hoàn thành' },
  cancelled: { color: 'bg-red-50 text-red-600 border-red-200', label: 'Đã huỷ' },
};

export default function OwnerTrainingPage() {
  const [selectedHorse, setSelectedHorse] = useState(null);
  const [viewMode, setViewMode] = useState('sessions');

  const { data: horsesData, isLoading: horsesLoading } = useQuery({
    queryKey: ['horses'],
    queryFn: () => horsesApi.list(),
  });
  const horses = horsesData?.data || [];

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['training-sessions'],
    queryFn: () => trainingSessionApi.list(),
  });
  const allSessions = sessionsData?.data || [];

  const { data: plansData } = useQuery({
    queryKey: ['training-plans'],
    queryFn: () => trainingPlanApi.list(),
  });
  const allPlans = plansData?.data || [];

  const { data: chartDataRes } = useQuery({
    queryKey: ['training-chart', selectedHorse],
    queryFn: () => reportsApi.trainingChart({ months: 6, horse: selectedHorse || undefined }),
  });
  const chartData = chartDataRes?.data || [];

  // Filter by selected horse
  const horseSessions = selectedHorse
    ? allSessions.filter((s) => (s.horse?._id || s.horse) === selectedHorse)
    : allSessions.filter((s) => horses.some((h) => h._id === (s.horse?._id || s.horse)));

  const horsePlans = selectedHorse
    ? allPlans.filter((p) => (p.horse?._id || p.horse) === selectedHorse)
    : allPlans.filter((p) => horses.some((h) => h._id === (p.horse?._id || p.horse)));

  const activePlan = horsePlans.find((p) => p.status === 'active');

  // Session stats
  const completedCount = horseSessions.filter((s) => s.status === 'completed').length;
  const scheduledCount = horseSessions.filter((s) => s.status === 'scheduled').length;
  const totalPlans = horsePlans.length;
  const avgRating =
    horseSessions.filter((s) => s.performanceRating).length > 0
      ? (
          horseSessions.reduce((sum, s) => sum + (s.performanceRating || 0), 0) /
          horseSessions.filter((s) => s.performanceRating).length
        ).toFixed(1)
      : '—';

  const sessionColumns = [
    {
      title: 'Ngày',
      dataIndex: 'scheduledAt',
      key: 'scheduledAt',
      render: (d) => <span className="font-medium text-gray-800">{dayjs(d).format('DD/MM/YYYY HH:mm')}</span>,
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt),
    },
    {
      title: 'Loại',
      dataIndex: 'sessionType',
      key: 'sessionType',
      render: (type) => (
        <span className="text-gray-600 font-medium">
          {SESSION_TYPE_CONFIG[type]?.label || type}
        </span>
      ),
      filters: [
        { text: 'Tập luyện', value: 'training' },
        { text: 'Chạy thử', value: 'trial_run' },
      ],
      onFilter: (value, record) => record.sessionType === value,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${SESSION_STATUS_CONFIG[status]?.color || 'bg-gray-100 border-gray-200 text-gray-600'}`}>
          {SESSION_STATUS_CONFIG[status]?.label || status}
        </span>
      ),
    },
    {
      title: 'Nhịp tim TB',
      dataIndex: ['metrics', 'avgHeartRate'],
      key: 'avgHeartRate',
      render: (v) => <span className="text-gray-500 font-medium">{v ? `${v} bpm` : '—'}</span>,
    },
    {
      title: 'Tốc độ tối đa',
      dataIndex: ['metrics', 'maxSpeed'],
      key: 'maxSpeed',
      render: (v) => <span className="text-gray-500 font-medium">{v ? `${v} km/h` : '—'}</span>,
    },
    {
      title: 'Khoảng cách',
      dataIndex: ['metrics', 'distance'],
      key: 'distance',
      render: (v) => <span className="text-gray-500 font-medium">{v ? `${v} m` : '—'}</span>,
    },
    {
      title: 'Mục đích',
      dataIndex: 'objective',
      key: 'objective',
      render: (obj) => <span className="text-gray-600">{obj || '—'}</span>,
    },
    {
      title: 'Rating',
      dataIndex: 'performanceRating',
      key: 'performanceRating',
      render: (r) => (r ? <span className="text-yellow-600 font-medium">⭐ {r}/10</span> : <span className="text-gray-400">—</span>),
    },
    {
      title: 'Kết quả',
      key: 'outcome',
      render: (_, record) => {
        if (!record.outcome) return <span className="text-gray-400">—</span>;
        const isMet = record.outcome.met;
        return (
          <div className="flex flex-col gap-1">
            <Tag color={isMet ? 'success' : 'error'} className="w-max m-0">
              {isMet ? 'Đạt' : 'Không đạt'}
            </Tag>
            {record.outcome.summary && (
              <span className="text-xs text-gray-500 max-w-[150px] truncate" title={record.outcome.summary}>
                {record.outcome.summary}
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: 'Video',
      dataIndex: 'videoUrl',
      key: 'videoUrl',
      render: (url) => url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          Xem video
        </a>
      ) : <span className="text-gray-400">—</span>,
    },
  ];

  const planColumns = [
    {
      title: 'Giai đoạn',
      dataIndex: 'phase',
      key: 'phase',
      render: (p) => <span className="font-semibold text-gray-800">{PHASE_LABELS[p] || p}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => (
        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PLAN_STATUS_CONFIG[s]?.color || 'bg-gray-100 border-gray-200 text-gray-600'}`}>
          {PLAN_STATUS_CONFIG[s]?.label || s}
        </span>
      ),
    },
    {
      title: 'Cường độ',
      dataIndex: 'intensity',
      key: 'intensity',
      render: (i) => (
        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${INTENSITY_CONFIG[i]?.color || 'bg-gray-100 border-gray-200 text-gray-600'}`}>
          {INTENSITY_CONFIG[i]?.label || i}
        </span>
      ),
    },
    {
      title: 'Mặt sân',
      dataIndex: 'surface',
      key: 'surface',
      render: (s) => <span className="text-gray-600 font-medium">{SURFACE_LABELS[s] || s}</span>,
    },
    {
      title: 'Cự ly',
      dataIndex: 'distanceTarget',
      key: 'distanceTarget',
      render: (v) => <span className="text-gray-500">{v ? `${v} m` : '—'}</span>,
    },
    {
      title: 'KL/tuần',
      dataIndex: 'weeklyVolumeKm',
      key: 'weeklyVolumeKm',
      render: (v) => <span className="text-gray-500">{v ? `${v} km` : '—'}</span>,
    },
    {
      title: 'Bắt đầu',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (d) => <span className="text-gray-500 font-medium">{d ? dayjs(d).format('DD/MM/YYYY') : '—'}</span>,
    },
    {
      title: 'Kết thúc',
      dataIndex: 'endDate',
      key: 'endDate',
      render: (d) => <span className="text-gray-500 font-medium">{d ? dayjs(d).format('DD/MM/YYYY') : 'Chưa xác định'}</span>,
    },
  ];

  const StatCard = ({ title, value, tagText, tagClass, subtitle }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <span className="text-gray-500 text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        {tagText && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tagClass}`}>
            {tagText}
          </span>
        )}
      </div>
      <span className="text-xs text-gray-400 font-medium">{subtitle}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-800 p-4 md:px-8 md:pb-8 md:pt-4 font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 m-0 mb-1 tracking-tight">Lịch Huấn luyện</h1>
        <p className="text-sm text-gray-500 m-0">
          Theo dõi lịch trình tập luyện, kế hoạch huấn luyện và hiệu suất của chiến mã.
        </p>
      </div>

      {/* Horse Selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="font-medium text-gray-500 text-sm">Hiển thị cho:</span>
          <Select
            placeholder="Tất cả chiến mã"
            allowClear
            value={selectedHorse}
            onChange={setSelectedHorse}
            options={horses.map((h) => ({ value: h._id, label: h.name }))}
            className="min-w-[200px]"
            size="middle"
          />
        </div>
        <Segmented
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'sessions', label: '📅 Danh sách buổi tập' },
            { value: 'plans', label: '📋 Kế hoạch dài hạn' },
          ]}
          className="bg-gray-100"
        />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="Sắp diễn ra" 
          value={scheduledCount}
          tagText="Đang chờ"
          tagClass="bg-blue-100 text-blue-700"
          subtitle="Buổi tập theo lịch"
        />
        <StatCard 
          title="Đã hoàn thành" 
          value={completedCount}
          tagText="Thành công"
          tagClass="bg-emerald-100 text-emerald-700"
          subtitle="Tổng số phiên đạt chuẩn"
        />
        <StatCard 
          title="Rating Trung bình" 
          value={avgRating}
          tagText="⭐ Tốt"
          tagClass="bg-yellow-100 text-yellow-700"
          subtitle="Đánh giá từ HLV"
        />
        <StatCard 
          title="Kế hoạch đang có" 
          value={totalPlans}
          subtitle="Kế hoạch huấn luyện"
        />
      </div>

      {/* Active Plan Card */}
      {activePlan && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-emerald-800 text-base m-0">Kế hoạch đang áp dụng</h2>
            <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-200 text-emerald-800">
              Đang Active
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <div className="text-emerald-600/70 text-xs font-medium mb-1">Giai đoạn</div>
              <div className="font-semibold text-emerald-900 text-sm">{PHASE_LABELS[activePlan.phase] || activePlan.phase}</div>
            </div>
            <div>
              <div className="text-emerald-600/70 text-xs font-medium mb-1">Cường độ</div>
              <div className="font-semibold text-emerald-900 text-sm">{INTENSITY_CONFIG[activePlan.intensity]?.label || activePlan.intensity}</div>
            </div>
            <div>
              <div className="text-emerald-600/70 text-xs font-medium mb-1">Mặt sân</div>
              <div className="font-semibold text-emerald-900 text-sm">{SURFACE_LABELS[activePlan.surface] || activePlan.surface}</div>
            </div>
            <div>
              <div className="text-emerald-600/70 text-xs font-medium mb-1">Cự ly mục tiêu</div>
              <div className="font-semibold text-emerald-900 text-sm">{activePlan.distanceTarget} m</div>
            </div>
            <div>
              <div className="text-emerald-600/70 text-xs font-medium mb-1">Khối lượng / Tuần</div>
              <div className="font-semibold text-emerald-900 text-sm">{activePlan.weeklyVolumeKm} km</div>
            </div>
            <div>
              <div className="text-emerald-600/70 text-xs font-medium mb-1">Thời gian</div>
              <div className="font-semibold text-emerald-900 text-sm">
                {dayjs(activePlan.startDate).format('DD/MM/YY')} - {activePlan.endDate ? dayjs(activePlan.endDate).format('DD/MM/YY') : 'N/A'}
              </div>
            </div>
          </div>
          {activePlan.notes && (
            <div className="mt-4 p-3 bg-white/50 border border-emerald-100 rounded-lg text-emerald-800 text-sm">
              <strong className="text-emerald-900 mr-2">Ghi chú HLV:</strong>
              {activePlan.notes}
            </div>
          )}
        </div>
      )}

      {/* Chart Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-900 m-0 mb-4">Biểu đồ Tập luyện (6 tháng gần đây)</h2>
        <div className="h-[300px] w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="_id" axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tickFormatter={(v) => Math.round(v)} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value, name) => {
                    const labelMap = {
                      sessions: 'Số buổi',
                      avgScore: 'Điểm TB',
                      avgSpeed: 'Tốc độ TB',
                      distance: 'Cự ly (m)',
                      metGoals: 'Đạt mục tiêu',
                    };
                    return [typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value, labelMap[name] || name];
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="sessions" name="Số buổi tập" fill="#bae6fd" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="metGoals" name="Đạt mục tiêu" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="avgScore" name="Điểm TB" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Không đủ dữ liệu biểu đồ</div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-base font-semibold text-gray-900 m-0">
            {viewMode === 'sessions' ? 'Bảng thống kê Buổi tập' : 'Danh sách Kế hoạch Huấn luyện'}
          </h2>
        </div>
        
        {viewMode === 'sessions' ? (
          <Table
            rowKey="_id"
            columns={sessionColumns}
            dataSource={horseSessions}
            loading={sessionsLoading}
            pagination={{ pageSize: 10, position: ['bottomRight'] }}
            className="custom-table"
            locale={{ emptyText: 'Chưa có buổi tập nào' }}
          />
        ) : (
          <Table
            rowKey="_id"
            columns={planColumns}
            dataSource={horsePlans}
            pagination={{ pageSize: 10, position: ['bottomRight'] }}
            className="custom-table"
            locale={{ emptyText: 'Chưa có kế hoạch nào' }}
          />
        )}
      </div>
    </div>
  );
}
