// Run with: npm test (from /mobile). No phone needed: storage and the server are stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox, isNetworkError, MAX_SERVER_ERRORS, OUTBOX_KEY } from './outbox.js';
import { applyOutbox } from './overlay.js';

const offline = () => Object.assign(new Error('Network Error'), { isNetworkError: true });
const refused = (message, status = 409) => Object.assign(new Error(message), { message, status });

function setup(overrides = {}) {
  const disk = new Map();
  const storage = {
    getItem: async (k) => disk.get(k) ?? null,
    setItem: async (k, v) => void disk.set(k, v),
  };
  const sent = [];
  let behaviour = async () => ({ ok: true });
  const handlers = {
    complete: {
      send: async (args, opts) => {
        sent.push({ args, opts });
        return behaviour(args);
      },
      alreadyDone: overrides.alreadyDone,
    },
    acknowledge: { send: async (args) => (sent.push({ args }), behaviour(args)) },
  };
  let t = 1000;
  const box = createOutbox({ storage, handlers, now: () => ++t, makeId: (() => { let n = 0; return () => `id${++n}`; })() });
  return { box, disk, sent, setBehaviour: (fn) => (behaviour = fn), handlers };
}
const settle = () => new Promise((r) => setTimeout(r, 5)); // lets a background flush finish
const meta = (taskId = 't1') => ({ userId: 'u1', label: 'Cho ăn', horseName: 'Thunder Bolt', taskId });

test('online: the write goes out at once and nothing is queued', async () => {
  const { box, sent } = setup();
  const res = await box.submit('complete', { taskId: 't1', payload: {} }, meta());
  assert.equal(res.queued, false);
  assert.equal(sent.length, 1);
  assert.equal(box.getState().items.length, 0);
});

test('a dead connection queues the write instead of losing it, and saves it to storage', async () => {
  const { box, setBehaviour, disk } = setup();
  setBehaviour(async () => { throw offline(); });
  const res = await box.submit('complete', { taskId: 't1', payload: {} }, meta());
  assert.equal(res.queued, true);
  assert.equal(box.getState().items.length, 1);
  assert.equal(box.getState().items[0].attempts, 1, 'the first try counts: the answer may have been lost');
  assert.equal(JSON.parse(disk.get(OUTBOX_KEY)).items.length, 1);
});

test('a refusal from the server is thrown, not queued', async () => {
  const { box, setBehaviour } = setup();
  setBehaviour(async () => { throw refused('Chưa tới giờ'); });
  await assert.rejects(box.submit('complete', { taskId: 't1' }, meta()), /Chưa tới giờ/);
  assert.equal(box.getState().items.length, 0);
});

test('the outbox survives a restart', async () => {
  const a = setup();
  a.setBehaviour(async () => { throw offline(); });
  await a.box.submit('complete', { taskId: 't1' }, meta());
  const b = createOutbox({ storage: { getItem: async (k) => a.disk.get(k) ?? null, setItem: async () => {} }, handlers: a.handlers });
  await b.load();
  assert.equal(b.getState().items.length, 1);
  assert.equal(b.getState().items[0].taskId, 't1');
});

test('a damaged file starts the outbox empty instead of crashing', async () => {
  const box = createOutbox({ storage: { getItem: async () => '{not json', setItem: async () => {} }, handlers: {} });
  await box.load();
  assert.deepEqual(box.getState().items, []);
});

test('flush sends the queue oldest first and empties it', async () => {
  const { box, setBehaviour, sent } = setup();
  setBehaviour(async () => { throw offline(); });
  await box.submit('complete', { taskId: 'a' }, meta('a'));
  await box.submit('acknowledge', { taskId: 'b' }, meta('b'));
  await settle();
  sent.length = 0;
  setBehaviour(async () => ({ ok: true }));
  const out = await box.flush('u1');
  assert.deepEqual(out, { sent: 2, failed: 0, offline: false });
  assert.deepEqual(sent.map((s) => s.args.taskId), ['a', 'b']);
  assert.equal(box.getState().items.length, 0);
});

test('flush stops at the first dead connection and keeps everything', async () => {
  const { box, setBehaviour, sent } = setup();
  setBehaviour(async () => { throw offline(); });
  await box.submit('complete', { taskId: 'a' }, meta('a'));
  await box.submit('complete', { taskId: 'b' }, meta('b'));
  await settle();
  sent.length = 0;
  const out = await box.flush('u1');
  assert.equal(out.offline, true);
  assert.equal(sent.length, 1, 'does not hammer a dead link with every item');
  assert.equal(box.getState().items.length, 2);
});

test('a write queued while others wait goes behind them, in order', async () => {
  const { box, setBehaviour, sent } = setup();
  setBehaviour(async () => { throw offline(); });
  await box.submit('complete', { taskId: 'a' }, meta('a'));
  setBehaviour(async () => ({ ok: true }));
  sent.length = 0;
  const res = await box.submit('acknowledge', { taskId: 'b' }, meta('b'));
  assert.equal(res.queued, true, 'it did not jump the queue');
  await box.flush('u1');
  assert.deepEqual(sent.map((s) => s.args.taskId), ['a', 'b']);
});

