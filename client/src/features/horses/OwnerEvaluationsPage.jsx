import { useState } from 'react';
import { Select, Timeline, Empty } from 'antd';
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

const SESSION_TYPE_CONFIG = {
  training: { color: 'bg-blue-50 text-blue-600 border-blue-200', label: 'Tập luyện' },
  trial_run: { color: 'bg-orange-50 text-orange-600 border-orange-200', label: '🏁 Chạy thử' },
};

function RatingBadge({ rating }) {
  if (!rating) return <span className="text-gray-400 font-medium">Chưa đánh giá</span>;
  let colorClass = 'bg-emerald-100 text-emerald-700';
  if (rating < 4) colorClass = 'bg-red-100 text-red-700';
  else if (rating < 7) colorClass = 'bg-yellow-100 text-yellow-700';
  return (
    <span className={`text-sm px-2.5 py-1 rounded-full font-bold shadow-sm ${colorClass}`}>
      ⭐ {rating}/10
    </span>
  );
}

const StatCard = ({ title, value, subtitle, icon, iconColorClass }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
    <div className="flex justify-between items-center mb-4">
      <span className="text-gray-500 text-sm font-medium">{title}</span>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconColorClass}`}>
        {icon}
      </div>
    </div>
    <div className="flex items-baseline gap-3 mb-1">
      <span className="text-3xl font-bold text-gray-900">{value}</span>
    </div>
    <span className="text-xs text-gray-400 font-medium">{subtitle}</span>
  </div>
);

export default function OwnerEvaluationsPage() {
  const [selectedHorse, setSelectedHorse] = useState(null);

  const { data: horsesData } = useQuery({
    queryKey: ['horses'],
    queryFn: () => horsesApi.list(),
  });
  const horses = horsesData?.data || [];

  const { data: sessionsData } = useQuery({
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

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-800 p-4 md:px-8 md:pb-8 md:pt-4 font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 m-0 mb-1 tracking-tight">Đánh giá từ Huấn luyện viên</h1>
        <p className="text-sm text-gray-500 m-0">
          Nhật ký nhận xét và đánh giá chuyên môn định kỳ từ Huấn luyện viên Trưởng.
        </p>
      </div>

      {/* Horse Selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="font-medium text-gray-500 text-sm">Xem đánh giá cho:</span>
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
        <div className="text-gray-500 text-sm">
          Tìm thấy <strong className="text-gray-800">{totalEvaluations}</strong> đánh giá
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard 
          title="Rating Trung bình" 
          value={avgRating || '—'}
          subtitle="Điểm trên thang 10"
          icon={<StarOutlined />}
          iconColorClass="bg-yellow-100 text-yellow-600"
        />
        <StatCard 
          title="Rating Cao nhất" 
          value={highestRating || '—'}
          subtitle="Thành tích tốt nhất"
          icon={<TrophyOutlined />}
          iconColorClass="bg-emerald-100 text-emerald-600"
        />
        <StatCard 
          title="Tổng Đánh giá" 
          value={totalEvaluations}
          subtitle="Số lần HLV nhận xét"
          icon={<CommentOutlined />}
          iconColorClass="bg-blue-100 text-blue-600"
        />
      </div>

      {/* Rating Chart */}
      {chartData.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
            <RiseOutlined className="text-emerald-500 text-xl" />
            <h2 className="text-base font-semibold text-gray-900 m-0">Biểu đồ Xu hướng Đánh giá</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
              <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload?.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100">
                        <div className="font-semibold text-gray-800 mb-2">{d.fullDate}</div>
                        <div className="text-lg">
                          ⭐ Rating: <strong className="text-gray-900">{d.rating}/10</strong>
                        </div>
                        <div className="text-gray-500 text-sm mt-2 font-medium">Loại: {d.type}</div>
                        {d.horse && <div className="text-gray-500 text-sm font-medium">Chiến mã: {d.horse}</div>}
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
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
          <CommentOutlined className="text-gray-700 text-xl" />
          <h2 className="text-base font-semibold text-gray-900 m-0">Nhật ký Đánh giá & Nhận xét</h2>
        </div>
        
        {evaluatedSessions.length > 0 ? (
          <Timeline
            className="mt-6 custom-timeline pl-2"
            items={evaluatedSessions.map((session) => ({
              color: session.performanceRating >= 7 ? '#10b981' : session.performanceRating >= 4 ? '#3b82f6' : '#ef4444',
              children: (
                <div className="pb-6 -mt-2">
                  <div className="flex justify-between items-start flex-wrap gap-4 mb-3">
                    <div>
                      <span className="font-semibold text-gray-900 text-base">
                        {dayjs(session.scheduledAt).format('DD/MM/YYYY HH:mm')}
                      </span>
                      <span className={`ml-3 text-xs px-2 py-0.5 rounded border font-medium ${SESSION_TYPE_CONFIG[session.sessionType]?.color || 'bg-gray-100'}`}>
                        {SESSION_TYPE_CONFIG[session.sessionType]?.label || session.sessionType}
                      </span>
                      {session.horse?.name && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 font-medium">
                          🐴 {session.horse.name}
                        </span>
                      )}
                    </div>
                    <RatingBadge rating={session.performanceRating} />
                  </div>

                  {session.trainerComment && (
                    <div className="mt-2 p-4 bg-gray-50 rounded-xl border border-gray-100 text-gray-700 text-sm shadow-sm relative">
                      <div className="absolute top-4 left-4 text-gray-300">
                        <CommentOutlined />
                      </div>
                      <div className="pl-6">
                        <div className="text-gray-400 text-xs mb-1 font-bold tracking-wider uppercase">Nhận xét HLV</div>
                        <p className="m-0 leading-relaxed">{session.trainerComment}</p>
                      </div>
                    </div>
                  )}

                  {session.metrics && (
                    <div className="mt-3 flex gap-2 flex-wrap text-sm">
                      {session.metrics.avgHeartRate && (
                        <span className="text-gray-600 font-medium bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
                          ❤️ {session.metrics.avgHeartRate} <span className="text-gray-400 text-xs">bpm</span>
                        </span>
                      )}
                      {session.metrics.maxSpeed && (
                        <span className="text-gray-600 font-medium bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
                          🏃 {session.metrics.maxSpeed} <span className="text-gray-400 text-xs">km/h</span>
                        </span>
                      )}
                      {session.metrics.distance && (
                        <span className="text-gray-600 font-medium bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
                          📏 {session.metrics.distance} <span className="text-gray-400 text-xs">m</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        ) : (
          <Empty description="Chưa có đánh giá nào từ HLV" className="my-12" />
        )}
      </div>
    </div>
  );
}
