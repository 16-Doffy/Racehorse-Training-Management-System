import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Dropdown, Tag, Typography, theme } from 'antd';
import { CheckCircleOutlined, DownOutlined, ExperimentOutlined, PauseCircleOutlined, UpOutlined } from '@ant-design/icons';
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
const GOLD = '#eab308';
const num = (n, digits = 0) => (n == null ? '—' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: digits }));

function formatDistance(meters) {
  if (meters == null) return { value: '—', unit: 'm' };
  const m = Number(meters);
  if (m >= 1000) return { value: num(m / 1000, 2), unit: 'km' };
  return { value: num(Math.round(m)), unit: 'm' };
}

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

function ScenarioButton({ session, compact = false, block = false, onSimulated }) {
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
      <Button
        size="small"
        block={block}
        icon={compact ? undefined : <ExperimentOutlined />}
        className={compact ? '!px-2 !text-xs font-medium' : undefined}
        title="Mô phỏng sự cố"
        aria-label={`Mô phỏng sự cố cho ${session.horse?.name || 'ngựa'}`}
      >
        Mô phỏng sự cố
      </Button>
    </Dropdown>
  );
}

/** Action bar inside focus detail view. */
function SessionControls({ session, onEnd, onAbort, onSimulated }) {
  const name = session.horse?.name || 'ngựa';
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <ScenarioButton session={session} onSimulated={onSimulated} />
      {onEnd && (
        <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => onEnd(session)} title="Kết thúc buổi" aria-label={`Kết thúc buổi của ${name}`}>
          Kết thúc
        </Button>
      )}
      {onAbort && (
        <Button size="small" danger icon={<PauseCircleOutlined />} onClick={() => onAbort(session)} title="Dừng buổi" aria-label={`Dừng buổi của ${name}`}>
          Dừng
        </Button>
      )}
    </span>
  );
}

/**
 * Compact broadcast telemetry card directly under the panoramic 3D track:
 * Horse header + 3 large scannable columns (Nhịp tim | Tốc độ | Cự ly) + slim gradient progress bar +
 * full-label action buttons (Mô phỏng sự cố | Kết thúc | Dừng). Clicking the card zooms into Tiêu điểm.
 */
