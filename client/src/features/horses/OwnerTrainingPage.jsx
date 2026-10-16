import { useState } from 'react';
import { SESSION_STATUS_LABELS } from '../training/sessionStatus';
import { Select, Tag, Table, Segmented, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { trainingPlanApi, trainingSessionApi } from '../training/trainingApi';
import { reportsApi } from '../reports/reportsApi';
import { trainingChartRows } from './trainingChart';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Bar, Line } from 'recharts';
import dayjs from 'dayjs';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { OwnerCard, Pill, StatStrip } from './ownerUi';

const SESSION_TYPE_CONFIG = {
  training: { label: 'Tập luyện' },
  trial_run: { label: 'Chạy thử' },
};

const SESSION_STATUS_TONES = {
  scheduled: 'neutral',
  in_progress: 'info',
  completed: 'good',
  cancelled: 'bad',
  ready: 'info',
  blocked: 'warn',
  evaluated: 'good',
  aborted: 'bad',
  missed: 'neutral',
};

const PHASE_LABELS = {
  base_building: 'Xây nền tảng',
  strength: 'Sức mạnh',
  speed: 'Tốc độ',
  peak: 'Đỉnh cao',
  recovery: 'Phục hồi',
};

const INTENSITY_CONFIG = {
  light: { tone: 'good', label: 'Nhẹ' },
  moderate: { tone: 'warn', label: 'Vừa' },
  high: { tone: 'bad', label: 'Cao' },
};

const SURFACE_LABELS = {
  turf: 'Cỏ tự nhiên',
  dirt: 'Đất',
  synthetic: 'Nhân tạo',
  sand: 'Cát',
};

const PLAN_STATUS_CONFIG = {
  draft: { tone: 'neutral', label: 'Nháp' },
  active: { tone: 'good', label: 'Đang áp dụng' },
  completed: { tone: 'info', label: 'Hoàn thành' },
  cancelled: { tone: 'bad', label: 'Đã huỷ' },
};

