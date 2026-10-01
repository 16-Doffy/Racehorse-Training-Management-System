const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const crudFactory = require('../../utils/crudFactory');
const FeedingSchedule = require('../../models/FeedingSchedule');
const DailyTask = require('../../models/DailyTask');
const { ensureFeedingTasks, atClock, DEFAULT_MEAL_TIMES } = require('../../realtime/dailyTaskGenerator');
const { taskTiming, dayBounds } = require('../../utils/taskTiming');

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
  if (task && task.scheduledDate.getTime() !== at.getTime() && taskTiming(task).state !== 'missed') {
    task.scheduledDate = at;
    await task.save();
  }
  await ensureFeedingTasks({ horseIds: [item.horse] });
}

const ctrl = crudFactory(FeedingSchedule, {
  populate: [{ path: 'horse', select: 'name' }, { path: 'approvedBy', select: 'name' }],
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
router.post('/', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.createOne);
router.put('/:id', authorize(ROLES.HEAD_TRAINER, ROLES.MANAGER), ctrl.updateOne);
router.delete('/:id', authorize(ROLES.MANAGER), ctrl.removeOne);

module.exports = router;
