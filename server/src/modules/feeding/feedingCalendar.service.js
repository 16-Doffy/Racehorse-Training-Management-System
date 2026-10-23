const TrainingPlan = require('../../models/TrainingPlan');
const Horse = require('../../models/Horse');
const InventoryItem = require('../../models/InventoryItem');
const FeedingSchedule = require('../../models/FeedingSchedule');
const FeedingCalendarDay = require('../../models/FeedingCalendarDay');
const StableAssignment = require('../../models/StableAssignment');
const DailyTask = require('../../models/DailyTask');
const clubPolicy = require('../../config/clubPolicy');
const { dayBounds, taskTiming } = require('../../utils/taskTiming');
const { ensureFeedingTasks, DEFAULT_MEAL_TIMES } = require('../../realtime/dailyTaskGenerator');
const { notifyCaretaker } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');

const { SLOTS, weightWarning, trainingDayWork, workOf, pickFeed, pickSupplements, dayMeals, weekNeed } = require('./rationRules');
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const atDay = (key) => new Date(`${key}T00:00:00`);

async function buildCalendar(plan, { times = {} } = {}) {
  const [horse, stock, rations, assignment] = await Promise.all([
    Horse.findById(plan.horse).select('name weightKg isArchived'),
    InventoryItem.find({ category: 'feed', isActive: { $ne: false } }).select('name quantity unit feedType expiryDate isActive'),
    FeedingSchedule.find({ horse: plan.horse }).select('mealTime timeOfDay items'),
    StableAssignment.findOne({ horse: plan.horse }).populate('assignedCaretaker', 'name isActive'),
  ]);
  const problems = [];
  if (!horse || horse.isArchived) problems.push('Ngựa không còn được quản lý.');
  if (!horse?.weightKg || horse.weightKg <= 0) problems.push('Chưa có cân nặng của ngựa để tính khẩu phần.');
  if (!assignment?.assignedCaretaker?.isActive) problems.push('Chưa có nhân viên chăm sóc đang hoạt động.');
  const bySlot = new Map(rations.map((r) => [r.mealTime, r]));
  const clocks = Object.fromEntries(SLOTS.map((slot) => [slot, times[slot] || bySlot.get(slot)?.timeOfDay || DEFAULT_MEAL_TIMES[slot]]));
  const ranges = { morning: [0, 660], noon: [660, 960], evening: [960, 1440] };
  const minutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  for (const slot of SLOTS) {
    const clock = clocks[slot];
    if (typeof clock !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock) || minutes(clock) < ranges[slot][0] || minutes(clock) >= ranges[slot][1]) {
      problems.push(`Giờ ${slot === 'morning' ? 'sáng' : slot === 'noon' ? 'trưa' : 'chiều'} không hợp lệ.`);
    }
  }
  // rationRules.js: the item the horse already eats, else enough for a week, expiring first, then the fullest.
  const today0 = dayBounds(new Date()).start;
  const keep = rations.flatMap((r) => r.items || []).map((i) => String(i.inventoryItem));
  const forage = pickFeed(stock, 'forage', { keep, weekNeed: weekNeed(horse?.weightKg, 'forage'), day: today0 });
  const concentrate = pickFeed(stock, 'concentrate', { keep, weekNeed: weekNeed(horse?.weightKg, 'concentrate'), day: today0 });
  const supplements = pickSupplements(stock, today0);
  if (!forage) problems.push('Kho chưa có cỏ đang sử dụng, đơn vị kg.');
  if (!concentrate) problems.push('Kho chưa có thức ăn tinh đang sử dụng, đơn vị kg.');

  const phases = TrainingPlan.phasesOf(plan);
  const start = new Date(plan.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(plan.endDate || phases.at(-1)?.endDate);
  end.setHours(0, 0, 0, 0);
  const today = dayBounds(new Date()).start;
  const days = [];
  // Eight phases of at most 12 weeks: bounded independently from malformed legacy plan dates.
  for (let cursor = new Date(start); cursor <= end && days.length < 672; cursor.setDate(cursor.getDate() + 1)) {
    const phase = phases.find((p) => cursor >= dayBounds(p.startDate).start && cursor <= dayBounds(p.endDate).start) || phases.at(-1);
    if (!phase) break;
    const work = workOf(phase, cursor);
    const meals = dayMeals({ weightKg: horse?.weightKg, work, phase, clocks, feeds: { forage, concentrate, supplements } });
    days.push({ date: dateKey(cursor), phase: phase.key, work, past: cursor < today, meals });
  }
  if (!days.length) problems.push('Kế hoạch không có ngày hợp lệ để xếp lịch ăn.');
  if (end >= start && days.length === 672 && dateKey(end) !== days.at(-1).date) problems.push('Kế hoạch vượt quá 672 ngày.');
  for (let i = 0; i < SLOTS.length; i += 1) {
    for (let j = i + 1; j < SLOTS.length; j += 1) {
      if (Math.abs(minutes(clocks[SLOTS[i]]) - minutes(clocks[SLOTS[j]])) < clubPolicy.mealMinGapHours * 60) problems.push('Giờ các bữa chưa cách nhau đủ theo quy định CLB.');
    }
  }
  // A missing weight is a problem above; a weight out of range is shown on its own, before confirming.
  const weightNote = horse?.weightKg > 0 ? weightWarning(horse.weightKg) : null;
  const warnings = [];
  for (const item of [forage, concentrate, ...supplements.map((x) => x.item)].filter(Boolean)) {
    const needed = days.filter((d) => !d.past).flatMap((d) => d.meals).flatMap((m) => m.items)
      .filter((i) => String(i.inventoryItem) === String(item._id)).reduce((n, i) => n + i.amount, 0);
    if (item.quantity < needed) warnings.push(`${item.name}: kho còn ${item.quantity} ${item.unit}, cả kỳ dự kiến cần ${Math.round(needed * 10) / 10} ${item.unit}. Quản lý cần bổ sung trước các bữa sau.`);
  }
  return { horse, caretaker: assignment?.assignedCaretaker || null, days, problems: [...new Set(problems)], warnings, weightNote };
}

