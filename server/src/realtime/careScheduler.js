const Horse = require('../models/Horse');
const { notifyHorseStaff, pushNotification } = require('../modules/alerts/notification.service');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly is plenty for day-granularity due dates
const RENOTIFY_AFTER_MS = 24 * 60 * 60 * 1000; // don't re-notify for the same due date within 24h
const DAY_MS = 24 * 60 * 60 * 1000;
// The owner hears of a care visit this many days before it (and on the day, if the date was set late).
const OWNER_AHEAD_DAYS = 2;

const CARE_ITEMS = [
  { kind: 'vaccination', dueField: 'nextVaccinationDue', notifiedField: 'vaccinationNotifiedAt', type: 'vaccination_due', label: 'tiêm phòng' },
  { kind: 'deworming', dueField: 'nextDewormingDue', notifiedField: 'dewormingNotifiedAt', type: 'deworming_due', label: 'tẩy giun' },
  { kind: 'farrier', dueField: 'nextFarrierDue', notifiedField: 'farrierNotifiedAt', type: 'farrier_due', label: 'kiểm tra móng (farrier)' },
  { kind: 'exam', dueField: 'nextExamDue', notifiedField: 'examNotifiedAt', type: 'exam_due', label: 'khám lại (tái khám hoặc định kỳ)' },
];
// How the owner reads each kind of care.
const OWNER_LABELS = { vaccination: 'tiêm phòng', deworming: 'tẩy giun', farrier: 'chăm sóc móng', exam: 'tái khám' };

const vnDate = (d) => new Date(d).toLocaleDateString('vi-VN');
const sameDate = (a, b) => Boolean(a && b) && new Date(a).getTime() === new Date(b).getTime();
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
/** "hôm nay", "ngày mai", "ngày 20/11". */
function whenText(due, now) {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  return days === 0 ? 'hôm nay' : days === 1 ? 'ngày mai' : `ngày ${vnDate(due)}`;
}

/**
 * Reminders of the horse's recurring care (vaccination, deworming, farrier) and of the exam the vet
 * booked (a follow-up or a periodic check):
 *  - the horse's vet when a date falls due, again every 24 hours while it stays due;
 *  - the horse's trainer once on the day a follow-up exam falls due, since it bears on the training;
 *  - the owner once, OWNER_AHEAD_DAYS before a visit (or on the day when it was booked late).
 * Each reminder is sent once per date: a date the vet moves is reminded afresh.
 */
async function checkCare(now = new Date()) {
  const ahead = new Date(startOfDay(now).getTime() + (OWNER_AHEAD_DAYS + 1) * DAY_MS);
  const horses = await Horse.find({
    isArchived: { $ne: true },
    $or: CARE_ITEMS.map((item) => ({ [`careSchedule.${item.dueField}`]: { $lt: ahead, $ne: null } })),
  }).select('name owner careSchedule');

  for (const horse of horses) {
    // One horse's failure (a bad record, a notification that won't save) must not cancel the
    // reminders for every horse after it — a single unknown reminder type used to do exactly that.
    try {
      // eslint-disable-next-line no-await-in-loop
      await remindHorse(horse, now);
    } catch (err) {
      console.error(`[care-scheduler] reminder for ${horse.name} failed:`, err.message);
    }
  }
}

async function remindHorse(horse, now) {
  let changed = false;
  for (const item of CARE_ITEMS) {
    const dueAt = horse.careSchedule?.[item.dueField];
    if (!dueAt) continue;
    const due = new Date(dueAt);

    // The owner: a visit coming up within the next days (not one already past).
    const upcoming = due >= startOfDay(now) && due < new Date(startOfDay(now).getTime() + (OWNER_AHEAD_DAYS + 1) * DAY_MS);
    if (horse.owner && upcoming && !sameDate(horse.careSchedule.ownerRemindedFor?.[item.kind], due)) {
      // eslint-disable-next-line no-await-in-loop
      await pushNotification({
        recipientUser: horse.owner,
        horse: horse._id,
        type: item.type,
        severity: 'info',
        message: `📅 ${horse.name} có lịch ${OWNER_LABELS[item.kind]} ${whenText(due, now)}${item.kind === 'exam' ? ' với bác sĩ' : ''}.`,
      });
      horse.set(`careSchedule.ownerRemindedFor.${item.kind}`, due);
      changed = true;
    }

    if (due > now) continue;

    // The vet: due now, reminded again each day it stays so.
    const notifiedAt = horse.careSchedule?.[item.notifiedField];
    if (!notifiedAt || now - new Date(notifiedAt) >= RENOTIFY_AFTER_MS) {
      // The horse's own vet; other vets can't even open this horse under per-horse scoping.
      // eslint-disable-next-line no-await-in-loop
      await notifyHorseStaff({
        staff: 'vet',
        horse: horse._id,
        type: item.type,
        severity: 'warning',
        message: `Ngựa ${horse.name} đến hạn ${item.label} (hạn: ${vnDate(due)}).`,
      });
      horse.careSchedule[item.notifiedField] = now;
      changed = true;
    }

    // The trainer: a follow-up exam falls due, once per date.
    if (item.kind === 'exam' && !sameDate(horse.careSchedule.trainerRemindedFor?.exam, due)) {
      // eslint-disable-next-line no-await-in-loop
      await notifyHorseStaff({
        staff: 'trainer',
        horse: horse._id,
        type: item.type,
        severity: 'info',
        message: `🩺 ${horse.name} đến hạn tái khám (hạn ${vnDate(due)}): bác sĩ cần khám lại. Nên chừa thời gian trong lịch tập và chờ kết luận trước khi tăng cường độ.`,
      });
      horse.set('careSchedule.trainerRemindedFor.exam', due);
      changed = true;
    }
  }
  if (changed) await horse.save();
}

function startCareScheduler() {
  console.log(`[care-scheduler] started (checking every ${CHECK_INTERVAL_MS / 60000}min)`);
  const check = () => checkCare().catch((err) => console.error('[care-scheduler] check failed:', err.message));
  check(); // also run once immediately on startup, don't wait a full interval
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { startCareScheduler, checkCare, OWNER_AHEAD_DAYS };
