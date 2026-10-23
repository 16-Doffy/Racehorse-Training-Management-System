const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { startIntegration } = require('../../test-support/integration');

/** Resolves with the first `event` the socket receives that `match` accepts, or fails after `ms`. */
function next(socket, event, match = () => true, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
    const handler = (payload) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

// The Manager stocks the storeroom; the grooms' app hears it at once over the socket, both as a
// notification (the bell, the banner) and as a signal to reload the stock it shows.
test('stock goes live: the grooms hear a new item and a delivery the moment the Manager records them', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('stocklive');
  const groom = connect(ctx.baseUrl, { auth: { token: ctx.tokens.groom }, transports: ['websocket'] });
  t.after(async () => {
    groom.disconnect();
    await ctx.close();
  });
  await new Promise((resolve, reject) => {
    groom.on('connect', resolve);
    groom.on('connect_error', reject);
  });
  const { api, tokens } = ctx;

  await t.test('a new item reaches the grooms as a notification and reloads their stock', async () => {
    const told = next(groom, 'notification:new', (n) => /TEST Yến mạch live/.test(n.message));
    const changed = next(groom, 'inventory:changed', (c) => c.method === 'POST');
    const item = await api('manager', 'POST', '/inventory', { name: 'TEST Yến mạch live', category: 'feed', unit: 'kg', quantity: 50, packUnit: 'bao', packSize: 25 }, 201);
    const notification = await told;
    assert.equal(notification.type, 'stock_update');
    assert.match(notification.message, /mặt hàng mới \(thức ăn\): "TEST Yến mạch live" — đang có 50 kg \(2 bao\)/);
    await changed;
    // Stored too: a groom who was offline finds it in the bell.
    const list = await api('groom', 'GET', '/notifications');
    assert.ok(list.some((n) => n._id === notification._id));
    ctx.item = item;
  });

  await t.test('a delivery counted in reaches them with the new total', async () => {
    const told = next(groom, 'notification:new', (n) => /vừa nhập thêm/.test(n.message));
    await api('manager', 'POST', `/inventory/${ctx.item._id}/receive`, { packs: 2 });
    assert.match((await told).message, /vừa nhập thêm 50 kg \(2 bao\) "TEST Yến mạch live" — tồn hiện tại 100 kg \(4 bao\)/);
  });

  await t.test('a refused write announces nothing', async () => {
    const silent = next(groom, 'inventory:changed', () => true, 700);
    const refused = await fetch(`${ctx.baseUrl}/api/v1/inventory`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.manager}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', category: 'feed', unit: 'kg' }),
    });
    assert.equal(refused.status, 400);
    await assert.rejects(silent, /no inventory:changed/);
  });
});