async function calendarView(plan) {
  const preview = await buildCalendar(plan);
  const confirmed = await FeedingCalendarDay.find({ plan: plan._id }).select('date meals approvedPlanUpdatedAt').lean();
  const byDate = new Map(confirmed.map((d) => [d.date, d]));
  return {
    plan: { _id: plan._id, horse: plan.horse, status: plan.status, updatedAt: plan.updatedAt, startDate: plan.startDate, endDate: plan.endDate },
    horse: preview.horse ? { _id: preview.horse._id, name: preview.horse.name, weightKg: preview.horse.weightKg } : null,
    caretaker: preview.caretaker ? { _id: preview.caretaker._id, name: preview.caretaker.name } : null,
    problems: preview.problems,
    warnings: preview.warnings,
    weightNote: preview.weightNote,
    days: preview.days.map((d) => ({ ...d, approved: Boolean(byDate.get(d.date)), stale: Boolean(byDate.get(d.date) && new Date(byDate.get(d.date).approvedPlanUpdatedAt) < new Date(plan.updatedAt)),
      meals: byDate.get(d.date)?.meals || d.meals })),
  };
}

async function confirmCalendar({ plan, actor, expectedUpdatedAt, times }) {
  if (String(new Date(expectedUpdatedAt).getTime()) !== String(new Date(plan.updatedAt).getTime())) return { error: 'Kế hoạch đã thay đổi. Tải lại lịch trước khi xác nhận.', status: 409 };
  if (plan.status !== 'active') return { error: 'Hãy áp dụng kế hoạch huấn luyện trước khi xác nhận lịch ăn.', status: 409 };
  if (times && (typeof times !== 'object' || Array.isArray(times) || Object.keys(times).some((slot) => !SLOTS.includes(slot)))) return { error: 'Giờ cho ăn không hợp lệ.', status: 400 };
  const preview = await buildCalendar(plan, { times });
  if (preview.problems.length) return { error: preview.problems.join(' '), status: 409 };
  const today = dayBounds(new Date()).start;
  const future = preview.days.filter((d) => atDay(d.date) >= today);
  const previous = await FeedingCalendarDay.find({ horse: plan.horse, date: { $gte: dateKey(today) } }).lean();
  const previousByDate = new Map(previous.map((d) => [d.date, d]));
  const todayTasks = await DailyTask.find({ horse: plan.horse, taskType: 'feeding', makeUpOf: null, scheduledDate: { $gte: today, $lt: dayBounds(new Date(today.getTime() + 86400000)).start } });
  const locked = new Map(todayTasks.filter((t) => t.status !== 'pending' || taskTiming(t).state === 'missed').map((t) => [t.mealSlot, t]));
  const effective = future.map((day) => {
    const old = previousByDate.get(day.date);
    const meals = day.meals.map((m) => {
        const edited = String(old?.plan || '') === String(plan._id) ? old?.meals.find((o) => o.slot === m.slot && o.edited) : null;
        const proposed = edited ? { ...edited, time: times?.[m.slot] || edited.time } : m;
        if (day.date !== dateKey(today)) return proposed;
        const task = locked.get(m.slot);
        if (!task) return proposed;
        return old?.meals.find((o) => o.slot === m.slot) || {
          slot: m.slot,
          time: `${String(task.scheduledDate.getHours()).padStart(2, '0')}:${String(task.scheduledDate.getMinutes()).padStart(2, '0')}`,
          items: (task.supplies || []).map((i) => ({ inventoryItem: i.inventoryItem, name: i.name, amount: i.amount, unit: i.unit })),
        };
      });
    return { ...day, meals };
  });
  const minute = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  if (effective.some((day) => day.meals.some((meal, i) => day.meals.slice(i + 1).some((other) => Math.abs(minute(meal.time) - minute(other.time)) < clubPolicy.mealMinGapHours * 60)))) {
    return { error: 'Giờ bữa đã chỉnh riêng quá gần giờ bữa khác. Hãy sửa ngày đó rồi xác nhận lại.', status: 409 };
  }
  const signature = (meals) => JSON.stringify(meals.map((m) => ({ slot: m.slot, time: m.time, items: m.items.map((i) => `${i.inventoryItem}:${i.amount}`) })));
  const changed = effective.filter((d) => {
    const old = previousByDate.get(d.date);
    return !old || old.plan.toString() !== String(plan._id) || old.phase !== d.phase || old.work !== d.work || signature(old.meals) !== signature(d.meals);
  });
  const ops = effective.map((day) => ({ updateOne: { filter: { horse: plan.horse, date: day.date }, update: { $set: { plan: plan._id, phase: day.phase, work: day.work, meals: day.meals, approvedBy: actor._id, approvedPlanUpdatedAt: plan.updatedAt } }, upsert: true } }));
  if (ops.length) await FeedingCalendarDay.bulkWrite(ops, { ordered: false });
  const newDates = new Set(future.map((d) => d.date));
  const obsolete = previous.filter((d) => !newDates.has(d.date) && atDay(d.date) > today);
  if (obsolete.length) await FeedingCalendarDay.deleteMany({ _id: { $in: obsolete.map((d) => d._id) } });
  await ensureFeedingTasks({ horseIds: [plan.horse] });
  if (changed.length || obsolete.length) {
    await notifyCaretaker({ horse: plan.horse, type: 'task_assigned', severity: 'info',
      message: `${actor.name} đã xác nhận lịch cho ăn của ${preview.horse.name} từ ${future[0]?.date || ''} đến ${future.at(-1)?.date || ''}. Xem bữa hôm nay trong mục Cho ăn; chỉ ghi nhận từ giờ hẹn.` });
  }
  await logAction({ actorId: actor._id, action: 'feeding.calendar_confirm', targetModel: 'TrainingPlan', targetId: plan._id, metadata: { days: future.length, changed: changed.length } });
  return { days: future.length, changed: changed.length };
}

