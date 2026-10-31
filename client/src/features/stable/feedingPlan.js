import dayjs from 'dayjs';
import { WEEK_DAYS } from '../training/trainingVocab';

// The words of a horse's feeding plan (server: feedingCalendar.service.js, rationRules.js).
export const SLOTS = ['morning', 'noon', 'evening'];
export const SLOT_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
export const SLOT_SHORT = { morning: 'Sáng', noon: 'Trưa', evening: 'Chiều' };
export const DEFAULT_MEAL_TIMES = { morning: '06:00', noon: '11:30', evening: '17:30' };
// Mirrors mealInput.js: breakfast before 11:00, lunch 11:00–15:59, the evening meal from 16:00.
export const SLOT_MINUTES = { morning: [0, 11 * 60], noon: [11 * 60, 16 * 60], evening: [16 * 60, 24 * 60] };
export const SLOT_RANGE_TEXT = { morning: 'trước 11:00', noon: 'từ 11:00 đến 15:59', evening: 'từ 16:00 trở đi' };
export const WORK_LABELS = { rest: 'Nghỉ tập', light: 'Tập nhẹ', moderate: 'Tập vừa', high: 'Tập nặng' };
export const WORK_COLORS = { rest: 'default', light: 'green', moderate: 'gold', high: 'red' };
// What each meal is for (rationRules.js), said once in the planner.
export const MEAL_ROLES = {
  morning: 'Trước giờ tập: chủ yếu cỏ, ít thức ăn tinh để kịp tiêu hóa.',
  noon: 'Bữa phụ, nhẹ.',
  evening: 'Bữa chính (sau giờ tập, cho cả đêm dài), kèm chất bổ sung.',
};

export const minutesOf = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
export const amountText = (n) => Number(Math.round(n * 100) / 100).toLocaleString('vi-VN');
export const idOf = (ref) => String(ref?._id || ref || '');
/** The plan's last day: its end date, else the end of its last phase. */
export const planEnd = (plan) => plan?.endDate || plan?.phases?.at(-1)?.endDate || null;
export const weekDayOf = (date) => WEEK_DAYS.find((w) => w.day === dayjs(date).day())?.short || '';
/** "T4 05/11" */
export const dayLabel = (date) => `${weekDayOf(date)} ${dayjs(date).format('DD/MM')}`;

/** Whether every line of a meal names a stock item and a positive amount. */
export const itemsComplete = (items) => (items || []).length > 0 && items.every((i) => idOf(i.inventoryItem) && Number(i.amount) > 0);
export const itemsKey = (items) => (items || []).map((i) => `${idOf(i.inventoryItem)}:${i.amount}`).join('|');
export const sameMeal = (a, b) => Boolean(a && b) && a.time === b.time && itemsKey(a.items) === itemsKey(b.items);

/**
 * Whether a day's meal times fit their parts of the day and the club's gap between meals (the server
 * refuses the same: mealInput.js). Returns the problem in words, or null.
 */
export function mealTimesProblem(meals, gapHours) {
  for (const m of meals) {
    const [from, to] = SLOT_MINUTES[m.slot];
    if (!/^\d{2}:\d{2}$/.test(m.time || '')) return `${SLOT_LABELS[m.slot]} chưa có giờ.`;
    if (minutesOf(m.time) < from || minutesOf(m.time) >= to) return `${SLOT_LABELS[m.slot]} phải ${SLOT_RANGE_TEXT[m.slot]} (đang chọn ${m.time}).`;
  }
  for (let i = 0; i < meals.length; i += 1) {
    for (let j = i + 1; j < meals.length; j += 1) {
      if (Math.abs(minutesOf(meals[i].time) - minutesOf(meals[j].time)) < gapHours * 60) {
        return `${SLOT_LABELS[meals[i].slot]} ${meals[i].time} và ${SLOT_LABELS[meals[j].slot].toLowerCase()} ${meals[j].time} cách nhau chưa đủ ${gapHours} giờ (quy định CLB).`;
      }
    }
  }
  return null;
}

/** A day's amounts by unit across its meals: [["kg", 9.5], ["lít", 0.1]]. */
export function dayTotals(meals) {
  const byUnit = new Map();
  for (const i of (meals || []).flatMap((m) => m.items || [])) byUnit.set(i.unit, (byUnit.get(i.unit) || 0) + Number(i.amount || 0));
  return [...byUnit];
}

/**
 * What the days take of each stock item, against what is in stock now:
 * [{ id, name, unit, needed, inStock, short }], the most needed first.
 */
export function stockNeed(days, feedItems) {
  const need = new Map();
  for (const meal of days.flatMap((d) => d.meals || [])) {
    for (const i of meal.items || []) {
      const id = idOf(i.inventoryItem);
      const row = need.get(id) || { id, name: i.name, unit: i.unit, needed: 0 };
      row.needed += Number(i.amount || 0);
      need.set(id, row);
    }
  }
  const stock = new Map(feedItems.map((f) => [String(f._id), f]));
  return [...need.values()]
    .map((r) => {
      const item = stock.get(r.id);
      const inStock = typeof item?.quantity === 'number' ? item.quantity : null;
      return { ...r, name: item?.name || r.name, unit: item?.unit || r.unit, needed: Math.round(r.needed * 10) / 10, inStock, short: inStock != null && inStock < r.needed };
    })
    .sort((a, b) => b.needed - a.needed);
}
