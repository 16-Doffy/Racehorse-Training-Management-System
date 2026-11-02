const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { startIntegration } = require('../../test-support/integration');

const once = (socket, event, ms = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
  socket.once(event, (payload) => {
    clearTimeout(timer);
    resolve(payload);
  });
});

test('who may stay connected, how often a password may be guessed, what the API sends and no longer serves', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('accessguards');
  const sockets = [];
  const open = (token) => {
    const socket = connect(ctx.baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    return socket;
  };
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    await ctx.close();
  });
  const login = (email) => fetch(`${ctx.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong-password' }),
  });

  await t.test('a blocked account is cut off at once and cannot connect again, though its token has not expired', async () => {
    const vet = open(ctx.tokens.vet);
    await once(vet, 'connect');
    const cut = once(vet, 'disconnect');
    await ctx.api('manager', 'PUT', `/users/${ctx.users.vet._id}`, { isActive: false });
    await cut;
    const again = open(ctx.tokens.vet);
    assert.match((await once(again, 'connect_error')).message, /not active/);
  });

  await t.test('an active account connects as before', async () => {
    await once(open(ctx.tokens.trainer), 'connect');
  });

  await t.test('ten wrong passwords stop that account from this address, and only that account', async () => {
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await login('nobody@test.local')).status, 401);
    }
    const stopped = await login('nobody@test.local');
    assert.equal(stopped.status, 429);
    assert.match((await stopped.json()).message, /15 phút/);
    assert.equal((await login('someone.else@test.local')).status, 401);
  });

  await t.test('the headers are set, files may be shown on the client, and the old disk folder is gone', async () => {
    const health = await fetch(`${ctx.baseUrl}/api/v1/health-check`);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.equal(health.headers.get('content-security-policy'), null);
    assert.equal((await fetch(`${ctx.baseUrl}/uploads/incidents/anything.png`)).status, 404);
  });
});
