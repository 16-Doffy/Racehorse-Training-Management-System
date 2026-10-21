import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money } from './ownerFormat';

/**
 * The Horse Owner's charts. One y-axis each; colours come from the series tokens in owner.css (set by
 * class, so the light and the dark canvas each get their own validated steps); every chart has a hover
 * tooltip and its legend in HTML above it.
 */

const AXIS = { axisLine: false, tickLine: false };

/** "1,2 tỷ", "150 tr", "800k" for an axis tick. */
const compactVnd = (n) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1).replace('.', ',')} tỷ`;
  if (abs >= 1e6) return `${Math.round(n / 1e6)} tr`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
};

/** The tooltip box: a title and rows of [swatch class, name, value]. */
function Tip({ active, payload, title, rows }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return (
    <div className="own-tip">
      <div className="own-tip-title">{title(datum)}</div>
      {rows(datum).map(([swatch, name, value]) => (
        <div className="own-tip-row" key={name}>
          <span>
            {swatch !== null && <i className={`own-swatch ${swatch}`} />}
            {name}
          </span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

/** Finished sessions per month (or day), split into those that met their targets and the rest. */
export function TrainingBars({ rows, height = 240 }) {
  const data = rows.map((r) => ({ ...r, rest: Math.max(0, (r.sessions || 0) - (r.metGoals || 0)) }));
  return (
    <>
      <div className="own-legend" aria-hidden="true">
        <span>
          <i className="own-swatch" />
          Đạt chỉ tiêu
        </span>
        <span>
          <i className="own-swatch is-soft" />
          Chưa đạt
        </span>
      </div>
      <div className="own-chart" style={{ height }} role="img" aria-label="Biểu đồ số buổi tập hoàn thành và số buổi đạt chỉ tiêu">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={10} />
            <YAxis allowDecimals={false} {...AXIS} width={44} />
            <Tooltip
              content={(p) => (
                <Tip
                  {...p}
                  title={(d) => d.label}
                  rows={(d) => [
                    ['', 'Đạt chỉ tiêu', `${d.metGoals || 0} buổi`],
                    ['is-soft', 'Chưa đạt', `${d.rest} buổi`],
                    [null, 'Điểm HLV TB', d.avgScore ? `${Number(d.avgScore).toFixed(1)}/10` : '—'],
                  ]}
                />
              )}
            />
            <Bar dataKey="metGoals" stackId="s" className="is-series-1" maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="rest" stackId="s" className="is-series-1-soft" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** The trainer's rating (1–10) of each evaluated session, oldest first. points: [{ key, label, rating, sub }]. */
export function RatingLine({ points, height = 220 }) {
  return (
    <div className="own-chart" style={{ height }} role="img" aria-label="Biểu đồ điểm đánh giá của HLV theo thời gian">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={14} />
          <YAxis domain={[0, 10]} ticks={[0, 5, 10]} {...AXIS} width={44} />
          <ReferenceLine y={5} strokeDasharray="3 3" />
          <Tooltip
            content={(p) => <Tip {...p} title={(d) => d.full} rows={(d) => [['', 'Điểm HLV', `${d.rating}/10`], [null, d.sub, '']]} />}
          />
          <Line type="monotone" dataKey="rating" className="is-line" dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One small line chart per vital sign, each on its own axis. series: [{ key, name, unit, points: [{ label, full, value }] }]. */
export function VitalsMultiples({ series }) {
  return (
    <div className="own-multiples">
      {series.map((s) => {
        const last = s.points[s.points.length - 1];
        return (
          <div key={s.key} className="min-w-0">
            <div className="own-multiple-title">
              <span>{s.name}</span>
              <b className="own-num">{last ? `${last.value} ${s.unit}` : '—'}</b>
            </div>
            <div className="own-chart" style={{ height: 130 }} role="img" aria-label={`Biểu đồ ${s.name}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s.points} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis domain={['dataMin - 2', 'dataMax + 2']} allowDecimals={false} {...AXIS} width={44} />
                  <Tooltip content={(p) => <Tip {...p} title={(d) => d.full} rows={(d) => [['', s.name, `${d.value} ${s.unit}`]]} />} />
                  <Line type="monotone" dataKey="value" className="is-line" dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Revenue and cost of each month of the year, side by side on one money axis. */
export function MoneyBars({ periods, height = 240 }) {
  const data = periods.map((p) => ({ ...p, short: `T${Number(p.key.slice(-2))}` }));
  return (
    <>
      <div className="own-legend" aria-hidden="true">
        <span>
          <i className="own-swatch" />
          Thu
        </span>
        <span>
          <i className="own-swatch is-2" />
          Chi
        </span>
      </div>
      <div className="own-chart" style={{ height }} role="img" aria-label="Biểu đồ thu và chi theo tháng">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 4, left: -6, bottom: 0 }} barGap={2} barCategoryGap="24%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="short" {...AXIS} interval="preserveStartEnd" minTickGap={6} />
            <YAxis tickFormatter={compactVnd} {...AXIS} width={56} />
            <Tooltip
              content={(p) => (
                <Tip
                  {...p}
                  title={(d) => d.label}
                  rows={(d) => [
                    ['', 'Thu', money(d.revenue)],
                    ['is-2', 'Chi', money(d.cost)],
                    [null, 'Chênh lệch', money(d.net)],
                  ]}
                />
              )}
            />
            <Bar dataKey="revenue" className="is-series-1" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey="cost" className="is-series-2" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
