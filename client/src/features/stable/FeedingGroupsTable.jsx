import { Tooltip } from 'antd';
import { CalendarOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PHASE_COLORS, PHASE_LABELS, SESSION_KINDS } from '../training/trainingVocab';
import { MealCell } from './FeedingDaysTable';
import { SLOTS, SLOT_LABELS, WORK_LABELS, amountText, dayLabel, dayTotals, dayWork, itemsKey } from './feedingPlan';
import './ration.css';

const ddmm = (date) => dayjs(date).format('DD/MM');
const SHOWN_DATES = 3;

/** The days with the same work and the same meals, phase by phase, in the order they first come. */
function groupDays(days) {
  const phases = [];
  for (const day of days) {
    if (phases.at(-1)?.phase !== day.phase) phases.push({ phase: day.phase, days: [], groups: [] });
    const p = phases.at(-1);
    p.days.push(day);
    const key = [
      dayWork(day),
      ...SLOTS.map((slot) => {
        const m = day.meals.find((x) => x.slot === slot);
        return m ? `${slot}@${m.time}:${itemsKey(m.items)}:${day.locked?.[slot] || ''}` : `${slot}:-`;
      }),
    ].join('|');
    let g = p.groups.find((x) => x.key === key);
    if (!g) {
      g = { key, work: dayWork(day), first: day, dates: [], kinds: new Set() };
      p.groups.push(g);
    }
    g.dates.push(day.date);
    for (const s of day.diet === 'sick' ? [] : day.sessions || []) g.kinds.add(`${SESSION_KINDS[s.kind]?.short || s.kind}${s.at ? ` ${s.at}${s.until ? `–${s.until}` : ''}` : s.slot === 'afternoon' ? ' (chiều)' : ''}`);
  }
  return phases;
}

/**
 * The plan's days folded: a card per phase, and in it a card for each set of days that eat the same (a
 * phase of four weeks is two or three: its training days, its rest days, any day changed on its own) with
 * its three meals side by side. Why the ration is what it is, and every date of a group, are on hover. A
 * meal opens for all the days of its group: `onEditMeal(dates, slot)`.
 */
export default function FeedingGroupsTable({ days, onEditMeal, edited = () => false }) {
  const phases = groupDays(days);
  return (
    <div className="rp-groups">
      {phases.map((p, pi) => {
        const training = p.days.filter((d) => d.work !== 'rest').length;
        return (
          <section key={`${p.phase}-${pi}`} className="rp-phase" style={{ '--phase': PHASE_COLORS[p.phase] || '#94a3b8' }}>
            <header className="rp-phase-head">
              <span className="rp-phase-name">{PHASE_LABELS[p.phase] || p.phase}</span>
              <span className="rp-phase-when">
                {ddmm(p.days[0].date)} – {ddmm(p.days.at(-1).date)} · {p.days.length} ngày
              </span>
              <span className="rp-phase-count">
                <span>{training} ngày tập</span>
                <span>{p.days.length - training} ngày nghỉ</span>
              </span>
            </header>
            <div className="rp-phase-body">
              {p.groups.map((g) => (
                <div key={g.key} className="rp-group">
                  <div className="rp-group-head">
                    <span className={`rp-work is-${g.work}`}>{g.dates.length === 1 ? `${dayLabel(g.dates[0])} · ${WORK_LABELS[g.work]}` : `${WORK_LABELS[g.work]} · ${g.dates.length} ngày`}</span>
                    {g.kinds.size > 0 && <span className="rp-sessions">{[...g.kinds].join(', ')}</span>}
                    {g.first?.rationNote && (
                      <Tooltip title={g.first.rationNote}>
                        <span className="rp-why" tabIndex={0}>
                          <InfoCircleOutlined /> Vì sao
                        </span>
                      </Tooltip>
                    )}
                    {g.dates.length > 1 && (
                      <Tooltip title={g.dates.map((d) => ddmm(d)).join(', ')}>
                        <span className="rp-dates" tabIndex={0}>
                          <CalendarOutlined /> {g.dates.slice(0, SHOWN_DATES).map((d) => ddmm(d)).join(', ')}
                          {g.dates.length > SHOWN_DATES ? ` +${g.dates.length - SHOWN_DATES}` : ''}
                        </span>
                      </Tooltip>
                    )}
                    <span className="rp-total">
                      {dayTotals(g.first.meals)
                        .map(([unit, n]) => `${amountText(n)} ${unit}`)
                        .join(' + ') || '—'}{' '}
                      / ngày
                    </span>
                  </div>
                  <div className="rp-meals">
                    {SLOTS.map((slot) => {
                      const meal = g.first.meals.find((m) => m.slot === slot);
                      const removed = !meal;
                      return (
                        <div key={slot} className="rp-meal">
                          <span className="rp-meal-label">{SLOT_LABELS[slot]}</span>
                          {removed && !onEditMeal && !(g.first.removedSlots || []).includes(slot) ? (
                            <span className="px-1.5 text-xs text-gray-400">—</span>
                          ) : (
                            <MealCell meal={meal} removed={removed} locked={g.first.locked?.[slot]} edited={Boolean(meal) && edited(g.first.date, slot)} onEdit={onEditMeal ? () => onEditMeal(g.dates, slot) : null} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
