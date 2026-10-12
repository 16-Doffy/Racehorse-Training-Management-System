// Run with `npm test` in mobile/. The rules the screens share: how a task stands, what the
// counters count, which dose a task is, and how a stock item stands — no React involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canCompleteTask,
  describeTask,
  doseSlots,
  getStockLevel,
  hasApprovedRation,
  isOpenRequest,
  rationLine,
  restockState,
  summarizeTasks,
  taskBlockers,
  taskState,
} from './groom.js';

const GROOM = 'groom-1';
const TRAINER = 'trainer-1';
const now = new Date();
const at = (hours, minutes = 0, base = now) => {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};
const yesterday = new Date(now.getTime() - 86400000);

const task = (extra = {}) => ({
  _id: Math.random().toString(36).slice(2),
  horse: { _id: 'h1', name: 'Arrow' },
  assignedTo: GROOM,
  taskType: 'cleaning',
  status: 'pending',
  scheduledDate: now.toISOString(),
  timing: { state: 'open', canComplete: true },
  supplies: [],
  ...extra,
});

const ration = { horse: { _id: 'h1' }, mealTime: 'morning', approvedBy: { name: 'HLV' }, items: [{ type: 'Cỏ khô', inventoryItem: 'hay', amount: 5, unit: 'kg' }] };

test('a meal needs an approved ration for its own slot', () => {
  const meal = task({ taskType: 'feeding', mealSlot: 'morning' });
  assert.equal(hasApprovedRation(meal, [ration]), true);
  assert.equal(hasApprovedRation({ ...meal, mealSlot: 'evening' }, [ration]), false);
  assert.equal(hasApprovedRation({ ...meal, mealSlot: null }, [ration]), false, 'the plain daily task has no ration');
  assert.equal(hasApprovedRation(meal, [{ ...ration, approvedBy: null }]), false);
  assert.equal(hasApprovedRation(meal, [{ ...ration, items: [] }]), false);
  assert.equal(hasApprovedRation(meal, null), true, 'not loaded yet: nothing is claimed');
});

test('blocked comes from stock, ration and expiry — and stops the button', () => {
  const short = task({ supplyStatus: { ok: false, missing: [{ name: 'Cỏ khô', needed: 5, available: 1, unit: 'kg' }] } });
  assert.equal(taskState(short).key, 'blocked');
  assert.match(taskState(short).reason, /Cỏ khô: cần 5 kg, còn 1 kg/);
  assert.equal(canCompleteTask(short), false);

  const noRation = task({ taskType: 'feeding', mealSlot: null });
  assert.equal(taskBlockers(noRation, { rations: [ration] })[0].code, 'NO_APPROVED_RATION');
  assert.equal(canCompleteTask(noRation, { rations: [ration] }), false);

  const expired = task({ supplies: [{ inventoryItem: 'paste', amount: 1 }] });
  const inventory = [{ _id: 'paste', name: 'Gel', expiryDate: yesterday.toISOString() }];
  assert.equal(taskBlockers(expired, { inventory })[0].code, 'EXPIRED_SUPPLY');
  assert.equal(canCompleteTask(task()), true);
});

test('states: missed is not blocked, unable is not completed, called off is not unable', () => {
  assert.equal(taskState(task({ timing: { state: 'missed', canComplete: false, reason: 'quá giờ' } })).key, 'missed');
  assert.equal(taskState(task({ timing: { state: 'upcoming', canComplete: false } })).key, 'upcoming');
  assert.equal(taskState(task({ timing: { state: 'late', canComplete: true } })).key, 'late');
  assert.equal(taskState(task({ status: 'completed' })).key, 'completed');
  assert.equal(taskState(task({ status: 'skipped', skippedBy: GROOM, skipReason: 'Ngựa nhả thuốc' })).key, 'unable');
  assert.equal(taskState(task({ status: 'skipped', skippedBy: TRAINER })).key, 'cancelled');
  assert.equal(taskState(task({ status: 'skipped', skippedBy: { _id: GROOM }, assignedTo: { _id: GROOM } })).key, 'unable');
});

test('counters: today vs carried over; missed and called-off work is not "to do"', () => {
  const list = [
    task({ status: 'completed' }),
    task(),
    task({ timing: { state: 'missed', canComplete: false } }),
    task({ status: 'skipped', skippedBy: TRAINER }),
    task({ supplyStatus: { ok: false, missing: [{ name: 'x', needed: 1, available: 0, unit: 'kg' }] } }),
    task({ scheduledDate: yesterday.toISOString(), timing: { state: 'late', canComplete: true } }),
    task({ scheduledDate: yesterday.toISOString(), taskType: 'feeding', mealSlot: 'morning', timing: { state: 'missed', canComplete: false } }),
  ];
  const s = summarizeTasks(list, { rations: [ration] });
  assert.equal(s.today.length, 5);
  assert.equal(s.planned, 4, 'the called-off chore is out of the day');
  assert.equal(s.completed.length, 1);
  assert.equal(s.missed.length, 1);
  assert.equal(s.blocked.length, 1);
  assert.equal(s.todayOpen.length, 2, 'the ready chore and the blocked one');
  assert.equal(s.overdue.length, 1, "yesterday's chore can still be done; yesterday's breakfast cannot");
  assert.equal(s.open.length, 3);
});

