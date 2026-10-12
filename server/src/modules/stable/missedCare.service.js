const DailyTask = require('../../models/DailyTask');
const Horse = require('../../models/Horse');
const { notifyHorseStaff, notifyCaretaker } = require('../alerts/notification.service');
const { taskTiming } = require('../../utils/taskTiming');

const pad = (n) => String(n).padStart(2, '0');
const dayLabel = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

/**
 * A vet's dose or check whose window closed with nobody recording it tells the vet responsible for
 * the horse, once per task (missedNotifiedAt). Nothing is rescheduled and no dose is doubled: what
 * to do about a missed dose is the vet's call. Only today's and yesterday's work is looked at, so
 * old history does not flood the vet the first time this runs.
 * Returns the number of tasks the vet was told about.
 */
async function notifyMissedDoses(now = new Date()) {
  const since = new Date(now);
  since.setDate(since.getDate() - 1);
  since.setHours(0, 0, 0, 0);
  const candidates = await DailyTask.find({
    source: 'vet',
    taskType: { $in: ['medication', 'monitoring'] },
    status: 'pending',
    missedNotifiedAt: null,
    scheduledDate: { $gte: since, $lte: now },
  });
  let told = 0;
  for (const task of candidates) {
    if (taskTiming(task, now).state !== 'missed') continue;
    // One claim per task: two server instances or overlapping runs tell the vet once.
    // eslint-disable-next-line no-await-in-loop
    const claimed = await DailyTask.updateOne({ _id: task._id, missedNotifiedAt: null, status: 'pending' }, { $set: { missedNotifiedAt: now } });
    if (claimed.modifiedCount !== 1) continue;
    // eslint-disable-next-line no-await-in-loop
    const horse = await Horse.findById(task.horse).select('name');
    const what = task.taskType === 'medication' ? `liều "${task.note || 'thuốc'}"` : `việc theo dõi "${task.note || 'theo y lệnh'}"`;
    const when = `${task.dueTime ? `lúc ${task.dueTime} ` : ''}ngày ${dayLabel(new Date(task.scheduledDate))}`;
    // eslint-disable-next-line no-await-in-loop
    await notifyHorseStaff({
      staff: 'vet',
      horse: task.horse,
      type: 'care_order',
      severity: 'warning',
      message: `⏰ ${horse?.name || 'Ngựa'}: ${what} ${when} đã quá khung giờ mà chưa ai ghi nhận. Hệ thống không tự xếp lại hay gấp đôi liều — bác sĩ quyết định cách xử lý.`,
    });
    told += 1;
  }
  return told;
}

const MEAL_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
const clockOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * A ration meal whose window closed with nobody recording it: the trainer is told (the horse may not
 * have eaten, and harder work is blocked until it has — readiness.service.js), and the groom is
 * reminded, once per meal (missedNotifiedAt). Only today's and yesterday's meals; the daily "feed
 * the horse" task of a horse without a ration is left out (the groom reports that one instead).
 * Returns the number of meals reported.
 */
async function notifyMissedMeals(now = new Date()) {
  const since = new Date(now);
  since.setDate(since.getDate() - 1);
  since.setHours(0, 0, 0, 0);
  const candidates = await DailyTask.find({
    taskType: 'feeding',
    mealSlot: { $ne: null },
    status: 'pending',
    missedNotifiedAt: null,
    scheduledDate: { $gte: since, $lte: now },
  });
  let told = 0;
  for (const task of candidates) {
    if (taskTiming(task, now).state !== 'missed') continue;
    // eslint-disable-next-line no-await-in-loop
    const claimed = await DailyTask.updateOne({ _id: task._id, missedNotifiedAt: null, status: 'pending' }, { $set: { missedNotifiedAt: now } });
    if (claimed.modifiedCount !== 1) continue;
    // eslint-disable-next-line no-await-in-loop
    const horse = await Horse.findById(task.horse).select('name');
    const at = new Date(task.scheduledDate);
    const meal = `${task.makeUpOf ? 'Bữa ăn bù' : MEAL_LABELS[task.mealSlot] || 'Bữa ăn'} (${clockOf(at)} ngày ${dayLabel(at)})`;
    const name = horse?.name || 'Ngựa';
    // eslint-disable-next-line no-await-in-loop
    await notifyHorseStaff({
      staff: 'trainer',
      horse: task.horse,
      type: 'meal_missed',
      severity: 'warning',
      message: `🍽️ ${name}: ${meal.toLowerCase()} đã quá hạn mà chưa được ghi nhận cho ăn — ngựa có thể chưa ăn. Kiểm tra với nhân viên; bài trung bình/nặng bị chặn cho tới khi ngựa được cho ăn (Tổng quan → Bữa bị bỏ lỡ hôm nay).`,
    });
    // eslint-disable-next-line no-await-in-loop
    await notifyCaretaker({
      horse: task.horse,
      type: 'meal_missed',
      severity: 'warning',
      message: `🍽️ ${meal} của ${name} đã quá hạn ghi nhận. Nếu đã cho ăn hoặc không cho ăn được, hãy báo HLV.`,
    });
    told += 1;
  }
  return told;
}

module.exports = { notifyMissedDoses, notifyMissedMeals };