test('a refusal during flush becomes a failure with the server reason, and the rest still go', async () => {
  const { box, setBehaviour } = setup();
  setBehaviour(async () => { throw offline(); });
  await box.submit('complete', { taskId: 'a' }, meta('a'));
  await box.submit('complete', { taskId: 'b' }, meta('b'));
  await settle();
  setBehaviour(async (args) => {
    if (args.taskId === 'a') throw refused('Ngoài giờ ghi nhận bữa ăn');
    return { ok: true };
  });
  const out = await box.flush('u1');
  assert.deepEqual(out, { sent: 1, failed: 1, offline: false });
  assert.equal(box.getState().items.length, 0);
  assert.equal(box.getState().failures.length, 1);
  assert.equal(box.getState().failures[0].message, 'Ngoài giờ ghi nhận bữa ăn');
  assert.equal(box.getState().failures[0].horseName, 'Thunder Bolt');
});

test('a "refusal" that is really the first try having gone through counts as sent', async () => {
  const { box, setBehaviour } = setup({ alreadyDone: async () => true });
  setBehaviour(async () => { throw offline(); });
  await box.submit('complete', { taskId: 'a' }, meta('a'));
  setBehaviour(async () => { throw refused('Đã hoàn thành rồi'); });
  const out = await box.flush('u1');
  assert.deepEqual(out, { sent: 1, failed: 0, offline: false });
  assert.equal(box.getState().failures.length, 0);
});

test('a server that keeps failing is given up on after a few tries, not retried forever', async () => {
  const { box, setBehaviour } = setup();
  setBehaviour(async () => { throw offline(); });
  await box.submit('complete', { taskId: 'a' }, meta('a'));
  setBehaviour(async () => { throw refused('Lỗi máy chủ', 503); });
  for (let i = 0; i < MAX_SERVER_ERRORS + 1; i++) await box.flush('u1');
  assert.equal(box.getState().items.length, 0);
  assert.equal(box.getState().failures.length, 1);
});

test('flush only sends the signed-in groom\'s writes', async () => {
  const { box, setBehaviour, sent } = setup();
  setBehaviour(async () => { throw offline(); });
  await box.submit('complete', { taskId: 'a' }, { ...meta('a'), userId: 'u1' });
  await box.submit('complete', { taskId: 'b' }, { ...meta('b'), userId: 'u2' });
  setBehaviour(async () => ({ ok: true }));
  sent.length = 0;
  await box.flush('u2');
  assert.deepEqual(sent.map((s) => s.args.taskId), ['b']);
  assert.equal(box.getState().items.length, 1);
  assert.equal(box.getState().items[0].userId, 'u1');
});

test('dismissing a failure removes it', async () => {
  const { box, setBehaviour } = setup();
  setBehaviour(async () => { throw offline(); });
  await box.submit('complete', { taskId: 'a' }, meta('a'));
  setBehaviour(async () => { throw refused('x'); });
  await box.flush('u1');
  await box.dismissFailure(box.getState().failures[0].id);
  assert.equal(box.getState().failures.length, 0);
});

test('two flushes at once run once', async () => {
  const { box, setBehaviour, sent } = setup();
  setBehaviour(async () => { throw offline(); });
  await box.submit('complete', { taskId: 'a' }, meta('a'));
  setBehaviour(async () => ({ ok: true }));
  sent.length = 0;
  await Promise.all([box.flush('u1'), box.flush('u1')]);
  assert.equal(sent.length, 1);
});

test('isNetworkError only matches the flag the client sets', () => {
  assert.equal(isNetworkError({ isNetworkError: true }), true);
  assert.equal(isNetworkError({ status: 500 }), false);
  assert.equal(isNetworkError(null), false);
});

// ------------------------------------------------------------------ overlay

const tasks = [
  { _id: 'a', status: 'pending', timing: { canComplete: true } },
  { _id: 'b', status: 'pending' },
  { _id: 'c', status: 'completed' },
];

test('overlay: a queued completion shows the task as done, marked as waiting', () => {
  const out = applyOutbox(tasks, [{ type: 'complete', taskId: 'a', createdAt: 5000 }]);
  assert.equal(out[0].status, 'completed');
  assert.equal(out[0].pendingSync, true);
  assert.equal(out[0].timing.canComplete, false);
  assert.equal(out[1].status, 'pending');
});

test('overlay: a queued "not done" shows the reason', () => {
  const out = applyOutbox(tasks, [{ type: 'notDone', taskId: 'b', args: { reason: 'Ngựa nhả thuốc' }, createdAt: 1 }]);
  assert.equal(out[1].status, 'skipped');
  assert.equal(out[1].skipReason, 'Ngựa nhả thuốc');
});

test('overlay: does not touch a task the server already has as completed, and returns the same list when nothing waits', () => {
  assert.equal(applyOutbox(tasks, []), tasks);
  const out = applyOutbox(tasks, [{ type: 'complete', taskId: 'c', createdAt: 1 }]);
  assert.equal(out[2].pendingSync, undefined);
});

test('a queued write keeps the time of the tap and the action id, unchanged on every resend', async () => {
  const { box, sent, setBehaviour } = setup();
  setBehaviour(async () => {
    throw offline();
  });
  const res = await box.submit('complete', { taskId: 't1', payload: {} }, meta());
  assert.equal(res.queued, true);
  const first = sent[0].args;
  assert.ok(first.performedAt && first.clientOpId, 'the time of the tap and an id the server can recognise a resend by');
  await box.flush('u1');
  setBehaviour(async () => ({ ok: true }));
  await box.flush('u1');
  const last = sent[sent.length - 1].args;
  assert.equal(last.performedAt, first.performedAt, 'sent later, still the time it was done');
  assert.equal(last.clientOpId, first.clientOpId);
  assert.equal(box.getState().items.length, 0);
});