/**
 * One meal as the rules suggest it (rationRules.js), for the single-ration form. That ration stands
 * every day, so it is set for a training day of the current phase of the horse's active plan (no plan:
 * a rest day); the dated calendar above lowers the rest days. Returns { phase, work, weightKg,
 * warning, sessionTime, daily: { forage, concentrate }, items }.
 */
async function suggestMeal({ horseId, slot }) {
  const [horse, plan, stock, rations] = await Promise.all([
    Horse.findById(horseId).select('name weightKg'),
    TrainingPlan.findOne({ horse: horseId, status: 'active' }),
    InventoryItem.find({ category: 'feed', isActive: { $ne: false } }).select('name quantity unit feedType expiryDate isActive'),
    FeedingSchedule.find({ horse: horseId }).select('mealTime timeOfDay items'),
  ]);
  const today = dayBounds(new Date()).start;
  const phase = plan ? TrainingPlan.phasesOf(plan).find((p) => today >= dayBounds(p.startDate).start && today <= dayBounds(p.endDate).start) || null : null;
  const work = trainingDayWork(phase);
  const keep = rations.flatMap((r) => r.items || []).map((i) => String(i.inventoryItem));
  const feeds = {
    forage: pickFeed(stock, 'forage', { keep, weekNeed: weekNeed(horse?.weightKg, 'forage'), day: today }),
    concentrate: pickFeed(stock, 'concentrate', { keep, weekNeed: weekNeed(horse?.weightKg, 'concentrate'), day: today }),
    supplements: pickSupplements(stock, today),
  };
  const clocks = Object.fromEntries(SLOTS.map((s) => [s, rations.find((r) => r.mealTime === s)?.timeOfDay || DEFAULT_MEAL_TIMES[s]]));
  const meals = dayMeals({ weightKg: horse?.weightKg, work, phase, clocks, feeds });
  const lines = meals.flatMap((m) => m.items);
  const perDay = (item) => (item ? Math.round(lines.filter((i) => String(i.inventoryItem) === String(item._id)).reduce((n, i) => n + i.amount, 0) * 10) / 10 : 0);
  return {
    phase: phase?.key || null,
    work,
    weightKg: horse?.weightKg || null,
    warning: weightWarning(horse?.weightKg),
    sessionTime: plan?.sessionTime || null,
    daily: { forage: perDay(feeds.forage), concentrate: perDay(feeds.concentrate) },
    items: meals.find((m) => m.slot === slot)?.items || [],
  };
}

module.exports = { calendarView, confirmCalendar, suggestMeal, dateKey };
