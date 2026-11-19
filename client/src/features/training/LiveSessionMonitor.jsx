import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Dropdown, Progress, Tag, Typography, theme } from 'antd';
import { CheckCircleOutlined, DownOutlined, ExperimentOutlined, EyeInvisibleOutlined, EyeOutlined, HeartFilled, PauseCircleOutlined, ThunderboltOutlined, UpOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import { message } from '../../lib/antdStatic';
import dayjs from 'dayjs';
import { getSocket } from '../../lib/socket';
import { trainingSessionApi } from './trainingApi';
import { SESSION_KINDS, OBJECTIVE_LABELS, segmentAtDistance, sessionTargets } from './trainingVocab';
import { FOREST, STATUS_TONES } from '../../layouts/forestTheme';
import MovingHorse3D from '../horses/horse3d/MovingHorse3D';
import MultiHorseTrack3D from '../horses/horse3d/MultiHorseTrack3D';
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
 * What the horse does now (horseMotion liveMotion); supports smooth finishing deceleration,
 * immediate 4-stage injury choreography (stumble -> limp -> careful halt -> guarded leg hold),
 * and trial finish-post countdown.
 */
function motionNow(session, f, readings = [], { finishing = false, stopped = false, injuryStartedAt = null, nowMs = 0 } = {}) {
  if (stopped) return liveMotion(session, 0, { stopped: true });
  if (finishing) return liveMotion(session, 0, { finishing: true });
  const injuryElapsedMs = injuryStartedAt != null ? Math.max(0, (nowMs || injuryStartedAt) - injuryStartedAt) : null;
  if (f.speed == null && session?.simScenario !== 'injury') return null;
  const [prev, last] = readings.slice(-2);
  const step = prev && last ? last.distance - prev.distance : undefined;
  return liveMotion(session, f.speed ?? 18, {
    ...(session.kind === 'trial' ? { remaining: f.targetDistance - f.distance, step } : {}),
    injuryElapsedMs,
  });
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
function ScenarioButton({ session, iconOnly = false, onSimulated }) {
  const queryClient = useQueryClient();
  const play = ({ key }) => {
    const [scenario, leg] = key.split(':');
    // Immediately kick off optimistic 3D stumble -> limp choreography without waiting 5s for polling.
    onSimulated?.(session._id, { scenario, leg: leg || 'fore_right', startedAt: Date.now() });
    trainingSessionApi
      .simulate(session._id, scenario, leg)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
        message.info(
          leg
            ? `Đã giả lập đau ${LEGS[leg].toLowerCase()}: ngựa hụt bước, khập khiễng giảm tốc rồi hệ thống tự dừng buổi.`
            : 'Đã giả lập ngựa mệt dần từ lần đo tới.',
        );
      })
      .catch((err) => {
        onSimulated?.(session._id, null);
        message.error(err.message || 'Không giả lập được.');
      });
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
function SessionControls({ session, onEnd, onAbort, onSimulated, iconOnly = false }) {
  const name = session.horse?.name || 'ngựa';
  return (
    <span className="inline-flex items-center gap-1">
      <ScenarioButton session={session} iconOnly={iconOnly} onSimulated={onSimulated} />
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
function LiveDetail({ session, readings, horse, surface, figures, motion, finishing, stopped, readOnly, onEnd, onAbort, onSimulated }) {
  const { token } = theme.useToken();
  const { target, segmentCount, segmentIndex, segmentLabel, segmentNote } = figures;
  const data = readings.map((r, i) => ({ i, hr: r.hr, speed: r.speed }));
  const shownMotion = motion || { clip: 'Idle_Look', label: 'Đã bắt đầu, chờ tín hiệu cảm biến' };
  return (
    <div className="grid grid-cols-1 gap-3 border-t px-3 pb-3 pt-3 lg:grid-cols-12" style={{ borderColor: token.colorBorderSecondary }}>
      <div className="min-w-0 lg:col-span-5">
        <MovingHorse3D breed={horse?.breed} color={horse?.color} motion={shownMotion} surface={surface} hour={hourOfSession(session)} height={210} />
      </div>
      <div className="flex min-w-0 flex-col lg:col-span-7">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: token.colorTextSecondary }}>
            <span>{shownMotion.label}</span>
            {finishing && (
              <Tag color="success" className="!m-0 text-xs">
                Đang giảm tốc hạ nhiệt
              </Tag>
            )}
            {stopped && (
              <Tag color="error" className="!m-0 text-xs">
                Đã tự dừng · Báo bác sĩ
              </Tag>
            )}
            {segmentCount > 0 && !finishing && !stopped && (
              <Tag color="gold" className="!m-0 text-xs">
                Đoạn {(segmentIndex ?? 0) + 1}/{segmentCount}: {segmentLabel}
                {segmentNote ? ` · ${segmentNote}` : ''}
              </Tag>
            )}
          </div>
          {!readOnly && !finishing && !stopped && <SessionControls session={session} onEnd={onEnd} onAbort={onAbort} onSimulated={onSimulated} />}
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
          {stopped
            ? 'Tốc độ tụt mạnh & nhịp tim vọt: hệ thống đã tự dừng, gửi yêu cầu khám gấp cho bác sĩ và giao nhân viên chăm sóc chườm lạnh.'
            : finishing
              ? 'Buổi tập đã đủ cự ly — ngựa đang giảm tốc hạ nhiệt qua các nhịp phi → kiệu → đi bộ rồi dừng nghỉ.'
              : 'Cảm biến mô phỏng gửi số liệu mỗi 5 giây (mỗi lần tương ứng 30 giây tập). Buổi tự kết thúc khi chạy đủ cự ly.'}
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
function LiveTile({ session, readings, horse, surface, figures, motion, finishing, stopped, open, onToggle, readOnly, onEnd, onAbort, onSimulated }) {
  const { token } = theme.useToken();
  const f = figures;
  const startedAt = session.actualStartAt ? dayjs(session.actualStartAt) : null;
  const minutes = startedAt ? dayjs().diff(startedAt, 'minute') : null;
  const pct = finishing ? 100 : share(f);
  const alert = Boolean(f.over || stopped || motion?.tone === 'alert');
  const border = alert ? RED : open ? token.colorPrimary : token.colorBorderSecondary;
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
        title={open ? 'Thu gọn' : 'Bấm để xem cận cảnh 3D và biểu đồ nhịp tim'}
      >
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          {/* The horse, its work, how long it has run. */}
          <div className={`flex min-w-0 items-center gap-1.5 ${readOnly || open || finishing || stopped ? 'pr-6' : 'pr-24'}`}>
            <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: alert ? RED : finishing ? '#eab308' : FOREST.primary }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: alert ? RED : finishing ? '#eab308' : FOREST.primary }} />
            </span>
            <span className="truncate text-sm font-semibold">{session.horse?.name}</span>
            <span className="truncate text-xs" style={{ color: token.colorTextSecondary }}>
              {kindLabel(session)}
              {f.segmentCount > 0 ? ` · đoạn ${(f.segmentIndex ?? 0) + 1}/${f.segmentCount}` : ''}
            </span>
            {(stopped || finishing || open) && (
              <span className="ml-auto shrink-0 text-[11px] tabular-nums" style={{ color: token.colorTextTertiary }}>
                {stopped ? 'đã dừng' : finishing ? 'hạ nhiệt' : minutes == null ? '' : minutes >= 1 ? `${minutes} phút` : 'vừa bắt đầu'}
              </span>
            )}
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
                <span className="text-base font-semibold">{stopped ? '0' : num(f.speed, 1)}</span>
                <span className="text-[11px] opacity-70"> km/h</span>
              </span>
            </div>
            <div className="min-w-[60px] flex-1">
              <Sparkline values={readings.map((r) => r.hr)} ceiling={f.target.heartRateMax} over={f.over} color={FOREST.primary} />
            </div>
          </div>
          {/* The distance done. */}
          <div className="flex items-center gap-2">
            <Progress className="!m-0 flex-1" percent={pct} size="small" showInfo={false} strokeColor={alert ? RED : FOREST.primary} aria-label={`Đã chạy ${pct}% cự ly`} />
            <span className="shrink-0 text-[11px] tabular-nums" style={{ color: token.colorTextSecondary }}>
              {num(f.distance)}/{num(f.targetDistance)} m
            </span>
          </div>
          {stopped ? (
            <span className="text-[11px] font-semibold" style={{ color: RED }}>
              Nghi chấn thương · Đang đứng bảo vệ chân đau
            </span>
          ) : finishing ? (
            <span className="text-[11px] font-semibold text-emerald-500">
              Hoàn tất cự ly · Đang giảm tốc hạ nhiệt
            </span>
          ) : motion?.tone === 'alert' ? (
            <span className="text-[11px] font-semibold" style={{ color: RED }}>
              {motion.label}
            </span>
          ) : f.over ? (
            <span className="text-[11px] font-semibold" style={{ color: RED }}>
              Vượt ngưỡng nhịp tim
            </span>
          ) : null}
        </div>
      </button>
      <span className="pointer-events-none absolute right-2.5 top-2.5 text-[10px]" style={{ color: token.colorTextTertiary }} aria-hidden="true">
        {open ? <UpOutlined /> : <DownOutlined />}
      </span>
      {/* End, stop and the demo tool, beside the tile's own button rather than inside it (open, they sit by the chart). */}
      {!readOnly && !open && !finishing && !stopped && (
        <div className="absolute right-6 top-1">
          <SessionControls session={session} onEnd={onEnd} onAbort={onAbort} onSimulated={onSimulated} iconOnly />
        </div>
      )}
      {open && (
        <LiveDetail
          session={session}
          readings={readings}
          horse={horse}
          surface={surface}
          figures={f}
          motion={motion}
          finishing={finishing}
          stopped={stopped}
          readOnly={readOnly}
          onEnd={onEnd}
          onAbort={onAbort}
          onSimulated={onSimulated}
        />
      )}
    </div>
  );
}