function LiveTelemetryCard({ session, figures, motion, finishing, stopped, selected, readOnly, onFocus, onEnd, onAbort, onSimulated }) {
  const { token } = theme.useToken();
  const f = figures;
  const pct = finishing ? 100 : share(f);
  const alert = Boolean(f.over || stopped || motion?.tone === 'alert');
  const dist = formatDistance(f.distance);
  const name = session.horse?.name || 'Ngựa';

  const borderColor = stopped
    ? RED
    : alert
      ? '#d97706'
      : selected
        ? GOLD
        : token.colorBorderSecondary;
  const cardShadow = alert
    ? '0 0 0 1px rgba(234, 179, 8, 0.28), 0 8px 22px -10px rgba(234, 179, 8, 0.35)'
    : selected
      ? '0 0 0 1px rgba(234, 179, 8, 0.35)'
      : undefined;

  return (
    <div
      className="flex min-w-0 flex-col justify-between rounded-xl border transition-all"
      style={{
        borderColor,
        background: token.colorBgContainer,
        boxShadow: cardShadow,
      }}
    >
      <button
        type="button"
        onClick={onFocus}
        className="block w-full cursor-pointer border-0 bg-transparent px-3.5 pb-2.5 pt-3 text-left"
        style={{ color: token.colorText }}
        title="Bấm để mở cận cảnh 3D và biểu đồ nhịp tim chi tiết"
      >
        {/* Row 1: Pulsing dot + Horse Name + concise exercise type */}
        <div className="mb-2.5 flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: alert ? RED : finishing ? GOLD : '#22c55e' }}
              />
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: alert ? RED : finishing ? GOLD : '#22c55e' }}
              />
            </span>
            <span className="truncate text-[15px] font-semibold tracking-tight">{name}</span>
          </div>
          <span className="shrink-0 truncate text-[11px]" style={{ color: token.colorTextTertiary }}>
            {kindLabel(session)}
          </span>
        </div>

        {/* Row 2: 3 clean scannable numeric columns (Nhịp tim | Tốc độ | Cự ly) */}
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: token.colorBorderSecondary }}>
          <div className="pr-2" title={`Ngưỡng nhịp tim: ${f.target.heartRateMax} bpm`}>
            <div className="text-[11px]" style={{ color: token.colorTextTertiary }}>
              Nhịp tim
            </div>
            <div className="mt-0.5 flex items-baseline gap-1 tabular-nums">
              <span
                className="text-lg font-bold leading-none"
                style={{ color: f.over ? '#f97316' : stopped ? RED : token.colorText }}
              >
                {num(f.heartRate)}
              </span>
              <span className="text-[11px] font-medium" style={{ color: f.over ? '#f59e0b' : token.colorTextSecondary }}>
                bpm
              </span>
            </div>
          </div>

          <div className="px-2.5" style={{ borderColor: token.colorBorderSecondary }} title={f.target.speed ? `Mục tiêu: ${num(f.target.speed, 1)} km/h` : 'Tốc độ hiện tại'}>
            <div className="text-[11px]" style={{ color: token.colorTextTertiary }}>
              Tốc độ
            </div>
            <div className="mt-0.5 flex items-baseline gap-1 tabular-nums">
              <span className="text-lg font-bold leading-none">
                {stopped ? '0' : num(f.speed, 1)}
              </span>
              <span className="text-[11px] font-medium" style={{ color: token.colorTextSecondary }}>
                km/h
              </span>
            </div>
          </div>

          <div className="pl-2.5" style={{ borderColor: token.colorBorderSecondary }} title={`Đã chạy ${num(f.distance)}/${num(f.targetDistance)} m (${pct}%)`}>
            <div className="text-[11px]" style={{ color: token.colorTextTertiary }}>
              Cự ly
            </div>
            <div className="mt-0.5 flex items-baseline gap-1 tabular-nums">
              <span className="text-lg font-bold leading-none">{dist.value}</span>
              <span className="text-[11px] font-medium" style={{ color: token.colorTextSecondary }}>
                {dist.unit}
              </span>
            </div>
          </div>
        </div>

        {/* Row 3: Slim gradient progress bar */}
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: token.colorFillSecondary }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Đã chạy ${pct}% cự ly`}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(4, pct)}%`,
              background: alert
                ? 'linear-gradient(90deg, #ef4444 0%, #eab308 100%)'
                : finishing
                  ? 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)'
                  : 'linear-gradient(90deg, #059669 0%, #22c55e 100%)',
            }}
          />
        </div>

        {/* Contextual alert line only when injured / cooling down / over ceiling */}
        {(stopped || finishing || motion?.tone === 'alert') && (
          <div
            className="mt-1.5 truncate text-[11px] font-semibold"
            style={{ color: stopped || motion?.tone === 'alert' ? RED : '#10b981' }}
          >
            {stopped
              ? 'Nghi chấn thương · Đang đứng bảo vệ chân đau'
              : finishing
                ? 'Hoàn tất cự ly · Đang giảm tốc hạ nhiệt'
                : motion?.label}
          </div>
        )}
      </button>

      {/* Row 4: Full-label compact trainer actions matching the broadcast control bar */}
      {!readOnly && !finishing && !stopped && (
        <div className="grid grid-cols-[1.35fr_1fr_0.75fr] gap-1.5 px-3.5 pb-3 pt-0.5">
          <ScenarioButton session={session} compact block onSimulated={onSimulated} />
          {onEnd && (
            <Button
              size="small"
              block
              className="!px-2 !text-xs font-medium"
              onClick={() => onEnd(session)}
              aria-label={`Kết thúc buổi của ${name}`}
            >
              Kết thúc
            </Button>
          )}
          {onAbort && (
            <Button
              size="small"
              block
              danger
              className="!px-2 !text-xs font-medium"
              onClick={() => onAbort(session)}
              aria-label={`Dừng buổi của ${name}`}
            >
              Dừng
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Full focus panel: close-up broadcast 3/4 3D horse + unified big-number KPI strip + Recharts HR chart. */
function FocusDetailPanel({ session, readings, horse, surface, figures, motion, finishing, stopped, readOnly, onEnd, onAbort, onSimulated }) {
  const { token } = theme.useToken();
  const { target, heartRate, speed, distance, targetDistance, over, segmentCount, segmentIndex, segmentLabel, segmentNote } = figures;
  const data = readings.map((r, i) => ({ i, hr: r.hr, speed: r.speed }));
  const shownMotion = motion || { clip: 'Idle_Look', label: 'Đã bắt đầu, chờ tín hiệu cảm biến' };
  const startedAt = session.actualStartAt ? dayjs(session.actualStartAt) : null;
  const minutes = startedAt ? dayjs().diff(startedAt, 'minute') : null;
  const pct = finishing ? 100 : share(figures);
  const dist = formatDistance(distance);
  const alert = Boolean(over || stopped || motion?.tone === 'alert');

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        borderColor: stopped ? RED : alert ? '#d97706' : token.colorBorderSecondary,
        background: token.colorBgContainer,
        boxShadow: alert ? '0 0 0 1px rgba(234, 179, 8, 0.25), 0 8px 22px -10px rgba(234, 179, 8, 0.32)' : undefined,
      }}
    >
      {/* Top identity & action bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2.5"
        style={{ borderColor: token.colorBorderSecondary }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: alert ? RED : finishing ? GOLD : '#22c55e' }} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: alert ? RED : finishing ? GOLD : '#22c55e' }} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{session.horse?.name}</span>
          <span className="text-xs" style={{ color: token.colorTextSecondary }}>
            {kindLabel(session)}
          </span>
          {minutes != null && !stopped && !finishing && (
            <span className="text-[11px] tabular-nums" style={{ color: token.colorTextTertiary }}>
              · {minutes >= 1 ? `${minutes} phút` : 'vừa bắt đầu'}
            </span>
          )}
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

      {/* Unified broadcast 3-column telemetry KPI bar + gradient progress bar (same signature style as multi-horse cards!) */}
      <div className="border-b px-3.5 py-3" style={{ borderColor: token.colorBorderSecondary }}>
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: token.colorBorderSecondary }}>
          <div className="pr-3" title={`Ngưỡng nhịp tim: ${target.heartRateMax} bpm`}>
            <div className="text-[11px]" style={{ color: token.colorTextTertiary }}>
              Nhịp tim
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1 tabular-nums">
              <span className="text-xl font-bold leading-none" style={{ color: over ? '#f97316' : stopped ? RED : token.colorText }}>
                {num(heartRate)}
              </span>
              <span className="text-xs font-medium" style={{ color: over ? '#f59e0b' : token.colorTextSecondary }}>
                bpm
              </span>
              <span className="text-[11px]" style={{ color: token.colorTextTertiary }}>
                / {target.heartRateMax}
              </span>
            </div>
          </div>

          <div className="px-3" style={{ borderColor: token.colorBorderSecondary }} title={target.speed ? `Mục tiêu: ${num(target.speed, 1)} km/h` : 'Tốc độ hiện tại'}>
            <div className="text-[11px]" style={{ color: token.colorTextTertiary }}>
              Tốc độ
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1 tabular-nums">
              <span className="text-xl font-bold leading-none">{stopped ? '0' : num(speed, 1)}</span>
              <span className="text-xs font-medium" style={{ color: token.colorTextSecondary }}>
                km/h
              </span>
              {target.speed ? (
                <span className="hidden text-[11px] sm:inline" style={{ color: token.colorTextTertiary }}>
                  · mục tiêu {num(target.speed, 1)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="pl-3" style={{ borderColor: token.colorBorderSecondary }} title={`Đã chạy ${num(distance)}/${num(targetDistance)} m (${pct}%)`}>
            <div className="text-[11px]" style={{ color: token.colorTextTertiary }}>
              Cự ly
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1 tabular-nums">
              <span className="text-xl font-bold leading-none">{dist.value}</span>
              <span className="text-xs font-medium" style={{ color: token.colorTextSecondary }}>
                {dist.unit}
              </span>
              <span className="hidden text-[11px] sm:inline" style={{ color: token.colorTextTertiary }}>
                / {num(targetDistance)} m ({pct}%)
              </span>
            </div>
          </div>
        </div>

        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: token.colorFillSecondary }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Đã chạy ${pct}% cự ly`}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(4, pct)}%`,
              background: alert
                ? 'linear-gradient(90deg, #ef4444 0%, #eab308 100%)'
                : finishing
                  ? 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)'
                  : 'linear-gradient(90deg, #059669 0%, #22c55e 100%)',
            }}
          />
        </div>
      </div>

      {/* Close-up 3D broadcast view + full HR chart */}
      <div className="grid grid-cols-1 gap-3 p-3.5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-6">
          <MovingHorse3D breed={horse?.breed} color={horse?.color} motion={shownMotion} surface={surface} hour={hourOfSession(session)} height={235} />
        </div>
        <div className="flex min-w-0 flex-col lg:col-span-6">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5 text-xs" style={{ color: token.colorTextSecondary }}>
            <span className="font-medium" style={{ color: token.colorText }}>
              {shownMotion.label}
            </span>
            <span className="tabular-nums text-[11px]" style={{ color: token.colorTextTertiary }}>
              Đồ thị nhịp tim theo thời gian
            </span>
          </div>
          {data.length > 1 ? (
            <div className="h-44 w-full">
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
                  <Tooltip
                    contentStyle={{
                      background: token.colorBgElevated,
                      borderColor: token.colorBorderSecondary,
                      color: token.colorText,
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    itemStyle={{ color: token.colorText }}
                    formatter={(v, name) => [name === 'hr' ? `${v} bpm` : `${v} km/h`, name === 'hr' ? 'Nhịp tim' : 'Tốc độ']}
                    labelFormatter={() => ''}
                  />
                  <ReferenceLine y={target.heartRateMax} stroke={RED} strokeDasharray="4 4" label={{ value: `ngưỡng ${target.heartRateMax}`, position: 'insideTopRight', fontSize: 11, fill: RED }} />
                  <Line type="monotone" dataKey="hr" stroke={FOREST.primary} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="m-0 mt-3 text-xs" style={{ color: token.colorTextTertiary }}>
              Biểu đồ nhịp tim hiện khi cảm biến gửi lần đo thứ hai.
            </p>
          )}
          <Text type="secondary" className="!text-[11px] mt-auto block pt-1.5">
            {stopped
              ? 'Tốc độ tụt mạnh & nhịp tim vọt: hệ thống đã tự dừng, gửi yêu cầu khám gấp cho bác sĩ và giao nhân viên chăm sóc chườm lạnh.'
              : finishing
                ? 'Buổi tập đã đủ cự ly — ngựa đang giảm tốc hạ nhiệt qua các nhịp phi → kiệu → đi bộ rồi dừng nghỉ.'
                : 'Cảm biến mô phỏng gửi số liệu mỗi 5 giây (mỗi lần tương ứng 30 giây tập). Buổi tự kết thúc khi chạy đủ cự ly.'}
          </Text>
        </div>
      </div>
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
 * Live sensor monitor for concurrent training sessions:
 * - Multi-horse default ("Sân chạy chung 3D"): ONE panoramic curved broadcast 3D racetrack showing all
 *   concurrent horses side-by-side with real shadows, billowing hoof dust, and floating live badges,
 *   paired with a crisp 3-column telemetry card row right underneath (Nhịp tim | Tốc độ | Cự ly + action bar).
 * - Focus mode ("Tiêu điểm", or single running horse): close-up broadcast 3/4 3D track + full Recharts HR chart.
 * - Supports graceful ~4s finish pull-up deceleration and 4-stage natural injury choreography.
 */
export default function LiveSessionMonitor({ sessions = [], horses = [], plans = [], onSessionCompleted, onEnd, onAbort, readOnly = false }) {
  const { token } = theme.useToken();
  const running = sessions.filter((s) => s.status === 'in_progress');
  const [readings, setReadings] = useState(() => Object.fromEntries(liveCache));
  const [stopped, setStopped] = useState([]);
  const [finishing, setFinishing] = useState([]);
  const [simOverrides, setSimOverrides] = useState({});
  const [injuryTickMs, setInjuryTickMs] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('shared'); // 'shared' | 'focus'
  const [folded, setFolded] = useState(readFolded);
  const queryClient = useQueryClient();
  const runningIds = running.map((s) => s._id).join(',');
  const horseById = new Map(horses.map((h) => [String(h._id), h]));
  const horseOf = (session) => horseById.get(String(session.horse?._id || session.horse));
  const planById = new Map(plans.map((p) => [String(p._id), p]));
  const surfaceFor = (session) => surfaceOf(planById.get(String(session.trainingPlan?._id || session.trainingPlan)), session.scheduledAt);

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

  // Fetch server-retained readings for already-running sessions.
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
  const effectiveMode = multi ? viewMode : 'focus';
  const focusedEntry = enriched.find((e) => String(e.session._id) === String(selectedId)) || enriched[0];
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

  const focusHorse = (id) => {
    setFolded(false);
    setSelectedId(id);
    setViewMode('focus');
  };

  const headerTitle = running.length > 0
    ? multi
      ? `Đang tập cùng khung giờ: ${running.length} ngựa`
      : `Đang tập · ${running.length} ngựa`
    : finishing.length > 0
      ? 'Đang giảm tốc kết thúc buổi tập'
      : 'Đã dừng nghi chấn thương';

  return (
    <section aria-label="Buổi tập đang diễn ra" className="mb-4 flex flex-col gap-2">
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
        styles={{ header: { minHeight: 'auto', padding: '10px 14px' }, body: { padding: folded ? 0 : 12 } }}
        title={
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="relative inline-flex h-2.5 w-2.5" aria-hidden="true">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: overCount > 0 || stopped.length > 0 ? RED : '#22c55e' }}
              />
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: overCount > 0 || stopped.length > 0 ? RED : '#22c55e' }}
              />
            </span>
            <span className="text-sm font-semibold tracking-tight">{headerTitle}</span>
            {overCount > 0 && (
              <Tag color="error" className="!m-0 rounded-full !px-2.5 text-xs font-medium">
                {overCount} vượt ngưỡng nhịp tim
              </Tag>
            )}
            {folded && (
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {enriched.map((e) => (
                  <button
                    key={e.session._id}
                    type="button"
                    onClick={() => focusHorse(e.session._id)}
                    className="cursor-pointer rounded-full border px-2 py-0.5 text-xs tabular-nums"
                    style={{
                      borderColor: e.figures.over || e.stopped ? RED : token.colorBorderSecondary,
                      color: e.figures.over || e.stopped ? RED : token.colorText,
                      background: 'transparent',
                    }}
                  >
                    {e.session.horse?.name} · {num(e.figures.heartRate)} bpm · {e.finishing ? 100 : share(e.figures)}%
                  </button>
                ))}
              </span>
            )}
          </div>
        }
        extra={
          <div className="flex items-center gap-2">
            {multi && !folded && (
              <div
                className="inline-flex items-center rounded-full border p-0.5"
                style={{ borderRadius: 9999, borderColor: token.colorBorderSecondary, background: token.colorFillQuaternary }}
                role="tablist"
                aria-label="Chế độ xem buổi tập trực tiếp"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveMode === 'shared'}
                  onClick={() => setViewMode('shared')}
                  className="cursor-pointer rounded-full border-0 px-3 py-1 text-xs font-semibold transition-all"
                  style={{
                    borderRadius: 9999,
                    background: effectiveMode === 'shared' ? GOLD : 'transparent',
                    color: effectiveMode === 'shared' ? '#0f172a' : token.colorTextSecondary,
                  }}
                >
                  Sân chạy chung 3D
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveMode === 'focus'}
                  onClick={() => setViewMode('focus')}
                  className="cursor-pointer rounded-full border-0 px-3 py-1 text-xs font-semibold transition-all"
                  style={{
                    borderRadius: 9999,
                    background: effectiveMode === 'focus' ? GOLD : 'transparent',
                    color: effectiveMode === 'focus' ? '#0f172a' : token.colorTextSecondary,
                  }}
                >
                  Tiêu điểm
                </button>
              </div>
            )}
            <Button size="small" type="text" icon={folded ? <DownOutlined /> : <UpOutlined />} onClick={toggleFold}>
              {folded ? 'Mở' : 'Thu gọn'}
            </Button>
          </div>
        }
      >
        {!folded && effectiveMode === 'shared' && (
          <div className="flex flex-col gap-3">
            <MultiHorseTrack3D
              items={trackItems}
              surface={sharedSurface}
              hour={sharedHour}
              height={255}
              selectedId={focusedEntry?.session._id}
              onSelect={(id) => focusHorse(id)}
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {enriched.map((e) => (
                <LiveTelemetryCard
                  key={e.session._id}
                  session={e.session}
                  figures={e.figures}
                  motion={e.motion}
                  finishing={e.finishing}
                  stopped={e.stopped}
                  selected={String(focusedEntry?.session._id) === String(e.session._id)}
                  readOnly={readOnly}
                  onFocus={() => focusHorse(e.session._id)}
                  onEnd={onEnd}
                  onAbort={onAbort}
                  onSimulated={handleSimulated}
                />
              ))}
            </div>
          </div>
        )}

        {!folded && effectiveMode === 'focus' && focusedEntry && (
          <div className="flex flex-col gap-2.5">
            {multi && (
              <div className="flex flex-wrap items-center gap-1.5">
                {enriched.map((e) => {
                  const active = String(focusedEntry.session._id) === String(e.session._id);
                  const alert = Boolean(e.figures.over || e.stopped || e.motion?.tone === 'alert');
                  return (
                    <button
                      key={e.session._id}
                      type="button"
                      onClick={() => setSelectedId(e.session._id)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all"
                      style={{
                        borderRadius: 9999,
                        borderColor: active ? GOLD : alert ? RED : token.colorBorderSecondary,
                        background: active ? 'rgba(234, 179, 8, 0.14)' : token.colorBgContainer,
                        color: token.colorText,
                      }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: alert ? RED : e.finishing ? GOLD : '#22c55e' }}
                      />
                      <span>{e.session.horse?.name}</span>
                      <span className="tabular-nums opacity-75">
                        · {num(e.figures.heartRate)} bpm
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <FocusDetailPanel
              session={focusedEntry.session}
              readings={focusedEntry.readings}
              horse={focusedEntry.horse}
              surface={focusedEntry.surface}
              figures={focusedEntry.figures}
              motion={focusedEntry.motion}
              finishing={focusedEntry.finishing}
              stopped={focusedEntry.stopped}
              readOnly={readOnly}
              onEnd={onEnd}
              onAbort={onAbort}
              onSimulated={handleSimulated}
            />
          </div>
        )}
      </Card>
    </section>
  );
}
