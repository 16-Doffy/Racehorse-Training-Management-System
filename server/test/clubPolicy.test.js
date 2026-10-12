// Run with: npm test
// The club's rules: afternoon work, what a meal was, and that each value comes from the environment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const { slotKindProblem } = require('../src/constants/training');
const { mealKind } = require('../src/modules/training/readiness.service');

const at = (h, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

test('afternoon work is light only, morning anything', () => {
  assert.equal(slotKindProblem('breeze', at(7, 30)), null);
  assert.equal(slotKindProblem('trial', at(11, 59)), null);
  assert.equal(slotKindProblem('walk', at(16)), null);
  assert.equal(slotKindProblem('canter', at(16)), null);
  assert.match(slotKindProblem('breeze', at(12)), /quy định CLB/);
  assert.match(slotKindProblem('trial', at(16)), /buổi chiều chỉ tập nhẹ/);
});

test('a meal of hay is forage; grain or pellets, or no ration recorded, is a main meal', () => {
  const meal = (...names) => ({ supplies: names.map((name) => ({ name })) });
  assert.equal(mealKind(meal('Cỏ khô Timothy (Timothy Hay)')), 'forage');
  assert.equal(mealKind(meal('Cỏ khô Alfalfa (Alfalfa Hay)', 'Vitamin tổng hợp (Multivitamin)', 'Muối liếm (Salt Lick Block)')), 'forage', 'supplements do not count');
  assert.equal(mealKind(meal('Cỏ khô Timothy (Timothy Hay)', 'Yến mạch (Oats)')), 'main');
  assert.equal(mealKind(meal('Thức ăn viên chuyên dụng (Horse Pellets)')), 'main');
  assert.equal(mealKind({ supplies: [] }), 'main', 'unknown ration is judged as a main meal');
  assert.equal(mealKind(null), 'main');
});

test('the policy is read from the environment, and the afternoon rule can be switched off', () => {
  const script =
    "const p=require('./src/config/clubPolicy');const {slotKindProblem}=require('./src/constants/training');" +
    "const d=new Date();d.setHours(16,0,0,0);" +
    "process.stdout.write(JSON.stringify({light:p.afternoonLightOnly,fever:p.feverC,digest:p.digestMinutes,problem:slotKindProblem('breeze',d)}));";
  const run = (env) =>
    JSON.parse(spawnSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env: { ...process.env, ...env }, encoding: 'utf8' }).stdout);
  assert.deepEqual(run({ AFTERNOON_LIGHT_ONLY: 'false', POLICY_FEVER_C: '39', POLICY_DIGEST_MIN: '120' }), { light: false, fever: 39, digest: 120, problem: null });
  const defaults = run({ AFTERNOON_LIGHT_ONLY: '', POLICY_FEVER_C: '', POLICY_DIGEST_MIN: '' });
  assert.equal(defaults.light, true);
  assert.equal(defaults.fever, 38.6);
  assert.equal(defaults.digest, 90);
  assert.match(defaults.problem, /buổi chiều/);
});
