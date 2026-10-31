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
const { SLOT_LABELS, stockFor, readItemsWith, mealSetProblem } = require('./mealInput');

const { SLOTS, weightWarning, trainingDayWork, workOf, pickFeed, pickSupplements, dayMeals, weekNeed } = require('./rationRules');
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const atDay = (key) => new Date(`${key}T00:00:00`);
const clockOf = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const signature = (meals) => JSON.stringify(meals.map((m) => ({ slot: m.slot, time: m.time, items: m.items.map((i) => `${i.inventoryItem}:${i.amount}`) })));
const sameItems = (a, b) => signature([{ slot: '', time: '', items: a || [] }]) === signature([{ slot: '', time: '', items: b || [] }]);
const bySlotOrder = (a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);
const plainMeal = (m) => ({ slot: m.slot, time: m.time, items: (m.items || []).map((i) => ({ inventoryItem: i.inventoryItem, name: i.name, amount: i.amount, unit: i.unit })), edited: Boolean(m.edited) });

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
  const clockProblem = mealSetProblem(clocks);
  if (clockProblem) problems.push(clockProblem);
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
    // The work the plan's week template puts on this day, so the planner reads the meals beside it.
    const sessions = (phase.week || []).filter((w) => Number(w.day) === cursor.getDay()).map((w) => ({ kind: w.kind, slot: w.slot || 'morning', distanceM: w.distanceM || null }));
    days.push({ date: dateKey(cursor), phase: phase.key, work, sessions, past: cursor < today, meals });
  }
  if (!days.length) problems.push('Kế hoạch không có ngày hợp lệ để xếp lịch ăn.');
  if (end >= start && days.length === 672 && dateKey(end) !== days.at(-1).date) problems.push('Kế hoạch vượt quá 672 ngày.');
  // A missing weight is a problem above; a weight out of range is shown on its own, before confirming.
  const weightNote = horse?.weightKg > 0 ? weightWarning(horse.weightKg) : null;
  return {
    horse,
    caretaker: assignment?.assignedCaretaker || null,
    stall: assignment?.stableBlock || null,
    clocks,
    phases: phases.map((p) => ({ key: p.key, startDate: dateKey(dayBounds(p.startDate).start), endDate: dateKey(dayBounds(p.endDate).start), intensity: trainingDayWork(p), trainDays: [...new Set((p.week || []).map((w) => Number(w.day)))].sort() })),
    feeds: { forage, concentrate, supplements: supplements.map((s) => s.item) },
    stock,
    days,
    problems: [...new Set(problems)],
    weightNote,
  };
}

/** Today's meals already given, skipped or missed: they stay as they happened, whatever is confirmed. */
async function lockedToday(horseId) {
  const { start, end } = dayBounds(new Date());
  const tasks = await DailyTask.find({ horse: horseId, taskType: 'feeding', makeUpOf: null, mealSlot: { $ne: null }, scheduledDate: { $gte: start, $lt: end } });
  const locked = new Map();
  for (const t of tasks) {
    const state = t.status === 'completed' ? 'fed' : t.status === 'skipped' ? 'skipped' : taskTiming(t).state === 'missed' ? 'missed' : null;
    if (state) locked.set(t.mealSlot, { state, task: t });
  }
  return locked;
}

/**
 * The plan's days from today as confirming would save them:
 * - a day the trainer set in the planner (`overrides`), as they set it — a meal they left out is not given;
 * - else a day already confirmed for this version of the plan, as it was confirmed (new meal times applied);
 * - else the rules' day, keeping the meals the trainer edited and left out on an earlier confirmation of
 *   this plan (`fresh` drops those: everything back to the rules);
 * - today, a meal already given, skipped or missed stays as it happened.
 * Each day: { date, phase, work, sessions, meals, removedSlots, suggested }, `suggested` being the rules' meals.
 */