export default function OwnerTrainingPage() {
  const [selectedHorse, setSelectedHorse] = useState(null);
  const [viewMode, setViewMode] = useState('sessions');

  const { data: horsesData } = useQuery({
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
  const chartData = trainingChartRows(chartDataRes?.data);

  // Filter by selected horse
  const horseSessions = selectedHorse
    ? allSessions.filter((s) => (s.horse?._id || s.horse) === selectedHorse)
    : allSessions.filter((s) => horses.some((h) => h._id === (s.horse?._id || s.horse)));

  const horsePlans = selectedHorse
    ? allPlans.filter((p) => (p.horse?._id || p.horse) === selectedHorse)
    : allPlans.filter((p) => horses.some((h) => h._id === (p.horse?._id || p.horse)));

  const activePlan = horsePlans.find((p) => p.status === 'active');

  // Session stats
  const completedCount = horseSessions.filter((s) => ['completed', 'evaluated'].includes(s.status)).length;
  const scheduledCount = horseSessions.filter((s) => ['scheduled', 'ready', 'blocked'].includes(s.status)).length;
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
      render: (d) => <span className="font-medium text-gray-900 tabular-nums">{dayjs(d).format('DD/MM/YYYY HH:mm')}</span>,
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt),
    },
    {
      title: 'Loại',
      dataIndex: 'sessionType',
      key: 'sessionType',
      render: (type) => <span className="text-gray-600">{SESSION_TYPE_CONFIG[type]?.label || type}</span>,
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
      render: (status) => <Pill tone={SESSION_STATUS_TONES[status]}>{SESSION_STATUS_LABELS[status] || status}</Pill>,
    },
    {
      title: 'Chỉ số',
      key: 'metrics',
      render: (_, r) => {
        const m = r.metrics || {};
        const parts = [m.avgHeartRate && `${m.avgHeartRate} bpm`, m.maxSpeed && `${m.maxSpeed} km/h`, m.distance && `${m.distance} m`].filter(Boolean);
        return parts.length ? <span className="text-gray-600 tabular-nums">{parts.join(' · ')}</span> : <span className="text-gray-400">—</span>;
      },
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
      render: (r) => (r ? <span className="font-semibold text-gray-900 tabular-nums">{r}/10</span> : <span className="text-gray-400">—</span>),
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
      render: (p) => <span className="font-semibold text-gray-900">{PHASE_LABELS[p] || p}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Pill tone={PLAN_STATUS_CONFIG[s]?.tone}>{PLAN_STATUS_CONFIG[s]?.label || s}</Pill>,
    },
    {
      title: 'Cường độ',
      dataIndex: 'intensity',
      key: 'intensity',
      render: (i) => <Pill tone={INTENSITY_CONFIG[i]?.tone}>{INTENSITY_CONFIG[i]?.label || i}</Pill>,
    },
    {
      title: 'Mặt sân',
      dataIndex: 'surface',
      key: 'surface',
      render: (s) => <span className="text-gray-600">{SURFACE_LABELS[s] || s}</span>,
    },
    {
      title: 'Cự ly',
      dataIndex: 'distanceTarget',
      key: 'distanceTarget',
      render: (v) => <span className="text-gray-600 tabular-nums">{v ? `${v} m` : '—'}</span>,
    },
    {
      title: 'KL/tuần',
      dataIndex: 'weeklyVolumeKm',
      key: 'weeklyVolumeKm',
      render: (v) => <span className="text-gray-600 tabular-nums">{v ? `${v} km` : '—'}</span>,
    },
    {
      title: 'Thời gian',
      key: 'period',
      render: (_, r) => (
        <span className="text-gray-600 tabular-nums">
          {r.startDate ? dayjs(r.startDate).format('DD/MM/YYYY') : '—'} – {r.endDate ? dayjs(r.endDate).format('DD/MM/YYYY') : 'chưa xác định'}
        </span>
      ),
    },
  ];

  return (
    <div className="light-surface-box owner-ui text-gray-800 font-sans">
      <PageHeroBanner eyebrow="TEAM 8 • LỊCH HUẤN LUYỆN" roleLabel="Horse Owner" title="Lịch Huấn Luyện Chiến Mã" subtitle="Theo dõi lịch trình tập luyện, kế hoạch huấn luyện và hiệu suất của chiến mã." />

      {/* Horse Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-gray-500 text-sm">Chiến mã</span>
          <Select
            placeholder="Tất cả chiến mã"
            allowClear
            value={selectedHorse}
            onChange={setSelectedHorse}
            options={horses.map((h) => ({ value: h._id, label: h.name }))}
            className="min-w-[220px]"
          />
        </div>
        <Segmented
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'sessions', label: 'Buổi tập' },
            { value: 'plans', label: 'Kế hoạch dài hạn' },
          ]}
        />
      </div>

      <StatStrip
        className="mb-4"
        items={[
          { label: 'Sắp diễn ra', value: scheduledCount, hint: 'Buổi tập theo lịch' },
          { label: 'Đã hoàn thành', value: completedCount, hint: 'Buổi tập đã xong' },
          { label: 'Rating trung bình', value: avgRating, hint: 'Đánh giá từ HLV' },
          { label: 'Kế hoạch', value: totalPlans, hint: 'Kế hoạch huấn luyện' },
        ]}
      />

      {/* Active Plan Card */}
      {activePlan && (
        <OwnerCard
          title="Kế hoạch đang áp dụng"
          extra={<Pill tone="good">Đang áp dụng</Pill>}
          className="mb-4"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              ['Giai đoạn', PHASE_LABELS[activePlan.phase] || activePlan.phase],
              ['Cường độ', INTENSITY_CONFIG[activePlan.intensity]?.label || activePlan.intensity],
              ['Mặt sân', SURFACE_LABELS[activePlan.surface] || activePlan.surface],
              ['Cự ly mục tiêu', `${activePlan.distanceTarget} m`],
              ['Khối lượng / tuần', `${activePlan.weeklyVolumeKm} km`],
              ['Thời gian', `${dayjs(activePlan.startDate).format('DD/MM/YY')} – ${activePlan.endDate ? dayjs(activePlan.endDate).format('DD/MM/YY') : 'N/A'}`],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] text-gray-400 uppercase font-semibold tracking-wider mb-1">{label}</div>
                <div className="font-semibold text-gray-900 text-sm">{value}</div>
              </div>
            ))}
          </div>
          {activePlan.notes && (
            <p className="m-0 mt-4 pl-3 border-l-2 border-emerald-200 text-sm text-gray-700 leading-relaxed">
              <strong className="text-gray-900">Ghi chú HLV:</strong> {activePlan.notes}
            </p>
          )}
        </OwnerCard>
      )}

      {/* Chart Section */}
      <OwnerCard title="Biểu đồ tập luyện (6 tháng gần đây)" className="mb-4">
        <div className="h-[280px] w-full">
          {chartData.some((row) => row.sessions > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
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
                <Legend formatter={(value) => <span style={{ color: '#374151' }}>{value}</span>} />
                <Bar yAxisId="left" dataKey="sessions" name="Số buổi tập" fill="#bae6fd" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="metGoals" name="Đạt mục tiêu" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="avgScore" name="Điểm TB" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">Không đủ dữ liệu biểu đồ</div>
          )}
        </div>
      </OwnerCard>

      {/* Main Table */}
      <OwnerCard title={viewMode === 'sessions' ? 'Buổi tập' : 'Kế hoạch huấn luyện'} flush>
        {viewMode === 'sessions' ? (
          <Table
            rowKey="_id"
            columns={sessionColumns}
            dataSource={horseSessions}
            loading={sessionsLoading}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có buổi tập nào" /> }}
          />
        ) : (
          <Table
            rowKey="_id"
            columns={planColumns}
            dataSource={horsePlans}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có kế hoạch nào" /> }}
          />
        )}
      </OwnerCard>
    </div>
  );
}
