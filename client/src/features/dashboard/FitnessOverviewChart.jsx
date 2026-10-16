import { useMemo, useState } from 'react';
import { Card, Typography, Empty, Select, DatePicker, Tag, Progress, theme } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';
import { SESSION_KINDS, DONE_STATUSES } from '../training/trainingVocab';
import { SESSION_STATUS_LABELS } from '../training/sessionStatus';

const { Text } = Typography;

// Same thresholds as server/src/realtime/alertEvaluator.js — a bar that crosses these is the same
// "fitness alert" condition the realtime system already pages the Head Trainer about.
const HEART_RATE_THRESHOLD = 180;
const SPEED_THRESHOLD = 70;
// A run that has numbers: finished, evaluated, or stopped part-way.
const RAN_STATUSES = [...DONE_STATUSES, 'aborted'];
const TREND_LENGTH = 10;

const idOf = (ref) => String(ref?._id || ref || '');
const ranAt = (s) => dayjs(s.actualStartAt || s.scheduledAt);
// Every session carries a metrics object (sampleCount defaults to 0), so "has metrics" is not enough:
// a booking that hasn't run would otherwise stand in for the horse's last run and hide it.
const hasNumbers = (s) => RAN_STATUSES.includes(s.status) && (s.metrics?.sampleCount > 0 || s.metrics?.distance > 0);
const kindLabel = (s) => SESSION_KINDS[s.kind]?.label || 'Buổi tập';
const verdictOf = (s) => (s.outcome?.met === true ? 'met' : s.outcome?.met === false ? 'missed' : 'none');
const VERDICT_TEXT = { met: 'Đạt', missed: 'Chưa đạt', none: 'Không có chỉ tiêu' };
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

const isDarkHex = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) || 0);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
};

/**
 * The chart colours from the active antd theme, so the light and the dark canvas both read. The
 * verdict colours are the panel's own: antd's success green and error red are too dark on the dark canvas.
 */
function useChartColors() {
  const { token } = theme.useToken();
  const dark = isDarkHex(token.colorBgContainer);
  return {
    axis: token.colorTextSecondary,
    grid: token.colorBorderSecondary,
    bar: token.colorPrimary,
    good: dark ? '#6EE7B7' : '#1F6B43',
    bad: dark ? '#FCA5A5' : '#A61B14',
    none: dark ? '#93AB9E' : '#7A847D',
    track: dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)',
    tooltip: { background: token.colorBgElevated, border: `1px solid ${token.colorBorder}`, color: token.colorText, borderRadius: 8 },
  };
}

/** Đạt / Chưa đạt / no target, in the panel's verdict colours. */
function VerdictTag({ verdict, colors }) {
  const color = colors[verdict === 'met' ? 'good' : verdict === 'missed' ? 'bad' : 'none'];
  return (
    <Tag className="!m-0" style={{ color, borderColor: color, background: 'transparent', fontWeight: 600 }}>
      {verdict === 'met' ? 'Đạt mục tiêu' : verdict === 'missed' ? 'Chưa đạt mục tiêu' : 'Không đặt chỉ tiêu'}
    </Tag>
  );
}

/** One "actual against target" line. `ceiling` means lower is better (heart rate under its limit). */
function TargetRow({ label, value, target, unit, ceiling = false, colors }) {
  if (value == null) return null;
  const hasTarget = target != null && target > 0;
  const ok = hasTarget && (ceiling ? value <= target : value >= target);
  return (
    <div className="mb-2">
      <div className="flex justify-between gap-3 text-sm">
        <Text>{label}</Text>
        <Text strong className="tabular-nums">
          {round1(value)} {hasTarget ? `/ ${ceiling ? 'trần ' : ''}${round1(target)}` : ''} {unit}
          {!hasTarget && <Text type="secondary" className="!font-normal"> · không đặt chỉ tiêu</Text>}
        </Text>
      </div>
      {hasTarget && <Progress percent={Math.min(100, Math.round((value / target) * 100))} showInfo={false} size="small" strokeColor={ok ? colors.good : colors.bad} railColor={colors.track} />}
    </div>
  );
}