function mergeDays({ preview, saved, plan, times = {}, overrides = new Map(), fresh = false, locked = new Map() }) {
  const todayKey = dateKey(new Date());
  const withTime = (m) => (times[m.slot] ? { ...m, time: times[m.slot] } : m);
  return preview.days.filter((d) => !d.past).map((day) => {
    const old = fresh ? null : saved.get(day.date);
    const samePlan = Boolean(old) && String(old.plan) === String(plan._id);
    const current = samePlan && new Date(old.approvedPlanUpdatedAt) >= new Date(plan.updatedAt);
    const ruled = (slot) => day.meals.find((m) => m.slot === slot);
    let meals;
    let removedSlots;
    const override = overrides.get(day.date);
    if (override) {
      // The trainer's own day: a meal is marked edited where it is not what the rules give.
      meals = override.map((m) => ({ ...m, edited: !ruled(m.slot) || ruled(m.slot).time !== m.time || !sameItems(ruled(m.slot).items, m.items) }));
      removedSlots = SLOTS.filter((slot) => !override.some((m) => m.slot === slot));
    } else if (current) {
      meals = old.meals.map((m) => withTime(plainMeal(m)));
      removedSlots = old.removedSlots || [];
    } else {
      removedSlots = samePlan ? old.removedSlots || [] : [];
      meals = day.meals
        .filter((m) => !removedSlots.includes(m.slot))
        .map((m) => {
          const edited = samePlan ? old.meals.find((o) => o.slot === m.slot && o.edited) : null;
          return edited ? withTime(plainMeal(edited)) : { ...m, edited: false };
        });
    }
    if (day.date === todayKey) {
      for (const [slot, { task }] of locked) {
        const kept = (old || saved.get(day.date))?.meals.find((o) => o.slot === slot);
        const meal = kept
          ? plainMeal(kept)
          : { slot, time: clockOf(task.scheduledDate), items: (task.supplies || []).map((i) => ({ inventoryItem: i.inventoryItem, name: i.name, amount: i.amount, unit: i.unit })), edited: false };
        meals = [...meals.filter((m) => m.slot !== slot), meal];
        removedSlots = removedSlots.filter((s) => s !== slot);
      }
    }
    return { date: day.date, phase: day.phase, work: day.work, sessions: day.sessions, meals: meals.sort(bySlotOrder), removedSlots, suggested: day.meals };
  });
}

/** What each stock item the days use would need, against what is in stock (a line per item that runs short). */
function stockWarnings(days, stock) {
  const need = new Map();
  for (const meal of days.flatMap((d) => d.meals)) {
    for (const i of meal.items) need.set(String(i.inventoryItem), (need.get(String(i.inventoryItem)) || 0) + i.amount);
  }
  const warnings = [];
  for (const [id, needed] of need) {
    const item = stock.find((s) => String(s._id) === id);
    if (item && item.quantity < needed) warnings.push(`${item.name}: kho còn ${item.quantity} ${item.unit}, cả kỳ dự kiến cần ${Math.round(needed * 10) / 10} ${item.unit}. Quản lý cần bổ sung trước các bữa sau.`);
  }
  return warnings;
}

async function calendarView(plan) {
  const preview = await buildCalendar(plan);
  const [saved, locked] = await Promise.all([
    FeedingCalendarDay.find({ horse: plan.horse }).select('plan date meals removedSlots approvedPlanUpdatedAt').lean(),
    lockedToday(plan.horse),
  ]);
  const savedByDate = new Map(saved.map((d) => [d.date, d]));
  const ahead = mergeDays({ preview, saved: savedByDate, plan, locked });
  const aheadByDate = new Map(ahead.map((d) => [d.date, d]));
  const todayKey = dateKey(new Date());
  return {
    plan: { _id: plan._id, horse: plan.horse, status: plan.status, updatedAt: plan.updatedAt, startDate: plan.startDate, endDate: plan.endDate, goal: plan.goal || null, sessionTime: plan.sessionTime || null },
    horse: preview.horse ? { _id: preview.horse._id, name: preview.horse.name, weightKg: preview.horse.weightKg } : null,
    caretaker: preview.caretaker ? { _id: preview.caretaker._id, name: preview.caretaker.name } : null,
    stall: preview.stall,
    clocks: preview.clocks,
    phases: preview.phases,
    feeds: {
      forage: preview.feeds.forage ? { _id: preview.feeds.forage._id, name: preview.feeds.forage.name } : null,
      concentrate: preview.feeds.concentrate ? { _id: preview.feeds.concentrate._id, name: preview.feeds.concentrate.name } : null,
      supplements: preview.feeds.supplements.map((s) => ({ _id: s._id, name: s.name })),
    },
    problems: preview.problems,
    // Today's meals already given have left stock.
    warnings: stockWarnings(ahead.map((d) => (d.date === todayKey ? { ...d, meals: d.meals.filter((m) => !locked.has(m.slot)) } : d)), preview.stock),
    weightNote: preview.weightNote,
    days: preview.days.map((d) => {
      const own = savedByDate.get(d.date);
      const confirmed = own && String(own.plan) === String(plan._id) ? own : null;
      const approved = Boolean(confirmed);
      const stale = Boolean(confirmed && new Date(confirmed.approvedPlanUpdatedAt) < new Date(plan.updatedAt));
      if (d.past) return { ...d, approved, stale, meals: confirmed?.meals.map(plainMeal) || d.meals, removedSlots: confirmed?.removedSlots || [] };
      const day = aheadByDate.get(d.date);
      return {
        ...day,
        past: false,
        approved,
        stale,
        // Today's meals that already happened: the planner shows them and leaves them alone.
        ...(d.date === todayKey && locked.size ? { locked: Object.fromEntries([...locked].map(([slot, l]) => [slot, l.state])) } : {}),
      };
    }),
  };
}

