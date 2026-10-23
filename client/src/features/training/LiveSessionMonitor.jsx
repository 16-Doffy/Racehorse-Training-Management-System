import { useEffect, useRef, useState } from 'react';
import { Button, Card, Dropdown, Progress, Tag, Typography } from 'antd';
import { HeartFilled, ThunderboltFilled, AimOutlined, ExperimentOutlined, LineChartOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import { message } from '../../lib/antdStatic';
import dayjs from 'dayjs';
import { getSocket } from '../../lib/socket';
import { trainingSessionApi } from './trainingApi';
import { SESSION_KINDS, OBJECTIVE_LABELS } from './trainingVocab';
import { FOREST, STATUS_TONES } from '../../layouts/forestTheme';

const { Text } = Typography;

// Readings kept per session for the chart: 40 ticks of 5 s, a little over three minutes on screen.
const KEEP = 40;
// Readings outlive this screen while the browser tab is open: going to another page and back
// keeps the chart instead of starting it again (the server also hands back its last readings).
const liveCache = new Map();
const toPoint = (r) => ({ hr: r.hr ?? r.heartRate, speed: r.speed, distance: r.distance, targetDistance: r.targetDistance });
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
  const isBad = tone === STATUS_TONES.bad;
  return (
    <div
      className={`flex min-w-0 flex-col gap-0.5 rounded-lg border p-2.5 transition-colors ${
        isBad ? 'bg-rose-50/70 border-rose-200 text-rose-900' : 'bg-gray-50/60 border-gray-200/80 text-gray-900'
      }`}
    >
      <span className={`flex items-center gap-1.5 text-xs font-medium ${isBad ? 'text-rose-700' : 'text-gray-500'}`}>
        {icon}
        {label}
      </span>
      <span className={`text-xl font-bold tabular-nums leading-tight ${isBad ? 'text-rose-700' : 'text-gray-900'}`}>
        {value ?? '—'}
        <span className="ml-1 text-xs font-normal text-gray-400">{unit}</span>
      </span>
      {sub && <span className="truncate text-[11px] text-gray-400 mt-0.5">{sub}</span>}
    </div>
  );
}

/** What a running session shows now: the latest reading, else the last one the server kept. */
function liveFigures(session, readings) {
  const target = targetsOf(session);
  const last = readings[readings.length - 1];
  const heartRate = last?.hr ?? session.metrics?.lastHeartRate;
  const speed = last?.speed ?? session.metrics?.lastSpeed;
  const distance = last?.distance ?? session.metrics?.distance ?? 0;
  const targetDistance = last?.targetDistance ?? target.distance;
  return { target, heartRate, speed, distance, targetDistance, over: heartRate != null && heartRate > target.heartRateMax };
}

// Demo only (simulated sensors): make the running horse tire, or go lame so the system stops the run.
const SCENARIO_ITEMS = [
  { key: 'tired', label: 'Ngựa mệt dần (tốc độ giảm, nhịp tim tăng)' },
  { key: 'injury', label: 'Nghi chấn thương (hệ thống tự dừng buổi)' },
];
function ScenarioButton({ session }) {
  const play = ({ key }) =>
    trainingSessionApi
      .simulate(session._id, key)
      .then(() => message.info(key === 'injury' ? 'Đã giả lập nghi chấn thương — lần đo tới hệ thống sẽ dừng buổi.' : 'Đã giả lập ngựa mệt dần từ lần đo tới.'))
      .catch((err) => message.error(err.message || 'Không giả lập được.'));
  return (
    <Dropdown menu={{ items: SCENARIO_ITEMS, onClick: play }} trigger={['click']}>
      <Button size="small" icon={<ExperimentOutlined />}>
        Mô phỏng sự cố
      </Button>
    </Dropdown>
  );
}