function SessionResult({ session, colors }) {
  const p = session.prescription || {};
  const m = session.metrics || {};
  const verdict = verdictOf(session);
  const workSeconds = session.simulatedWorkSec ?? (session.actualStartAt && session.actualEndAt ? dayjs(session.actualEndAt).diff(session.actualStartAt, 'second') : null);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <VerdictTag verdict={verdict} colors={colors} />
        {session.status === 'aborted' && <Tag className="!m-0">{SESSION_STATUS_LABELS.aborted}</Tag>}
        <Text type="secondary" className="text-xs">
          {kindLabel(session)} · {ranAt(session).format('DD/MM HH:mm')}
        </Text>
      </div>
      {session.outcome?.summary && <Text type="secondary" className="block text-xs mb-3">{session.outcome.summary}</Text>}
      <TargetRow label="Cự ly" value={m.distance} target={p.distanceM ? p.distanceM * (p.reps || 1) : null} unit="m" colors={colors} />
      <TargetRow label="Nhịp tim trung bình" value={m.avgHeartRate} target={p.targetHeartRateMax} unit="bpm" ceiling colors={colors} />
      <TargetRow label="Tốc độ tối đa" value={m.maxSpeed} target={p.targetSpeedKmh} unit="km/h" colors={colors} />
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm">
        {m.maxHeartRate != null && <Text type="secondary">Nhịp tim tối đa: <Text strong>{m.maxHeartRate} bpm</Text></Text>}
        {workSeconds > 0 && <Text type="secondary">Thời gian chạy: <Text strong>{Math.floor(workSeconds / 60)} phút {workSeconds % 60} giây</Text></Text>}
        <Text type="secondary">HLV chấm: <Text strong>{session.performanceRating ? `${session.performanceRating}/10` : 'chưa đánh giá'}</Text></Text>
      </div>
      {session.trainerComment && <Text italic className="block text-sm mt-2">“{session.trainerComment}”</Text>}
      <Link to={`/training/sessions?horse=${idOf(session.horse)}`} className="inline-block text-sm mt-3">
        Xem buổi tập của ngựa này →
      </Link>
    </div>
  );
}

