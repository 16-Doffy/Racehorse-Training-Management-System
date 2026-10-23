const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const crudFactory = require('../../utils/crudFactory');
const FeedingSchedule = require('../../models/FeedingSchedule');
const FeedingCalendarDay = require('../../models/FeedingCalendarDay');
const TrainingPlan = require('../../models/TrainingPlan');
const { calendarView, confirmCalendar, suggestMeal, dateKey } = require('./feedingCalendar.service');
const { feedingTimetable } = require('./feedingTimetable.service');
const DailyTask = require('../../models/DailyTask');
const { ensureFeedingTasks, atClock, DEFAULT_MEAL_TIMES } = require('../../realtime/dailyTaskGenerator');
const { taskTiming, dayBounds } = require('../../utils/taskTiming');

const InventoryItem = require('../../models/InventoryItem');
const StableAssignment = require('../../models/StableAssignment');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, fail } = require('../../utils/apiResponse');
const { canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { logAction } = require('../audit/audit.service');
const { pushNotification } = require('../alerts/notification.service');
const clubPolicy = require('../../config/clubPolicy');

// The part of the day each meal belongs to: breakfast before 11:00, lunch 11:00–15:59, the
// evening meal from 16:00 — so "lunch at 23:00" cannot be saved.
const SLOT_MINUTES = { morning: [0, 11 * 60], noon: [11 * 60, 16 * 60], evening: [16 * 60, 24 * 60] };
const SLOT_RANGE_TEXT = { morning: 'trước 11:00', noon: 'từ 11:00 đến 15:59', evening: 'từ 16:00 trở đi' };
const SLOT_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/**
 * Ration items come from the stock list: each names a food item in stock and an amount per meal in
 * that item's unit. The display text (type, quantity) is written from the item, so screens that
 * only read those keep working. Older text-only items are kept as they are.
 */
async function readRationItems(rawItems) {
  if (!Array.isArray(rawItems)) return { message: 'items phải là danh sách.' };
  const ids = rawItems.map((i) => i?.inventoryItem).filter(Boolean);
  const stock = ids.length ? await InventoryItem.find({ _id: { $in: ids } }).select('name unit category isActive') : [];
  const byId = new Map(stock.map((s) => [String(s._id), s]));
  const items = [];
  for (const [i, raw] of rawItems.entries()) {
    if (!raw) continue;
    if (!raw.inventoryItem) return { message: `Món thứ ${i + 1}: chọn mặt hàng trong kho — món ghi bằng chữ không trừ kho được.` };
    const item = byId.get(String(raw.inventoryItem));
    if (!item) return { message: `Món thứ ${i + 1}: không tìm thấy mặt hàng trong kho.` };
    if (item.category !== 'feed') return { message: `Món thứ ${i + 1}: "${item.name}" không thuộc loại thức ăn.` };
    if (item.isActive === false) return { message: `Món thứ ${i + 1}: "${item.name}" đã ngừng sử dụng.` };
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { message: `Món thứ ${i + 1}: lượng mỗi bữa phải là số dương.` };
    items.push({ type: item.name, quantity: `${amount} ${item.unit}`, inventoryItem: item._id, amount, unit: item.unit });
  }
  if (!items.length) return { message: 'Khẩu phần cần ít nhất một món chọn từ kho.' };
  return { items };
}

async function normalizeRationItems(req, res, next) {
  try {
    // A ration is what the groom gives and what leaves stock: at least one line, each a stock item.
    if (req.body.items === undefined) {
      if (req.method === 'POST') return res.status(400).json({ success: false, data: null, message: 'Khẩu phần cần ít nhất một món chọn từ kho.' });
      return next();
    }
    const read = await readRationItems(req.body.items);
    if (read.message) return res.status(400).json({ success: false, data: null, message: read.message });
    req.body.items = read.items;
    return next();
  } catch (err) {
    return next(err);
  }
}

const rationSupplies = (items) =>
  (items || []).filter((i) => i.inventoryItem && i.amount).map((i) => ({ inventoryItem: i.inventoryItem, name: i.type, amount: i.amount, unit: i.unit }));

/**
 * One ration per horse per meal (two "breakfast" rations made the groom's day ambiguous); its time
 * fits the meal's part of the day; and it is at least mealMinGapHours (club policy) from the horse's
 * other meals, so the groom's windows and the digestion check stay meaningful.
 */
async function validateRation(req, { existing }) {
  const horse = req.body.horse || existing?.horse;
  const mealTime = req.body.mealTime || existing?.mealTime;
  if (!horse || !mealTime) return null;
  const approvedCalendar = await FeedingCalendarDay.exists({ horse, date: { $gte: dateKey(new Date()) } });
  if (approvedCalendar) return { status: 409, message: 'Ngựa đã có lịch ăn theo kế hoạch. Hãy sửa bữa trong lịch theo ngày ở phía trên.' };
  const others = await FeedingSchedule.find({ horse, ...(existing ? { _id: { $ne: existing._id } } : {}) }).select('mealTime timeOfDay');
  if (others.some((o) => o.mealTime === mealTime)) return 'Ngựa này đã có khẩu phần cho bữa đó — hãy sửa khẩu phần hiện có.';
  if (!SLOT_MINUTES[mealTime]) return null; // the schema refuses an unknown meal
  const clock = (req.body.timeOfDay !== undefined ? req.body.timeOfDay : existing?.timeOfDay) || DEFAULT_MEAL_TIMES[mealTime];
  if (typeof clock !== 'string' || !CLOCK.test(clock)) return { status: 400, message: 'Giờ cho ăn phải có dạng HH:mm.' };
  const at = minutesOf(clock);
  const [from, to] = SLOT_MINUTES[mealTime];
  if (at < from || at >= to) return { status: 400, message: `${SLOT_LABELS[mealTime]} phải ${SLOT_RANGE_TEXT[mealTime]} (đang chọn ${clock}).` };
  const gap = clubPolicy.mealMinGapHours * 60;
  for (const other of others) {
    const otherClock = other.timeOfDay || DEFAULT_MEAL_TIMES[other.mealTime];
    if (CLOCK.test(otherClock || '') && Math.abs(minutesOf(otherClock) - at) < gap) {
      return {
        status: 400,
        message: `${SLOT_LABELS[mealTime]} ${clock} quá gần ${SLOT_LABELS[other.mealTime].toLowerCase()} ${otherClock} — theo quy định CLB hai bữa cách nhau ít nhất ${clubPolicy.mealMinGapHours} giờ.`,
      };
    }
  }
  return null;
}

/**
 * Keeps today's meal task in step with the ration. Moving breakfast from 06:00 to 07:00 moves
 * today's still-open task with it; a meal that has already passed is left as it is. Then makes
 * sure today's task exists if its window is still open.
 */
async function syncTodayMeal(item) {
  const { start, end } = dayBounds(new Date());
  const at = atClock(start, item.timeOfDay || DEFAULT_MEAL_TIMES[item.mealTime]);
  const task = await DailyTask.findOne({
    horse: item.horse,
    taskType: 'feeding',
    mealSlot: item.mealTime,
    status: 'pending',
    makeUpOf: null,
    scheduledDate: { $gte: start, $lt: end },
  });
  if (task && taskTiming(task).state !== 'missed') {
    // Same meal, new time or new menu: today's still-open task follows the ration.
    if (task.scheduledDate.getTime() !== at.getTime()) task.dueNotifiedAt = null;
    task.scheduledDate = at;
    task.supplies = rationSupplies(item.items);
    await task.save();
  }
  await ensureFeedingTasks({ horseIds: [item.horse] });
}

const ctrl = crudFactory(FeedingSchedule, {
  populate: [
    { path: 'horse', select: 'name' },
    { path: 'approvedBy', select: 'name' },
    { path: 'items.inventoryItem', select: 'name unit quantity category' },
  ],
  label: 'Feeding schedule',
  scopeByHorse: true,
  // Only the Head Trainer or Manager may write a ration, so whoever saves it is its approver.
  // Without this, rations created through the UI stayed "pending" forever.
  stamp: (req) => ({ approvedBy: req.user._id }),
  validate: validateRation,
  // The groom should see the new meal on their list now, not after the next hourly run.
  afterWrite: syncTodayMeal,
  // Only these are the trainer's to write (approvedBy is stamped above). Without a list the whole
  // body went into the update, so a body wrapped in "$set" moved a ration past the horse-scope check.
  fields: ['horse', 'mealTime', 'timeOfDay', 'items'],
});

router.use(protect);
router.patch('/calendar/:planId/day/:date/:slot', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), asyncHandler(async (req, res) => {
  const { planId, date, slot } = req.params;
  if (!/^[0-9a-f]{24}$/i.test(planId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !SLOT_MINUTES[slot]) return fail(res, 'Ngày hoặc bữa không hợp lệ.', 400);
  const plan = await TrainingPlan.findById(planId);
  if (!plan || plan.status !== 'active') return fail(res, 'Kế hoạch không còn áp dụng.', 409);
  if (!(await canAccessHorse(req.user, plan.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (date < dateKey(new Date())) return fail(res, 'Không sửa được bữa của ngày đã qua.', 409);
  const calendar = await FeedingCalendarDay.findOne({ plan: planId, date });
  if (!calendar) return fail(res, 'Ngày này chưa được xác nhận trong lịch ăn.', 409);
  if (calendar.approvedPlanUpdatedAt < plan.updatedAt) return fail(res, 'Kế hoạch tập đã thay đổi. Hãy xác nhận lại lịch ăn toàn kỳ trước khi sửa bữa.', 409);
  const meal = calendar.meals.find((m) => m.slot === slot);
  if (!meal) return fail(res, 'Bữa này không có trong lịch.', 404);
  const read = await readRationItems(req.body?.items);
  if (read.message) return fail(res, read.message, 400);
  const time = req.body?.time;
  const clocks = Object.fromEntries(calendar.meals.map((m) => [m.slot, m.slot === slot ? time : m.time]));
  const problem = mealSetProblem(clocks);
  if (problem) return fail(res, problem, 400);
  const { start, end } = dayBounds(new Date(`${date}T00:00:00`));
  const task = await DailyTask.findOne({ horse: plan.horse, taskType: 'feeding', mealSlot: slot, makeUpOf: null, scheduledDate: { $gte: start, $lt: end } });
  if (task && (task.status !== 'pending' || taskTiming(task).state === 'missed')) return fail(res, 'Bữa đã ghi nhận hoặc quá hạn, không sửa được.', 409);
  meal.time = time;
  meal.items = read.items.map((i) => ({ inventoryItem: i.inventoryItem, name: i.type, amount: i.amount, unit: i.unit }));
  meal.edited = true;
  await calendar.save();
  if (date === dateKey(new Date())) await ensureFeedingTasks({ horseIds: [plan.horse] });
  const assignment = await StableAssignment.findOne({ horse: plan.horse }).select('assignedCaretaker');
  if (assignment?.assignedCaretaker) await pushNotification({ recipientUser: assignment.assignedCaretaker, horse: plan.horse, type: 'task_assigned',
    message: `${req.user.name} đã sửa ${SLOT_LABELS[slot].toLowerCase()} ngày ${date} lúc ${time}. Xem khẩu phần mới trong mục Cho ăn.` });
  await logAction({ actorId: req.user._id, action: 'feeding.calendar_meal_update', targetModel: 'FeedingCalendarDay', targetId: calendar._id, metadata: { date, slot } });
  return ok(res, calendar, 'Feeding calendar meal updated.');
}));
/** GET /feeding/suggest?horse=&slot= — one meal as rationRules.js suggests it today (the single-ration form). */
router.get('/suggest', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), asyncHandler(async (req, res) => {
  const { horse, slot } = req.query;
  if (!/^[0-9a-f]{24}$/i.test(String(horse || '')) || !SLOT_MINUTES[slot]) return fail(res, 'Chọn ngựa và bữa.', 400);
  if (!(await canAccessHorse(req.user, horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  return ok(res, await suggestMeal({ horseId: horse, slot }), 'Meal suggested.');
}));
/** GET /feeding/timetable?horse=&week=YYYY-MM-DD — one horse's feeding week, each meal with what happened (feedingTimetable.service.js). */
router.get('/timetable', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), asyncHandler(async (req, res) => {
  const { horse, week } = req.query;
  if (!/^[0-9a-f]{24}$/i.test(String(horse || ''))) return fail(res, 'Chọn ngựa.', 400);
  if (week !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(week))) return fail(res, 'Tuần không hợp lệ.', 400);
  if (!(await canAccessHorse(req.user, horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  return ok(res, await feedingTimetable({ horseId: horse, week: week ? new Date(`${week}T00:00:00`) : undefined }), 'Feeding timetable fetched.');
}));
router.get('/calendar/:planId', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), asyncHandler(async (req, res) => {
  if (!/^[0-9a-f]{24}$/i.test(req.params.planId)) return fail(res, 'Kế hoạch không hợp lệ.', 400);
  const plan = await TrainingPlan.findById(req.params.planId);
  if (!plan) return fail(res, 'Không tìm thấy kế hoạch huấn luyện.', 404);
  if (!(await canAccessHorse(req.user, plan.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  return ok(res, await calendarView(plan), 'Feeding calendar fetched.');
}));
router.post('/calendar/:planId/confirm', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), asyncHandler(async (req, res) => {
  if (!/^[0-9a-f]{24}$/i.test(req.params.planId)) return fail(res, 'Kế hoạch không hợp lệ.', 400);
  const plan = await TrainingPlan.findById(req.params.planId);
  if (!plan) return fail(res, 'Không tìm thấy kế hoạch huấn luyện.', 404);
  if (!(await canAccessHorse(req.user, plan.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const result = await confirmCalendar({ plan, actor: req.user, expectedUpdatedAt: req.body?.expectedUpdatedAt, times: req.body?.times });
  if (result.error) return fail(res, result.error, result.status);
  return ok(res, result, 'Feeding calendar confirmed.');
}));
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), normalizeRationItems, ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), normalizeRationItems, ctrl.updateOne);
/** Whether a horse's meal times, all together, fit their parts of the day and the club's gap between meals. */
function mealSetProblem(clocks) {
  const slots = Object.keys(clocks);
  for (const slot of slots) {
    const clock = clocks[slot];
    if (typeof clock !== 'string' || !CLOCK.test(clock)) return `Giờ cho ăn phải có dạng HH:mm (${SLOT_LABELS[slot].toLowerCase()}).`;
    const [from, to] = SLOT_MINUTES[slot];
    if (minutesOf(clock) < from || minutesOf(clock) >= to) return `${SLOT_LABELS[slot]} phải ${SLOT_RANGE_TEXT[slot]} (đang chọn ${clock}).`;
  }
  const gap = clubPolicy.mealMinGapHours * 60;
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      if (Math.abs(minutesOf(clocks[slots[i]]) - minutesOf(clocks[slots[j]])) < gap) {
        return `${SLOT_LABELS[slots[i]]} ${clocks[slots[i]]} và ${SLOT_LABELS[slots[j]].toLowerCase()} ${clocks[slots[j]]} cách nhau chưa đủ ${clubPolicy.mealMinGapHours} giờ (quy định CLB).`;
      }
    }
  }
  return null;
}

/**
 * POST /feeding/plan { horse, meals: [{ mealTime, timeOfDay, items }], from?, basis? } — the trainer
 * confirms a horse's meals as the training plan suggests them, all at once.
 * - Without `from` (or a day not after today): each meal's ration is created or updated now, and
 *   today's open meal follows it.
 * - With a later `from` (the first day of the plan's next phase): the amounts wait on each existing
 *   ration as `upcoming` and replace its items that day; times stay as they are.
 */
const confirmPlanRations = asyncHandler(async (req, res) => {
  const { horse, from, basis } = req.body || {};
  if (!/^[0-9a-f]{24}$/i.test(String(horse || ''))) return fail(res, 'Chọn ngựa.', 400);
  if (!(await canAccessHorse(req.user, horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (await FeedingCalendarDay.exists({ horse, date: { $gte: dateKey(new Date()) } })) return fail(res, 'Ngựa đã có lịch ăn theo kế hoạch. Hãy sửa bữa trong lịch theo ngày.', 409);
  const meals = Array.isArray(req.body?.meals) ? req.body.meals.filter(Boolean) : [];
  if (!meals.length) return fail(res, 'Chọn ít nhất một bữa để xác nhận.', 400);
  if (meals.some((m) => !SLOT_MINUTES[m.mealTime]) || new Set(meals.map((m) => m.mealTime)).size !== meals.length) {
    return fail(res, 'Mỗi bữa (sáng, trưa, chiều) chỉ một lần.', 400);
  }
  const read = [];
  for (const meal of meals) {
    // eslint-disable-next-line no-await-in-loop
    const r = await readRationItems(meal.items);
    if (r.message) return fail(res, `${SLOT_LABELS[meal.mealTime]}: ${r.message}`, 400);
    read.push({ ...meal, items: r.items });
  }
  const existing = await FeedingSchedule.find({ horse });
  const bySlot = new Map(existing.map((e) => [e.mealTime, e]));
  const { start: today } = dayBounds(new Date());
  const startsOn = from ? dayBounds(new Date(from)).start : null;
  if (from && Number.isNaN(new Date(from).getTime())) return fail(res, 'Ngày áp dụng không hợp lệ.', 400);

  if (startsOn && startsOn > today) {
    const missing = read.filter((m) => !bySlot.has(m.mealTime));
    if (missing.length) {
      return fail(res, `Chưa có khẩu phần ${missing.map((m) => SLOT_LABELS[m.mealTime].toLowerCase()).join(', ')} để hẹn đổi — hãy xác nhận khẩu phần giai đoạn hiện tại trước.`, 409);
    }
    for (const meal of read) {
      const ration = bySlot.get(meal.mealTime);
      ration.upcoming = { from: startsOn, items: meal.items, approvedBy: req.user._id, basis: typeof basis === 'string' ? basis.slice(0, 120) : undefined };
      // eslint-disable-next-line no-await-in-loop
      await ration.save();
    }
    await logAction({ actorId: req.user._id, action: 'feeding.plan_confirm', targetModel: 'Horse', targetId: horse, metadata: { from: startsOn, meals: read.map((m) => m.mealTime), basis } });
    return ok(res, await FeedingSchedule.find({ horse }).populate('items.inventoryItem', 'name unit quantity category'), 'Upcoming rations confirmed.');
  }

  // Now: the meal times all together, including meals of this horse the confirmation leaves as they are.
  const clocks = Object.fromEntries(existing.map((e) => [e.mealTime, e.timeOfDay || DEFAULT_MEAL_TIMES[e.mealTime]]));
  for (const meal of read) clocks[meal.mealTime] = meal.timeOfDay || clocks[meal.mealTime] || DEFAULT_MEAL_TIMES[meal.mealTime];
  const problem = mealSetProblem(clocks);
  if (problem) return fail(res, problem, 400);
  const saved = [];
  for (const meal of read) {
    const ration = bySlot.get(meal.mealTime) || new FeedingSchedule({ horse, mealTime: meal.mealTime });
    ration.timeOfDay = clocks[meal.mealTime];
    ration.items = meal.items;
    ration.approvedBy = req.user._id;
    ration.upcoming = null;
    // eslint-disable-next-line no-await-in-loop
    await ration.save();
    // eslint-disable-next-line no-await-in-loop
    await syncTodayMeal(ration);
    saved.push(ration);
  }
  await logAction({ actorId: req.user._id, action: 'feeding.plan_confirm', targetModel: 'Horse', targetId: horse, metadata: { meals: read.map((m) => m.mealTime), basis } });
  return ok(res, await FeedingSchedule.find({ horse }).populate('items.inventoryItem', 'name unit quantity category'), 'Rations confirmed.');
});
router.post('/plan', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), confirmPlanRations);

/**
 * Deleting a ration (Head Trainer or Manager): today's meal of that slot that is not given yet and
 * still open goes with it, so the groom is not left with work nobody wants; meals given or missed
 * stay as history. The horse's groom is told.
 */
const removeRation = asyncHandler(async (req, res) => {
  const ration = await FeedingSchedule.findById(req.params.id).populate('horse', 'name');
  if (!ration) return fail(res, 'Feeding schedule not found.', 404);
  if (!(await canAccessHorse(req.user, ration.horse._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (await FeedingCalendarDay.exists({ horse: ration.horse._id, date: { $gte: dateKey(new Date()) } })) return fail(res, 'Ngựa đã có lịch ăn theo kế hoạch. Hãy sửa bữa trong lịch theo ngày.', 409);
  await ration.deleteOne();
  const { start } = dayBounds(new Date());
  const open = await DailyTask.find({ horse: ration.horse._id, taskType: 'feeding', mealSlot: ration.mealTime, status: 'pending', makeUpOf: null, scheduledDate: { $gte: start } });
  const removable = open.filter((t) => taskTiming(t).state !== 'missed');
  if (removable.length) await DailyTask.deleteMany({ _id: { $in: removable.map((t) => t._id) } });
  await logAction({ actorId: req.user._id, action: 'feeding.delete', targetModel: 'FeedingSchedule', targetId: ration._id, metadata: { horse: ration.horse._id, mealTime: ration.mealTime, removedTasks: removable.length } });
  const assignment = await StableAssignment.findOne({ horse: ration.horse._id }).select('assignedCaretaker');
  if (assignment?.assignedCaretaker) {
    await pushNotification({
      recipientUser: assignment.assignedCaretaker,
      horse: ration.horse._id,
      type: 'task_assigned',
      severity: 'info',
      message: `🍽️ ${req.user.name} đã xoá khẩu phần ${SLOT_LABELS[ration.mealTime].toLowerCase()} của ${ration.horse.name}${removable.length ? ' — việc cho ăn của bữa đó hôm nay cũng được bỏ.' : '.'}`,
    });
  }
  return ok(res, { removedTasks: removable.length }, 'Feeding schedule deleted.');
});

router.delete('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), removeRation);

module.exports = router;