/** The trainer's days from the planner: [{ date, meals: [{ slot, time, items }] }] → Map(date → meals), or { error }. */
async function readOverrides(raw, allowedDates) {
  if (raw === undefined || raw === null) return { overrides: new Map() };
  if (!Array.isArray(raw)) return { error: 'Danh sách ngày không hợp lệ.' };
  const byId = await stockFor(raw.flatMap((d) => (Array.isArray(d?.meals) ? d.meals.map((m) => m?.items) : [])));
  const overrides = new Map();
  for (const day of raw) {
    const date = String(day?.date || '');
    const label = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `Ngày ${date.slice(8, 10)}/${date.slice(5, 7)}` : 'Một ngày';
    if (!allowedDates.has(date)) return { error: `${label} không thuộc các ngày còn lại của kế hoạch.` };
    if (overrides.has(date)) return { error: `${label} có hai lần trong danh sách.` };
    if (!Array.isArray(day.meals) || !day.meals.length) return { error: `${label}: cần ít nhất một bữa.` };
    const meals = [];
    for (const m of day.meals) {
      if (!SLOTS.includes(m?.slot)) return { error: `${label}: bữa không hợp lệ.` };
      if (meals.some((x) => x.slot === m.slot)) return { error: `${label}: ${SLOT_LABELS[m.slot].toLowerCase()} có hai lần.` };
      const read = readItemsWith(m.items, byId);
      if (read.message) return { error: `${label}, ${SLOT_LABELS[m.slot].toLowerCase()}: ${read.message}` };
      meals.push({ slot: m.slot, time: m.time, items: read.items.map((i) => ({ inventoryItem: i.inventoryItem, name: i.type, amount: i.amount, unit: i.unit })) });
    }
    const problem = mealSetProblem(Object.fromEntries(meals.map((m) => [m.slot, m.time])));
    if (problem) return { error: `${label}: ${problem}` };
    overrides.set(date, meals.sort(bySlotOrder));
  }
  return { overrides };
}

/**
 * Confirms the plan's feeding days from today. `times` sets each meal's clock for every day; `days`
 * are the days the trainer changed in the planner, saved as they are; `fresh` puts every other day back
 * to the rules. Today's meals that already happened are left alone; a meal of today left out that is
 * still to be given leaves the groom's list.
 */
