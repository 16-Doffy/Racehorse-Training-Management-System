const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { startIntegration, TEST_PASSWORD } = require('../../test-support/integration');

test('defenseData CLI dry-run, relay, report and final work against real server', { skip: !process.env.TEST_MONGO_URI }, async (t) => {
  const ctx = await startIntegration('defensedata');
  t.after(() => ctx.close());
  const { api, users, baseUrl } = ctx;
  const accounts = { password: TEST_PASSWORD, ...Object.fromEntries(['manager', 'trainer', 'vet', 'groom', 'owner'].map((r) => [r, users[r].email])) };
  await api('manager', 'POST', '/inventory', { name: 'Yến mạch viên', category: 'feed', unit: 'kg', quantity: 200, feedType: 'concentrate' }, 201);

  const runScript = (env = {}) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../../scripts/defenseData.js')], {
      env: {
        ...process.env,
        LIVE_API_URL: `${baseUrl}/api/v1`,
        DEFENSE_ACCOUNTS: JSON.stringify(accounts),
        DEMO_ACCOUNTS: JSON.stringify(accounts),
        DEMO_LATEST_START: '23:59',
        GITHUB_STEP_SUMMARY: '',
        GITHUB_OUTPUT: '',
        GITHUB_ACTIONS: '',
        ...env,
      },
    });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });

  const dry = await runScript({ DEFENSE_CONFIRM: '', DEFENSE_SHIFT: 'morning', DEFENSE_DAY: '2026-11-18' });
  assert.equal(dry.code, 0, dry.output);
  assert.match(dry.output, /chỉ đọc: 2026-11-18 morning/);
  assert.match(dry.output, /Orion: pass/);
  assert.match(dry.output, /Pegasus: trial/);

  const relay = await runScript({ DEFENSE_CONFIRM: 'write', DEFENSE_SHIFT: 'relay' });
  assert.equal(relay.code, 0, relay.output);
  assert.match(relay.output, /Chờ qua đêm/);

  const report = await runScript({ DEFENSE_CONFIRM: 'write', DEFENSE_SHIFT: 'report' });
  assert.equal(report.code, 0, report.output);
  assert.match(report.output, /### Ngày /);
  assert.match(report.output, /### Các giải/);

  const final = await runScript({ DEFENSE_CONFIRM: 'write', DEFENSE_SHIFT: 'final' });
  assert.equal(final.code, 0, final.output);
  assert.match(final.output, /### Tổng kết 7 ngày/);
});
