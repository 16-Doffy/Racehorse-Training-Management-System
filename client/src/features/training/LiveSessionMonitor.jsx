import { useEffect, useRef, useState } from 'react';
import { Button, Card, Dropdown, Progress, Tag, Typography } from 'antd';
import { ExperimentOutlined, LineChartOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import { message } from '../../lib/antdStatic';
import dayjs from 'dayjs';
import { getSocket } from '../../lib/socket';
import { trainingSessionApi } from './trainingApi';
import { SESSION_KINDS, OBJECTIVE_LABELS, sessionTargets } from './trainingVocab';
import { FOREST, STATUS_TONES } from '../../layouts/forestTheme';
import MovingHorse3D from '../horses/horse3d/MovingHorse3D';
import Telemetry from './Telemetry';
import { hourOf, liveMotion, surfaceOf } from '../horses/horse3d/horseMotion';

const { Text } = Typography;

// Readings kept per session for the chart: 40 ticks of 5 s, a little over three minutes on screen.
const KEEP = 40;
// Readings outlive this screen while the browser tab is open: going to another page and back
// keeps the chart instead of starting it again (the server also hands back its last readings).
const liveCache = new Map();
const toPoint = (r) => ({ hr: r.hr ?? r.heartRate, speed: r.speed, distance: r.distance, targetDistance: r.targetDistance });
const GRID = '#E4DFD3';
const AXIS = '#8A8578';

/** What a running session shows now: the latest reading, else the last one the server kept. */
function liveFigures(session, readings) {
  const target = sessionTargets(session);
  const last = readings[readings.length - 1];
  const heartRate = last?.hr ?? session.metrics?.lastHeartRate;
  const speed = last?.speed ?? session.metrics?.lastSpeed;
  const distance = last?.distance ?? session.metrics?.distance ?? 0;
  const targetDistance = last?.targetDistance ?? target.distance;
  return { target, heartRate, speed, distance, targetDistance, over: heartRate != null && heartRate > target.heartRateMax };
}

/**
 * What the horse does now (horseMotion liveMotion); a trial with the metres it has left and those the
 * last reading added, for its finish post. Null before the first reading.
 */
function motionNow(session, f, readings = []) {
  if (f.speed == null) return null;
  const [prev, last] = readings.slice(-2);
  const step = prev && last ? last.distance - prev.distance : undefined;
  return liveMotion(session, f.speed, session.kind === 'trial' ? { remaining: f.targetDistance - f.distance, step } : {});
}
// The session's sky: the hour it started (or was booked for).
const hourOfSession = (session) => hourOf(session.actualStartAt || session.scheduledAt);

// Demo only (simulated sensors): make the running horse tire, or go lame on a leg so the system stops the run.
const LEGS = { fore_left: 'Chân trước trái', fore_right: 'Chân trước phải', hind_left: 'Chân sau trái', hind_right: 'Chân sau phải' };
const SCENARIO_ITEMS = [
  { key: 'tired', label: 'Ngựa mệt dần (tốc độ giảm, nhịp tim tăng)' },
  { type: 'divider' },
  {
    type: 'group',
    label: 'Nghi chấn thương, hệ thống tự dừng buổi. Chân đau:',
    children: Object.entries(LEGS).map(([leg, label]) => ({ key: `injury:${leg}`, label })),
  },
];
function ScenarioButton({ session }) {
  const queryClient = useQueryClient();
  const play = ({ key }) => {
    const [scenario, leg] = key.split(':');
    trainingSessionApi
      .simulate(session._id, scenario, leg)
      .then(() => {
        // The horse on the card plays the scenario from the next reading.
        queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
        message.info(
          leg ? `Đã giả lập đau ${LEGS[leg].toLowerCase()}: ngựa khập khiễng từ lần đo tới, rồi hệ thống tự dừng buổi.` : 'Đã giả lập ngựa mệt dần từ lần đo tới.'
        );
      })
      .catch((err) => message.error(err.message || 'Không giả lập được.'));
  };
  return (
    <Dropdown menu={{ items: SCENARIO_ITEMS, onClick: play }} trigger={['click']}>
      <Button size="small" icon={<ExperimentOutlined />}>
        Mô phỏng sự cố
      </Button>
    </Dropdown>
  );
}

/** The card's title row: the horse, the work, when it started. */
function CardTitle({ session, children }) {
  const kind = SESSION_KINDS[session.kind];
  const startedAt = session.actualStartAt ? dayjs(session.actualStartAt) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-1">
        <span className="font-semibold text-gray-900 text-sm break-words">{session.horse?.name}</span>
        <span className="text-xs text-gray-600 font-normal">{kind?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập'}</span>
        {startedAt && (
          <span className="text-xs text-gray-500 font-normal tabular-nums">
            bắt đầu {startedAt.format('HH:mm')}
            {dayjs().diff(startedAt, 'minute') >= 1 ? `, đã chạy ${dayjs().diff(startedAt, 'minute')} phút` : ', vừa bắt đầu'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">{children}</div>
    </div>
  );
}
const CARD_STYLES = {
  header: { whiteSpace: 'normal', height: 'auto', minHeight: 'auto', padding: '8px 12px' },
  title: { whiteSpace: 'normal', overflow: 'visible' },
};

function LiveCard({ session, readings, horse, surface }) {
  const figures = liveFigures(session, readings);
  const { target, heartRate, speed, distance, targetDistance, over } = figures;
  const data = readings.map((r, i) => ({ i, hr: r.hr, speed: r.speed }));
  // The horse runs as the sensors say: its gait and pace follow the latest speed.
  const motion = motionNow(session, figures, readings) || { clip: 'Idle_Look', label: 'Đã bắt đầu, chờ tín hiệu cảm biến' };

  return (
    <Card
      size="small"
      className="min-w-0 rounded-xl border-gray-200/80 shadow-xs overflow-hidden"
      styles={CARD_STYLES}
      title={
        <CardTitle session={session}>
          {over && (
            <Tag color="error" className="!m-0 text-xs font-medium">
              Vượt ngưỡng nhịp tim
            </Tag>
          )}
          <ScenarioButton session={session} />
        </CardTitle>
      }
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-5 min-w-0">
          <MovingHorse3D creditInFrame breed={horse?.breed} color={horse?.color} motion={motion} surface={surface} hour={hourOfSession(session)} height={236} />
        </div>
        <div className="lg:col-span-7 min-w-0">
          <Telemetry heartRate={heartRate} heartRateMax={target.heartRateMax} speed={speed} targetSpeed={target.speed} distance={distance} targetDistance={targetDistance} />
          {data.length > 1 ? (
            <div className="mt-2 h-28 w-full">
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
            </div>
          ) : (
            <p className="m-0 mt-3 text-xs text-gray-500">Biểu đồ nhịp tim hiện khi cảm biến gửi lần đo thứ hai.</p>
          )}
          <Text type="secondary" className="!text-[11px] block mt-1">
            Cảm biến mô phỏng gửi số liệu mỗi 5 giây (mỗi lần tương ứng 30 giây tập). Buổi tự kết thúc khi chạy đủ cự ly.
          </Text>
        </div>
      </div>
    </Card>
  );
}

// From this many horses at once, one row each instead of one card each: the board stays readable.
const COMPACT_FROM = 3;

/** Several horses at once: a row per horse, the ones over their heart-rate ceiling first; a row opens its card. */
function LiveBoard({ running, readings, horseOf, surfaceFor }) {
  const [openId, setOpenId] = useState(null);
  const rows = running
    .map((s) => ({ s, f: liveFigures(s, readings[s._id] || []) }))
    .sort((a, b) => Number(b.f.over) - Number(a.f.over) || b.f.distance / b.f.targetDistance - a.f.distance / a.f.targetDistance);
  const open = running.find((s) => s._id === openId);
  return (
    <Card size="small" className="mb-4 rounded-xl" title={`Đang tập: ${running.length} ngựa, cập nhật mỗi 5 giây`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-1.5 pr-3 font-medium">Ngựa</th>
              <th className="py-1.5 pr-3 font-medium">Dáng chạy</th>
              <th className="py-1.5 pr-3 font-medium text-right">Nhịp tim</th>
              <th className="py-1.5 pr-3 font-medium text-right">Tốc độ</th>
              <th className="py-1.5 pr-3 font-medium w-[28%]">Cự ly</th>
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
                <td className="py-2 pr-3 text-gray-700">{motionNow(s, f)?.label || 'Chờ cảm biến'}</td>
                <td className="py-2 pr-3 tabular-nums text-right whitespace-nowrap">
                  <span className={f.over ? 'font-bold text-rose-700' : 'font-semibold'}>{f.heartRate ?? '—'}</span>
                  <span className="text-xs text-gray-400"> / {f.target.heartRateMax} bpm</span>
                  {f.over && <Tag color="error" className="!ml-2 !text-xs">Vượt ngưỡng</Tag>}
                </td>
                <td className="py-2 pr-3 tabular-nums text-right whitespace-nowrap">
                  <span className="font-semibold">{f.speed ?? '—'}</span>
                  <span className="text-xs text-gray-400"> km/h</span>
                </td>
                <td className="py-2 pr-3">
                  <Progress className="!m-0" size="small" strokeColor={FOREST.primary} percent={Math.min(100, Math.round((f.distance / f.targetDistance) * 100))} format={() => `${f.distance}/${f.targetDistance} m`} />
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Button size="small" type="link" icon={<LineChartOutlined />}>
                    {s._id === openId ? 'Thu gọn' : 'Xem ngựa chạy'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="mt-3">
          <LiveCard session={open} readings={readings[open._id] || []} horse={horseOf(open)} surface={surfaceFor(open)} />
        </div>
      )}
    </Card>
  );
}

// A run the sensor feed stopped (a suspected injury) stays on the board this long, so the trainer sees it.
const STOPPED_SHOWN_MS = 60 * 1000;

/** A run the system stopped as a suspected injury: the horse pulls up and stands; what was done about it. */
function StoppedCard({ session, horse, surface, onClose }) {
  return (
    <Card
      size="small"
      className="min-w-0 rounded-xl overflow-hidden !border-rose-200"
      styles={CARD_STYLES}
      title={
        <CardTitle session={session}>
          <Tag color="error" className="!m-0 text-xs font-medium">
            Đã dừng: nghi chấn thương
          </Tag>
          <Button size="small" onClick={onClose}>
            Đóng
          </Button>
        </CardTitle>
      }
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-5 min-w-0">
          <MovingHorse3D creditInFrame breed={horse?.breed} color={horse?.color} motion={liveMotion(session, 0, { stopped: true })} surface={surface} hour={hourOfSession(session)} height={236} />
        </div>
        <div className="lg:col-span-7 min-w-0 flex flex-col gap-2 text-sm text-gray-800">
          <p className="m-0">Tốc độ tụt hẳn và nhịp tim vọt lên giữa buổi: hệ thống đã dừng buổi tập để bảo vệ ngựa.</p>
          <ul className="m-0 pl-5 text-gray-700">
            <li>Đã gửi yêu cầu khám gấp cho bác sĩ phụ trách.</li>
            <li>Đã giao nhân viên chăm sóc chườm lạnh và theo dõi.</li>
            <li>Chủ ngựa đã được báo.</li>
          </ul>
          <Text type="secondary" className="!text-xs">
            Buổi này không cần đánh giá. Lịch tập tiếp theo chờ kết luận của bác sĩ.
          </Text>
        </div>
      </div>
    </Card>
  );
}

/**
 * The sessions running right now, each with the horse running in 3D at its live speed, its heart rate,
 * speed and distance from the sensor feed (`sensor:reading`, sent to the horse's trainer) and a
 * heart-rate line against the session's own ceiling. Shown only while something is running (or was
 * just stopped as a suspected injury): a card per horse, or a row per horse from COMPACT_FROM at once.
 * `horses` gives each horse's breed and colour, so it runs in its own coat.
 */
export default function LiveSessionMonitor({ sessions = [], horses = [], plans = [], onSessionCompleted }) {
  const running = sessions.filter((s) => s.status === 'in_progress');
  const [readings, setReadings] = useState(() => Object.fromEntries(liveCache));
  // Runs just stopped as a suspected injury: { session, at }.
  const [stopped, setStopped] = useState([]);
  const queryClient = useQueryClient();
  const runningIds = running.map((s) => s._id).join(',');
  const horseById = new Map(horses.map((h) => [String(h._id), h]));
  const horseOf = (session) => horseById.get(String(session.horse?._id || session.horse));
  // The track the plan trains on that day: the horse runs on it.
  const planById = new Map(plans.map((p) => [String(p._id), p]));
  const surfaceFor = (session) => surfaceOf(planById.get(String(session.trainingPlan?._id || session.trainingPlan)), session.scheduledAt);
  // The sessions as last seen running: a stopped run has left the list by the time the feed says so.
  const lastSeen = useRef(new Map());
  useEffect(() => {
    for (const s of running) lastSeen.current.set(String(s._id), s);
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
        const id = String(payload.sessionId);
        liveCache.delete(id);
        // Stopped by the sensor feed (a suspected injury): shown on the board, there is nothing to evaluate.
        if (payload.aborted) {
          const session = lastSeen.current.get(id) || { _id: id, horse: { name: 'Ngựa' } };
          setStopped((prev) => [...prev.filter((x) => String(x.session._id) !== id), { session, at: Date.now() }]);
          message.warning({ content: `${session.horse?.name || 'Ngựa'}: hệ thống đã dừng buổi tập vì nghi chấn thương.`, duration: 6 });
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

  // A stopped run leaves the board after a minute, or when the trainer closes it.
  useEffect(() => {
    if (!stopped.length) return undefined;
    const next = Math.min(...stopped.map((x) => x.at)) + STOPPED_SHOWN_MS - Date.now();
    const timer = setTimeout(() => setStopped((prev) => prev.filter((x) => Date.now() - x.at < STOPPED_SHOWN_MS)), Math.max(0, next));
    return () => clearTimeout(timer);
  }, [stopped]);
  const closeStopped = (id) => setStopped((prev) => prev.filter((x) => String(x.session._id) !== String(id)));

  if (!running.length && !stopped.length) return null;
  return (
    <section aria-label="Buổi tập đang diễn ra" className="mb-4 flex flex-col gap-3">
      {stopped.map(({ session }) => (
        <StoppedCard key={session._id} session={session} horse={horseOf(session)} surface={surfaceFor(session)} onClose={() => closeStopped(session._id)} />
      ))}
      {running.length >= COMPACT_FROM ? (
        <LiveBoard running={running} readings={readings} horseOf={horseOf} surfaceFor={surfaceFor} />
      ) : (
        running.map((s) => <LiveCard key={s._id} session={s} readings={readings[s._id] || []} horse={horseOf(s)} surface={surfaceFor(s)} />)
      )}
    </section>
  );
}
