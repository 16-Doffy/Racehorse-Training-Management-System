import { Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { PHASE_COLORS, PHASE_LABELS, PHASE_SHORT } from '../training/trainingVocab';
import { amountText } from './feedingPlan';

/**
 * The days ahead as a bar, a segment per training phase sized by its days: which phase the meals
 * follow, and from when to when.
 */
export function PhaseStrip({ days }) {
  const segments = [];
  for (const d of days) {
    if (segments.at(-1)?.phase !== d.phase) segments.push({ phase: d.phase, from: d.date, to: d.date, count: 0, training: 0 });
    const s = segments.at(-1);
    s.to = d.date;
    s.count += 1;
    if (d.work !== 'rest') s.training += 1;
  }
  if (!segments.length) return null;
  return (
    <div className="flex w-full overflow-hidden rounded-lg border border-gray-200" role="img" aria-label="Các giai đoạn tập trong kỳ">
      {segments.map((s, i) => (
        <Tooltip key={i} title={`${PHASE_LABELS[s.phase] || s.phase}: ${dayjs(s.from).format('DD/MM')} – ${dayjs(s.to).format('DD/MM')}, ${s.training} ngày tập, ${s.count - s.training} ngày nghỉ`}>
          <div
            className="min-w-0 truncate px-2 py-0.5 text-[11px] text-white"
            style={{ flex: `${s.count} 1 0%`, background: PHASE_COLORS[s.phase] || '#888', borderLeft: i ? '2px solid rgba(255,255,255,0.7)' : undefined }}
          >
            <b>{PHASE_SHORT[s.phase] || s.phase}</b>
            <span className="tabular-nums opacity-90">
              {' '}
              · {dayjs(s.from).format('DD/MM')}–{dayjs(s.to).format('DD/MM')} · {s.count} ngày
            </span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

/** What the days take of each stock item against what is in stock now (feedingPlan.stockNeed). */
export function StockNeedList({ rows }) {
  if (!rows.length) return null;
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-1 text-sm">
          <span className="min-w-0 truncate text-gray-800">{r.name}</span>
          <span className="shrink-0 tabular-nums text-xs text-gray-600">
            cần <b className="text-gray-900">{amountText(r.needed)}</b> {r.unit}
            {r.inStock != null && (
              <>
                {' · kho '}
                {amountText(r.inStock)}
                {r.short && (
                  <Tag color="red" className="!ml-1.5 !mr-0 !px-1 !text-[10px] !leading-4">
                    Thiếu {amountText(r.needed - r.inStock)}
                  </Tag>
                )}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A small fact with its label, for the strip above a horse's feeding plan. */
export function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900">{children}</div>
    </div>
  );
}