test('each prescribed time is its own dose, matched by name and dose', () => {
  const treatment = { _id: 't1' };
  const medication = { name: 'Bute', dosage: '1 viên/lần', times: ['08:00', '16:00'] };
  const note = 'Bute — 1 viên/lần — [2 lần/ngày]';
  const morning = task({ taskType: 'medication', source: 'vet', treatment: 't1', note, dueTime: '08:00', status: 'completed' });
  const afternoon = task({ taskType: 'medication', source: 'vet', treatment: 't1', note, dueTime: '16:00' });
  const otherMedicine = task({ taskType: 'medication', source: 'vet', treatment: 't1', note: 'Bute — 2 viên/lần', dueTime: '16:00' });
  const slots = doseSlots(treatment, medication, [morning, afternoon, otherMedicine], { now });
  assert.deepEqual(slots.map((s) => s.time), ['08:00', '16:00']);
  assert.equal(slots[0].task, morning);
  assert.equal(slots[1].task, afternoon, 'a different dose of the same medicine is not this one');

  const none = doseSlots(treatment, medication, [], { now: new Date(at(23, 30)) });
  assert.match(none[0].reason, /đã qua giờ/);
  const notMine = doseSlots(treatment, medication, [], { mine: false });
  assert.match(notMine[0].reason, /Không phải ngựa bạn phụ trách/);
  const later = doseSlots(treatment, { ...medication, startDate: new Date(now.getTime() + 3 * 86400000).toISOString() }, []);
  assert.match(later[0].reason, /Hôm nay không dùng/);
  const untimed = doseSlots(treatment, { name: 'Bute', dosage: '1 viên/lần' }, [{ ...afternoon, dueTime: null }]);
  assert.equal(untimed.length, 1);
  assert.ok(untimed[0].task);
});

test('stock level follows the Manager minimum and days of use, not a fixed number', () => {
  assert.equal(getStockLevel({ quantity: 3 }).key, 'ok', 'no minimum and no use: 3 is fine');
  assert.equal(getStockLevel({ quantity: 3, reorderLevel: 5 }).key, 'low');
  assert.equal(getStockLevel({ quantity: 100 }, { daysLeft: 2 }).key, 'low');
  assert.equal(getStockLevel({ quantity: 0 }).key, 'out');
  assert.equal(getStockLevel({ quantity: 50, expiryDate: yesterday.toISOString() }).key, 'expired');
  assert.equal(getStockLevel({ quantity: 50, expiryDate: new Date(now.getTime() + 5 * 86400000).toISOString() }).key, 'expiring');
  assert.equal(getStockLevel({ quantity: 50, expiryDate: new Date(now.getTime() + 5 * 86400000).toISOString() }).short, false);
});

test('a supply request is open until it is received or rejected', () => {
  assert.equal(isOpenRequest({ status: 'pending' }), true);
  assert.equal(isOpenRequest({ status: 'approved', awaitingDelivery: true }), true, 'approved is ordered, not on the shelf');
  assert.equal(isOpenRequest({ status: 'received', receivedAt: now }), false);
  assert.equal(isOpenRequest({ status: 'rejected' }), false);
  assert.equal(restockState({ status: 'approved', awaitingDelivery: true }).key, 'approved');
  assert.equal(restockState({ status: 'approved' }).key, 'received', 'approved before the delivery step was counted then');
});

test('labels: "Việc khác" shows the job, a ration line shows the item and its unit', () => {
  assert.equal(describeTask(task({ taskType: 'other', note: 'Cắt bờm' })).label, 'Cắt bờm');
  assert.equal(describeTask(task({ taskType: 'feeding', mealSlot: null })).label, 'Cho ăn trong ngày');
  assert.equal(describeTask(task({ dueTime: '09:30' })).time, '09:30');
  assert.deepEqual(rationLine({ type: 'Cỏ khô Timothy', inventoryItem: 'hay', amount: 5, unit: 'kg', quantity: '5 kg' }).amount, '5 kg');
  assert.equal(rationLine({ type: 'Cỏ khô Timothy', inventoryItem: 'hay', amount: 5, unit: 'kg' }).label, 'Cỏ khô Timothy');
  assert.equal(rationLine({ type: 'hay', quantity: '2.5 kg' }).label, 'Cỏ khô', 'older free-text lines keep their kind');
});
