import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import './dash.css';

/**
 * The pieces every role's home is built from, on the owner kit's tokens (.own-ui, light and dark):
 * a hero band with the one figure the day turns on, figure tiles with a sparkline or a meter, and a
 * handful of charts (columns, an area trend, ranked bars, a segmented bar, a meter list). Chart colours
 * are the validated series tokens of owner.css; status colours only ever mean a status, with its word.
 */

const AXIS = { axisLine: false, tickLine: false };
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export const todayLong = () => `${WEEKDAYS[dayjs().day()]}, ${dayjs().format('DD/MM/YYYY')}`;
export const greeting = () => {
  const h = dayjs().hour();
  return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
};

/** "1,2 tỷ", "150 tr", "800k". */
export const compactVnd = (n) => {
  const abs = Math.abs(n || 0);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1).replace('.', ',')} tỷ`;
  if (abs >= 1e6)
    return `${sign}${(abs / 1e6)
      .toFixed(abs >= 1e8 ? 0 : 1)
      .replace('.', ',')
      .replace(',0', '')} tr`;
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}k`;
  return `${sign}${abs}`;
};
const pct = (value, max) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

/** The page's opening band: who and when, what the day holds, the main actions, and its one figure. */
export function DashHero({ eyebrow, title, sub, actions, figure }) {
  return (
    <section className="dk-hero">
      <svg className="dk-hero-art" viewBox="0 0 400 220" aria-hidden="true" focusable="false">
        <ellipse cx="300" cy="200" rx="230" ry="120" />
        <ellipse cx="300" cy="200" rx="180" ry="88" />
        <ellipse cx="300" cy="200" rx="130" ry="58" />
      </svg>
      <div className="dk-hero-main">
        {eyebrow && <div className="dk-hero-eyebrow">{eyebrow}</div>}
        <h1 className="dk-hero-title">{title}</h1>
        {sub && <p className="dk-hero-sub">{sub}</p>}
        {actions && <div className="dk-hero-actions">{actions}</div>}
      </div>
      {figure && (
        <div className="dk-hero-figure">
          <span className="dk-hero-figure-label">{figure.label}</span>
          <b className="dk-hero-figure-value">
            {figure.value}
            {figure.of != null && <small>/{figure.of}</small>}
          </b>
          {figure.meter && (
            <span className="dk-hero-meter" role="img" aria-label={`${figure.label}: ${figure.meter.value}/${figure.meter.max}`}>
              <i style={{ width: `${pct(figure.meter.value, figure.meter.max)}%` }} />
            </span>
          )}
          {figure.sub && <span className="dk-hero-figure-sub">{figure.sub}</span>}
        </div>
      )}
    </section>
  );
}

/** The value printed on a column's cap (under it for a negative one); nothing for zero. */
function capLabel(fmt, data, className = 'dk-cap') {
  return function Cap({ x, y, width, height, index, value }) {
    const v = value ?? data?.[index]?.value;
    if (!v) return null;
    const top = Math.min(y, y + (height || 0));
    return (
      <text x={x + width / 2} y={top - 5} textAnchor="middle" className={className}>
        {fmt(v)}
      </text>
    );
  };
}

/**
 * A small labelled column chart for a figure tile: one column per day, week or month with its name
 * under it and its value on its cap, the latest one in the accent and the rest a lighter step (a
 * negative one in the second hue). data: [{ key, label, full, value }]; the tooltip gives `full`.
 */
