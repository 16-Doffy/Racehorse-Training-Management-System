// Run with `npm test` in mobile/. The rules the screens share: how a task stands, what the
// counters count, which dose a task is, and how a stock item stands — no React involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHORE_TYPES,
  approvedOf,
  canCompleteTask,
  canRecordLate,
  describeTask,
  lateRecordTimes,
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

test('a missed meal can be recorded late only inside its own window and the last 24 hours', () => {
  const scheduled = new Date('2026-10-15T06:00:00');
  const missed = task({
    taskType: 'feeding',
    mealSlot: 'morning',
    scheduledDate: scheduled.toISOString(),
    timing: { state: 'missed', canComplete: false, opensAt: '2026-10-15T05:00:00', closesAt: '2026-10-15T10:00:00' },
  });
  const noon = new Date('2026-10-15T12:00:00');
  const times = lateRecordTimes(missed, noon);
  assert.equal(times[0].getHours(), 5, 'from an hour before');
  assert.equal(times.at(-1).getHours(), 10, 'until the window closed');
  assert.ok(times.some((t) => t.getTime() === scheduled.getTime()), 'the scheduled time is offered');
  assert.equal(canRecordLate(missed, { rations: [ration] }, noon), true);

  const nextDay = new Date('2026-10-16T09:00:00');
  assert.ok(lateRecordTimes(missed, nextDay).every((t) => t >= new Date('2026-10-15T09:01:00')), 'nothing older than 24 hours');
  assert.equal(canRecordLate(missed, { rations: [ration] }, new Date('2026-10-16T11:00:00')), false, 'too old to send');
  assert.equal(canRecordLate({ ...missed, makeUpTask: 'm1' }, { rations: [ration] }, noon), false, 'a make-up already stands in for it');
  assert.equal(canRecordLate({ ...missed, mealSlot: 'evening' }, { rations: [ration] }, noon), false, 'no approved ration, nothing to record');
  assert.equal(canRecordLate({ ...missed, timing: { state: 'open', canComplete: true } }, { rations: [ration] }, noon), false);
});

test('a make-up meal says so and keeps its own time; hoof care is stable work', () => {
  const makeUp = task({ taskType: 'feeding', mealSlot: 'evening', makeUpOf: 'meal-1', scheduledDate: new Date('2026-10-15T18:42:00').toISOString() });
  const info = describeTask(makeUp, [{ ...ration, mealTime: 'evening', timeOfDay: '17:30' }]);
  assert.equal(info.label, 'Cho ăn bù — Bữa tối');
  assert.equal(info.time, '18:42', 'when the trainer asked for it, not the ration time');
  assert.equal(info.makeUp, true);
  assert.ok(CHORE_TYPES.includes('hoof_care'));
  assert.equal(describeTask(task({ taskType: 'hoof_care' })).label, 'Chăm sóc móng');
});

test('a request the Manager approved in part says how much is coming', () => {
  const partial = { status: 'approved', awaitingDelivery: true, quantity: 10, approvedQuantity: 6 };
  assert.equal(restockState(partial).label, 'Duyệt 6/10 · chờ hàng về');
  assert.equal(approvedOf(partial), 6);
  assert.equal(approvedOf({ quantity: 10 }), 10, 'older requests: what was asked');
  assert.equal(restockState({ status: 'approved', awaitingDelivery: true, quantity: 10, approvedQuantity: 10 }).label, 'Đã duyệt · chờ hàng về');
});

test('an injury mark on the side view becomes a place along the 3D horse', async () => {
  const { hotspotFor, activeInjuries } = await import('../three/injuryHotspots.js');
  const hoof = hotspotFor({ coordinates: { x: 0.39, y: 0.88 } });
  assert.ok(hoof.along > 0.35 && hoof.along < 0.45, 'front leg, a little over a third of the way back');
  assert.ok(hoof.height < 0.1, 'near the ground');
  const head = hotspotFor({ coordinates: { x: 0.12, y: 0.09 } });
  assert.ok(head.along < 0.15 && head.height > 0.85);
  assert.deepEqual(hotspotFor({ coordinates: { x: 2, y: -1 } }), { along: 1, height: 1 }, 'kept on the horse');
  const list = activeInjuries([
    { _id: 'a', severity: 'mild', recoveryStatus: 'recovering' },
    { _id: 'b', severity: 'severe', recoveryStatus: 'new' },
    { _id: 'c', severity: 'severe', recoveryStatus: 'recovered' },
  ]);
  assert.deepEqual(list.map((m) => m._id), ['b', 'a'], 'healed ones are left out, worst first');
});

test('the 3D page: head to the right of a catalogue view, injury labels kept as text', async () => {
  const { horse360Html, initialOrbit } = await import('../three/horse360Html.js');
  assert.equal(initialOrbit('+z'), '-60deg 76deg 115%');
  assert.equal(initialOrbit('-x'), '-150deg 76deg 115%');
  const page = horse360Html({
    headDirection: '+z',
    animation: 'Horse|Horse_Idle',
    hotspots: [{ along: 0.4, height: 0.1, label: '<img src=x onerror=alert(1)>', sub: 'Nặng', color: '#ef4444' }],
  });
  assert.ok(!page.includes('<img src=x'), 'a body part from the server is shown as text, never as markup');
  assert.ok(page.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(page.includes('animation-name="Horse|Horse_Idle"'));
  assert.ok(page.includes('class="floor"'), 'the card stage has its glow ring');
  assert.ok(!horse360Html({ interactive: true }).includes('class="floor"'), 'full screen does not');
});
