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

/**
 * Ration items come from the stock list: each names a food item in stock and an amount per meal in
 * that item's unit. The display text (type, quantity) is written from the item, so screens that
 * only read those keep working. Older text-only items are kept as they are.
 */
async function normalizeRationItems(req, res, next) {
  try {
    if (req.body.items === undefined) return next();
    if (!Array.isArray(req.body.items)) return res.status(400).json({ success: false, data: null, message: 'items phải là danh sách.' });
    const ids = req.body.items.map((i) => i?.inventoryItem).filter(Boolean);
    const stock = ids.length ? await InventoryItem.find({ _id: { $in: ids } }).select('name unit category') : [];
    const byId = new Map(stock.map((s) => [String(s._id), s]));
    const items = [];
    for (const [i, raw] of req.body.items.entries()) {
      if (!raw) continue;
      if (!raw.inventoryItem) {
        if (raw.type && raw.quantity) items.push({ type: raw.type, quantity: raw.quantity });
        continue;
      }
      const item = byId.get(String(raw.inventoryItem));
      const fail400 = (message) => res.status(400).json({ success: false, data: null, message: `Món thứ ${i + 1}: ${message}` });
      if (!item) return fail400('không tìm thấy mặt hàng trong kho.');
      if (item.category !== 'feed') return fail400(`"${item.name}" không thuộc loại thức ăn.`);
      const amount = Number(raw.amount);
      if (!Number.isFinite(amount) || amount <= 0) return fail400('lượng mỗi bữa phải là số dương.');
      items.push({ type: item.name, quantity: `${amount} ${item.unit}`, inventoryItem: item._id, amount, unit: item.unit });
    }
    req.body.items = items;
    return next();
  } catch (err) {
    return next(err);
  }
}

const rationSupplies = (items) =>
  (items || []).filter((i) => i.inventoryItem && i.amount).map((i) => ({ inventoryItem: i.inventoryItem, name: i.type, amount: i.amount, unit: i.unit }));

/** One ration per horse per meal: two "breakfast" rations made the groom's day ambiguous. */
async function refuseDuplicateMeal(req, { existing }) {
  const horse = req.body.horse || existing?.horse;
  const mealTime = req.body.mealTime || existing?.mealTime;
  if (!horse || !mealTime) return null;
  const clash = await FeedingSchedule.exists({ horse, mealTime, ...(existing ? { _id: { $ne: existing._id } } : {}) });
  return clash ? 'Ngựa này đã có khẩu phần cho bữa đó — hãy sửa khẩu phần hiện có.' : null;
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
  validate: refuseDuplicateMeal,
  // The groom should see the new meal on their list now, not after the next hourly run.
  afterWrite: syncTodayMeal,
});

router.use(protect);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), normalizeRationItems, ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), normalizeRationItems, ctrl.updateOne);
router.delete('/:id', authorize(ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
