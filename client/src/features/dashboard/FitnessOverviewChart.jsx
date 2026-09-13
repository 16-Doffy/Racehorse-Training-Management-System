import { Card, Typography, Empty } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Cell, ResponsiveContainer } from 'recharts';

const { Text } = Typography;

// Same thresholds as server/src/realtime/alertEvaluator.js — a bar that crosses these is the
// same "fitness alert" condition the realtime system already pages the Head Trainer about, so
// the chart marks it with the reserved status color instead of the normal sequential blue.
const HEART_RATE_THRESHOLD = 180;
const SPEED_THRESHOLD = 70;

const SEQUENTIAL_BLUE = '#1677ff'; // matches ConfigProvider colorPrimary
const STATUS_CRITICAL = '#d03b3b';
const GRID_COLOR = '#e1e0d9';
const AXIS_COLOR = '#898781';

/**
 * Two small-multiple bar charts (avg heart rate, max speed) — deliberately not one dual-axis
 * chart, since the two measures have different units/scales. One sequential hue per chart;
 * bars that cross the same threshold the realtime alert system uses are called out in the
 * reserved status color, with a legend so identity never rests on color alone.
 */
function SingleMetricChart({ title, unit, dataKey, threshold, rows }) {
  if (rows.length === 0) {
    return (
      <Card title={title} className="flex-1">
        <Empty description="Chưa có dữ liệu buổi tập" />
      </Card>
    );
  }

  const hasAlert = rows.some((r) => r[dataKey] > threshold);

  return (
    <Card title={title} className="flex-1">
      <ResponsiveContainer width="100%" height={Math.max(rows.length * 44, 120)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
          <XAxis type="number" stroke={AXIS_COLOR} tick={{ fontSize: 12 }} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            stroke={AXIS_COLOR}
            tick={{ fontSize: 12 }}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={false}
            width={90}
          />
          <Tooltip formatter={(value) => [`${value} ${unit}`, title]} cursor={{ fill: 'rgba(22,119,255,0.06)' }} />
          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} maxBarSize={24}>
            {rows.map((r) => (
              <Cell key={r.name} fill={r[dataKey] > threshold ? STATUS_CRITICAL : SEQUENTIAL_BLUE} />
            ))}
            <LabelList dataKey={dataKey} position="right" formatter={(v) => `${v} ${unit}`} style={{ fontSize: 12, fill: '#52514e' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {hasAlert && (
        <div className="flex items-center gap-2 mt-2 text-xs">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STATUS_CRITICAL }} />
          <Text type="secondary">Vượt ngưỡng cảnh báo ({threshold} {unit})</Text>
        </div>
      )}
    </Card>
  );
}

export default function FitnessOverviewChart({ sessions }) {
  // One row per horse, using that horse's most recently scheduled session with recorded metrics.
  const latestByHorse = new Map();
  for (const s of sessions) {
    if (!s.horse?.name || !s.metrics) continue;
    const existing = latestByHorse.get(s.horse.name);
    if (!existing || new Date(s.scheduledAt) > new Date(existing.scheduledAt)) {
      latestByHorse.set(s.horse.name, s);
    }
  }

  const heartRateRows = [...latestByHorse.entries()]
    .filter(([, s]) => s.metrics.avgHeartRate != null)
    .map(([name, s]) => ({ name, avgHeartRate: s.metrics.avgHeartRate }));

  const speedRows = [...latestByHorse.entries()]
    .filter(([, s]) => s.metrics.maxSpeed != null)
    .map(([name, s]) => ({ name, maxSpeed: s.metrics.maxSpeed }));

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <SingleMetricChart title="Nhịp tim TB mới nhất" unit="bpm" dataKey="avgHeartRate" threshold={HEART_RATE_THRESHOLD} rows={heartRateRows} />
      <SingleMetricChart title="Tốc độ tối đa mới nhất" unit="km/h" dataKey="maxSpeed" threshold={SPEED_THRESHOLD} rows={speedRows} />
    </div>
  );
}
