const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { startIntegration, intake, planFor, book, start, day, future, TEST_PASSWORD } = require('../test-support/integration');
const root = path.resolve(__dirname, '../..');
async function main() {
  const ctx = await startIntegration('ui');
  let vite;
  try {
    const { horse } = await intake(ctx, 'TEST Browser Horse');
    await ctx.models.Horse.updateOne({ _id: horse._id }, { $set: { weightKg: 500 } });
    // Papers and the club's valuation, for the Owner's horse page (the valuation is the Manager's and the owner's only).
    await ctx.api('manager', 'PUT', `/horses/${horse._id}`, { microchipNumber: '985112345678901', registrationNumber: 'TEST-REG-001', valuationVnd: 750000000 });
    // A zone on the stable map with the horse in its first stall (stable map, horse stall card).
    const zone = await ctx.api('manager', 'POST', '/stable/stalls/generate', { zone: 'A', count: 4, zoneName: 'Khu A', zonePurpose: 'TEST ngựa đua' }, 201);
    await ctx.api('manager', 'POST', '/stable/assignments', { horse: horse._id, stall: zone.created[0]._id, assignedCaretaker: ctx.users.groom.id }, 201);
    // Routine care the vet did, for the owner's care map on the 3D horse: a cracked hoof, a shot in the neck.
    await ctx.api('vet', 'POST', `/horses/${horse._id}/care-events`, { kind: 'farrier', date: day().toISOString(), work: ['new_shoes'], limbs: ['fore_right'], hoofCondition: ['cracked'] }, 201);
    await ctx.api('vet', 'POST', `/horses/${horse._id}/care-events`, { kind: 'vaccination', date: day().toISOString(), product: 'TEST Equiflu', targets: ['influenza'], route: 'im', site: 'Cổ trái' }, 201);
    const plan = await planFor(ctx, horse);
    await book(ctx, horse, plan);
    // A run that already happened, with its numbers, for the dashboard's fitness panel: a walk started now
    // and ended with the readings typed in (allowed while no sensor has reported).
    const run = await book(ctx, horse, plan, { scheduledAt: future(40) });
    await start(ctx, run);
    await ctx.api('trainer', 'POST', `/training/sessions/${run._id}/end`, { metrics: { avgHeartRate: 112, maxHeartRate: 124, maxSpeed: 13.4, distance: 4000 } });
    await ctx.api('trainer', 'PATCH', `/training/sessions/${run._id}/evaluation`, { performanceRating: 8, trainerComment: 'TEST đi bộ đều, hồi sức tốt' });
    const race = await ctx.api('trainer', 'POST', '/races', { horse: horse._id, raceName: 'TEST Browser Cup', raceDate: day().toISOString(), distance: 1600 }, 201);
    await ctx.api('trainer', 'PATCH', `/races/${race._id}/results`, { position: 1, prizeMoney: 1000000 });
    await ctx.api('manager', 'POST', '/inventory', { name: 'TEST Browser Feed', category: 'feed', unit: 'kg', quantity: 100, feedType: 'concentrate' }, 201);
    await ctx.api('manager', 'POST', '/inventory', { name: 'TEST Browser Hay', category: 'feed', unit: 'kg', quantity: 200, feedType: 'forage' }, 201);
    fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
    const fixture = path.join(root, 'scratch/ui-fixture.json');
    fs.writeFileSync(fixture, JSON.stringify({ horseId: horse._id, password: TEST_PASSWORD, apiUrl: ctx.baseUrl }));
    vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5180', '--strictPort'], {
      cwd: path.join(root, 'client'), stdio: 'inherit',
      env: { ...process.env, VITE_API_BASE_URL: `${ctx.baseUrl}/api/v1`, VITE_SOCKET_URL: ctx.baseUrl },
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (vite.exitCode !== null) throw new Error('Vite exited before becoming ready.');
      try { ready = (await fetch('http://127.0.0.1:5180')).ok; } catch { /* wait for Vite */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error('Vite readiness timed out.');
    // Vite compiles the app on the first page load; on a busy machine that alone outlasted the first
    // test's 30 s. Load it once here, with time to spare, so every test starts on a compiled app.
    const { chromium } = require(path.join(root, 'node_modules/@playwright/test'));
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:5180/login', { timeout: 180000 });
      await page.locator('#email').waitFor({ timeout: 180000 });
    } finally {
      await browser.close();
    }
    const status = await new Promise((resolve, reject) => {
      const tests = spawn(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)], {
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