function LiveCard({ session, readings }) {
  const { target, heartRate, speed, distance, targetDistance, over } = liveFigures(session, readings);
  const kind = SESSION_KINDS[session.kind];
  const data = readings.map((r, i) => ({ i, hr: r.hr, speed: r.speed }));
  const startedAt = session.actualStartAt ? dayjs(session.actualStartAt).format('HH:mm') : null;

  return (
    <Card
      size="small"
      className="min-w-0 rounded-xl border-gray-200/80 shadow-xs overflow-hidden"
      styles={{
        header: { whiteSpace: 'normal', height: 'auto', minHeight: 'auto', padding: '8px 12px' },
        title: { whiteSpace: 'normal', overflow: 'visible' },
      }}
      headStyle={{ whiteSpace: 'normal' }}
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1">
            <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block shrink-0" />
            <span className="font-semibold text-gray-900 text-sm break-words">{session.horse?.name}</span>
            <span className="text-xs text-gray-500 font-normal">
              {kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}
            </span>
            {startedAt && (
              <span className="text-xs text-gray-400">· Bắt đầu {startedAt}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {over && (
              <Tag color="error" className="!m-0 text-xs font-medium">
                Vượt ngưỡng nhịp tim
              </Tag>
            )}
            <ScenarioButton session={session} />
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Figure
          icon={<HeartFilled />}
          label="Nhịp tim"
          value={heartRate}
          unit="bpm"
          sub={`Giới hạn ${target.heartRateMax} · TB ${session.metrics?.avgHeartRate ? Math.round(session.metrics.avgHeartRate) : '—'}`}
          tone={over ? STATUS_TONES.bad : STATUS_TONES.neutral}
        />
        <Figure
          icon={<ThunderboltFilled />}
          label="Tốc độ"
          value={speed}
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
      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
          <span>Tiến độ cự ly</span>
          <span className="tabular-nums font-medium text-gray-700">
            {distance} / {targetDistance} m
          </span>
        </div>
        <Progress
          className="!m-0"
          percent={Math.min(100, Math.round((distance / targetDistance) * 100))}
          strokeColor={FOREST.primary}
          size="small"
          showInfo={false}
        />
      </div>
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

// From this many horses at once, one row each instead of one card each: the board stays readable.
const COMPACT_FROM = 3;

/** Several horses at once: a row per horse, the ones over their heart-rate ceiling first; a row opens its chart. */
function LiveBoard({ running, readings }) {
  const [openId, setOpenId] = useState(null);
  const rows = running
    .map((s) => ({ s, f: liveFigures(s, readings[s._id] || []) }))
    .sort((a, b) => Number(b.f.over) - Number(a.f.over) || b.f.distance / b.f.targetDistance - a.f.distance / a.f.targetDistance);
  const open = running.find((s) => s._id === openId);
  return (
    <Card size="small" className="mb-4 rounded-xl" title={`Đang tập: ${running.length} ngựa · cập nhật mỗi 5 giây`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-1.5 pr-3 font-medium">Ngựa</th>
              <th className="py-1.5 pr-3 font-medium">Nhịp tim</th>
              <th className="py-1.5 pr-3 font-medium">Tốc độ</th>
              <th className="py-1.5 pr-3 font-medium w-[30%]">Cự ly</th>
              <th className="py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(({ s, f }) => (
              <tr key={s._id} className={`cursor-pointer ${s._id === openId ? 'bg-emerald-50/60' : 'hover:bg-gray-50'}`} onClick={() => setOpenId(s._id === openId ? null : s._id)}>
                <td className="py-2 pr-3">
                  <div className="font-semibold text-gray-900">{s.horse?.name}</div>
                  <div className="text-xs text-gray-500">{SESSION_KINDS[s.kind]?.label || OBJECTIVE_LABELS[s.objective] || 'Buổi tập'}</div>
                </td>
                <td className="py-2 pr-3 tabular-nums">
                  <span className={f.over ? 'font-bold text-rose-700' : 'font-semibold'}>{f.heartRate ?? '—'}</span>
                  <span className="text-xs text-gray-400"> / {f.target.heartRateMax} bpm</span>
                  {f.over && <Tag color="error" className="!ml-2 !text-xs">Vượt ngưỡng</Tag>}
                </td>
                <td className="py-2 pr-3 tabular-nums">
                  <span className="font-semibold">{f.speed ?? '—'}</span>
                  <span className="text-xs text-gray-400"> km/h</span>
                </td>
                <td className="py-2 pr-3">
                  <Progress className="!m-0" size="small" strokeColor={FOREST.primary} percent={Math.min(100, Math.round((f.distance / f.targetDistance) * 100))} format={() => `${f.distance}/${f.targetDistance} m`} />
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Button size="small" type="link" icon={<LineChartOutlined />}>
                    {s._id === openId ? 'Ẩn biểu đồ' : 'Biểu đồ'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="mt-3">
          <LiveCard session={open} readings={readings[open._id] || []} />
        </div>
      )}
    </Card>
  );
}

/**
 * The sessions running right now, each with its live heart rate, speed and distance from the sensor
 * feed (`sensor:reading`, sent to the horse's trainer) and a heart-rate line against the session's
 * own ceiling. Shown only while something is running: a card per horse, or a row per horse from
 * COMPACT_FROM horses at once.
 */
export default function LiveSessionMonitor({ sessions = [], onSessionCompleted }) {
  const running = sessions.filter((s) => s.status === 'in_progress');
  const [readings, setReadings] = useState(() => Object.fromEntries(liveCache));
  const queryClient = useQueryClient();
  const runningIds = running.map((s) => s._id).join(',');
  // Horse names for a message about a run that has just left the board.
  const names = useRef(new Map());
  useEffect(() => {
    for (const s of running) names.current.set(String(s._id), s.horse?.name);
  }, [running]);

  // A run that was already going when this screen opened: fetch what the server kept of it.
  useEffect(() => {
    if (!runningIds) return;
    for (const id of runningIds.split(',')) {
      if (liveCache.get(id)?.length) continue;
      trainingSessionApi
        .readings(id)
        .then((res) => {
          const list = (res?.data || []).map(toPoint).slice(-KEEP);
          if (!list.length) return;
          const merged = [...list, ...(liveCache.get(id) || [])].slice(-KEEP);
          liveCache.set(id, merged);
          setReadings((prev) => ({ ...prev, [id]: merged }));
        })
        .catch(() => {});
    }
  }, [runningIds]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    if (!socket.connected) socket.connect();
    const onReading = (r) => {
      const id = String(r.sessionId);
      const list = [...(liveCache.get(id) || []), toPoint(r)].slice(-KEEP);
      liveCache.set(id, list);
      setReadings((prev) => ({ ...prev, [id]: list }));
    };
    // A finished session leaves the board at once instead of at the next poll.
    const onCompleted = (payload) => {
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      if (payload?.sessionId) {
        liveCache.delete(String(payload.sessionId));
        // Stopped by the sensor feed (a suspected injury): say so, there is nothing to evaluate.
        if (payload.aborted) {
          const horse = names.current.get(String(payload.sessionId)) || 'Ngựa';
          message.warning({ content: `${horse}: hệ thống đã dừng buổi tập vì nghi chấn thương. Đã gửi yêu cầu khám gấp cho bác sĩ và giao việc sơ cứu cho nhân viên chăm sóc.`, duration: 10 });
        } else {
          onSessionCompleted?.(payload.sessionId);
        }
      }
    };
    socket.on('sensor:reading', onReading);
    socket.on('session:completed', onCompleted);
    return () => {
      socket.off('sensor:reading', onReading);
      socket.off('session:completed', onCompleted);
    };
  }, [queryClient, onSessionCompleted]);

  if (!running.length) return null;
  if (running.length >= COMPACT_FROM) return <LiveBoard running={running} readings={readings} />;
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
      {running.map((s) => (
        <LiveCard key={s._id} session={s} readings={readings[s._id] || []} />
      ))}
    </div>
  );
}
