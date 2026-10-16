import { useState } from 'react';
import { Select, Empty } from 'antd';
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
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { OwnerCard, Pill, StatStrip } from './ownerUi';

const SESSION_TYPE_CONFIG = {
  training: { tone: 'info', label: 'Tập luyện' },
  trial_run: { tone: 'warn', label: 'Chạy thử' },
};

function RatingBadge({ rating }) {
  if (!rating) return <span className="text-gray-400 text-sm">Chưa đánh giá</span>;
  return <Pill tone={rating >= 7 ? 'good' : rating >= 4 ? 'warn' : 'bad'}>{rating}/10</Pill>;
}

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
    <div className="light-surface-box owner-ui text-gray-800 font-sans">
      <PageHeroBanner eyebrow="TEAM 8 • ĐÁNH GIÁ CHUYÊN MÔN" roleLabel="Horse Owner" title="Đánh Giá Từ Huấn Luyện Viên" subtitle="Nhật ký nhận xét và đánh giá chuyên môn định kỳ từ Huấn luyện viên Trưởng." />

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
        <span className="text-gray-500 text-sm">
          <strong className="text-gray-800">{totalEvaluations}</strong> đánh giá
        </span>
      </div>

      <StatStrip
        className="mb-4"
        items={[
          { label: 'Rating trung bình', value: avgRating || '—', hint: 'Thang điểm 10' },
          { label: 'Rating cao nhất', value: highestRating || '—', hint: 'Thành tích tốt nhất' },
          { label: 'Tổng đánh giá', value: totalEvaluations, hint: 'Số lần HLV nhận xét' },
        ]}
      />

      {/* Rating Chart */}
      {chartData.length > 1 && (
        <OwnerCard title="Xu hướng đánh giá" className="mb-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
              <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload?.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white px-3 py-2 rounded-lg shadow-lg border border-gray-100 text-sm">
                        <div className="font-semibold text-gray-800">{d.fullDate}</div>
                        <div className="text-gray-600 mt-1">
                          Rating <strong className="text-gray-900">{d.rating}/10</strong> · {d.type}
                        </div>
                        {d.horse && <div className="text-gray-500">{d.horse}</div>}
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
                stroke="#0F5A43"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#0F5A43', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </OwnerCard>
      )}

      {/* Evaluations */}
      <OwnerCard title="Nhật ký đánh giá & nhận xét">
        {evaluatedSessions.length > 0 ? (
          <ul className="list-none m-0 p-0 divide-y divide-gray-100">
            {evaluatedSessions.map((session) => {
              const m = session.metrics;
              const metrics = m
                ? [m.avgHeartRate && `${m.avgHeartRate} bpm`, m.maxSpeed && `${m.maxSpeed} km/h`, m.distance && `${m.distance} m`].filter(Boolean)
                : [];
              const type = SESSION_TYPE_CONFIG[session.sessionType];
              return (
                <li key={session._id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                      <span className="font-semibold text-gray-900 tabular-nums">
                        {dayjs(session.scheduledAt).format('DD/MM/YYYY HH:mm')}
                      </span>
                      {session.horse?.name && <span className="text-sm text-gray-600">{session.horse.name}</span>}
                      <Pill tone={type?.tone}>{type?.label || session.sessionType}</Pill>
                    </div>
                    <RatingBadge rating={session.performanceRating} />
                  </div>

                  {session.trainerComment && (
                    <p className="m-0 mt-2 pl-3 border-l-2 border-gray-200 text-sm text-gray-700 leading-relaxed">
                      {session.trainerComment}
                    </p>
                  )}

                  {metrics.length > 0 && <div className="mt-2 text-xs text-gray-500 tabular-nums">{metrics.join('  ·  ')}</div>}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có đánh giá nào từ HLV" />
        )}
      </OwnerCard>
    </div>
  );
}
