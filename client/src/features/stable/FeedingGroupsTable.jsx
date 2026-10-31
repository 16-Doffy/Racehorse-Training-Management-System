import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import { PHASE_COLORS, PHASE_LABELS, SESSION_KINDS } from '../training/trainingVocab';
import { MealCell } from './FeedingDaysTable';
import { SLOTS, SLOT_LABELS, WORK_LABELS, amountText, dayLabel, dayTotals, itemsKey } from './feedingPlan';

const ddmm = (date) => dayjs(date).format('DD/MM');
const WORK_DOT = { rest: 'bg-gray-300', light: 'bg-emerald-500', moderate: 'bg-amber-500', high: 'bg-rose-500' };
const SHOWN_DATES = 6;

/** The days with the same work and the same meals, phase by phase, in the order they first come. */
function groupDays(days) {
  const phases = [];
  for (const day of days) {
    if (phases.at(-1)?.phase !== day.phase) phases.push({ phase: day.phase, days: [], groups: [] });
    const p = phases.at(-1);
    p.days.push(day);
    const key = [
      day.work,
      ...SLOTS.map((slot) => {
        const m = day.meals.find((x) => x.slot === slot);
        return m ? `${slot}@${m.time}:${itemsKey(m.items)}:${day.locked?.[slot] || ''}` : `${slot}:-`;
      }),
    ].join('|');
    let g = p.groups.find((x) => x.key === key);
    if (!g) {
      g = { key, work: day.work, first: day, dates: [], kinds: new Set() };
      p.groups.push(g);
    }
    g.dates.push(day.date);
    for (const s of day.sessions || []) g.kinds.add(`${SESSION_KINDS[s.kind]?.short || s.kind}${s.slot === 'afternoon' ? ' (chiều)' : ''}`);
  }
  return phases;
}

/**
 * The plan's days folded: per phase, one row for each set of days that eat the same (a phase of four
 * weeks is two or three rows: its training days, its rest days, any day changed on its own). A meal
 * opens for all the days of its row: `onEditMeal(dates, slot)`.
 */
export default function FeedingGroupsTable({ days, onEditMeal, edited = () => false }) {
  const phases = groupDays(days);
  return (
    <div className="light-surface-box overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[190px]" />
          {SLOTS.map((s) => (
            <col key={s} />
          ))}
          <col className="w-[84px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-3 py-1.5">Nhóm ngày</th>
            {SLOTS.map((s) => (
              <th key={s} className="px-3 py-1.5">
                {SLOT_LABELS[s]}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-1.5 text-right">Mỗi ngày</th>
          </tr>
        </thead>
        {phases.map((p, pi) => {
          const training = p.days.filter((d) => d.work !== 'rest').length;
          return (
            <tbody key={`${p.phase}-${pi}`}>
              <tr>
                <td colSpan={5} className="border-y border-gray-200 bg-gray-50 px-3 py-1">
                  <div className="flex flex-wrap items-center gap-x-3 border-l-4 pl-2 text-[11px]" style={{ borderColor: PHASE_COLORS[p.phase] || '#999' }}>
                    <span className="font-semibold text-gray-900">{PHASE_LABELS[p.phase] || p.phase}</span>
                    <span className="tabular-nums text-gray-600">
                      {ddmm(p.days[0].date)} – {ddmm(p.days.at(-1).date)} · {p.days.length} ngày
                    </span>
                    <span className="text-gray-500">
                      {training} ngày tập · {p.days.length - training} ngày nghỉ
                    </span>
                  </div>
                </td>
              </tr>
              {p.groups.map((g) => (
                <tr key={g.key} className="border-b border-gray-100 align-top">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${WORK_DOT[g.work] || 'bg-gray-300'}`} aria-hidden />
                      {g.dates.length === 1 ? dayLabel(g.dates[0]) : `${WORK_LABELS[g.work]} · ${g.dates.length} ngày`}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-4 text-gray-600">
                      {g.dates.length === 1 ? WORK_LABELS[g.work] : null}
                      {g.kinds.size > 0 && `${g.dates.length === 1 ? ' · ' : ''}${[...g.kinds].join(', ')}`}
                    </div>
                    {g.dates.length > 1 && (
                      <Tooltip title={g.dates.map((d) => ddmm(d)).join(', ')}>
                        <div className="mt-0.5 cursor-default text-[10px] leading-4 tabular-nums text-gray-500">
                          {g.dates.slice(0, SHOWN_DATES).map((d) => ddmm(d)).join(', ')}
                          {g.dates.length > SHOWN_DATES ? ` … +${g.dates.length - SHOWN_DATES}` : ''}
                        </div>
                      </Tooltip>
                    )}
                  </td>
                  {SLOTS.map((slot) => {
                    const meal = g.first.meals.find((m) => m.slot === slot);
                    if (!meal && !onEditMeal && !(g.first.removedSlots || []).includes(slot)) {
                      return (
                        <td key={slot} className="px-3 py-1.5 text-xs text-gray-300">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={slot} className="px-1.5 py-1">
                        <MealCell
                          meal={meal}
                          removed={!meal}
                          locked={g.first.locked?.[slot]}
                          edited={Boolean(meal) && edited(g.first.date, slot)}
                          onEdit={onEditMeal ? () => onEditMeal(g.dates, slot) : null}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right text-[11px] leading-4 tabular-nums text-gray-700">
                    {dayTotals(g.first.meals).map(([unit, n]) => (
                      <div key={unit}>
                        <b>{amountText(n)}</b> {unit}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
