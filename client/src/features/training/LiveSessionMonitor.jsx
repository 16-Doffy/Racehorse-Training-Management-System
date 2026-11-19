import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Dropdown, Progress, Tag, Typography, theme } from 'antd';
import { CheckCircleOutlined, DownOutlined, ExperimentOutlined, HeartFilled, PauseCircleOutlined, ThunderboltOutlined, UpOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import { message } from '../../lib/antdStatic';
import dayjs from 'dayjs';
import { getSocket } from '../../lib/socket';
import { trainingSessionApi } from './trainingApi';
import { SESSION_KINDS, OBJECTIVE_LABELS, segmentAtDistance, sessionTargets } from './trainingVocab';
import { FOREST, STATUS_TONES } from '../../layouts/forestTheme';
import MovingHorse3D from '../horses/horse3d/MovingHorse3D';
import { hourOf, liveMotion, surfaceOf } from '../horses/horse3d/horseMotion';

const { Text } = Typography;

// Readings kept per session for the chart: 40 ticks of 5 s, a little over three minutes on screen.
const KEEP = 40;
// Readings outlive this screen while the browser tab is open: going to another page and back
// keeps the chart instead of starting it again (the server also hands back its last readings).
const liveCache = new Map();
const toPoint = (r) => ({
  hr: r.hr ?? r.heartRate,
  speed: r.speed,
  distance: r.distance,
  targetDistance: r.targetDistance,
  segmentIndex: r.segmentIndex,
  segmentCount: r.segmentCount,
  segmentKind: r.segmentKind,
  segmentLabel: r.segmentLabel,
  segmentNote: r.segmentNote,
});
const GRID = '#E4DFD3';
const AXIS = '#8A8578';
const RED = STATUS_TONES.bad.color;
const num = (n, digits = 0) => (n == null ? '—' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: digits }));

/** What a running session shows now: the latest reading, else the last one the server kept. */
function liveFigures(session, readings) {
  const baseTarget = sessionTargets(session);
  const last = readings[readings.length - 1];
  const heartRate = last?.hr ?? session.metrics?.lastHeartRate;
  const speed = last?.speed ?? session.metrics?.lastSpeed;
  const distance = last?.distance ?? session.metrics?.distance ?? 0;
  const targetDistance = last?.targetDistance ?? baseTarget.distance;
  const segTarget = segmentAtDistance(session, distance);
  const target = segTarget
    ? { heartRateMax: segTarget.heartRateMax, speed: segTarget.speed, distance: targetDistance }
    : baseTarget;
  return {
    target,
    heartRate,
    speed,
    distance,
    targetDistance,
    over: heartRate != null && heartRate > target.heartRateMax,
    segmentIndex: last?.segmentIndex ?? segTarget?.segmentIndex,
    segmentCount: last?.segmentCount ?? segTarget?.segmentCount,
    segmentLabel: last?.segmentLabel ?? segTarget?.segmentLabel,
    segmentNote: last?.segmentNote ?? segTarget?.segmentNote,
  };
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
const kindLabel = (session) => SESSION_KINDS[session.kind]?.label || OBJECTIVE_LABELS[session.objective] || 'Buổi tập';
const share = (f) => (f.targetDistance ? Math.min(100, Math.round((f.distance / f.targetDistance) * 100)) : 0);

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
function ScenarioButton({ session, iconOnly = false }) {
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
      <Button size="small" type={iconOnly ? 'text' : 'default'} icon={<ExperimentOutlined />} title="Mô phỏng sự cố" aria-label={`Mô phỏng sự cố cho ${session.horse?.name || 'ngựa'}`}>
        {iconOnly ? null : 'Mô phỏng sự cố'}
      </Button>
    </Dropdown>
  );
}

/**
 * The trainer's hands on a running session: end it (the end-of-session form), stop it (with a reason), and
 * the demo's scenario button. `iconOnly`: the small tile's corner; open, the buttons carry their words.
 */
function SessionControls({ session, onEnd, onAbort, iconOnly = false }) {
  const name = session.horse?.name || 'ngựa';
  return (
    <span className="inline-flex items-center gap-1">
      <ScenarioButton session={session} iconOnly={iconOnly} />
      {onEnd && (
        <Button size="small" type={iconOnly ? 'text' : 'primary'} icon={<CheckCircleOutlined />} onClick={() => onEnd(session)} title="Kết thúc buổi" aria-label={`Kết thúc buổi của ${name}`}>
          {iconOnly ? null : 'Kết thúc'}
        </Button>
      )}
      {onAbort && (
        <Button size="small" type={iconOnly ? 'text' : 'default'} danger icon={<PauseCircleOutlined />} onClick={() => onAbort(session)} title="Dừng buổi" aria-label={`Dừng buổi của ${name}`}>
          {iconOnly ? null : 'Dừng'}
        </Button>
      )}
    </span>
  );
}

