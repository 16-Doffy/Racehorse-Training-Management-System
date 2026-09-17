import { useState } from 'react';
import { Typography, Card, Row, Col, Tag, Select, Empty, Timeline, Rate, Divider } from 'antd';
import {
  StarOutlined,
  CommentOutlined,
  RiseOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { trainingSessionApi } from '../training/trainingApi';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

const SESSION_TYPE_CONFIG = {
  training: { color: 'blue', label: 'Tập luyện' },
  trial_run: { color: 'orange', label: '🏁 Chạy thử' },
};

function RatingBadge({ rating }) {
  if (!rating) return <Text type="secondary">Chưa đánh giá</Text>;
  let color = '#52c41a';
  if (rating < 4) color = '#ff4d4f';
  else if (rating < 7) color = '#faad14';
  return (
    <Tag color={color} style={{ fontSize: 14, padding: '2px 10px' }}>
      ⭐ {rating}/10
    </Tag>
  );
}

export default function OwnerEvaluationsPage() {
  const [selectedHorse, setSelectedHorse] = useState(null);

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

  // Only sessions that have evaluation (trainerComment or performanceRating)
  const ownerHorseIds = horses.map((h) => h._id);
  const evaluatedSessions = allSessions
    .filter((s) => {
      const horseId = s.horse?._id || s.horse;
      const isOwnerHorse = ownerHorseIds.includes(horseId);
      const hasEvaluation = s.trainerComment || s.performanceRating;
      const matchesFilter = !selectedHorse || horseId === selectedHorse;
      return isOwnerHorse && hasEvaluation && matchesFilter;
    })
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  // Chart data — rating over time
  const chartData = evaluatedSessions
    .filter((s) => s.performanceRating)
    .reverse()
    .map((s) => ({
      date: dayjs(s.scheduledAt).format('DD/MM'),
      fullDate: dayjs(s.scheduledAt).format('DD/MM/YYYY'),
      rating: s.performanceRating,
      type: SESSION_TYPE_CONFIG[s.sessionType]?.label || s.sessionType,
      horse: s.horse?.name || '',
    }));

  // Stats
  const totalEvaluations = evaluatedSessions.length;
  const avgRating =
    evaluatedSessions.filter((s) => s.performanceRating).length > 0
      ? (
          evaluatedSessions.reduce((sum, s) => sum + (s.performanceRating || 0), 0) /
          evaluatedSessions.filter((s) => s.performanceRating).length
        ).toFixed(1)
      : null;
  const highestRating = evaluatedSessions.reduce(
    (max, s) => Math.max(max, s.performanceRating || 0),
    0
  );
  const latestEval = evaluatedSessions[0];

  return (
    <div>
      <Title level={3} className="!font-semibold !mb-2 !text-[#022c22]" style={{ fontFamily: 'Georgia, serif' }}>
        <StarOutlined className="mr-2 text-[#eab308]" />
        Đánh giá từ HLV
      </Title>
      <Text className="block mb-6 text-gray-500">
        Nhật ký nhận xét và đánh giá chuyên môn từ Huấn luyện viên Trưởng.
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
          <Text className="text-gray-500 text-sm">
            Tìm thấy <strong className="text-gray-800">{totalEvaluations}</strong> đánh giá
          </Text>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="premium-card p-4 flex items-center gap-4 border-t-4 border-t-[#eab308]">
          <div className="w-12 h-12 rounded-full bg-yellow-50 text-[#eab308] flex items-center justify-center text-xl">
            <StarOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Rating trung bình</div>
            <div className="text-2xl font-bold text-[#022c22]">{avgRating || '—'}</div>
          </div>
        </div>
        <div className="premium-card p-4 flex items-center gap-4 border-t-4 border-t-green-500">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-500 flex items-center justify-center text-xl">
            <TrophyOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Rating cao nhất</div>
            <div className="text-2xl font-bold text-[#022c22]">{highestRating || '—'}</div>
          </div>
        </div>
        <div className="premium-card p-4 flex items-center gap-4 border-t-4 border-t-blue-500">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xl">
            <CommentOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Tổng đánh giá</div>
            <div className="text-2xl font-bold text-[#022c22]">{totalEvaluations}</div>
          </div>
        </div>
      </div>

      {/* Rating Chart */}
      {chartData.length > 1 && (
        <div className="premium-card p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <RiseOutlined className="text-green-500 text-lg" />
            <h4 className="font-bold text-lg text-[#022c22] m-0">Biểu đồ Xu hướng Đánh giá</h4>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload?.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-100">
                        <div className="font-semibold text-gray-800">{d.fullDate}</div>
                        <div className="mt-1">
                          ⭐ Rating: <strong className="text-gray-900">{d.rating}/10</strong>
                        </div>
                        <div className="text-gray-600 text-sm mt-1">Loại: {d.type}</div>
                        {d.horse && <div className="text-gray-600 text-sm">Ngựa: {d.horse}</div>}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={5} stroke="#faad14" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="rating"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ r: 5, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Evaluations Timeline */}
      <div className="premium-card p-5">
        <div className="flex items-center gap-2 mb-6">
          <CommentOutlined className="text-[#022c22] text-lg" />
          <h4 className="font-bold text-lg text-[#022c22] m-0">Nhật ký Đánh giá</h4>
        </div>
        
        {evaluatedSessions.length > 0 ? (
          <Timeline
            className="mt-2"
            items={evaluatedSessions.map((session) => ({
              color:
                session.performanceRating >= 7
                  ? 'green'
                  : session.performanceRating >= 4
                    ? 'blue'
                    : 'red',
              children: (
                <div className="pb-4">
                  <div className="flex justify-between items-start flex-wrap gap-2 mb-2">
                    <div>
                      <span className="font-medium text-gray-800 text-base">
                        {dayjs(session.scheduledAt).format('DD/MM/YYYY HH:mm')}
                      </span>
                      <Tag className="ml-3 rounded-full border-0" color={SESSION_TYPE_CONFIG[session.sessionType]?.color}>
                        {SESSION_TYPE_CONFIG[session.sessionType]?.label || session.sessionType}
                      </Tag>
                      {session.horse?.name && (
                        <Tag className="ml-1 rounded-full border-0 bg-gray-100 text-gray-600">{session.horse.name}</Tag>
                      )}
                    </div>
                    <RatingBadge rating={session.performanceRating} />
                  </div>

                  {session.trainerComment && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg text-gray-700 text-sm">
                      <div className="text-gray-400 text-xs mb-1">💬 Nhận xét HLV:</div>
                      {session.trainerComment}
                    </div>
                  )}

                  {session.metrics && (
                    <div className="mt-3 flex gap-4 flex-wrap text-sm">
                      {session.metrics.avgHeartRate && (
                        <span className="text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded-md">❤️ {session.metrics.avgHeartRate} bpm</span>
                      )}
                      {session.metrics.maxSpeed && (
                        <span className="text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded-md">🏃 {session.metrics.maxSpeed} km/h</span>
                      )}
                      {session.metrics.distance && (
                        <span className="text-gray-500 bg-white border border-gray-200 px-2 py-1 rounded-md">📏 {session.metrics.distance} m</span>
                      )}
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        ) : (
          <Empty description="Chưa có đánh giá nào từ HLV" />
        )}
      </div>
    </div>
  );
}
