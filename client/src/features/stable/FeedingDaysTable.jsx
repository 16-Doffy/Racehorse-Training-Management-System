import { Tag, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PHASE_COLORS, PHASE_LABELS, SESSION_KINDS } from '../training/trainingVocab';
import { MEAL_STATUS_META } from '../../constants/care';
import { SLOTS, SLOT_LABELS, WORK_LABELS, amountText, dayTotals, weekDayOf } from './feedingPlan';

const ddmm = (date) => dayjs(date).format('DD/MM');
// "Cỏ khô Timothy (Timothy Hay)" → "Cỏ khô Timothy": the stock name's bracketed part only lengthens the row.
const shortName = (name) => String(name || '').replace(/\s*\([^)]*\)\s*$/, '') || name;
const WORK_DOT = { rest: 'bg-gray-300', light: 'bg-emerald-500', moderate: 'bg-amber-500', high: 'bg-rose-500' };

export function MealCell({ meal, removed, locked, edited, onEdit }) {
  const clickable = Boolean(onEdit) && !locked;
  const content = removed ? (
    <span className="text-[11px] italic text-gray-400">
      Không cho ăn
      {clickable && (
        <span className="ml-1.5 not-italic text-emerald-700 opacity-0 group-hover:opacity-100">
          <PlusOutlined className="text-[10px]" /> Thêm lại
        </span>
      )}
    </span>
  ) : (
    <div className="flex gap-2">
      <span className="w-9 shrink-0 text-[11px] font-semibold tabular-nums text-gray-900">
        {meal.time}
        {edited && <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" title="Đã chỉnh khác gợi ý" />}
      </span>
      <div className="min-w-0 flex-1 text-[11px] leading-4 text-gray-700">
        {meal.items.map((i) => (
          <div key={`${i.inventoryItem?._id || i.inventoryItem}`} className="truncate" title={`${amountText(i.amount)} ${i.unit} ${i.name}`}>
            <b className="tabular-nums font-semibold text-gray-900">
              {amountText(i.amount)} {i.unit}
            </b>{' '}
            {shortName(i.name)}
          </div>
        ))}
        {locked && (
          <Tag color={MEAL_STATUS_META[locked]?.color} className="!mt-0.5 !mr-0 !px-1 !text-[10px] !leading-4">
            {MEAL_STATUS_META[locked]?.label}
          </Tag>
        )}
      </div>
    </div>
  );
  const fill = edited ? 'bg-amber-50' : '';
  if (!clickable) return <div className={`rounded-md px-1.5 py-1 ${fill}`}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={`group block w-full cursor-pointer rounded-md border-0 px-1.5 py-1 text-left hover:bg-emerald-50 hover:ring-1 hover:ring-emerald-500/40 ${fill || 'bg-transparent'}`}
      aria-label={removed ? 'Thêm lại bữa này' : 'Sửa bữa này'}
    >
      {content}
    </button>
  );
}

/**
 * A horse's feeding days beside its training, phase by phase, a compact row a day: the day's work, each
 * meal's time and foods with their amounts, and the day's total. With `onEditMeal(date, slot)` a meal
 * opens to be changed (the planner); without, it is read only. `edited(date, slot)` marks meals that are
 * not what the plan suggests (an amber dot and ground).
 */
export default function FeedingDaysTable({ days, phases = [], onEditMeal, edited = () => false }) {
  const today = dayjs().format('YYYY-MM-DD');
  const groups = [];
  for (const day of days) {
    if (groups.at(-1)?.phase !== day.phase) groups.push({ phase: day.phase, days: [] });
    groups.at(-1).days.push(day);
  }
  return (
    <div className="light-surface-box overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[148px]" />
          {SLOTS.map((s) => (
            <col key={s} />
          ))}
          <col className="w-[84px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-3 py-1.5">Ngày · lịch tập</th>
            {SLOTS.map((s) => (
              <th key={s} className="px-3 py-1.5">
                {SLOT_LABELS[s]}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-1.5 text-right">Cả ngày</th>
          </tr>
        </thead>
        {groups.map((g, gi) => {
          const info = phases.find((p) => p.key === g.phase && p.endDate >= g.days[0].date && p.startDate <= g.days.at(-1).date);
          const training = g.days.filter((d) => d.work !== 'rest').length;
          return (
            <tbody key={`${g.phase}-${gi}`}>
              <tr>
                <td colSpan={5} className="border-y border-gray-200 bg-gray-50 px-3 py-1">
                  <div className="flex flex-wrap items-center gap-x-3 border-l-4 pl-2 text-[11px]" style={{ borderColor: PHASE_COLORS[g.phase] || '#999' }}>
                    <span className="font-semibold text-gray-900">{PHASE_LABELS[g.phase] || g.phase}</span>
                    <span className="tabular-nums text-gray-600">
                      {ddmm(g.days[0].date)} – {ddmm(g.days.at(-1).date)}
                      {info && info.endDate !== g.days.at(-1).date ? ` (giai đoạn đến ${ddmm(info.endDate)})` : ''}
                    </span>
                    <span className="text-gray-500">
                      {training} ngày tập · {g.days.length - training} ngày nghỉ
                    </span>
                  </div>
                </td>
              </tr>
              {g.days.map((d) => {
                const isToday = d.date === today;
                const sessions = (d.sessions || []).map((s) => `${SESSION_KINDS[s.kind]?.short || s.kind}${s.slot === 'afternoon' ? ' (chiều)' : ''}`);
                return (
                  <tr key={d.date} className={`border-b border-gray-100 align-top ${isToday ? 'bg-emerald-50' : ''}`}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                        <span>{weekDayOf(d.date)}</span>
                        <span className="tabular-nums">{ddmm(d.date)}</span>
                        {isToday && <span className="rounded bg-[#0F5A43] px-1 text-[10px] font-semibold text-white">Hôm nay</span>}
                      </div>
                      <div className="mt-0.5 flex items-start gap-1.5 text-[11px] leading-4 text-gray-600">
                        <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${WORK_DOT[d.work] || 'bg-gray-300'}`} aria-hidden />
                        <span>
                          {WORK_LABELS[d.work]}
                          {sessions.length > 0 && ` · ${sessions.join(', ')}`}
                        </span>
                      </div>
                      {d.stale && (
                        <Tooltip title="Kế hoạch tập đã đổi sau khi xác nhận lịch ăn ngày này.">
                          <Tag color="gold" className="!mt-0.5 !mr-0 !px-1 !text-[10px] !leading-4">
                            Cần xác nhận lại
                          </Tag>
                        </Tooltip>
                      )}
                    </td>
                    {SLOTS.map((slot) => {
                      const meal = d.meals.find((m) => m.slot === slot);
                      const removed = !meal;
                      if (removed && !onEditMeal && !(d.removedSlots || []).includes(slot)) {
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
                            removed={removed}
                            locked={d.locked?.[slot]}
                            edited={!removed && edited(d.date, slot)}
                            onEdit={onEditMeal ? () => onEditMeal(d.date, slot) : null}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right text-[11px] leading-4 tabular-nums text-gray-700">
                      {dayTotals(d.meals).map(([unit, n]) => (
                        <div key={unit}>
                          <b>{amountText(n)}</b> {unit}
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