/** The heart rate of the last minutes as a thin line, against the ceiling (dashed): the trend at a glance. */
function Sparkline({ values, ceiling, over, color }) {
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return <span className="text-[11px] opacity-60">chờ số liệu…</span>;
  const W = 100;
  const H = 26;
  const lo = Math.min(...pts, ceiling) - 6;
  const hi = Math.max(...pts, ceiling) + 6;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="block w-full" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={W} y1={y(ceiling)} y2={y(ceiling)} stroke={RED} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.7" />
      <path d={d} fill="none" stroke={over ? RED : color} strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The open tile: the horse running in 3D at its live speed, and its heart-rate line against the ceiling. */
function LiveDetail({ session, readings, horse, surface, figures, readOnly, onEnd, onAbort }) {
  const { token } = theme.useToken();
  const { target, segmentCount, segmentIndex, segmentLabel, segmentNote } = figures;
  const data = readings.map((r, i) => ({ i, hr: r.hr, speed: r.speed }));
  // The horse runs as the sensors say: its gait and pace follow the latest speed.
  const motion = motionNow(session, figures, readings) || { clip: 'Idle_Look', label: 'Đã bắt đầu, chờ tín hiệu cảm biến' };
  return (
    <div className="grid grid-cols-1 gap-3 border-t px-3 pb-3 pt-3 lg:grid-cols-12" style={{ borderColor: token.colorBorderSecondary }}>
      <div className="min-w-0 lg:col-span-5">
        <MovingHorse3D breed={horse?.breed} color={horse?.color} motion={motion} surface={surface} hour={hourOfSession(session)} height={210} />
      </div>
      <div className="flex min-w-0 flex-col lg:col-span-7">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: token.colorTextSecondary }}>
            <span>{motion.label}</span>
            {segmentCount > 0 && (
              <Tag color="gold" className="!m-0 text-xs">
                Đoạn {(segmentIndex ?? 0) + 1}/{segmentCount}: {segmentLabel}
                {segmentNote ? ` · ${segmentNote}` : ''}
              </Tag>
            )}
          </div>
          {!readOnly && <SessionControls session={session} onEnd={onEnd} onAbort={onAbort} />}
        </div>
        {data.length > 1 ? (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={token.colorBorderSecondary || GRID} vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis
                  domain={[60, Math.max(target.heartRateMax + 20, ...data.map((d) => d.hr + 5))]}
                  tick={{ fontSize: 11, fill: token.colorTextTertiary || AXIS }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip formatter={(v, name) => [name === 'hr' ? `${v} bpm` : `${v} km/h`, name === 'hr' ? 'Nhịp tim' : 'Tốc độ']} labelFormatter={() => ''} />
                <ReferenceLine y={target.heartRateMax} stroke={RED} strokeDasharray="4 4" label={{ value: `ngưỡng ${target.heartRateMax}`, position: 'insideTopRight', fontSize: 11, fill: RED }} />
                <Line type="monotone" dataKey="hr" stroke={FOREST.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="m-0 mt-3 text-xs" style={{ color: token.colorTextTertiary }}>
            Biểu đồ nhịp tim hiện khi cảm biến gửi lần đo thứ hai.
          </p>
        )}
        <Text type="secondary" className="!text-[11px] mt-auto block pt-1">
          Cảm biến mô phỏng gửi số liệu mỗi 5 giây (mỗi lần tương ứng 30 giây tập). Buổi tự kết thúc khi chạy đủ cự ly.
        </Text>
      </div>
    </div>
  );
}

/**
 * One running horse as a small tile: the horse and its work, heart rate against the ceiling (red above it),
 * speed against the target, the distance done and a line of the heart rate. Pressed, it opens across the
 * whole row with the 3D horse and the full chart.
 */
function LiveTile({ session, readings, horse, surface, open, onToggle, readOnly, onEnd, onAbort }) {
  const { token } = theme.useToken();
  const f = liveFigures(session, readings);
  const startedAt = session.actualStartAt ? dayjs(session.actualStartAt) : null;
  const minutes = startedAt ? dayjs().diff(startedAt, 'minute') : null;
  const pct = share(f);
  const border = f.over ? RED : open ? token.colorPrimary : token.colorBorderSecondary;
  return (
    <div
      className="relative min-w-0 overflow-hidden rounded-xl border transition-shadow"
      style={{ gridColumn: open ? '1 / -1' : undefined, borderColor: border, background: token.colorBgContainer, boxShadow: open ? token.boxShadowTertiary : undefined }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
        style={{ color: token.colorText }}
        title={open ? 'Thu gọn' : 'Bấm để xem ngựa chạy 3D và biểu đồ'}
      >
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          {/* The horse, its work, how long it has run. */}
          <div className={`flex min-w-0 items-center gap-2 ${readOnly || open ? 'pr-6' : 'pr-28'}`}>
            <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: f.over ? RED : FOREST.primary }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: f.over ? RED : FOREST.primary }} />
            </span>
            <span className="truncate text-sm font-semibold">{session.horse?.name}</span>
            <span className="truncate text-xs" style={{ color: token.colorTextSecondary }}>
              {kindLabel(session)}
              {f.segmentCount > 0 ? ` · đoạn ${(f.segmentIndex ?? 0) + 1}/${f.segmentCount}` : ''}
            </span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums" style={{ color: token.colorTextTertiary }}>
              {minutes == null ? '' : minutes >= 1 ? `${minutes} phút` : 'vừa bắt đầu'}
            </span>
          </div>
          {/* Heart rate and speed, with the heart-rate line beside them. */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-baseline gap-3 tabular-nums">
              <span className="whitespace-nowrap" style={{ color: f.over ? RED : token.colorText }} title={`Nhịp tim · ngưỡng ${f.target.heartRateMax} bpm`}>
                <HeartFilled className="mr-1 text-xs" style={{ color: f.over ? RED : token.colorTextTertiary }} />
                <span className="text-base font-semibold">{num(f.heartRate)}</span>
                <span className="text-[11px] opacity-70">/{f.target.heartRateMax}</span>
              </span>
              <span className="whitespace-nowrap" title={f.target.speed ? `Tốc độ · mục tiêu ${num(f.target.speed, 1)} km/h` : 'Tốc độ'}>
                <ThunderboltOutlined className="mr-1 text-xs" style={{ color: token.colorTextTertiary }} />
                <span className="text-base font-semibold">{num(f.speed, 1)}</span>
                <span className="text-[11px] opacity-70"> km/h</span>
              </span>
            </div>
            <div className="min-w-[60px] flex-1">
              <Sparkline values={readings.map((r) => r.hr)} ceiling={f.target.heartRateMax} over={f.over} color={FOREST.primary} />
            </div>
          </div>
          {/* The distance done. */}
          <div className="flex items-center gap-2">
            <Progress className="!m-0 flex-1" percent={pct} size="small" showInfo={false} strokeColor={FOREST.primary} aria-label={`Đã chạy ${pct}% cự ly`} />
            <span className="shrink-0 text-[11px] tabular-nums" style={{ color: token.colorTextSecondary }}>
              {num(f.distance)}/{num(f.targetDistance)} m
            </span>
          </div>
          {f.over && (
            <span className="text-[11px] font-semibold" style={{ color: RED }}>
              Vượt ngưỡng nhịp tim
            </span>
          )}
        </div>
      </button>
      <span className="pointer-events-none absolute right-2.5 top-2.5 text-[10px]" style={{ color: token.colorTextTertiary }} aria-hidden="true">
        {open ? <UpOutlined /> : <DownOutlined />}
      </span>
      {/* End, stop and the demo tool, beside the tile's own button rather than inside it (open, they sit by the chart). */}
      {!readOnly && !open && (
        <div className="absolute right-6 top-1">
          <SessionControls session={session} onEnd={onEnd} onAbort={onAbort} iconOnly />
        </div>
      )}
      {open && <LiveDetail session={session} readings={readings} horse={horse} surface={surface} figures={f} readOnly={readOnly} onEnd={onEnd} onAbort={onAbort} />}
    </div>
  );
}

