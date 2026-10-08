import { useEffect, useState } from 'react';
import { Card, Progress, Tag, Typography } from 'antd';
import { HeartFilled, ThunderboltFilled, AimOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getSocket } from '../../lib/socket';
import { SESSION_KINDS, OBJECTIVE_LABELS } from './trainingVocab';
import { FOREST, STATUS_TONES } from '../../layouts/forestTheme';

const { Text } = Typography;

// Readings kept per session for the chart: 40 ticks of 5 s, a little over three minutes on screen.
const KEEP = 40;
const GRID = '#E4DFD3';
const AXIS = '#8A8578';

/** The workout a running session is measured against (same fallbacks as the server's simulator). */
function targetsOf(session) {
  const kind = SESSION_KINDS[session.kind]?.prescription || {};
  const p = session.prescription || {};
  const pick = (f) => p[f] ?? kind[f];
  return {
    heartRateMax: pick('targetHeartRateMax') || 180,
    speed: pick('targetSpeedKmh'),
    distance: (pick('distanceM') || 2000) * (p.reps ?? kind.reps ?? 1),
  };
}

function Figure({ icon, label, value, unit, sub, tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md px-3 py-2" style={{ background: tone.bg }}>
      <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide" style={{ color: tone.color }}>
        {icon}
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums leading-tight" style={{ color: tone.color }}>
        {value ?? '—'}
        <span className="ml-1 text-xs font-normal">{unit}</span>
      </span>
      {sub && <span className="truncate text-[11px] text-gray-500">{sub}</span>}
    </div>
  );
}

function LiveCard({ session, readings }) {
  const target = targetsOf(session);
  const last = readings[readings.length - 1];
  const distance = last?.distance ?? session.metrics?.distance ?? 0;
  const targetDistance = last?.targetDistance ?? target.distance;
  const over = last && last.hr > target.heartRateMax;
  const kind = SESSION_KINDS[session.kind];
  const data = readings.map((r, i) => ({ i, hr: r.hr, speed: r.speed }));
  const startedAt = session.actualStartAt ? dayjs(session.actualStartAt).format('HH:mm') : null;

  return (
    <Card
      size="small"
      className="min-w-0"
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: STATUS_TONES.good.color }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: STATUS_TONES.good.color }} />
          </span>
          <span className="font-semibold">{session.horse?.name}</span>
          <Tag color={kind?.color || 'default'} className="!m-0">
            {kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}
          </Tag>
          <Text type="secondary" className="!text-xs">
            Đang tập{startedAt ? ` · bắt đầu ${startedAt}` : ''}
          </Text>
          {over && (
            <Tag color="error" className="!m-0">
              Vượt ngưỡng nhịp tim
            </Tag>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Figure
          icon={<HeartFilled />}
          label="Nhịp tim"
          value={last?.hr}
          unit="bpm"
          sub={`Giới hạn ${target.heartRateMax} · TB ${session.metrics?.avgHeartRate ? Math.round(session.metrics.avgHeartRate) : '—'}`}
          tone={over ? STATUS_TONES.bad : STATUS_TONES.neutral}
        />
        <Figure
          icon={<ThunderboltFilled />}
          label="Tốc độ"
          value={last?.speed}
          unit="km/h"
          sub={target.speed ? `Mục tiêu ${target.speed} km/h` : null}
          tone={STATUS_TONES.neutral}
        />
        <Figure
          icon={<AimOutlined />}
          label="Cự ly"
          value={distance}
          unit="m"
          sub={`Mục tiêu ${targetDistance} m`}
          tone={STATUS_TONES.neutral}
        />
      </div>
      <Progress
        className="!mt-2 !mb-0"
        percent={Math.min(100, Math.round((distance / targetDistance) * 100))}
        strokeColor={FOREST.primary}
        size="small"
      />
      <div className="mt-1 h-32 w-full">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis
                domain={[60, Math.max(target.heartRateMax + 20, ...data.map((d) => d.hr + 5))]}
                tick={{ fontSize: 11, fill: AXIS }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip formatter={(v, name) => [name === 'hr' ? `${v} bpm` : `${v} km/h`, name === 'hr' ? 'Nhịp tim' : 'Tốc độ']} labelFormatter={() => ''} />
              <ReferenceLine
                y={target.heartRateMax}
                stroke={STATUS_TONES.bad.color}
                strokeDasharray="4 4"
                label={{ value: `ngưỡng ${target.heartRateMax}`, position: 'insideTopRight', fontSize: 11, fill: STATUS_TONES.bad.color }}
              />
              <Line type="monotone" dataKey="hr" stroke={FOREST.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-500">Đang chờ số liệu cảm biến…</div>
        )}
      </div>
      <Text type="secondary" className="!text-[11px] block">
        Cảm biến mô phỏng gửi số liệu mỗi 5 giây (mỗi lần tương ứng 30 giây tập). Buổi tự kết thúc khi chạy đủ cự ly.
      </Text>
    </Card>
  );
}

/**
 * The sessions running right now, each with its live heart rate, speed and distance from the sensor
 * feed (`sensor:reading`, sent to the horse's trainer) and a heart-rate line against the session's
 * own ceiling. Shown only while something is running.
 */
export default function LiveSessionMonitor({ sessions = [] }) {
  const running = sessions.filter((s) => s.status === 'in_progress');
  const [readings, setReadings] = useState({});
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    if (!socket.connected) socket.connect();
    const onReading = (r) => {
      setReadings((prev) => {
        const list = [...(prev[r.sessionId] || []), { hr: r.heartRate, speed: r.speed, distance: r.distance, targetDistance: r.targetDistance }];
        return { ...prev, [r.sessionId]: list.slice(-KEEP) };
      });
    };
    // A finished session leaves the board at once instead of at the next poll.
    const onCompleted = () => {
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
    };
    socket.on('sensor:reading', onReading);
    socket.on('session:completed', onCompleted);
    return () => {
      socket.off('sensor:reading', onReading);
      socket.off('session:completed', onCompleted);
    };
  }, [queryClient]);

  if (!running.length) return null;
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
      {running.map((s) => (
        <LiveCard key={s._id} session={s} readings={readings[s._id] || []} />
      ))}
    </div>
  );
}