/** A horse's last runs as a line, each dot coloured by its verdict; clicking a dot opens that run. */
function TrendChart({ title, unit, dataKey, rows, selectedId, onSelect, colors }) {
  const points = rows.filter((r) => r[dataKey] != null);
  const selected = points.find((r) => r.id === selectedId);
  const dot = ({ cx, cy, payload }) => {
    if (cx == null || cy == null) return null;
    const isSelected = payload.id === selectedId;
    return (
      <circle
        key={payload.id}
        cx={cx}
        cy={cy}
        r={isSelected ? 7 : 4.5}
        fill={colors[payload.verdict === 'met' ? 'good' : payload.verdict === 'missed' ? 'bad' : 'none']}
        stroke={isSelected ? colors.axis : 'none'}
        strokeWidth={2}
        style={{ cursor: 'pointer' }}
        onClick={() => onSelect(payload.id)}
      />
    );
  };
  return (
    <Card size="small" title={title} className="flex-1 min-w-0">
      {points.length === 0 ? (
        <Empty description="Chưa có số đo" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={points} margin={{ top: 10, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis dataKey="label" stroke={colors.axis} tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis stroke={colors.axis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={colors.tooltip}
              formatter={(value, _name, item) => [`${value} ${unit} · ${VERDICT_TEXT[item.payload.verdict]}`, title]}
              labelFormatter={(label, items) => `${label}${items?.[0] ? ` · ${items[0].payload.kind}` : ''}`}
            />
            {selected && <ReferenceLine x={selected.label} stroke={colors.axis} strokeDasharray="3 3" />}
            <Line type="monotone" dataKey={dataKey} stroke={colors.bar} strokeWidth={2} dot={dot} activeDot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/** One bar per horse that ran on the chosen day; the horse being looked at stands out, a click picks another. */
function DayCompareChart({ title, unit, dataKey, threshold, rows, selectedHorse, onSelect, colors }) {
  const bars = rows.filter((r) => r[dataKey] != null);
  if (bars.length === 0) {
    return (
      <Card size="small" title={title} className="flex-1 min-w-0">
        <Empty description="Chưa có số đo" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>
    );
  }
  const hasAlert = bars.some((r) => r[dataKey] > threshold);
  return (
    <Card size="small" title={title} className="flex-1 min-w-0">
      <ResponsiveContainer width="100%" height={Math.max(bars.length * 40, 110)}>
        <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
          <CartesianGrid horizontal={false} stroke={colors.grid} />
          <XAxis type="number" stroke={colors.axis} tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            stroke={colors.axis}
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={130}
            tickFormatter={(name) => (name.length > 22 ? `${name.slice(0, 21)}…` : name)}
          />
          <Tooltip contentStyle={colors.tooltip} formatter={(value) => [`${value} ${unit}`, title]} cursor={{ fill: 'transparent' }} />
          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} maxBarSize={22} style={{ cursor: 'pointer' }} onClick={(entry) => onSelect(entry?.payload?.horseId ?? entry?.horseId)}>
            {bars.map((r) => (
              <Cell key={r.horseId} fill={r[dataKey] > threshold ? colors.bad : colors.bar} fillOpacity={r.horseId === selectedHorse ? 1 : 0.45} />
            ))}
            <LabelList dataKey={dataKey} position="right" formatter={(v) => `${v} ${unit}`} style={{ fontSize: 11, fill: colors.axis }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {hasAlert && (
        <div className="flex items-center gap-2 mt-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colors.bad }} />
          <Text type="secondary" className="text-xs">Vượt ngưỡng cảnh báo ({threshold} {unit})</Text>
        </div>
      )}
    </Card>
  );
}

/**
 * The Head Trainer's fitness panel: pick a day, then one of the horses that ran that day, then (when it
 * ran more than once) the run. Shows that run against its targets, the horse's recent runs as a trend,
 * and every horse of the day side by side. All from the sessions the dashboard already loads.
 */
export default function FitnessOverviewChart({ sessions }) {
  const colors = useChartColors();
  const runs = useMemo(() => sessions.filter(hasNumbers).sort((a, b) => ranAt(b).valueOf() - ranAt(a).valueOf()), [sessions]);
  const runDays = useMemo(() => new Set(runs.map((s) => ranAt(s).format('YYYY-MM-DD'))), [runs]);
  const [day, setDay] = useState(null);
  const [pick, setPick] = useState({ horse: null, session: null });

  if (runs.length === 0) {
    return (
      <Empty description="Chưa có buổi tập nào có số đo">
        <Link to="/training/sessions">Sang trang Buổi tập</Link>
      </Empty>
    );
  }

  // Today when a horse has run today, else the last day anything ran.
  const activeDay = day || (runDays.has(dayjs().format('YYYY-MM-DD')) ? dayjs() : ranAt(runs[0]));
  const dayRuns = runs.filter((s) => ranAt(s).isSame(activeDay, 'day'));
  const horses = [];
  for (const s of dayRuns) if (!horses.some((h) => h.id === idOf(s.horse))) horses.push({ id: idOf(s.horse), name: s.horse?.name || 'Ngựa' });
  const horseId = horses.some((h) => h.id === pick.horse) ? pick.horse : horses[0]?.id;
  const horseDayRuns = dayRuns.filter((s) => idOf(s.horse) === horseId);
  const session = horseDayRuns.find((s) => s._id === pick.session) || horseDayRuns[0];

  const trendRows = runs
    .filter((s) => idOf(s.horse) === horseId)
    .slice(0, TREND_LENGTH)
    .reverse()
    .map((s) => ({ id: s._id, label: ranAt(s).format('DD/MM HH:mm'), kind: kindLabel(s), verdict: verdictOf(s), avgHeartRate: round1(s.metrics?.avgHeartRate), maxSpeed: round1(s.metrics?.maxSpeed) }));
  const compareRows = horses.map((h) => {
    const last = dayRuns.find((s) => idOf(s.horse) === h.id);
    return { horseId: h.id, name: h.name, avgHeartRate: round1(last?.metrics?.avgHeartRate), maxSpeed: round1(last?.metrics?.maxSpeed) };
  });

  const selectRun = (id) => {
    const s = runs.find((r) => r._id === id);
    if (!s) return;
    setDay(ranAt(s));
    setPick({ horse: idOf(s.horse), session: s._id });
  };
  const selectHorse = (id) => id && setPick({ horse: id, session: null });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          value={activeDay}
          format="DD/MM/YYYY"
          allowClear={false}
          aria-label="Ngày tập"
          disabledDate={(d) => !runDays.has(d.format('YYYY-MM-DD'))}
          onChange={(d) => {
            setDay(d);
            setPick({ horse: null, session: null });
          }}
        />
        <Select
          aria-label="Ngựa"
          className="min-w-[220px]"
          value={horseId}
          onChange={selectHorse}
          options={horses.map((h) => ({ value: h.id, label: h.name }))}
        />
        {horseDayRuns.length > 1 && (
          <Select
            aria-label="Buổi tập"
            className="min-w-[220px]"
            value={session?._id}
            onChange={(id) => setPick({ horse: horseId, session: id })}
            options={horseDayRuns.map((s) => ({ value: s._id, label: `${kindLabel(s)} · ${ranAt(s).format('HH:mm')} · ${VERDICT_TEXT[verdictOf(s)]}` }))}
          />
        )}
        <Text type="secondary" className="text-xs">
          {horses.length} ngựa đã tập ngày {activeDay.format('DD/MM')}
        </Text>
      </div>

      {session && (
        <Card size="small" title={`Kết quả buổi tập · ${session.horse?.name || ''}`}>
          <SessionResult session={session} colors={colors} />
        </Card>
      )}

      <div>
        <Text strong className="block mb-2">Xu hướng {Math.min(TREND_LENGTH, trendRows.length)} buổi gần nhất của ngựa</Text>
        <div className="flex flex-col md:flex-row gap-4">
          <TrendChart title="Nhịp tim trung bình" unit="bpm" dataKey="avgHeartRate" rows={trendRows} selectedId={session?._id} onSelect={selectRun} colors={colors} />
          <TrendChart title="Tốc độ tối đa" unit="km/h" dataKey="maxSpeed" rows={trendRows} selectedId={session?._id} onSelect={selectRun} colors={colors} />
        </div>
      </div>

      <div>
        <Text strong className="block mb-2">So sánh các ngựa ngày {activeDay.format('DD/MM')} (buổi gần nhất mỗi ngựa)</Text>
        <div className="flex flex-col md:flex-row gap-4">
          <DayCompareChart title="Nhịp tim trung bình" unit="bpm" dataKey="avgHeartRate" threshold={HEART_RATE_THRESHOLD} rows={compareRows} selectedHorse={horseId} onSelect={selectHorse} colors={colors} />
          <DayCompareChart title="Tốc độ tối đa" unit="km/h" dataKey="maxSpeed" threshold={SPEED_THRESHOLD} rows={compareRows} selectedHorse={horseId} onSelect={selectHorse} colors={colors} />
        </div>
      </div>
    </div>
  );
}