export function MiniColumns({ data, fmt = (v) => v, label, height = 104, caption }) {
  const last = data.length - 1;
  return (
    <div className="dk-mini">
      {caption && <div className="dk-mini-caption">{caption}</div>}
      <div className="own-chart" style={{ height }} role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 2, left: 2, bottom: 0 }} barCategoryGap="20%">
            <XAxis dataKey="label" {...AXIS} interval={0} tick={{ fontSize: 10 }} height={16} />
            <YAxis hide domain={[(min) => Math.min(0, min), (max) => Math.max(1, max)]} />
            <ReferenceLine y={0} className="dk-mini-base" />
            <Tooltip
              cursor={{ className: 'dk-mini-cursor' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="own-tip">
                    <div className="own-tip-title">{payload[0].payload.full || payload[0].payload.label}</div>
                    <div className="own-tip-row">
                      <span>{label}</span>
                      <b>{fmt(payload[0].payload.value)}</b>
                    </div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.key} fill={d.value < 0 ? 'var(--o-series-2)' : i === last ? 'var(--o-series-1)' : 'var(--o-series-1-soft)'} />
              ))}
              <LabelList dataKey="value" content={capLabel(fmt, data)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** A ratio against its whole: the fill carries the tone, the track a lighter step of it. */
export function Meter({ value, max, tone = 'info', label }) {
  return (
    <span className={`dk-meter is-${tone}`} role="img" aria-label={label || `${value}/${max}`}>
      <i style={{ width: `${pct(value, max)}%` }} />
    </span>
  );
}

/**
 * A figure tile: label, the value with its change against a named period, a line under it, and a chart
 * that explains it: `chart` (MiniColumns props), `meter`, or `split` (a thin split bar with its legend).
 */
export function KpiTile({ icon, label, value, unit, sub, delta, tone = 'info', chart, meter, split, to }) {
  const body = (
    <>
      <div className="dk-kpi-top">
        <span className={`dk-kpi-icon is-${tone}`} aria-hidden="true">
          {icon}
        </span>
        <span className="dk-kpi-label">{label}</span>
      </div>
      <div className="dk-kpi-value">
        <span>
          {value}
          {unit && <small>{unit}</small>}
        </span>
        {delta && <span className={`dk-delta ${delta.good ? 'is-good' : 'is-bad'}`}>{delta.text}</span>}
      </div>
      {sub && <div className="dk-kpi-sub">{sub}</div>}
      {chart && <MiniColumns {...chart} />}
      {meter && (
        <div className="dk-kpi-meter">
          <Meter {...meter} label={meter.label || label} />
          {meter.caption && <div className="dk-kpi-meter-caption">{meter.caption}</div>}
        </div>
      )}
      {split && <SplitBar parts={split} thin legend />}
    </>
  );
  return to ? (
    <Link to={to} className="dk-kpi is-link">
      {body}
    </Link>
  ) : (
    <div className="dk-kpi">{body}</div>
  );
}

export function KpiRow({ children }) {
  return <div className="dk-kpis">{children}</div>;
}

/** "+3 so với tuần trước" from two counts; up is good unless `downIsGood`. */
export function deltaOf(now, before, period, { downIsGood = false, unit = '' } = {}) {
  if (now == null || before == null || now === before) return null;
  const diff = Math.round((now - before) * 10) / 10;
  return { text: `${diff > 0 ? '+' : '−'}${Math.abs(diff)}${unit} ${period}`, good: downIsGood ? diff < 0 : diff > 0 };
}

/** The legend for two or more series, above the chart. items: [[swatch class, name]]. */
function Legend({ items }) {
  if (items.length < 2) return null;
  return (
    <div className="own-legend" aria-hidden="true">
      {items.map(([swatch, name]) => (
        <span key={name}>
          <i className={`own-swatch ${swatch}`} />
          {name}
        </span>
      ))}
    </div>
  );
}

function Tip({ active, payload, title, rows }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="own-tip">
      <div className="own-tip-title">{title(d)}</div>
      {rows(d).map(([swatch, name, value]) => (
        <div className="own-tip-row" key={name}>
          <span>
            {swatch != null && <i className={`own-swatch is-line ${swatch}`} />}
            {name}
          </span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

const SWATCH = { 'is-series-1': '', 'is-series-1-soft': 'is-soft', 'is-series-2': 'is-2' };

/**
 * Columns on one axis: one series, two side by side, or two stacked into one whole. series:
 * [{ key, name, cls: 'is-series-1' | 'is-series-1-soft' | 'is-series-2' }]; `more(d)` adds tooltip rows.
 */
export function Columns({ data, series, stacked = false, height = 240, xKey = 'label', fmt = (v) => v, yFmt, capFmt, table, title = (d) => d.full || d[xKey], more = () => [], label }) {
  // A stacked column's total rides on a see-through column of its own, on a hidden second x axis so it
  // stands exactly over the stack: a label on a stacked segment is lost when that segment is zero.
  const capped = stacked && capFmt;
  const rows = capped ? data.map((d) => ({ ...d, __total: series.reduce((t, s) => t + (d[s.key] || 0), 0) })) : data;
  return (
    <div className="flex flex-col gap-2">
      <Legend items={series.map((s) => [SWATCH[s.cls], s.name])} />
      <div className="own-chart" style={{ height }} role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 18, right: 4, left: -14, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={8} />
            {capped && <XAxis xAxisId="cap" dataKey={xKey} hide />}
            <YAxis allowDecimals={false} tickFormatter={yFmt} {...AXIS} width={yFmt ? 56 : 40} />
            <Tooltip content={(p) => <Tip {...p} title={title} rows={(d) => [...series.map((s) => [SWATCH[s.cls], s.name, fmt(d[s.key] || 0)]), ...more(d)]} />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stackId={stacked ? 'one' : undefined}
                className={s.cls}
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={stacked ? 24 : 16}
                isAnimationActive={false}
              >
                {capFmt && !stacked && <LabelList dataKey={s.key} content={capLabel(capFmt, null)} />}
              </Bar>
            ))}
            {capped && (
              <Bar xAxisId="cap" dataKey="__total" className="dk-cap-bar" maxBarSize={24} isAnimationActive={false} legendType="none" tooltipType="none">
                <LabelList dataKey="__total" content={capLabel(capFmt, null)} />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {table && (
        <div className="dk-table-wrap">
          <table className="dk-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Số liệu</span>
                </th>
                {data.map((d) => (
                  <th key={d.key || d[xKey]} scope="col">
                    {d[xKey]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.key}>
                  <th scope="row">
                    <i className={`own-swatch ${SWATCH[s.cls]}`} />
                    {s.name}
                  </th>
                  {data.map((d) => (
                    <td key={d.key || d[xKey]}>{table.fmt(d[s.key] || 0)}</td>
                  ))}
                </tr>
              ))}
              {(table.extra || []).map((r) => (
                <tr key={r.name} className="is-extra">
                  <th scope="row">{r.name}</th>
                  {data.map((d) => (
                    <td key={d.key || d[xKey]} className={r.tone ? r.tone(d) : ''}>
                      {r.value(d)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One series over time as a line with a wash under it; the crosshair finds the point. */
export function AreaTrend({ data, yKey, name, height = 220, xKey = 'label', fmt = (v) => v, yFmt, title = (d) => d.full || d[xKey], more = () => [], label }) {
  return (
    <div className="own-chart dk-area" style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -14, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={10} />
          <YAxis allowDecimals={false} tickFormatter={yFmt} {...AXIS} width={yFmt ? 56 : 40} />
          <Tooltip content={(p) => <Tip {...p} title={title} rows={(d) => [['', name, fmt(d[yKey] || 0)], ...more(d)]} />} />
          <Area type="monotone" dataKey={yKey} className="dk-area-series" dot={{ r: 3.5 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Parts compared with each other, largest first (or in their own order): one hue, the value at the tip. */
export function RankBars({ rows, fmt = (v) => v, empty, max: scale }) {
  // A paged list passes the scale of the whole list, so a bar keeps its length from page to page.
  const max = scale ?? Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="own-empty">{empty}</div>;
  return (
    <ul className="dk-rank">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="dk-rank-name">
              <span className="dk-rank-label">{r.label}</span>
              {r.sub && <span className="dk-rank-sub">{r.sub}</span>}
            </span>
            <span className="dk-rank-track">
              <i className={r.tone ? `is-${r.tone}` : ''} style={{ width: `${Math.max(r.value > 0 ? 2 : 0, pct(r.value, max))}%` }} />
            </span>
            <b className="dk-rank-value">{r.display ?? fmt(r.value)}</b>
          </>
        );
        return (
          <li key={r.key} title={`${r.label}: ${r.display ?? fmt(r.value)}`}>
            {r.to ? (
              <Link to={r.to} className="dk-rank-row">
                {inner}
              </Link>
            ) : (
              <div className="dk-rank-row">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One whole split into its parts. Tall: each block prints its share when it fits, the legend names the
 * parts with their counts. Thin: no text (the figures sit beside it). parts: [{ key, label, value, tone }].
 */
export function SplitBar({ parts, thin = false, legend = !thin, unit = '' }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  const name = parts.map((p) => `${p.label} ${p.value}${unit}`).join(', ');
  return (
    <div className={`dk-split${thin ? ' is-thin' : ''}`}>
      <div className="dk-split-bar" role="img" aria-label={name}>
        {total === 0 ? (
          <i className="is-empty" style={{ flexGrow: 1 }} />
        ) : (
          shown.map((p) => {
            const share = Math.round((p.value / total) * 100);
            return (
              <i key={p.key} className={`is-${p.tone}`} style={{ flexGrow: p.value }} title={`${p.label}: ${p.value}${unit} (${share}%)`}>
                {!thin && share >= 12 && <span>{share}%</span>}
              </i>
            );
          })
        )}
      </div>
      {legend && (
        <div className="dk-split-legend">
          {parts.map((p) => (
            <span key={p.key}>
              <i className={`is-${p.tone}`} />
              {p.label} <b>{p.value}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Several ratios, one per named row, each against its own whole. rows: [{ key, label, sub, value, max, tone, display, to }]. */
export function MeterList({ rows }) {
  return (
    <ul className="dk-meters">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="dk-meters-name">
              <span className="dk-meters-label">{r.label}</span>
              {r.sub && <span className="dk-meters-sub">{r.sub}</span>}
            </span>
            <Meter value={r.value} max={r.max} tone={r.tone} label={`${r.label}: ${r.display}`} />
            <b className="dk-meters-value">{r.display}</b>
          </>
        );
        return (
          <li key={r.key}>
            {r.to ? (
              <Link to={r.to} className="dk-meters-row">
                {inner}
              </Link>
            ) : (
              <div className="dk-meters-row">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A chart card's headline: the number the chart sums up, and what it means. */
export function ChartHead({ value, text }) {
  return (
    <div className="dk-chart-head">
      <b>{value}</b>
      <span>{text}</span>
    </div>
  );
}

/** The last `n` days (oldest first) as { key, label, full, start }. */
export function lastDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = dayjs()
      .startOf('day')
      .subtract(n - 1 - i, 'day');
    return { key: d.format('YYYY-MM-DD'), label: d.format('DD/MM'), full: `${WEEKDAYS[d.day()]}, ${d.format('DD/MM')}`, start: d };
  });
}

/** The last `n` weeks (Monday first, oldest first) as { key, label, full, start, end }. */
export function lastWeeks(n) {
  const monday = dayjs()
    .startOf('day')
    .subtract((dayjs().day() + 6) % 7, 'day');
  return Array.from({ length: n }, (_, i) => {
    const start = monday.subtract(n - 1 - i, 'week');
    const end = start.add(1, 'week');
    return { key: start.format('YYYY-MM-DD'), label: start.format('DD/MM'), full: `Tuần ${start.format('DD/MM')} – ${end.subtract(1, 'day').format('DD/MM')}`, start, end };
  });
}

/** The last `n` months (oldest first) as { key, label, full, start, end }. */
export function lastMonths(n) {
  const first = dayjs().startOf('month');
  return Array.from({ length: n }, (_, i) => {
    const start = first.subtract(n - 1 - i, 'month');
    return { key: start.format('YYYY-MM'), label: `T${start.month() + 1}`, full: `Tháng ${start.month() + 1}/${start.year()}`, start, end: start.add(1, 'month') };
  });
}

/** Whether a date falls in a bucket made by lastDays/lastWeeks/lastMonths. */
export const inBucket = (date, b) => {
  if (!date) return false;
  const d = dayjs(date);
  const end = b.end || b.start.add(1, 'day');
  return !d.isBefore(b.start) && d.isBefore(end);
};

/**
 * Pages through a long list inside a card: `rows` is the page to draw, `pager` the control under it
 * (nothing when everything fits). `resetKey` going back to the first page when a filter changes.
 */
export function usePager(items, size, resetKey) {
  // The page belongs to the list it was picked in: a new resetKey starts again at the first page.
  const [picked, setPicked] = useState({ key: resetKey, page: 0 });
  const page = picked.key === resetKey ? picked.page : 0;
  const setPage = (n) => setPicked({ key: resetKey, page: n });
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages - 1);
  const rows = items.slice(current * size, current * size + size);
  const pager = items.length > size ? <Pager page={current} pages={pages} total={items.length} size={size} onChange={setPage} /> : null;
  return { rows, pager, page: current };
}

function Pager({ page, pages, total, size, onChange }) {
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  // At most seven page buttons: the first, the last and those around the current one.
  const shown = Array.from({ length: pages }, (_, i) => i).filter((i) => pages <= 7 || i === 0 || i === pages - 1 || Math.abs(i - page) <= 1);
  return (
    <nav className="dk-pager" aria-label="Phân trang">
      <span className="dk-pager-count">
        {from}–{to} / {total}
      </span>
      <div className="dk-pager-pages">
        <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="Trang trước">
          <LeftOutlined />
        </button>
        {shown.map((i, k) => (
          <span key={i} className="contents">
            {k > 0 && i - shown[k - 1] > 1 && <span className="dk-pager-gap">…</span>}
            <button type="button" className={i === page ? 'is-active' : ''} aria-current={i === page ? 'page' : undefined} onClick={() => onChange(i)}>
              {i + 1}
            </button>
          </span>
        ))}
        <button type="button" disabled={page === pages - 1} onClick={() => onChange(page + 1)} aria-label="Trang sau">
          <RightOutlined />
        </button>
      </div>
    </nav>
  );
}
