const Treatment = require('../../models/Treatment');
const DailyTask = require('../../models/DailyTask');
const StableAssignment = require('../../models/StableAssignment');

/**
 * A treatment is the vet's plan; the person who actually gives the medicine and watches the horse
 * is the groom. Before this, a prescription lived only in the vet's record — nothing told the
 * stable to do anything, and nothing recorded that the dose had been given.
 *
 * While a treatment is ongoing, each medication becomes one "medication" task a day for the
 * horse's caretaker, and the care instructions one "monitoring" task. Completing them goes through
 * the same endpoint as any other daily task, so the vet can see the care was carried out.
 */

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function medicationNote(m) {
  return [m.name, m.dosage, m.frequency].filter(Boolean).join(' — ');
}

/** The care a treatment asks of the stable today, as the tasks it should exist as. */
function wantedTasks(treatment) {
  const wanted = (treatment.medications || []).map((m) => ({ taskType: 'medication', note: medicationNote(m) }));
  if (treatment.careInstructions) wanted.push({ taskType: 'monitoring', note: treatment.careInstructions });
  return wanted;
}

function isActiveToday(treatment, { start, end }) {
  if (treatment.status !== 'ongoing') return false;
  if (treatment.startDate && treatment.startDate >= end) return false;
  if (treatment.endDate && treatment.endDate < start) return false;
  return true;
}

/**
 * Brings today's care tasks in line with the treatment as it stands now: creates what is missing,
 * and removes pending tasks that no longer apply (the vet changed the prescription, or the
 * treatment ended). Work already done is never touched. Idempotent.
 *
 * Returns { created, removed, caretaker } — `caretaker` is null when the horse has nobody assigned,
 * in which case nothing can be created.
 */
async function syncCareTasks(treatment) {
  const bounds = todayBounds();
  const active = isActiveToday(treatment, bounds);
  const wanted = active ? wantedTasks(treatment) : [];

  const pendingToday = { treatment: treatment._id, status: 'pending', scheduledDate: { $gte: bounds.start, $lt: bounds.end } };
  // A treatment that has ended leaves no pending care behind, whichever day it was created for.
  const stale = active
    ? { ...pendingToday, note: { $nin: wanted.map((w) => w.note) } }
    : { treatment: treatment._id, status: 'pending' };
  const { deletedCount: removed } = await DailyTask.deleteMany(stale);

  if (wanted.length === 0) return { created: 0, removed, caretaker: null };

  const assignment = await StableAssignment.findOne({ horse: treatment.horse }).select('assignedCaretaker');
  const caretaker = assignment?.assignedCaretaker || null;
  if (!caretaker) return { created: 0, removed, caretaker: null };

  let created = 0;
  for (const item of wanted) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await DailyTask.exists({
      treatment: treatment._id,
      taskType: item.taskType,
      note: item.note,
      scheduledDate: { $gte: bounds.start, $lt: bounds.end },
    });
    if (exists) continue;

    // eslint-disable-next-line no-await-in-loop
    await DailyTask.create({
      horse: treatment.horse,
      assignedTo: caretaker,
      taskType: item.taskType,
      source: 'vet',
      treatment: treatment._id,
      note: item.note,
      scheduledDate: new Date(),
      status: 'pending',
    });
    created += 1;
  }
  return { created, removed, caretaker };
}

/** Daily run: every ongoing treatment gets today's care tasks; ended ones are cleaned up. */
async function syncAllCareTasks() {
  const { start } = todayBounds();
  const treatments = await Treatment.find({
    $or: [
      { status: 'ongoing' },
      // Recently ended treatments, so their leftover pending tasks are removed.
      { status: 'completed', updatedAt: { $gte: new Date(start.getTime() - 24 * 60 * 60 * 1000) } },
    ],
  }).select('horse medications careInstructions status startDate endDate');

  let created = 0;
  for (const treatment of treatments) {
    // eslint-disable-next-line no-await-in-loop
    created += (await syncCareTasks(treatment)).created;
  }
  return created;
}

module.exports = { syncCareTasks, syncAllCareTasks };
