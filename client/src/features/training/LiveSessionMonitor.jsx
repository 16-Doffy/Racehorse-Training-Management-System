import { useEffect, useRef, useState } from 'react';
import { Button, Card, Dropdown, Progress, Segmented, Tag, Typography, theme } from 'antd';
import {
  AimOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
  EyeOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import { message } from '../../lib/antdStatic';
import dayjs from 'dayjs';
import { getSocket } from '../../lib/socket';
import { trainingSessionApi } from './trainingApi';
import { SESSION_KINDS, OBJECTIVE_LABELS, segmentAtDistance, sessionTargets } from './trainingVocab';
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

function HeartRateChart({ readings, target, gridColor, axisColor, heightClass = 'h-24' }) {
  const data = readings.map((r, i) => ({ i, hr: r.hr, speed: r.speed }));
  if (data.length <= 1) {
    return <p className="m-0 mt-2 text-xs text-gray-500">Biểu đồ nhịp tim hiện khi cảm biến gửi lần đo thứ hai.</p>;
  }
  return (
    <div className={`mt-2 ${heightClass} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={gridColor} vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis
            domain={[60, Math.max(target.heartRateMax + 20, ...data.map((d) => d.hr + 5))]}
            tick={{ fontSize: 11, fill: axisColor }}
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
  );
}

function SessionQuickControls({ session, readOnly, onEnd, onAbort }) {
  if (readOnly) return null;
  return (
    <>
      <ScenarioButton session={session} />
      {onEnd && (
        <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => onEnd(session)}>
          Kết thúc
        </Button>
      )}
      {onAbort && (
        <Button size="small" danger icon={<PauseCircleOutlined />} onClick={() => onAbort(session)}>
          Dừng
        </Button>
      )}
    </>
  );
}

function LiveCard({ session, readings, horse, surface, readOnly = false, onEnd, onAbort }) {
  const { token } = theme.useToken();
  const gridColor = token.colorBorderSecondary || GRID;
  const axisColor = token.colorTextTertiary || AXIS;
  const figures = liveFigures(session, readings);
  const { target, heartRate, speed, distance, targetDistance, over, segmentIndex, segmentCount, segmentLabel, segmentNote } = figures;
  // The horse runs as the sensors say: its gait and pace follow the latest speed.
  const motion = motionNow(session, figures, readings) || { clip: 'Idle_Look', label: 'Đã bắt đầu, chờ tín hiệu cảm biến' };

  return (
    <Card
      size="small"
      className="min-w-0 rounded-xl border-gray-200/80 shadow-xs overflow-hidden"
      styles={CARD_STYLES}
      title={
        <CardTitle session={session}>
          {segmentCount > 0 && (
            <Tag color="gold" className="!m-0 text-xs font-medium">
              Đoạn {(segmentIndex ?? 0) + 1}/{segmentCount}: {segmentLabel}
              {segmentNote ? ` · ${segmentNote}` : ''}
            </Tag>
          )}
          {over && (
            <Tag color="error" className="!m-0 text-xs font-medium">
              Vượt ngưỡng nhịp tim
            </Tag>
          )}
          <SessionQuickControls session={session} readOnly={readOnly} onEnd={onEnd} onAbort={onAbort} />
        </CardTitle>
      }
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-5 min-w-0">
          <MovingHorse3D breed={horse?.breed} color={horse?.color} motion={motion} surface={surface} hour={hourOfSession(session)} height={204} />
        </div>
        <div className="lg:col-span-7 min-w-0">
          <Telemetry heartRate={heartRate} heartRateMax={target.heartRateMax} speed={speed} targetSpeed={target.speed} distance={distance} targetDistance={targetDistance} />
          <HeartRateChart readings={readings} target={target} gridColor={gridColor} axisColor={axisColor} heightClass="h-24" />
          <Text type="secondary" className="!text-[11px] block mt-1">
            Cảm biến mô phỏng gửi số liệu mỗi 5 giây (mỗi lần tương ứng 30 giây tập). Buổi tự kết thúc khi chạy đủ cự ly.
          </Text>
        </div>
      </div>
    </Card>
  );
}

// From 2 horses at once, show a single compact multi-horse control deck instead of stacked 3D cards.
const COMPACT_FROM = 2;
const fmtNum = (n, digits = 0) => (n == null ? '—' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: digits }));

/**
 * Compact multi-horse live deck (2+ concurrent horses in the same time slot):
 * - "Tiêu điểm" (default): left roster lists every concurrent horse at once; right stage mounts one smooth 3D + HR chart for the selected horse.
 * - "Lưới tất cả": 2–3 column telemetry grid so every concurrent horse stays visible side by side with zero vertical bloat.
 */
function MultiLiveDeck({ running, readings, horseOf, surfaceFor, readOnly = false, onEnd, onAbort }) {
  const { token } = theme.useToken();
  const gridColor = token.colorBorderSecondary || GRID;
  const axisColor = token.colorTextTertiary || AXIS;
  const [mode, setMode] = useState('focus');
  const [selectedId, setSelectedId] = useState(null);

  const rows = running
    .map((s) => {
      const list = readings[s._id] || [];
      const f = liveFigures(s, list);
      const pct = f.targetDistance ? Math.min(100, Math.round((f.distance / f.targetDistance) * 100)) : 0;
      const motion = motionNow(s, f, list) || { clip: 'Idle_Look', label: 'Chờ cảm biến' };
      return { s, list, f, pct, motion };
    })
    .sort((a, b) => Number(b.f.over) - Number(a.f.over) || b.pct - a.pct);

  const overCount = rows.filter((r) => r.f.over).length;
  const active = rows.find((r) => r.s._id === selectedId) || rows[0];
  const activeHorse = active ? horseOf(active.s) : null;

  return (
    <Card
      size="small"
      className="min-w-0 rounded-xl border-gray-200/80 shadow-xs overflow-hidden"
      styles={CARD_STYLES}
      title={
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="font-semibold text-sm text-[var(--st-ink,#0F172A)]">
              Đang tập cùng khung giờ: {running.length} ngựa
            </span>
            {overCount > 0 && (
              <Tag color="error" className="!m-0 text-xs font-medium">
                {overCount} vượt ngưỡng nhịp tim
              </Tag>
            )}
            <span className="hidden sm:inline text-xs font-normal text-[var(--st-ink-muted,#64748B)]">
              Cập nhật mỗi 5 giây
            </span>
          </div>
          <Segmented
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'focus', label: 'Tiêu điểm', icon: <AimOutlined /> },
              { value: 'grid', label: 'Lưới tất cả', icon: <AppstoreOutlined /> },
            ]}
          />
        </div>
      }
    >
      {mode === 'focus' && active ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 items-start">
          {/* Left roster: every horse running in this time slot visible in one compact column */}
          <div
            role="listbox"
            aria-label="Danh sách ngựa đang tập cùng khung giờ"
            className="lg:col-span-5 min-w-0 max-h-[296px] overflow-y-auto rounded-lg border border-[var(--st-border,#E5E7EB)] divide-y divide-[var(--st-border,#F1F5F9)]"
          >
            {rows.map(({ s, f, pct }) => {
              const isSelected = s._id === active.s._id;
              const kindLabel = SESSION_KINDS[s.kind]?.short || SESSION_KINDS[s.kind]?.label || OBJECTIVE_LABELS[s.objective] || 'Buổi tập';
              return (
                <button
                  key={s._id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setSelectedId(s._id)}
                  className={`w-full cursor-pointer border-0 border-l-[3px] px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'border-l-[var(--st-action,#EAB308)] bg-[var(--st-primary-soft,rgba(234,179,8,0.12))]'
                      : 'border-l-transparent bg-transparent hover:bg-[var(--st-hover,#F8FAFC)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-[var(--st-ink,#0F172A)]">{s.horse?.name}</span>
                      <span className="shrink-0 text-[11px] text-[var(--st-ink-muted,#64748B)]">{kindLabel}</span>
                    </div>
                    <span className={`shrink-0 text-xs tabular-nums ${f.over ? 'font-bold text-rose-600' : 'font-semibold text-[var(--st-ink,#0F172A)]'}`}>
                      {f.heartRate ?? '—'}
                      <span className="font-normal text-[var(--st-ink-muted,#64748B)]">/{f.target.heartRateMax} bpm</span>
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] tabular-nums text-[var(--st-ink-muted,#64748B)]">
                    <span className="shrink-0">{fmtNum(f.speed, 1)} km/h</span>
                    <div className="flex-1 min-w-[48px]">
                      <Progress
                        className="!m-0"
                        size="small"
                        showInfo={false}
                        strokeColor={f.over ? STATUS_TONES.bad.color : FOREST.primary}
                        percent={pct}
                      />
                    </div>
                    <span className="shrink-0">
                      {fmtNum(f.distance)}/{fmtNum(f.targetDistance)} m
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right focused stage: single WebGL 3D view + telemetry + HR chart for selected horse */}
          <div className="lg:col-span-7 min-w-0 rounded-lg border border-[var(--st-border,#E5E7EB)] p-2.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                <span className="text-sm font-semibold text-[var(--st-ink,#0F172A)]">{active.s.horse?.name}</span>
                <span className="text-xs text-[var(--st-ink-muted,#64748B)]">
                  {SESSION_KINDS[active.s.kind]?.label || OBJECTIVE_LABELS[active.s.objective] || 'Buổi tập'}
                </span>
                {active.f.segmentCount > 0 && (
                  <Tag color="gold" className="!m-0 text-[11px]">
                    Đoạn {(active.f.segmentIndex ?? 0) + 1}/{active.f.segmentCount}: {active.f.segmentLabel}
                  </Tag>
                )}
                {active.f.over && (
                  <Tag color="error" className="!m-0 text-[11px]">
                    Vượt ngưỡng nhịp tim
                  </Tag>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <SessionQuickControls session={active.s} readOnly={readOnly} onEnd={onEnd} onAbort={onAbort} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
              <div className="sm:col-span-5 min-w-0">
                <MovingHorse3D
                  breed={activeHorse?.breed}
                  color={activeHorse?.color}
                  motion={active.motion}
                  surface={surfaceFor(active.s)}
                  hour={hourOfSession(active.s)}
                  height={186}
                />
              </div>
              <div className="sm:col-span-7 min-w-0">
                <Telemetry
                  heartRate={active.f.heartRate}
                  heartRateMax={active.f.target.heartRateMax}
                  speed={active.f.speed}
                  targetSpeed={active.f.target.speed}
                  distance={active.f.distance}
                  targetDistance={active.f.targetDistance}
                />
                <HeartRateChart readings={active.list} target={active.f.target} gridColor={gridColor} axisColor={axisColor} heightClass="h-[88px]" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Grid mode: every horse side-by-side without heavy multiple 3D canvases */
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ s, f, pct, motion }) => {
            const kindLabel = SESSION_KINDS[s.kind]?.short || SESSION_KINDS[s.kind]?.label || OBJECTIVE_LABELS[s.objective] || 'Buổi tập';
            return (
              <div
                key={s._id}
                className={`min-w-0 rounded-lg border p-2.5 ${
                  f.over ? 'border-rose-400/70' : 'border-[var(--st-border,#E5E7EB)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-[var(--st-ink,#0F172A)]">{s.horse?.name}</span>
                      <span className="text-xs text-[var(--st-ink-muted,#64748B)]">{kindLabel}</span>
                      {f.over && <Tag color="error" className="!m-0 !text-[10px]">Vượt ngưỡng</Tag>}
                    </div>
                    <div className="truncate text-[11px] text-[var(--st-ink-muted,#64748B)]">{motion.label}</div>
                  </div>
                  <Button
                    size="small"
                    type="link"
                    className="!px-1 shrink-0"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setSelectedId(s._id);
                      setMode('focus');
                    }}
                  >
                    Xem 3D
                  </Button>
                </div>

                <dl className="m-0 mt-2 grid grid-cols-3 gap-2 border-t border-[var(--st-border,#F1F5F9)] pt-2 text-xs tabular-nums">
                  <div>
                    <dt className="text-[10px] text-[var(--st-ink-muted,#64748B)]">Nhịp tim</dt>
                    <dd className={`m-0 font-semibold ${f.over ? 'text-rose-600' : 'text-[var(--st-ink,#0F172A)]'}`}>
                      {f.heartRate ?? '—'} <span className="text-[10px] font-normal text-[var(--st-ink-muted,#64748B)]">/{f.target.heartRateMax}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-[var(--st-ink-muted,#64748B)]">Tốc độ</dt>
                    <dd className="m-0 font-semibold text-[var(--st-ink,#0F172A)]">
                      {fmtNum(f.speed, 1)} <span className="text-[10px] font-normal text-[var(--st-ink-muted,#64748B)]">km/h</span>
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-[10px] text-[var(--st-ink-muted,#64748B)]">Cự ly</dt>
                    <dd className="m-0 font-semibold text-[var(--st-ink,#0F172A)]">
                      {fmtNum(f.distance)}/{fmtNum(f.targetDistance)} m
                    </dd>
                  </div>
                </dl>
                <Progress
                  className="!m-0 !mt-1.5"
                  size="small"
                  strokeColor={f.over ? STATUS_TONES.bad.color : FOREST.primary}
                  percent={pct}
                />
                {!readOnly && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <SessionQuickControls session={s} readOnly={readOnly} onEnd={onEnd} onAbort={onAbort} />
                  </div>
                )}
              </div>
            );
          })}
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
          <MovingHorse3D breed={horse?.breed} color={horse?.color} motion={liveMotion(session, 0, { stopped: true })} surface={surface} hour={hourOfSession(session)} height={236} />
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
 * `horses` gives each horse's breed and colour, so it runs in its own coat. `readOnly`: watched by the owner,
 * without the trainer's tools (the scenario button).
 */
export default function LiveSessionMonitor({ sessions = [], horses = [], plans = [], onSessionCompleted, onEnd, onAbort, readOnly = false }) {
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
        <MultiLiveDeck running={running} readings={readings} horseOf={horseOf} surfaceFor={surfaceFor} readOnly={readOnly} onEnd={onEnd} onAbort={onAbort} />
      ) : (
        running.map((s) => <LiveCard key={s._id} session={s} readings={readings[s._id] || []} horse={horseOf(s)} surface={surfaceFor(s)} readOnly={readOnly} onEnd={onEnd} onAbort={onAbort} />)
      )}
    </section>
  );
}
