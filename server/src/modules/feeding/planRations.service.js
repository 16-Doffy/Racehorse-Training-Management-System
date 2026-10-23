const TrainingPlan = require('../../models/TrainingPlan');
const FeedingSchedule = require('../../models/FeedingSchedule');
const FeedingCalendarDay = require('../../models/FeedingCalendarDay');
const Notification = require('../../models/Notification');
const { notifyHorseStaff } = require('../alerts/notification.service');
const { PHASE_LABELS } = require('../../constants/training');

const { phasesOf } = TrainingPlan;
const DAY_MS = 24 * 60 * 60 * 1000;
// How early the trainer is told a phase change is coming, and how long one reminder lasts.
const REMIND_BEFORE_DAYS = 2;
const REMIND_EVERY_DAYS = 3;
const ddmm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * A horse whose plan moves to its next phase within two days, and whose rations are not yet set for
 * it (no amounts confirmed ahead for that day): the trainer is told once, and the bell opens the
 * horse's rations, where the suggestion for the new phase waits for a click (POST /feeding/plan).
 * Returns how many trainers were told.
 */
async function remindRationReviews(now = new Date()) {
  const plans = await TrainingPlan.find({ status: 'active' }).populate('horse', 'name isArchived');
  let told = 0;
  for (const plan of plans) {
    if (!plan.horse || plan.horse.isArchived) continue;
    const next = phasesOf(plan).find((p) => new Date(p.startDate) > now);
    if (!next) continue;
    const startsAt = new Date(next.startDate);
    if (startsAt.getTime() - now.getTime() > REMIND_BEFORE_DAYS * DAY_MS) continue;
    const nextDate = `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}-${String(startsAt.getDate()).padStart(2, '0')}`;
    // A confirmed daily calendar already includes the next phase; the older one-phase reminder is unnecessary.
    // eslint-disable-next-line no-await-in-loop
    if (await FeedingCalendarDay.exists({ plan: plan._id, date: nextDate, approvedPlanUpdatedAt: { $gte: plan.updatedAt } })) continue;
    // eslint-disable-next-line no-await-in-loop
    const rations = await FeedingSchedule.find({ horse: plan.horse._id }).select('upcoming');
    const ready = rations.length && rations.every((r) => r.upcoming?.from && new Date(r.upcoming.from).getTime() === startsAt.getTime());
    if (ready) continue;
    // eslint-disable-next-line no-await-in-loop
    const recent = await Notification.exists({ type: 'ration_review', horse: plan.horse._id, createdAt: { $gte: new Date(now.getTime() - REMIND_EVERY_DAYS * DAY_MS) } });
    if (recent) continue;
    // eslint-disable-next-line no-await-in-loop
    await notifyHorseStaff({
      staff: 'trainer',
      horse: plan.horse._id,
      type: 'ration_review',
      severity: 'warning',
      message: `🍽️ ${plan.horse.name} sang giai đoạn ${PHASE_LABELS[next.key] || next.key} ngày ${ddmm(startsAt)}: khẩu phần cho giai đoạn mới đã được gợi ý sẵn, bấm để mở và xác nhận.`,
    });
    told += 1;
  }
  return told;
}

module.exports = { remindRationReviews, REMIND_BEFORE_DAYS };