// A run the sensor feed stopped (a suspected injury) stays on the board this long, so the trainer sees it.
const STOPPED_SHOWN_MS = 60 * 1000;
// A normally finished run stays on the track briefly (~5.5s) to play its Gallop -> Trot -> Walk -> Idle pull-up.
const FINISHING_SHOWN_MS = 5500;
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
 * The sessions running right now, from the sensor feed (`sensor:reading`, sent to the horse's trainer):
 * - When 2+ horses run concurrently: renders ONE panoramic shared multi-lane 3D racetrack (`MultiHorseTrack3D`)
 *   showing EVERY running horse side-by-side simultaneously, above compact live telemetry tiles.
 * - Clicking any floating 3D horse pill or tile expands its close-up 3D view + full heart-rate chart.
 * - Supports graceful ~4s finish pull-up deceleration and 4-stage natural injury choreography (stumble -> limp ->
 *   careful halt -> guarded leg hold).
 */
export default function LiveSessionMonitor({ sessions = [], horses = [], plans = [], onSessionCompleted, onEnd, onAbort, readOnly = false }) {
  const { token } = theme.useToken();
  const running = sessions.filter((s) => s.status === 'in_progress');
  const [readings, setReadings] = useState(() => Object.fromEntries(liveCache));
  // Runs just stopped as a suspected injury: { session, at, readings }.
  const [stopped, setStopped] = useState([]);
  // Runs that just finished normally: kept ~5.5s for natural Gallop -> Trot -> Walk -> Idle pull-up.
  const [finishing, setFinishing] = useState([]);
  // Optimistic scenario triggers so clicking "Mô phỏng sự cố -> Chân đau" starts stumble -> limp immediately.
  const [simOverrides, setSimOverrides] = useState({});
  const [injuryTickMs, setInjuryTickMs] = useState(0);
  // The tile opened by the viewer (null: none); undefined until they choose, when a lone horse opens by itself.
  const [openId, setOpenId] = useState(undefined);
  const [folded, setFolded] = useState(readFolded);
  const [showSharedTrack, setShowSharedTrack] = useState(true);
  const queryClient = useQueryClient();
  const runningIds = running.map((s) => s._id).join(',');
  const horseById = new Map(horses.map((h) => [String(h._id), h]));
  const horseOf = (session) => horseById.get(String(session.horse?._id || session.horse));
  // The track the plan trains on that day: the horse runs on it.
  const planById = new Map(plans.map((p) => [String(p._id), p]));
  const surfaceFor = (session) => surfaceOf(planById.get(String(session.trainingPlan?._id || session.trainingPlan)), session.scheduledAt);
  // The sessions as last seen running: a stopped or finishing run has left the server list by the time socket fires.
  const lastSeen = useRef(new Map());
  const simRef = useRef(simOverrides);
  useEffect(() => {
    simRef.current = simOverrides;
  }, [simOverrides]);
  useEffect(() => {
    for (const s of running) {
      const ov = simRef.current[String(s._id)];
      lastSeen.current.set(String(s._id), ov ? { ...s, simScenario: ov.scenario, simLeg: ov.leg } : s);
    }
  }, [running]);

  const handleSimulated = (sessionId, override) => {
    const id = String(sessionId);
    setSimOverrides((prev) => {
      if (!override) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: override };
    });
    if (override?.startedAt) setInjuryTickMs(override.startedAt);
  };

  // Advance stumble -> limp phase cleanly after ~1.35s when an injury simulation starts.
  const activeStumble = Object.values(simOverrides).some((o) => o?.scenario === 'injury' && injuryTickMs - o.startedAt < 1400);
  useEffect(() => {
    if (!activeStumble) return undefined;
    const timer = setTimeout(() => setInjuryTickMs(Date.now()), 1350);
    return () => clearTimeout(timer);
  }, [activeStumble]);

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
    // A finished session plays its natural pull-up deceleration; an injury stop stays on stage protecting its leg.
    const onCompleted = (payload) => {
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      if (payload?.sessionId) {
        const id = String(payload.sessionId);
        const keptReadings = liveCache.get(id) || [];
        liveCache.delete(id);
        const ov = simRef.current[id];
        const base = lastSeen.current.get(id) || { _id: id, horse: { name: 'Ngựa' } };
        const session = ov ? { ...base, simScenario: ov.scenario, simLeg: ov.leg } : base;
        if (payload.aborted) {
          setStopped((prev) => [...prev.filter((x) => String(x.session._id) !== id), { session, readings: keptReadings, at: Date.now() }]);
          message.warning({ content: `${session.horse?.name || 'Ngựa'}: hệ thống đã dừng buổi tập vì nghi chấn thương.`, duration: 6 });
        } else {
          setFinishing((prev) => [...prev.filter((x) => String(x.session._id) !== id), { session, readings: keptReadings, at: Date.now() }]);
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

  // Auto-expire stopped injury cards after 60s, and finishing cool-down horses after 5.5s.
  useEffect(() => {
    if (!stopped.length) return undefined;
    const next = Math.min(...stopped.map((x) => x.at)) + STOPPED_SHOWN_MS - Date.now();
    const timer = setTimeout(() => setStopped((prev) => prev.filter((x) => Date.now() - x.at < STOPPED_SHOWN_MS)), Math.max(0, next));
    return () => clearTimeout(timer);
  }, [stopped]);
  useEffect(() => {
    if (!finishing.length) return undefined;
    const next = Math.min(...finishing.map((x) => x.at)) + FINISHING_SHOWN_MS - Date.now();
    const timer = setTimeout(() => setFinishing((prev) => prev.filter((x) => Date.now() - x.at < FINISHING_SHOWN_MS)), Math.max(0, next));
    return () => clearTimeout(timer);
  }, [finishing]);
  const closeStopped = (id) => setStopped((prev) => prev.filter((x) => String(x.session._id) !== String(id)));

  // Combine currently running + gracefully finishing + recently injury-stopped sessions onto one continuous stage
  // so a horse never abruptly disappears or teleports onto a brand-new static canvas mid-stop.
  const runningIdSet = new Set(running.map((s) => String(s._id)));
  const activeEntries = [
    ...running.map((s) => {
      const ov = simOverrides[String(s._id)];
      const session = ov ? { ...s, simScenario: ov.scenario, simLeg: ov.leg } : s;
      return { session, readings: readings[s._id] || [], finishing: false, stopped: false, injuryStartedAt: ov?.scenario === 'injury' ? ov.startedAt : null };
    }),
    ...finishing
      .filter((x) => !runningIdSet.has(String(x.session._id)))
      .map((x) => ({ session: x.session, readings: x.readings || [], finishing: true, stopped: false, injuryStartedAt: null })),
    ...stopped
      .filter((x) => !runningIdSet.has(String(x.session._id)))
      .map((x) => ({ session: x.session, readings: x.readings || [], finishing: false, stopped: true, injuryStartedAt: null })),
  ];

  if (!activeEntries.length) return null;

  const enriched = activeEntries
    .map((entry) => {
      const f = liveFigures(entry.session, entry.readings);
      const motion = motionNow(entry.session, f, entry.readings, {
        finishing: entry.finishing,
        stopped: entry.stopped,
        injuryStartedAt: entry.injuryStartedAt,
        nowMs: injuryTickMs,
      });
      return { ...entry, figures: f, motion, horse: horseOf(entry.session), surface: surfaceFor(entry.session) };
    })
    .sort(
      (a, b) =>
        Number(b.stopped || b.figures.over || b.motion?.tone === 'alert') - Number(a.stopped || a.figures.over || a.motion?.tone === 'alert') ||
        String(a.session.horse?.name || '').localeCompare(String(b.session.horse?.name || ''), 'vi'),
    );

  const overCount = enriched.filter((e) => !e.stopped && e.figures.over).length;
  const multi = enriched.length >= 2;
  const openNow = openId === undefined ? (enriched.length === 1 ? enriched[0].session._id : null) : openId;
  const sharedSurface = enriched[0]?.surface || 'dirt';
  const sharedHour = hourOfSession(enriched[0]?.session);
  const trackItems = enriched.map((e) => ({
    id: String(e.session._id),
    name: e.session.horse?.name || 'Ngựa',
    horse: e.horse,
    motion: e.motion || { clip: 'Idle_Look', kmh: 0 },
    pct: e.finishing ? 100 : share(e.figures),
    heartRate: e.figures.heartRate,
    speed: e.stopped ? 0 : e.figures.speed,
    over: e.figures.over,
    finishing: e.finishing,
    stopped: e.stopped,
  }));

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
    setOpenId((prev) => (String(prev) === String(id) ? null : id));
  };

  return (
    <section aria-label="Buổi tập đang diễn ra" className="mb-4 flex flex-col gap-2">
      {/* A run the system stopped as a suspected injury: clear summary alert with dismiss button. */}
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

      <Card
        size="small"
        className="rounded-xl"
        styles={{ header: { minHeight: 'auto', padding: '8px 12px' }, body: { padding: folded ? 0 : 10 } }}
        title={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="relative inline-flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: overCount > 0 || stopped.length > 0 ? RED : FOREST.primary }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: overCount > 0 || stopped.length > 0 ? RED : FOREST.primary }} />
            </span>
            <span className="text-sm font-semibold">
              {running.length > 0 ? `Đang tập · ${running.length} ngựa` : finishing.length > 0 ? 'Đang giảm tốc kết thúc buổi tập' : 'Đã dừng nghi chấn thương'}
            </span>
            {overCount > 0 && (
              <Tag color="error" className="!m-0 text-xs">
                {overCount} vượt ngưỡng nhịp tim
              </Tag>
            )}
            {!folded && (
              <span className="text-xs font-normal" style={{ color: token.colorTextTertiary }}>
                {multi ? 'cập nhật mỗi 5 giây · bấm tên ngựa để mở biểu đồ chi tiết' : 'cập nhật mỗi 5 giây'}
              </span>
            )}
            {/* Folded: each horse in a word, its heart rate coloured; pressing one opens it. */}
            {folded && (
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {enriched.map((e) => (
                  <button
                    key={e.session._id}
                    type="button"
                    onClick={() => openTile(e.session._id)}
                    className="cursor-pointer rounded-full border px-2 py-0.5 text-xs tabular-nums"
                    style={{ borderColor: e.figures.over || e.stopped ? RED : token.colorBorderSecondary, color: e.figures.over || e.stopped ? RED : token.colorText, background: 'transparent' }}
                  >
                    {e.session.horse?.name} · {num(e.figures.heartRate)} bpm · {e.finishing ? 100 : share(e.figures)}%
                  </button>
                ))}
              </span>
            )}
          </div>
        }
        extra={
          <div className="flex items-center gap-1">
            {multi && !folded && (
              <Button
                size="small"
                type="text"
                icon={showSharedTrack ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={() => setShowSharedTrack((v) => !v)}
              >
                {showSharedTrack ? 'Ẩn sân 3D' : 'Sân 3D chung'}
              </Button>
            )}
            <Button size="small" type="text" icon={folded ? <DownOutlined /> : <UpOutlined />} onClick={toggleFold}>
              {folded ? 'Mở' : 'Thu gọn'}
            </Button>
          </div>
        }
      >
        {!folded && (
          <div className="flex flex-col gap-2.5">
            {multi && showSharedTrack && (
              <MultiHorseTrack3D
                items={trackItems}
                surface={sharedSurface}
                hour={sharedHour}
                height={235}
                selectedId={openNow}
                onSelect={(id) => openTile(id)}
              />
            )}
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gridAutoFlow: 'dense' }}>
              {enriched.map((e) => (
                <LiveTile
                  key={e.session._id}
                  session={e.session}
                  readings={e.readings}
                  horse={e.horse}
                  surface={e.surface}
                  figures={e.figures}
                  motion={e.motion}
                  finishing={e.finishing}
                  stopped={e.stopped}
                  open={openNow === e.session._id}
                  onToggle={() => setOpenId(openNow === e.session._id ? null : e.session._id)}
                  readOnly={readOnly}
                  onEnd={onEnd}
                  onAbort={onAbort}
                  onSimulated={handleSimulated}
                />
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
