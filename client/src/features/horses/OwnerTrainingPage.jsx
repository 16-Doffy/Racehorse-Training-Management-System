import { useState } from 'react';
import { Typography, Card, Row, Col, Tag, Table, Select, Empty, Descriptions, Badge, Segmented } from 'antd';
import {
  CalendarOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  ClockCircleOutlined,
  FireOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { trainingPlanApi, trainingSessionApi } from '../training/trainingApi';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

const SESSION_TYPE_CONFIG = {
  training: { color: 'blue', label: 'Tập luyện' },
  trial_run: { color: 'orange', label: '🏁 Chạy thử' },
};

const SESSION_STATUS_CONFIG = {
  scheduled: { color: 'default', label: 'Đã lên lịch' },
  in_progress: { color: 'processing', label: 'Đang diễn ra' },
  completed: { color: 'success', label: 'Hoàn thành' },
  cancelled: { color: 'error', label: 'Đã huỷ' },
};

const PHASE_LABELS = {
  base_building: '🏗️ Xây nền tảng',
  strength: '💪 Sức mạnh',
  speed: '⚡ Tốc độ',
  peak: '🏆 Đỉnh cao',
  recovery: '🔄 Phục hồi',
};

const INTENSITY_CONFIG = {
  light: { color: 'green', label: 'Nhẹ' },
  moderate: { color: 'gold', label: 'Vừa' },
  high: { color: 'red', label: 'Cao' },
};

const SURFACE_LABELS = {
  turf: '🌿 Cỏ tự nhiên',
  dirt: '🟤 Đất',
  synthetic: '⬛ Nhân tạo',
  sand: '🏖️ Cát',
};

const PLAN_STATUS_CONFIG = {
  draft: { color: 'default', label: 'Nháp' },
  active: { color: 'green', label: 'Đang áp dụng' },
  completed: { color: 'blue', label: 'Hoàn thành' },
  cancelled: { color: 'red', label: 'Đã huỷ' },
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
      render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm'),
      defaultSortOrder: 'descend',
      sorter: (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt),
    },
    {
      title: 'Loại',
      dataIndex: 'sessionType',
      key: 'sessionType',
      render: (type) => (
        <Tag color={SESSION_TYPE_CONFIG[type]?.color}>
          {SESSION_TYPE_CONFIG[type]?.label || type}
        </Tag>
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
        <Badge status={SESSION_STATUS_CONFIG[status]?.color} text={SESSION_STATUS_CONFIG[status]?.label || status} />
      ),
    },
    {
      title: 'Nhịp tim TB',
      dataIndex: ['metrics', 'avgHeartRate'],
      key: 'avgHeartRate',
      render: (v) => (v ? `${v} bpm` : '—'),
    },
    {
      title: 'Tốc độ tối đa',
      dataIndex: ['metrics', 'maxSpeed'],
      key: 'maxSpeed',
      render: (v) => (v ? `${v} km/h` : '—'),
    },
    {
      title: 'Khoảng cách',
      dataIndex: ['metrics', 'distance'],
      key: 'distance',
      render: (v) => (v ? `${v} m` : '—'),
    },
    {
      title: 'Rating',
      dataIndex: 'performanceRating',
      key: 'performanceRating',
      render: (r) => (r ? <Tag color="gold">⭐ {r}/10</Tag> : '—'),
    },
  ];

  const planColumns = [
    {
      title: 'Giai đoạn',
      dataIndex: 'phase',
      key: 'phase',
      render: (p) => PHASE_LABELS[p] || p,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => (
        <Tag color={PLAN_STATUS_CONFIG[s]?.color}>
          {PLAN_STATUS_CONFIG[s]?.label || s}
        </Tag>
      ),
    },
    {
      title: 'Cường độ',
      dataIndex: 'intensity',
      key: 'intensity',
      render: (i) => (
        <Tag color={INTENSITY_CONFIG[i]?.color}>
          {INTENSITY_CONFIG[i]?.label || i}
        </Tag>
      ),
    },
    {
      title: 'Mặt sân',
      dataIndex: 'surface',
      key: 'surface',
      render: (s) => SURFACE_LABELS[s] || s,
    },
    {
      title: 'Mục tiêu cự ly',
      dataIndex: 'distanceTarget',
      key: 'distanceTarget',
      render: (v) => (v ? `${v} m` : '—'),
    },
    {
      title: 'KL/tuần',
      dataIndex: 'weeklyVolumeKm',
      key: 'weeklyVolumeKm',
      render: (v) => (v ? `${v} km` : '—'),
    },
    {
      title: 'Bắt đầu',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '—'),
    },
    {
      title: 'Kết thúc',
      dataIndex: 'endDate',
      key: 'endDate',
      render: (d) => (d ? dayjs(d).format('DD/MM/YYYY') : 'Chưa xác định'),
    },
  ];

  return (
    <div>
      <Title level={3} className="!font-semibold !mb-2 !text-[#022c22]" style={{ fontFamily: 'Georgia, serif' }}>
        <CalendarOutlined className="mr-2 text-[#eab308]" />
        Lịch Huấn luyện
      </Title>
      <Text className="block mb-6 text-gray-500">
        Theo dõi lịch trình tập luyện và giáo án huấn luyện của ngựa.
      </Text>

      {/* Horse Selector */}
      <div className="premium-card p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-medium text-gray-700">Chọn ngựa:</span>
          <Select
            placeholder="Tất cả ngựa"
            allowClear
            value={selectedHorse}
            onChange={setSelectedHorse}
            options={horses.map((h) => ({ value: h._id, label: h.name }))}
            style={{ minWidth: 200 }}
            className="rounded-md"
          />
          <Segmented
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'sessions', label: '📅 Buổi tập' },
              { value: 'plans', label: '📋 Giáo án' },
            ]}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="premium-card p-4 flex items-center gap-4 border-l-4 border-l-blue-500">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xl">
            <ClockCircleOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Sắp diễn ra</div>
            <div className="text-2xl font-bold text-[#022c22]">{scheduledCount}</div>
          </div>
        </div>
        <div className="premium-card p-4 flex items-center gap-4 border-l-4 border-l-green-500">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-500 flex items-center justify-center text-xl">
            <ThunderboltOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Đã hoàn thành</div>
            <div className="text-2xl font-bold text-[#022c22]">{completedCount}</div>
          </div>
        </div>
        <div className="premium-card p-4 flex items-center gap-4 border-l-4 border-l-orange-500">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-xl">
            <FireOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Rating TB</div>
            <div className="text-2xl font-bold text-[#022c22]">{avgRating}</div>
          </div>
        </div>
      </div>

      {/* Active Plan Card */}
      {activePlan && (
        <div className="premium-card p-5 mb-6 border-l-4 border-l-[#eab308]">
          <div className="flex items-center gap-2 mb-4">
            <span className="font-bold text-lg text-[#022c22]">📋 Giáo án đang áp dụng</span>
            <Tag className="rounded-full border-0 font-medium" color="green">Active</Tag>
          </div>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" colon={false} labelStyle={{ color: '#6b7280' }}>
            <Descriptions.Item label="Giai đoạn">
              <span className="font-medium text-gray-800">{PHASE_LABELS[activePlan.phase] || activePlan.phase}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Cường độ">
              <Tag className="rounded-full border-0" color={INTENSITY_CONFIG[activePlan.intensity]?.color}>
                {INTENSITY_CONFIG[activePlan.intensity]?.label || activePlan.intensity}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Mặt sân">
              <span className="font-medium text-gray-800">{SURFACE_LABELS[activePlan.surface] || activePlan.surface}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Mục tiêu cự ly">
              <span className="font-medium text-gray-800">{activePlan.distanceTarget} m</span>
            </Descriptions.Item>
            <Descriptions.Item label="Khối lượng/tuần">
              <span className="font-medium text-gray-800">{activePlan.weeklyVolumeKm} km</span>
            </Descriptions.Item>
            <Descriptions.Item label="Thời gian">
              <span className="font-medium text-gray-800">
                {dayjs(activePlan.startDate).format('DD/MM/YYYY')} →{' '}
                {activePlan.endDate ? dayjs(activePlan.endDate).format('DD/MM/YYYY') : 'Chưa xác định'}
              </span>
            </Descriptions.Item>
          </Descriptions>
          {activePlan.notes && (
            <div className="mt-3 p-3 bg-gray-50 rounded text-gray-600 text-sm">
              📝 {activePlan.notes}
            </div>
          )}
        </div>
      )}

      {/* Main Table */}
      <div className="premium-card p-5">
        <h3 className="font-bold text-lg text-[#022c22] mb-4">
          {viewMode === 'sessions' ? 'Danh sách Buổi tập' : 'Danh sách Giáo án Huấn luyện'}
        </h3>
        {viewMode === 'sessions' ? (
          <Table
            rowKey="_id"
            columns={sessionColumns}
            dataSource={horseSessions}
            loading={sessionsLoading}
            pagination={{ pageSize: 10 }}
            size="middle"
            locale={{ emptyText: 'Chưa có buổi tập nào' }}
            rowClassName="hover:bg-gray-50 transition-colors cursor-pointer"
          />
        ) : (
          <Table
            rowKey="_id"
            columns={planColumns}
            dataSource={horsePlans}
            pagination={{ pageSize: 10 }}
            size="middle"
            locale={{ emptyText: 'Chưa có giáo án nào' }}
            rowClassName="hover:bg-gray-50 transition-colors"
          />
        )}
      </div>
    </div>
  );
}