// A run the sensor feed stopped (a suspected injury) stays on the board this long, so the trainer sees it.
const STOPPED_SHOWN_MS = 60 * 1000;
// Whether the board is folded to its one line: the viewer's own choice, kept in this browser.
const FOLD_KEY = 'liveBoard.folded';
const readFolded = () => {
  try {
    return window.localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * The sessions running right now, from the sensor feed (`sensor:reading`, sent to the horse's trainer): one
 * small tile per horse — heart rate against the session's own ceiling, speed, distance and a line of the
 * heart rate — so ten or twenty horses at once still fit in a few rows. A tile opens across the row with
 * the horse running in 3D and the full chart (one at a time; a lone horse opens by itself). The board folds
 * to one line. Shown only while something is running (or was just stopped as a suspected injury).
 * `horses` gives each horse's breed and colour, so it runs in its own coat. `onEnd` / `onAbort`: the trainer
 * ends or stops a run from its tile. `readOnly`: watched by the owner, without the trainer's tools.
 */
export default function LiveSessionMonitor({ sessions = [], horses = [], plans = [], onSessionCompleted, onEnd, onAbort, readOnly = false }) {
  const { token } = theme.useToken();
  const running = sessions.filter((s) => s.status === 'in_progress');
  const [readings, setReadings] = useState(() => Object.fromEntries(liveCache));
  // Runs just stopped as a suspected injury: { session, at }.
  const [stopped, setStopped] = useState([]);
  // The tile opened by the viewer (null: none); undefined until they choose, when a lone horse opens by itself.
  const [openId, setOpenId] = useState(undefined);
  const [folded, setFolded] = useState(readFolded);
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

  const figures = new Map(running.map((s) => [s._id, liveFigures(s, readings[s._id] || [])]));
  // Horses over their ceiling first; otherwise a steady order (by name), so tiles do not jump at every reading.
  const tiles = [...running].sort((a, b) => Number(figures.get(b._id).over) - Number(figures.get(a._id).over) || String(a.horse?.name || '').localeCompare(String(b.horse?.name || ''), 'vi'));
  const overCount = tiles.filter((s) => figures.get(s._id).over).length;
  const openNow = openId === undefined ? (running.length === 1 ? running[0]._id : null) : openId;
  const toggleFold = () => {
    setFolded((v) => {
      try {
        window.localStorage.setItem(FOLD_KEY, v ? '0' : '1');
      } catch {
        /* the choice is only a convenience */
      }
      return !v;
    });
  };
  const openTile = (id) => {
    setFolded(false);
    setOpenId(id);
  };

  return (
    <section aria-label="Buổi tập đang diễn ra" className="mb-4 flex flex-col gap-2">
      {/* A run the system stopped as a suspected injury: one line each, with what was done about it. */}
      {stopped.map(({ session }) => (
        <Alert
          key={session._id}
          type="error"
          showIcon
          closable
          onClose={() => closeStopped(session._id)}
          title={`${session.horse?.name || 'Ngựa'} · ${kindLabel(session)}: hệ thống đã dừng buổi vì nghi chấn thương`}
          description={
            <span className="text-xs">
              Tốc độ tụt hẳn và nhịp tim vọt lên giữa buổi. Đã gửi yêu cầu khám gấp cho bác sĩ, giao nhân viên chăm sóc chườm lạnh và theo dõi, báo chủ ngựa. Buổi này không cần đánh giá.
            </span>
          }
        />
      ))}

      {running.length > 0 && (
        <Card
          size="small"
          className="rounded-xl"
          styles={{ header: { minHeight: 'auto', padding: '8px 12px' }, body: { padding: folded ? 0 : 10 } }}
          title={
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="relative inline-flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: FOREST.primary }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: FOREST.primary }} />
              </span>
              <span className="text-sm font-semibold">Đang tập · {running.length} ngựa</span>
              {overCount > 0 && (
                <Tag color="error" className="!m-0 text-xs">
                  {overCount} vượt ngưỡng nhịp tim
                </Tag>
              )}
              {!folded && (
                <span className="text-xs font-normal" style={{ color: token.colorTextTertiary }}>
                  cập nhật mỗi 5 giây · bấm một ngựa để xem chạy 3D
                </span>
              )}
              {/* Folded: each horse in a word, its heart rate coloured; pressing one opens it. */}
              {folded && (
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {tiles.map((s) => {
                    const f = figures.get(s._id);
                    return (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => openTile(s._id)}
                        className="cursor-pointer rounded-full border px-2 py-0.5 text-xs tabular-nums"
                        style={{ borderColor: f.over ? RED : token.colorBorderSecondary, color: f.over ? RED : token.colorText, background: 'transparent' }}
                      >
                        {s.horse?.name} · {num(f.heartRate)} bpm · {share(f)}%
                      </button>
                    );
                  })}
                </span>
              )}
            </div>
          }
          extra={
            <Button size="small" type="text" icon={folded ? <DownOutlined /> : <UpOutlined />} onClick={toggleFold}>
              {folded ? 'Mở' : 'Thu gọn'}
            </Button>
          }
        >
          {!folded && (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gridAutoFlow: 'dense' }}>
              {tiles.map((s) => (
                <LiveTile
                  key={s._id}
                  session={s}
                  readings={readings[s._id] || []}
                  horse={horseOf(s)}
                  surface={surfaceFor(s)}
                  open={openNow === s._id}
                  onToggle={() => setOpenId(openNow === s._id ? null : s._id)}
                  readOnly={readOnly}
                  onEnd={onEnd}
                  onAbort={onAbort}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
