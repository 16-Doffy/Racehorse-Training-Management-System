const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const envFile = path.join(__dirname, '..', 'src', 'config', 'env.js');
// Run away from server/ so that no .env is read.
const load = (env) => spawnSync(process.execPath, ['-e', `require(${JSON.stringify(envFile)})`], { cwd: os.tmpdir(), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });

test('on the host the server does not start without its secret', () => {
  const run = load({ RENDER: 'true' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /JWT_SECRET is required/);
});

test('with the secret, or on a local machine, it starts', () => {
  assert.equal(load({ RENDER: 'true', JWT_SECRET: 'x' }).status, 0);
  assert.equal(load({}).status, 0);
});
