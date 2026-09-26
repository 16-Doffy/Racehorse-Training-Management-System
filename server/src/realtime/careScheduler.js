const Horse = require('../models/Horse');
const { notifyHorseStaff } = require('../modules/alerts/notification.service');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly is plenty for day-granularity due dates
const RENOTIFY_AFTER_MS = 24 * 60 * 60 * 1000; // don't re-notify for the same due date within 24h

const CARE_ITEMS = [
  { dueField: 'nextVaccinationDue', notifiedField: 'vaccinationNotifiedAt', type: 'vaccination_due', label: 'tiêm phòng' },
  { dueField: 'nextDewormingDue', notifiedField: 'dewormingNotifiedAt', type: 'deworming_due', label: 'tẩy giun' },
  { dueField: 'nextFarrierDue', notifiedField: 'farrierNotifiedAt', type: 'farrier_due', label: 'kiểm tra móng (farrier)' },
];

/**
 * Automatic reminders for the horse's Veterinarian: periodically checks every horse's recurring care
 * schedule (vaccination / deworming / farrier) and fires a Notification + realtime push once a
 * due date has arrived, without re-spamming the same reminder every check.
 */
function startCareScheduler() {
  console.log(`[care-scheduler] started (checking every ${CHECK_INTERVAL_MS / 60000}min)`);

  const check = async () => {
    try {
      const now = new Date();
      const horses = await Horse.find({
        $or: CARE_ITEMS.map((item) => ({ [`careSchedule.${item.dueField}`]: { $lte: now, $ne: null } })),
      }).select('name careSchedule');

      if (horses.length === 0) return;

      for (const horse of horses) {
        for (const item of CARE_ITEMS) {
          const dueAt = horse.careSchedule?.[item.dueField];
          if (!dueAt || dueAt > now) continue;

          const notifiedAt = horse.careSchedule?.[item.notifiedField];
          if (notifiedAt && now - new Date(notifiedAt) < RENOTIFY_AFTER_MS) continue;

          const message = `Ngựa ${horse.name} đến hạn ${item.label} (hạn: ${dueAt.toLocaleDateString('vi-VN')}).`;
          // eslint-disable-next-line no-await-in-loop
          // The horse's own vet; other vets can't even open this horse under per-horse scoping.
          await notifyHorseStaff({
            staff: 'vet',
            horse: horse._id,
            type: item.type,
            severity: 'warning',
            message,
          });

          horse.careSchedule[item.notifiedField] = now;
          // eslint-disable-next-line no-await-in-loop
          await horse.save();
        }
      }
    } catch (err) {
      console.error('[care-scheduler] check failed:', err.message);
    }
  };

  check(); // also run once immediately on startup, don't wait a full interval
  setInterval(check, CHECK_INTERVAL_MS);
}

module.exports = { startCareScheduler };