async function confirmCalendar({ plan, actor, expectedUpdatedAt, times, days: rawDays, fresh = false }) {
  if (String(new Date(expectedUpdatedAt).getTime()) !== String(new Date(plan.updatedAt).getTime())) return { error: 'Kế hoạch đã thay đổi. Tải lại lịch trước khi xác nhận.', status: 409 };
  if (plan.status !== 'active') return { error: 'Hãy áp dụng kế hoạch huấn luyện trước khi xác nhận lịch ăn.', status: 409 };
  if (times && (typeof times !== 'object' || Array.isArray(times) || Object.keys(times).some((slot) => !SLOTS.includes(slot)))) return { error: 'Giờ cho ăn không hợp lệ.', status: 400 };
  const preview = await buildCalendar(plan, { times });
  if (preview.problems.length) return { error: preview.problems.join(' '), status: 409 };
  const today = dayBounds(new Date()).start;
  const todayKey = dateKey(today);
  const future = preview.days.filter((d) => !d.past);
  const read = await readOverrides(rawDays, new Set(future.map((d) => d.date)));
  if (read.error) return { error: read.error, status: 400 };
  const previous = await FeedingCalendarDay.find({ horse: plan.horse, date: { $gte: todayKey } }).lean();
  const previousByDate = new Map(previous.map((d) => [d.date, d]));
  const locked = await lockedToday(plan.horse);
  const effective = mergeDays({ preview, saved: previousByDate, plan, times: times || {}, overrides: read.overrides, fresh: Boolean(fresh), locked });
  for (const day of effective) {
    if (!day.meals.length) return { error: `Ngày ${day.date.slice(8, 10)}/${day.date.slice(5, 7)} cần ít nhất một bữa.`, status: 400 };
    const problem = mealSetProblem(Object.fromEntries(day.meals.map((m) => [m.slot, m.time])));
    if (problem) return { error: `Ngày ${day.date.slice(8, 10)}/${day.date.slice(5, 7)}: ${problem}`, status: 409 };
  }
  const saveable = (meals) => meals.map(({ slot, time, items, edited }) => ({ slot, time, items, edited: Boolean(edited) }));
  const changed = effective.filter((d) => {
    const old = previousByDate.get(d.date);
    return !old || old.plan.toString() !== String(plan._id) || old.phase !== d.phase || old.work !== d.work || signature(old.meals) !== signature(d.meals);
  });
  const ops = effective.map((day) => ({
    updateOne: {
      filter: { horse: plan.horse, date: day.date },
      update: { $set: { plan: plan._id, phase: day.phase, work: day.work, meals: saveable(day.meals), removedSlots: day.removedSlots, approvedBy: actor._id, approvedPlanUpdatedAt: plan.updatedAt } },
      upsert: true,
    },
  }));
  if (ops.length) await FeedingCalendarDay.bulkWrite(ops, { ordered: false });
  const newDates = new Set(future.map((d) => d.date));
  const obsolete = previous.filter((d) => !newDates.has(d.date) && atDay(d.date) > today);
  if (obsolete.length) await FeedingCalendarDay.deleteMany({ _id: { $in: obsolete.map((d) => d._id) } });
  // A meal of today the trainer left out goes from the groom's list if it is still to be given.
  const todayLeftOut = effective.find((d) => d.date === todayKey)?.removedSlots || [];
  if (todayLeftOut.length) {
    const { start, end } = dayBounds(today);
    const open = await DailyTask.find({ horse: plan.horse, taskType: 'feeding', mealSlot: { $in: todayLeftOut }, status: 'pending', makeUpOf: null, scheduledDate: { $gte: start, $lt: end } });
    const removable = open.filter((t) => taskTiming(t).state !== 'missed');
    if (removable.length) await DailyTask.deleteMany({ _id: { $in: removable.map((t) => t._id) } });
  }
  await ensureFeedingTasks({ horseIds: [plan.horse] });
  if (changed.length || obsolete.length) {
    await notifyCaretaker({ horse: plan.horse, type: 'task_assigned', severity: 'info',
      message: `${actor.name} đã xác nhận lịch cho ăn của ${preview.horse.name} từ ${future[0]?.date || ''} đến ${future.at(-1)?.date || ''}. Xem bữa hôm nay trong mục Cho ăn; chỉ ghi nhận từ giờ hẹn.` });
  }
  await logAction({ actorId: actor._id, action: 'feeding.calendar_confirm', targetModel: 'TrainingPlan', targetId: plan._id, metadata: { days: future.length, changed: changed.length, edited: read.overrides.size, fresh: Boolean(fresh) } });
  return { days: future.length, changed: changed.length };
}

/**
 * The meals as the rules suggest them (rationRules.js), for the daily ration of a horse without a
 * calendar. That ration stands every day, so it is set for a training day of the current phase of the
 * horse's active plan (no plan: a rest day); the dated calendar lowers the rest days. Returns { phase,
 * work, weightKg, warning, sessionTime, daily: { forage, concentrate }, items (the slot's), meals (all three) }.
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
    meals,
  };
}

module.exports = { calendarView, confirmCalendar, suggestMeal, dateKey };
