const Treatment = require('../../models/Treatment');
const DailyTask = require('../../models/DailyTask');
const StableAssignment = require('../../models/StableAssignment');
const InventoryItem = require('../../models/InventoryItem');
const { mealWindow } = require('../../utils/taskTiming');

/**
 * A treatment is the vet's plan; the person who actually gives the medicine and watches the horse
 * is the groom. Before this, a prescription lived only in the vet's record — nothing told the
 * stable to do anything, and nothing recorded that the dose had been given.
 *
 * While a treatment is ongoing, every dose becomes a "medication" task for the horse's caretaker —
 * one per medication per time of day the vet set (08:00, 20:00…), or one a day when no time was
 * given — and the care instructions one "monitoring" task. A medication linked to a stock item
 * carries that item and amount as the task's supplies, taken from stock when the dose is given.
 */

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function atClock(dayStart, hhmm) {
  const d = new Date(dayStart);
  const [hh, mm] = String(hhmm).split(':').map(Number);
  d.setHours(hh, mm, 0, 0);
  return d;
}

function medicationNote(m) {
  return [m.name, m.dosage, m.frequency].filter(Boolean).join(' — ');
}

const keyOf = (t) => `${t.taskType}|${t.note}|${t.dueTime || ''}`;

/** The care a treatment asks of the stable today, as the tasks it should exist as. */
async function wantedTasks(treatment) {
  const meds = treatment.medications || [];
  const itemIds = meds.map((m) => m.inventoryItem).filter(Boolean);
  const items = itemIds.length ? await InventoryItem.find({ _id: { $in: itemIds } }).select('name unit') : [];
  const itemById = new Map(items.map((i) => [String(i._id), i]));

  const wanted = [];
  for (const m of meds) {
    const item = m.inventoryItem ? itemById.get(String(m.inventoryItem)) : null;
    const supplies = item && m.amount ? [{ inventoryItem: item._id, name: item.name, amount: m.amount, unit: item.unit }] : [];
    const note = medicationNote(m);
    const times = (m.times || []).length ? m.times : [null];
    for (const dueTime of times) wanted.push({ taskType: 'medication', note, dueTime, supplies });
  }
  if (treatment.careInstructions) wanted.push({ taskType: 'monitoring', note: treatment.careInstructions, dueTime: null, supplies: [] });
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
 * and removes pending tasks that no longer apply (the vet changed the prescription or its times,
 * or the treatment ended). Work already done is never touched. A dose whose time window has
 * already closed today is not created. Idempotent.
 *
 * Returns { created, removed, caretaker, wanted } — `caretaker` is null when the horse has nobody
 * assigned, in which case nothing can be created.
 */
async function syncCareTasks(treatment) {
  const bounds = todayBounds();
  const active = isActiveToday(treatment, bounds);
  const wanted = active ? await wantedTasks(treatment) : [];
  const wantedKeys = new Set(wanted.map(keyOf));

  // A treatment that has ended leaves no pending care behind, whichever day it was created for.
  const pendingScope = active
    ? { treatment: treatment._id, status: 'pending', scheduledDate: { $gte: bounds.start, $lt: bounds.end } }
    : { treatment: treatment._id, status: 'pending' };
  const pending = await DailyTask.find(pendingScope).select('taskType note dueTime');
  const staleIds = pending.filter((t) => !wantedKeys.has(keyOf(t))).map((t) => t._id);
  const { deletedCount: removed } = staleIds.length ? await DailyTask.deleteMany({ _id: { $in: staleIds } }) : { deletedCount: 0 };

  if (wanted.length === 0) return { created: 0, removed, caretaker: null, wanted: 0 };

  const assignment = await StableAssignment.findOne({ horse: treatment.horse }).select('assignedCaretaker');
  const caretaker = assignment?.assignedCaretaker || null;
  if (!caretaker) return { created: 0, removed, caretaker: null, wanted: wanted.length };

  const now = new Date();
  let created = 0;
  for (const item of wanted) {
    const at = item.dueTime ? atClock(bounds.start, item.dueTime) : now;
    if (item.dueTime && now > mealWindow(at).closesAt) continue; // today's 08:00 dose is gone by 15:00

    // eslint-disable-next-line no-await-in-loop
    const exists = await DailyTask.exists({
      treatment: treatment._id,
      taskType: item.taskType,
      note: item.note,
      dueTime: item.dueTime || null,
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
      dueTime: item.dueTime || null,
      supplies: item.supplies,
      scheduledDate: at,
      status: 'pending',
    });
    created += 1;
  }
  return { created, removed, caretaker, wanted: wanted.length };
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
