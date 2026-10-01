/**
 * When a daily task may be acted on, judged against the real clock.
 *
 * A meal is only worth recording around the time it is eaten. Ticking breakfast at 23:00 would
 * store "ate at 23:00", and the training readiness check would then believe the horse had just
 * been fed; creating breakfast at 23:00 only produces a task that is born overdue. The same goes
 * for a dose of medicine: yesterday's cannot be given today.
 *
 * One definition, used by the task generator (what to create), the completion endpoint (what a
 * groom may tick), the trainer's edits (what may still be changed) and the `timing` field every
 * task carries in API responses, so no screen has to re-derive the rules.
 *
 * States:
 *   upcoming — not yet time (a later day, or a meal more than an hour away)
 *   open     — can be done now
 *   late     — its day has passed but the work can still be done and recorded (mucking out, washing)
 *   missed   — its window has closed; it stays on record as not done
 *   closed   — already completed or called off
 */

// A meal can be recorded from an hour before its time (feeding a little early is normal)…
const MEAL_OPENS_BEFORE_MINUTES = 60;
// …until four hours after, by which point the next meal is due and a "late breakfast" is fiction.
const MEAL_CLOSES_AFTER_HOURS = 4;
// Work that belongs to its day and cannot be made up afterwards.
const DAY_BOUND_TYPES = ['feeding', 'medication', 'monitoring'];

const MINUTE = 60 * 1000;

function dayBounds(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

const clock = (date) => new Date(date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const day = (date) => new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

/** The window of one meal scheduled at `at`: [opensAt, closesAt], never running past its own day. */
function mealWindow(at) {
  const scheduled = new Date(at);
  const { end } = dayBounds(scheduled);
  const closesAt = new Date(Math.min(scheduled.getTime() + MEAL_CLOSES_AFTER_HOURS * 60 * MINUTE, end.getTime() - 1));
  return { opensAt: new Date(scheduled.getTime() - MEAL_OPENS_BEFORE_MINUTES * MINUTE), closesAt };
}

function taskTiming(task, now = new Date()) {
  if (task.status === 'completed' || task.status === 'skipped') {
    return { state: 'closed', canComplete: false, canChange: false };
  }

  const scheduled = new Date(task.scheduledDate);
  const { start, end } = dayBounds(scheduled);

  if (now < start) {
    return { state: 'upcoming', canComplete: false, canChange: true, opensAt: start, reason: 'Chưa tới ngày thực hiện công việc này.' };
  }

  if (task.taskType === 'feeding' && task.mealSlot) {
    const { opensAt, closesAt } = mealWindow(scheduled);
    if (now < opensAt) {
      return { state: 'upcoming', canComplete: false, canChange: true, opensAt, closesAt, reason: `Chưa tới giờ bữa này — ghi nhận được từ ${clock(opensAt)}.` };
    }
    if (now > closesAt) {
      return {
        state: 'missed',
        canComplete: false,
        canChange: false,
        opensAt,
        closesAt,
        reason: `Bữa này đã quá giờ (hạn ghi nhận ${clock(closesAt)} ngày ${day(closesAt)}) — không ghi nhận muộn được.`,
      };
    }
    return { state: 'open', canComplete: true, canChange: true, opensAt, closesAt };
  }

  if (now >= end) {
    if (DAY_BOUND_TYPES.includes(task.taskType)) {
      return {
        state: 'missed',
        canComplete: false,
        canChange: false,
        closesAt: end,
        reason: `Việc của ngày ${day(scheduled)} đã qua — không ghi nhận bù được.`,
      };
    }
    // Mucking out a day late is still mucking out; it just shows as overdue.
    return { state: 'late', canComplete: true, canChange: true };
  }

  return { state: 'open', canComplete: true, canChange: true, closesAt: end };
}

module.exports = { taskTiming, mealWindow, dayBounds, MEAL_OPENS_BEFORE_MINUTES, MEAL_CLOSES_AFTER_HOURS, DAY_BOUND_TYPES };
