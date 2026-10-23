const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

// The socket server stands in for itself: the events the inventory routes send are recorded here.
const sent = [];
const socketServer = require('../src/realtime/socketServer');
socketServer.getIO = () => ({ emit: (event, payload) => sent.push({ event, payload }) });
const { broadcastWrites, emitInventoryChanged, amountText } = require('../src/modules/inventory/stockEvents');

/** Runs the middleware for one request and finishes the response with `status`. */
function write(method, path, status) {
  const res = new EventEmitter();
  res.statusCode = status;
  let passed = false;
  broadcastWrites({ method, path }, res, () => {
    passed = true;
  });
  res.emit('finish');
  return passed;
}

test('a write to the storeroom that succeeds reloads every open stock screen; a read or a refusal does not', () => {
  sent.length = 0;
  assert.equal(write('POST', '/', 201), true, 'the request goes on to its route');
  assert.equal(write('POST', '/abc123/receive', 200), true);
  write('PUT', '/abc123', 400);
  write('DELETE', '/abc123', 409);
  write('GET', '/', 200);
  assert.deepEqual(
    sent.map((s) => [s.event, s.payload.method, s.payload.itemId]),
    [
      ['inventory:changed', 'POST', null],
      ['inventory:changed', 'POST', 'abc123'],
    ]
  );
});

test('without a socket server (a script, a test) a stock change is simply not announced', () => {
  const real = socketServer.getIO;
  socketServer.getIO = () => {
    throw new Error('Socket.io not initialized yet.');
  };
  try {
    // stockEvents keeps the getIO it was given, so this checks the guard through a fresh copy.
    delete require.cache[require.resolve('../src/modules/inventory/stockEvents')];
    const fresh = require('../src/modules/inventory/stockEvents');
    assert.doesNotThrow(() => fresh.emitInventoryChanged({ itemId: 'x' }));
  } finally {
    socketServer.getIO = real;
    delete require.cache[require.resolve('../src/modules/inventory/stockEvents')];
  }
  assert.doesNotThrow(() => emitInventoryChanged());
});

test('the amount in a stock message reads in its unit and in the packs it is bought in', () => {
  const oats = { unit: 'kg', packUnit: 'bao', packSize: 25 };
  assert.equal(amountText(oats, 50), '50 kg (2 bao)');
  assert.equal(amountText(oats, 60), '60 kg (2 bao + 10 kg)');
  assert.equal(amountText(oats, 10), '10 kg');
  assert.equal(amountText({ unit: 'cái' }, 8), '8 cái');
});
