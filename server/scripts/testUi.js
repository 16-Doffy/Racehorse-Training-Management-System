const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { startIntegration, intake, planFor, book, day, clock, TEST_PASSWORD } = require('../test-support/integration');
const root = path.resolve(__dirname, '../..');
async function main() {
  const groomEnabled = !process.argv.includes('--groom-disabled');
  const ctx = await startIntegration('ui');
  let vite;
  try {
    const { horse } = await intake(ctx, 'TEST Browser Horse');
    const plan = await planFor(ctx, horse);
    await book(ctx, horse, plan);
    const race = await ctx.api('trainer', 'POST', '/races', { horse: horse._id, raceName: 'TEST Browser Cup', raceDate: day().toISOString(), distance: 1600 }, 201);
    await ctx.api('trainer', 'PATCH', `/races/${race._id}/results`, { position: 1, prizeMoney: 1000000 });
    const feed = await ctx.api('manager', 'POST', '/inventory', { name: 'TEST Browser Feed', category: 'feed', unit: 'kg', quantity: 100 }, 201);
    await ctx.api('trainer', 'POST', '/feeding', { horse: horse._id, mealTime: 'noon', timeOfDay: clock(), items: [{ inventoryItem: feed._id, amount: 2 }] }, 201);
    for (const note of ['TEST complete task', 'TEST not done task', 'TEST incident task']) {
      const due = new Date(Date.now() + 5 * 60000);
      await ctx.api('trainer', 'POST', '/stable/tasks', { horse: horse._id, assignedTo: ctx.users.groom.id, taskType: 'cleaning', dueTime: clock(due), scheduledDate: due.toISOString(), note }, 201);
    }
    fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
    const fixture = path.join(root, 'scratch/ui-fixture.json');
    fs.writeFileSync(fixture, JSON.stringify({ horseId: horse._id, password: TEST_PASSWORD, apiUrl: ctx.baseUrl }));
    vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5180', '--strictPort'], {
      cwd: path.join(root, 'client'), stdio: 'inherit',
      env: { ...process.env, VITE_API_BASE_URL: `${ctx.baseUrl}/api/v1`, VITE_SOCKET_URL: ctx.baseUrl, VITE_ENABLE_GROOM_WEB: String(groomEnabled) },
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (vite.exitCode !== null) throw new Error('Vite exited before becoming ready.');
      try { ready = (await fetch('http://127.0.0.1:5180')).ok; } catch { /* wait for Vite */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error('Vite readiness timed out.');
    const status = await new Promise((resolve, reject) => {
      const tests = spawn(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...(groomEnabled ? ['--grep-invert', 'Groom web disabled'] : ['--grep', 'Groom web disabled'])], {
        cwd: path.join(root, 'client'), stdio: 'inherit', env: { ...process.env, UI_TEST_FIXTURE: fixture },
      });
      tests.on('error', reject);
      tests.on('close', (code) => resolve(code ?? 1));
    });
    process.exitCode = status;
  } finally {
    if (vite && vite.exitCode === null) {
      const stopped = new Promise((resolve) => vite.once('close', resolve));
      vite.kill();
      await stopped;
    }
    await ctx.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
