const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const crudFactory = require('../../utils/crudFactory');
const FeedingSchedule = require('../../models/FeedingSchedule');
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
async function normalizeRationItems(req, res, next) {
  try {
    // A ration is what the groom gives and what leaves stock: at least one line, each a stock item.
    if (req.body.items === undefined) {
      if (req.method === 'POST') return res.status(400).json({ success: false, data: null, message: 'Khẩu phần cần ít nhất một món chọn từ kho.' });
      return next();
    }
    if (!Array.isArray(req.body.items)) return res.status(400).json({ success: false, data: null, message: 'items phải là danh sách.' });
    const ids = req.body.items.map((i) => i?.inventoryItem).filter(Boolean);
    const stock = ids.length ? await InventoryItem.find({ _id: { $in: ids } }).select('name unit category isActive') : [];
    const byId = new Map(stock.map((s) => [String(s._id), s]));
    const items = [];
    for (const [i, raw] of req.body.items.entries()) {
      if (!raw) continue;
      if (!raw.inventoryItem) {
        return res.status(400).json({ success: false, data: null, message: `Món thứ ${i + 1}: chọn mặt hàng trong kho — món ghi bằng chữ không trừ kho được.` });
      }
      const item = byId.get(String(raw.inventoryItem));
      const fail400 = (message) => res.status(400).json({ success: false, data: null, message: `Món thứ ${i + 1}: ${message}` });
      if (!item) return fail400('không tìm thấy mặt hàng trong kho.');
      if (item.category !== 'feed') return fail400(`"${item.name}" không thuộc loại thức ăn.`);
      if (item.isActive === false) return fail400(`"${item.name}" đã ngừng sử dụng.`);
      const amount = Number(raw.amount);
      if (!Number.isFinite(amount) || amount <= 0) return fail400('lượng mỗi bữa phải là số dương.');
      items.push({ type: item.name, quantity: `${amount} ${item.unit}`, inventoryItem: item._id, amount, unit: item.unit });
    }
    if (!items.length) return res.status(400).json({ success: false, data: null, message: 'Khẩu phần cần ít nhất một món chọn từ kho.' });
    req.body.items = items;
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
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), normalizeRationItems, ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), normalizeRationItems, ctrl.updateOne);
/**
 * Deleting a ration (Head Trainer or Manager): today's meal of that slot that is not given yet and
 * still open goes with it, so the groom is not left with work nobody wants; meals given or missed
 * stay as history. The horse's groom is told.
 */
const removeRation = asyncHandler(async (req, res) => {
  const ration = await FeedingSchedule.findById(req.params.id).populate('horse', 'name');
  if (!ration) return fail(res, 'Feeding schedule not found.', 404);
  if (!(await canAccessHorse(req.user, ration.horse._id))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
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
