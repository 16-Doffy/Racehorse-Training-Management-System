#!/usr/bin/env node
// Evergreen 3-shift live auto-test on the REAL site through the same API people use
// (.github/workflows/defense-data.yml): every day runs three shifts across four test horses
// (Orion, Pegasus, Apollo, Titan) on a repeating Monday–Sunday cycle:
//
//   morning  05:00–11:00  the only shift with trials: the club allows them before noon
//   noon     11:00–16:00
//   evening  16:00–22:00  the day's results, and at 23:30 a report
//
// Real horses only live through autoOperate.js and are never touched here. Each Sunday races the weekly
// cup ("Cúp Tuần CLB dd/mm/yyyy"): morning weighs each horse's form (verdict), evening records results &
// prizes and enters next week's cup.
//
// Reads only unless DEFENSE_CONFIRM=write. DEFENSE_DAY (YYYY-MM-DD) and DEFENSE_SHIFT (morning, noon,
// evening, report, relay, final) replace what the clock says. A shift that has begun does not begin again, so
// any number of triggers is harmless. Each run asks for the next one when done (defenseClock.js):
//   morning 05:00 → noon 11:00 → evening 16:00 → report → relay (02:00) → morning 05:00.
if (process.env.DEMO_TZ) process.env.TZ = process.env.DEMO_TZ;
const fs = require('fs');
const clock = require('./defenseClock');

/** ISO calendar date N days from `dayStr` (YYYY-MM-DD), timezone-safe via UTC noon math. */
function addDays(dayStr, offset) {
  const d = new Date(`${dayStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
/** 0 = Monday .. 6 = Sunday for an ISO date string (YYYY-MM-DD). */
function weekDayIndex(dayStr) {
  const d = new Date(`${dayStr}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}
/** Weekly cup on Sunday of `dayStr`'s Mon–Sun week (shifted by `weekOffset` weeks). */
function weeklyCup(dayStr, weekOffset = 0) {
  const idx = weekDayIndex(dayStr);
  const date = addDays(dayStr, 6 - idx + weekOffset * 7);
  const [yyyy, mm, dd] = date.split('-');
  return { name: `Cúp Tuần CLB ${dd}/${mm}/${yyyy}`, date };
}
/** Upcoming drill race two days out, used by flowInjured so injury tests never cancel the Sunday cup. */
function drillRace(dayStr) {
  const date = addDays(dayStr, 2);
  const [, mm, dd] = date.split('-');
  return { name: `Cúp Diễn Tập Chấn Thương ${dd}/${mm}`, date };
}

const TODAY = new Date().toLocaleDateString('sv-SE');
// The day of the rota to run: today, or another for a rehearsal.
const ROTA_DAY = process.env.DEFENSE_DAY || TODAY;
const REPORT_DAY = new Date().getHours() < 3 ? new Date(Date.now() - 24 * 3600000).toLocaleDateString('sv-SE') : TODAY;
const SHIFT = clock.pickShift(process.env.DEFENSE_SHIFT, new Date());
if (['morning', 'noon', 'evening'].includes(SHIFT)) process.env.DEMO_MEAL_SLOT = SHIFT;
process.env.DEMO_LATEST_START = process.env.DEMO_LATEST_START || '23:30';
const demo = require('./demoFlows');

const { ids, must, refused, read, log, minutes, hhmm } = demo;
const WRITE = process.env.DEFENSE_CONFIRM === 'write';
const SLEEP_MIN = Number(process.env.DEFENSE_TIDY_MIN ?? 5);
const SHIFT_ENDS = { morning: '10:50', noon: '15:50', evening: '21:50' };
const SHIFT_WORDS = { morning: 'Ca sáng', noon: 'Ca trưa', evening: 'Ca tối', relay: 'Chờ qua đêm' };
const HAY_CLOCK = process.env.DEFENSE_HAY_CLOCK || '20:10';
const ORION = 'Orion';
const PEGASUS = 'Pegasus';
const READY = 'Apollo';
const DRILL = 'Titan';
const TEST_HORSES = [ORION, PEGASUS, READY, DRILL];
const NEW_HORSES = {
  [ORION]: { breed: 'Thoroughbred', sex: 'gelding', color: 'Bay', weightKg: 480, dob: '2021-03-18' },
  [PEGASUS]: { breed: 'Arabian', sex: 'mare', color: 'Grey', weightKg: 450, dob: '2022-02-09' },
  [READY]: { breed: 'Thoroughbred', sex: 'colt', color: 'Chestnut', weightKg: 470, dob: '2021-06-10' },
  [DRILL]: { breed: 'Quarter Horse', sex: 'filly', color: 'Dark Bay', weightKg: 460, dob: '2022-01-22' },
};
const RATION_TIMES = { morning: process.env.DEFENSE_BREAKFAST || '06:00', noon: '12:00', evening: '17:00' };
const FAST_EXAM = (diagnosis, resultStatus, extra = {}) => ({
  diagnosis, resultStatus,
  vitalSigns: { temperatureC: 37.7, heartRate: 38, respiratoryRate: 12 },
  clinical: { mucousMembrane: 'pink', capillaryRefillSec: 1.5, gutSounds: 'normal', hydration: 'normal', lamenessGrade: 0 },
  ...extra,
});

const aim = (race) => {
  process.env.DEMO_RACE_DATE = race.date;
  process.env.DEMO_RACE_NAME = race.name;
};
const idOf = (x) => String(x?._id || x || '');
const atClock = (text) => {
  const [h, m] = text.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const allHorses = async () => (await read('manager', '/horses')) || [];
async function horseNamed(name) {
  return (await allHorses()).find((h) => h.name === name);
}
async function setupOf(name) {
  const horse = await horseNamed(name);
  if (!horse) throw new Error(`Không thấy ngựa "${name}".`);
  const plans = (await read('trainer', '/training/plans')) || [];
  const plan = plans.find((p) => p.status === 'active' && idOf(p.horse) === idOf(horse));
  return { horse, plan };
}
const stallsNow = async () => (await read('manager', '/stable/stalls')) || { stalls: [], waiting: [] };
async function whereIs(horse) {
  const { stalls } = await stallsNow();
  return stalls.find((s) => idOf(s.occupant?.horse) === idOf(horse));
}
/** Says where the horse stands, and whether that is the kind of stall its health asks for. */
async function expectStall(F, horse, type, what) {
  const stall = await whereIs(horse);
  log(F, 'manager', what, (stall?.type || 'standard') === type, stall ? `${stall.code} (${stall.type || 'standard'})` : 'không thấy chuồng');
}
const exam = (F, horse, label, body) => must(F, 'vet', label, 'POST', '/health/records', { horse: horse._id, ...body });

const findFreeStandardStall = (stalls) => {
  const free = stalls.filter((s) => (s.type || 'standard') === 'standard' && s.status !== 'maintenance' && !s.occupied && !s.reservedFor);
  return free.find((s) => s.zone === 'A') || free[0];
};
/** A horse new to the club: profile, a free ordinary stall and its groom, an exam, a breakfast, a plan. */
async function newHorse(F, name, ctx) {
  const horse = await must(F, 'manager', `thêm ngựa "${name}", giao chủ, HLV, bác sĩ`, 'POST', '/horses', {
    name, ...NEW_HORSES[name], owner: ids.owner, assignedTrainer: ids.trainer, assignedVet: ids.vet,
  }, 201);
  const free = findFreeStandardStall((await stallsNow()).stalls);
  await must(F, 'manager', `xếp chuồng ${free?.code}, giao nhân viên chăm sóc`, 'POST', '/stable/assignments', { horse: horse._id, stall: free?._id, assignedCaretaker: ids.groom }, 201);
  await exam(F, horse, demo.INTAKE_EXAM.label, demo.INTAKE_EXAM.body);
  await must(F, 'trainer', `khẩu phần bữa sáng ${RATION_TIMES.morning}: 2,5 ${ctx.feed.unit} ${ctx.feed.name}`, 'POST', '/feeding', {
    horse: horse._id, mealTime: 'morning', timeOfDay: RATION_TIMES.morning, items: [{ inventoryItem: ctx.feed._id, amount: 2.5 }],
  }, 201);
  await must(F, 'trainer', 'kế hoạch nền tảng sức bền (đang áp dụng)', 'POST', '/training/plans', {
    horse: horse._id, phase: 'base_building', distanceTarget: 1600, weeklyVolumeKm: 20, intensity: 'moderate', surface: 'dirt',
    startDate: new Date().toISOString(), status: 'active', goal: 'Sức bền trước các giải đấu tuần',
  }, 201);
}
/** Whatever a shift needs and is not there yet: the four test horses, stalls, active plans, and 3 meals. */
async function prepare(ctx) {
  const F = 'Chuẩn bị';
  const horses = await allHorses();
  for (const name of TEST_HORSES) {
    // eslint-disable-next-line no-await-in-loop
    if (!horses.some((h) => h.name === name)) await newHorse(F, name, ctx);
  }
  const [rations, plans, { stalls, waiting }] = await Promise.all([
    read('trainer', '/feeding'),
    read('trainer', '/training/plans'),
    stallsNow(),
  ]);
  for (const name of TEST_HORSES) {
    // eslint-disable-next-line no-await-in-loop
    const horse = await horseNamed(name);
    if (!horse) throw new Error(`Không thấy ngựa "${name}".`);
    const stabled = stalls.some((s) => idOf(s.occupant?.horse) === idOf(horse)) || waiting.some((w) => idOf(w.horse) === idOf(horse));
    if (!stabled) {
      const free = findFreeStandardStall((await stallsNow()).stalls);
      // eslint-disable-next-line no-await-in-loop
      if (free) await must(F, 'manager', `${name}: xếp chuồng ${free.code}`, 'POST', '/stable/assignments', { horse: horse._id, stall: free._id, assignedCaretaker: ids.groom }, 201);
    }
    if (!(plans || []).some((p) => p.status === 'active' && idOf(p.horse) === idOf(horse))) {
      // eslint-disable-next-line no-await-in-loop
      await must(F, 'trainer', `${name}: tạo kế hoạch huấn luyện mới`, 'POST', '/training/plans', {
        horse: horse._id, phase: 'base_building', distanceTarget: 1600, weeklyVolumeKm: 20, intensity: 'moderate', surface: 'dirt',
        startDate: new Date().toISOString(), status: 'active', goal: 'Sức bền trước các giải đấu tuần',
      }, 201);
    }
    for (const [slot, amount] of [['morning', 2.5], ['noon', 1], ['evening', 1]]) {
      if (!(rations || []).some((r) => idOf(r.horse) === idOf(horse) && r.mealTime === slot)) {
        // eslint-disable-next-line no-await-in-loop
        await must(F, 'trainer', `${name}: thêm bữa ${RATION_TIMES[slot]}, ${amount} ${ctx.feed.unit} ${ctx.feed.name}`, 'POST', '/feeding', {
          horse: horse._id, mealTime: slot, timeOfDay: RATION_TIMES[slot], items: [{ inventoryItem: ctx.feed._id, amount }],
        }, 201);
      }
    }
  }
}

const entriesOf = async (race) => ((await read('trainer', '/races')) || []).filter((e) => e.raceName === race.name);
/** Enters the horse for the race, if it is not already, and points its plan at that race. */
async function enter(F, setup, race) {
  aim(race);
  const { horse, plan } = setup;
  const entry = (await entriesOf(race)).find((e) => idOf(e.horse) === idOf(horse)) || await demo.registerRace(F, horse);
  if (TEST_HORSES.includes(horse.name) && plan && idOf(plan.targetRace) !== idOf(entry)) {
    await must(F, 'trainer', `kế hoạch của ${horse.name} hướng tới ${race.name}`, 'PUT', `/training/plans/${plan._id}`, { targetRace: entry._id });
  }
  return entry;
}
async function enterAll(F, race, names) {
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    const horse = await horseNamed(name);
    if (!horse) {
      log(F, 'trainer', `${name}: không có ngựa để đăng ký ${race.name}`, true);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await enter(F, await setupOf(name), race);
  }
}
/** The race's results. `places`: [[horse name, position, finish time, prize]]; a horse not running is skipped and said. */
async function recordRace(F, race, places) {
  const entries = await entriesOf(race);
  for (const [name, position, finishTime, prizeMoney] of places) {
    const entry = entries.find((e) => e.horse?.name === name);
    if (!entry || entry.status === 'withdrawn') {
      log(F, 'trainer', `${name}: không có kết quả ở ${race.name}`, true, entry ? 'đã rút khỏi giải' : 'chưa đăng ký');
      continue;
    }
    if (entry.status === 'completed') {
      log(F, 'trainer', `${name}: đã có kết quả ở ${race.name}`, true, entry.result);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await must(F, 'trainer', `${race.name}: ${name} hạng ${position}, ${finishTime}, thưởng ${demo.vnd(prizeMoney)}`, 'PATCH', `/races/${entry._id}/results`, { position, finishTime, prizeMoney });
  }
}

const trialReason = /chạy thử/i;
const formLine = (form) => (form ? `${form.label}: tập ${form.done}/${form.due} buổi, đạt ${form.met}/${form.rated}, chạy thử ${form.trial || 'không có'}` : 'chưa có kế hoạch');
/**
 * Race morning: each horse's record decides. The vet's stop, or a record below the club's bar, withdraws
 * it; otherwise it runs. A missed trial alone stays the trainer's call, taken with a reason.
 */
async function verdict(race, names) {
  const F = `Xét dự giải · ${race.name}`;
  const entries = await entriesOf(race);
  const plans = (await read('trainer', '/training/plans')) || [];
  for (const name of names) {
    const entry = entries.find((e) => e.horse?.name === name);
    if (!entry || !['registered', 'confirmed'].includes(entry.status)) continue;
    const plan = plans.find((p) => p.status === 'active' && p.horse?.name === name);
    const form = plan?.progress?.form;
    log(F, 'trainer', `${name}: kết luận của hệ thống`, true, `${formLine(form)}${form?.reasons?.length ? ` — ${form.reasons.join(' ')}` : ''}`);
    const against = form?.status === 'blocked' ? form.reasons : (form?.status === 'not_ready' ? form.reasons.filter((r) => !trialReason.test(r)) : []);
    if (against.length) {
      if (form.status === 'blocked') {
        // eslint-disable-next-line no-await-in-loop
        await refused(F, 'trainer', `${name}: xác nhận dự giải → bị chặn`, 'POST', `/races/${entry._id}/decision`, { decision: 'confirmed', reason: 'HLV vẫn muốn cho thi đấu.' });
      }
      // eslint-disable-next-line no-await-in-loop
      await must(F, 'trainer', `${name}: không đủ điều kiện, rút khỏi giải`, 'POST', `/races/${entry._id}/decision`, { decision: 'withdrawn', reason: against.join(' ') });
    } else if (entry.status === 'registered') {
      // eslint-disable-next-line no-await-in-loop
      const trials = (await read('trainer', `/races/${entry._id}/trials`)) || [];
      const passed = trials.some((t) => t.outcome?.met === true);
      // eslint-disable-next-line no-await-in-loop
      await must(F, 'trainer', `${name}: đủ điều kiện, xác nhận dự giải`, 'POST', `/races/${entry._id}/decision`, {
        decision: 'confirmed',
        ...(passed ? {} : { reason: 'Quá trình tập đạt yêu cầu; chưa có buổi chạy thử đạt, HLV vẫn cho thi đấu và giữ sức nửa đầu.' }),
      });
    }
  }
}

/** Whether the horse has no ongoing training lock, no unrecovered injury, and high medical clearance. */
async function isFit(horse) {
  const [treatments, markers, records] = await Promise.all([
    read('vet', `/health/treatments?horse=${horse._id}`),
    read('vet', `/health/injury-markers?horse=${horse._id}`),
    read('vet', `/health/records?horse=${horse._id}`),
  ]);
  const locked = (treatments || []).some((t) => idOf(t.horse) === idOf(horse) && t.status === 'ongoing' && t.trainingLevel && t.trainingLevel !== 'high');
  const hurt = (markers || []).some((m) => idOf(m.horse) === idOf(horse) && m.recoveryStatus !== 'recovered');
  const latest = [...(records || [])]
    .filter((r) => idOf(r.horse) === idOf(horse))
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))[0];
  const notCleared = latest && (latest.resultStatus !== 'eligible' || (latest.clearedLevel && latest.clearedLevel !== 'high'));
  return !locked && !hurt && !notCleared;
}

/** The vet finds the horse fit: its treatments closed, its injuries recovered, then the exam that clears it. */
async function clearHorse(F, horse) {
  const treatments = ((await read('vet', `/health/treatments?horse=${horse._id}`)) || []).filter((t) => idOf(t.horse) === idOf(horse) && t.status === 'ongoing');
  for (const t of treatments) {
    // eslint-disable-next-line no-await-in-loop
    await must(F, 'vet', 'kết thúc đợt điều trị, mở khóa tập', 'PUT', `/health/treatments/${t._id}`, { status: 'completed' });
  }
  const markers = ((await read('vet', `/health/injury-markers?horse=${horse._id}`)) || []).filter((m) => idOf(m.horse) === idOf(horse) && m.recoveryStatus !== 'recovered');
  for (const m of markers) {
    // eslint-disable-next-line no-await-in-loop
    await must(F, 'vet', `chấn thương "${m.bodyPart}" đã hồi phục`, 'PUT', `/health/injury-markers/${m._id}`, { recoveryStatus: 'recovered' });
  }
  await exam(F, horse, 'tái khám: đủ điều kiện tập', FAST_EXAM('Tái khám: hết sưng nóng, đi lại bình thường. Đủ điều kiện tập.', 'eligible', { clearedLevel: 'high' }));
}

/** Clears any lingering lock/injury only if the horse is not already fit. Returns true if cleared. */
async function ensureFit(F, horse) {
  if (await isFit(horse)) return false;
  await clearHorse(F, horse);
  return true;
}

/** Cleared for light work only, for as long as the rota says. The exam comes once. */
async function lightOnly(ctx, F, setup) {
  const records = (await read('vet', `/health/records?horse=${setup.horse._id}`)) || [];
  const latest = [...records].filter((r) => idOf(r.horse) === idOf(setup.horse)).sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))[0];
  if (latest?.clearedLevel !== 'light') await exam(F, setup.horse, demo.RECOVERING_EXAM.label, demo.RECOVERING_EXAM.body);
  return demo.flowLightOnly(ctx, F, setup);
}
/** Breakfast's time has passed unfed: the canter is refused until the horse is fed, late. */
async function lateMeal(ctx, F, setup) {
  const meal = await mealOfShift(setup.horse);
  ctx.missedBreakfastAt = new Date(meal.scheduledDate);
  await demo.waitUntil(new Date(meal.scheduledDate), `${F}: để quá giờ bữa ăn`);
  await sleep(minutes(Number(process.env.DEFENSE_LATE_AFTER_MIN ?? 5)));
  return demo.flowFail(ctx, F, setup);
}
/** The main flow, then a trial for the race and the decision on it. A trial already passed stands. */
const withTrial = (race) => async (ctx, F, setup) => {
  const entry = await enter(F, setup, race);
  const canter = await demo.flowPass(ctx, F, setup, false);
  const trials = (await read('trainer', `/races/${entry._id}/trials`)) || [];
  if (trials.some((t) => t.outcome?.met === true)) return `${canter} · đã có buổi chạy thử đạt`;
  if (['completed', 'withdrawn'].includes(entry.status)) return `${canter} · giải đã ${entry.status}`;
  return `${canter} · ${await demo.trialThenDecide(F, setup, entry)}`;
};
const WORK = {
  pass: ['flow chính', (ctx, F, s) => demo.flowPass({ ...ctx, incidents: false }, F, s, false)],
  scrape: ['flow chính, có sự cố nhỏ', (ctx, F, s) => demo.flowPass({ ...ctx, incidents: true }, F, s, false)],
  trial: ['chạy thử giải tuần', (ctx, F, s) => withTrial(weeklyCup(ROTA_DAY))(ctx, F, s)],
  tired: ['ngựa mệt', demo.flowTired],
  missed: ['lỡ giờ, xếp lại', demo.flowMissed],
  makeup: ['bỏ bữa, ăn bù', demo.flowMakeUp],
  weather: ['dừng vì mưa', demo.flowWeather],
  lock: ['khóa giữa buổi', demo.flowVetLock],
  injured: ['chấn thương', (ctx, F, s) => {
    aim(drillRace(ROTA_DAY));
    return demo.flowInjured(ctx, F, s);
  }],
  light: ['chỉ tập nhẹ', lightOnly],
  late: ['bữa quá giờ', lateMeal],
};

const mealOfShift = async (horse) => (await demo.groomTasks(horse)).find((t) => t.taskType === 'feeding' && t.mealSlot === SHIFT && !t.makeUpOf && t.status === 'pending' && t.timing?.state !== 'missed');
const cases = [];
/** One horse's case for this shift: from its meal's opening, the flow, and a line in the shift's table. */
async function runCase(ctx, setup, work) {
  const [label, flow] = WORK[work];
  const F = `${setup.horse.name} · ${label}`;
  let result = 'lỗi';
  try {
    const meal = await mealOfShift(setup.horse);
    if (!meal) throw new Error(`không có ${SHIFT_WORDS[SHIFT].toLowerCase()} nào đang chờ cho ăn`);
    if (meal.timing?.opensAt && new Date(meal.timing.opensAt) > new Date()) await demo.waitUntil(new Date(meal.timing.opensAt), `${F}: giờ mở bữa ăn`);
    result = await flow({ ...ctx }, F, setup);
  } catch (error) {
    log(F, '-', 'case dừng giữa chừng', false, error.message);
  }
  cases.push({ horse: setup.horse.name, label, result });
  return result;
}

/**
 * Repeating Monday–Sunday 3-shift rota per horse, in TEST_HORSES' order ([Orion, Pegasus, Ready, Drill]).
 * '-' means rest (only meals, doses, and scheduled care are completed).
 */
const WEEK_ROTA = [
  // Thứ 2: mở tuần — Orion chạy thử cho Cúp Chủ Nhật; cả 4 ngựa đều chạy case
  { morning: ['trial', 'pass', 'tired', 'weather'], noon: ['pass', 'pass', 'pass', 'pass'], evening: ['scrape', 'makeup', 'tired', 'missed'] },
  // Thứ 3: diễn tập chấn thương (Pegasus) + khóa giữa buổi (Drill) → vào khu hồi phục / chờ chuồng
  { morning: ['makeup', 'injured', 'missed', 'lock'], noon: ['pass', '-', 'pass', '-'], evening: ['pass', '-', 'tired', '-'] },
  // Thứ 4: hồi phục về chuồng thường → Pegasus chạy thử, Ready bữa quá giờ → trưa/tối tập nhẹ
  { morning: ['pass', 'trial', 'late', 'pass'], noon: ['pass', 'pass', 'light', 'pass'], evening: ['pass', 'scrape', 'light', 'weather'] },
  // Thứ 5: Ready hết tập nhẹ; trưa giao chăm sóc nhiều ngày (Orion); 20:10 tối tạm ngưng cỏ kiểm tra cảnh báo (Ready)
  { morning: ['trial', 'pass', 'pass', 'pass'], noon: ['pass', 'pass', 'pass', 'pass'], evening: ['pass', 'pass', 'pass', 'pass'] },
  // Thứ 6: Ready hồi phục sau vụ hết cỏ; Drill diễn tập xếp tay & cách ly (chuồng CL)
  { morning: ['-', 'pass', 'pass', '-'], noon: ['pass', 'pass', 'pass', '-'], evening: ['-', 'makeup', 'pass', '-'] },
  // Thứ 7: Drill hết cách ly về chuồng cũ; Ready & Drill chạy thử trước Chủ Nhật
  { morning: ['pass', 'pass', 'trial', 'trial'], noon: ['pass', 'pass', 'pass', 'pass'], evening: ['pass', 'tired', 'scrape', 'missed'] },
  // Chủ Nhật: sáng xét dự giải (verdict); trưa nhập kho; tối ghi kết quả giải tuần, xem thành tích & đăng ký tuần sau
  { morning: ['pass', 'pass', 'pass', 'pass'], noon: ['pass', 'pass', 'pass', 'pass'], evening: ['pass', 'pass', 'pass', 'missed'] },
];
const planForDay = (dayStr, shift) => WEEK_ROTA[weekDayIndex(dayStr)]?.[shift] || null;

/** The groom's other work on these horses, as it falls due: late meals of the shift, doses, ice, baths. */
async function tidy(setups) {
  for (const { horse } of setups) {
    // eslint-disable-next-line no-await-in-loop
    const tasks = await demo.groomTasks(horse);
    for (const task of tasks) {
      const open = task.status === 'pending' && ['open', 'late'].includes(task.timing?.state);
      const isMeal = task.taskType === 'feeding';
      const due = isMeal ? (task.mealSlot === SHIFT || task.makeUpOf) && Date.now() >= new Date(task.scheduledDate).getTime() - minutes(5) : !task.dueTime || hhmm(new Date()) >= task.dueTime;
      if (!open || !due) continue;
      const F = `${horse.name} · ${isMeal ? 'chỉ bữa ăn' : 'chăm sóc'}`;
      // eslint-disable-next-line no-await-in-loop
      const r = await demo.call('groom', 'PATCH', `/stable/tasks/${idOf(task)}/complete`, {
        clientOpId: `defense-${idOf(task)}`, note: 'Đã làm đúng giờ.',
        ...(isMeal ? { observation: { appetite: 'Tốt', manure: 'Bình thường', waterIntake: 'Bình thường' }, amountEatenPercent: 100 } : {}),
      });
      const ok = r.status === 200 || r.status === 201;
      log(F, 'groom', isMeal ? `cho ăn ${SHIFT_WORDS[SHIFT].toLowerCase()}` : `làm việc ${task.taskType}${task.dueTime ? ` ${task.dueTime}` : ''}`, ok, ok ? '' : `HTTP ${r.status}: ${r.message}`);
    }
  }
}
async function tidyUntilShiftEnds(setups) {
  const end = atClock(SHIFT_ENDS[SHIFT]);
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    await tidy(setups);
    if (!SLEEP_MIN || new Date() >= end) return;
    // eslint-disable-next-line no-await-in-loop
    await sleep(minutes(SLEEP_MIN));
  }
}

/** No forage in the store for about two minutes, when no meal is due. Always put back. */
async function hay(horse) {
  const F = 'Hết cỏ';
  const stock = (await read('manager', '/inventory')) || [];
  const forage = stock.filter((i) => i.category === 'feed' && i.feedType === 'forage' && i.isActive !== false);
  log(F, 'manager', `tạm ngưng ${forage.length} loại cỏ trong kho`, forage.length > 0, forage.map((i) => i.name).join(', '));
  try {
    for (const item of forage) {
      // eslint-disable-next-line no-await-in-loop
      await must(F, 'manager', `ngưng dùng ${item.name}`, 'PUT', `/inventory/${item._id}`, { isActive: false });
    }
    await exam(F, horse, 'kết luận chấn thương khi kho hết cỏ', FAST_EXAM('Sưng khớp cổ chân sau phải, cần nghỉ tại chuồng.', 'injured', { clearedLevel: 'none' }));
    const notes = (await read('trainer', '/notifications')) || [];
    const told = (notes.items || notes.notifications || notes).find?.((n) => /chưa đổi được khẩu phần/.test(n.message || '') && idOf(n.horse) === idOf(horse));
    log(F, 'trainer', 'HLV được báo chưa đổi được khẩu phần, kèm lý do', Boolean(told), told?.message || 'không thấy thông báo');
  } finally {
    for (const item of forage) {
      // eslint-disable-next-line no-await-in-loop
      await must(F, 'manager', `dùng lại ${item.name}`, 'PUT', `/inventory/${item._id}`, { isActive: true });
    }
  }
  const after = ((await read('manager', '/inventory')) || []).filter((i) => forage.some((x) => idOf(x) === idOf(i)) && i.isActive === false);
  log(F, 'manager', 'kho có cỏ trở lại đầy đủ', after.length === 0, after.map((i) => i.name).join(', '));
}

/** A care job for many days: the same job again is refused, then it is stopped. */
async function careJob(horse) {
  const C = 'Việc nhiều ngày';
  const today = new Date().toLocaleDateString('sv-SE');
  const inAWeek = new Date(Date.now() + minutes(6 * 24 * 60)).toLocaleDateString('sv-SE');
  const job = {
    horse: horse._id, taskType: 'icing', startDate: today, endDate: inAWeek, weekDays: [0, 1, 2, 3, 4, 5, 6], times: ['17:00'], durationMinutes: 15, instructions: 'Ngâm chân nước đá 15 phút sau khi tập.', assignedTo: ids.groom,
  };
  const routine = await demo.call('trainer', 'POST', '/stable/routines', job);
  log(C, 'trainer', 'giao việc chăm sóc cho cả tuần', routine.status === 201, routine.status === 201 ? '' : `HTTP ${routine.status}: ${routine.message}`);
  if (routine.status === 201) {
    await refused(C, 'trainer', 'giao trùng việc đó → hệ thống từ chối', 'POST', '/stable/routines', job);
    await must(C, 'trainer', 'dừng việc đã giao', 'POST', `/stable/routines/${routine.data._id}/stop`, {});
  }
}
async function restock(ctx) {
  const R = 'Kho';
  await demo.flowRestock(ctx, R);
  const refreshed = ((await read('manager', '/inventory')) || []).find((i) => idOf(i) === idOf(ctx.feed));
  const approved = [...(refreshed?.restockRequests || [])].reverse().find((q) => q.status === 'approved');
  if (approved) await must(R, 'manager', `hàng về: nhận ${approved.approvedQuantity} ${ctx.feed.unit}`, 'POST', `/inventory/${ctx.feed._id}/receive`, { quantity: approved.approvedQuantity, requestId: approved._id });
}
/** Keeps grain stock safely above preflight minimum (>= 120 kg) across continuous weekly cycles. */
async function topUpGrainIfNeeded(ctx) {
  const fresh = ((await read('manager', '/inventory')) || []).find((i) => idOf(i) === idOf(ctx.feed));
  if (!fresh || Number(fresh.quantity) >= 120) return;
  const R = 'Bổ sung kho tự động';
  const item = await must(R, 'groom', `kho còn ${fresh.quantity} ${ctx.feed.unit} ${ctx.feed.name} → đề xuất nhập thêm 200 ${ctx.feed.unit}`, 'POST', `/inventory/${ctx.feed._id}/restock-request`, {
    quantity: 200, note: 'Kho xuống thấp trong chu kỳ auto test 3 ca — bổ sung tự động.',
  });
  const reqItem = [...(item?.restockRequests || [])].reverse().find((q) => q.status === 'pending');
  if (!reqItem) return;
  await must(R, 'manager', `duyệt nhập thêm 200 ${ctx.feed.unit}`, 'PATCH', `/inventory/${ctx.feed._id}/restock-requests/${reqItem._id}`, {
    status: 'approved', approvedQuantity: 200, note: 'Duyệt nhập kho giữ mức vận hành liên tục.',
  });
  await must(R, 'manager', `nhận 200 ${ctx.feed.unit} vào kho`, 'POST', `/inventory/${ctx.feed._id}/receive`, { quantity: 200, requestId: reqItem._id });
}
/** Enters only horses that are currently medically fit into the target race. */
async function enterFitHorses(F, race) {
  const fitNames = [];
  for (const name of TEST_HORSES) {
    // eslint-disable-next-line no-await-in-loop
    const horse = await horseNamed(name);
    // eslint-disable-next-line no-await-in-loop
    if (horse && (await isFit(horse))) fitNames.push(name);
  }
  await enterAll(F, race, fitNames);
}
/** Records ranked podium finishes & prize money for confirmed entries in the weekly cup. */
async function recordWeeklyRace(race) {
  const G = 'Thành tích';
  const entries = (await entriesOf(race)).filter((e) => TEST_HORSES.includes(e.horse?.name));
  const confirmed = entries.filter((e) => e.status === 'confirmed' || e.status === 'completed');
  const offset = confirmed.length ? Math.floor(Date.parse(race.date) / (7 * 86400000)) % confirmed.length : 0;
  const ordered = [...confirmed.slice(offset), ...confirmed.slice(0, offset)];
  const times = ['1:36.85', '1:37.40', '1:38.25', '1:39.10'];
  const prizes = [100000000, 50000000, 25000000, 0];
  const places = ordered.map((e, idx) => [e.horse.name, idx + 1, times[idx] || '1:40.00', prizes[idx] ?? 0]);
  for (const e of entries) {
    if (!confirmed.includes(e)) places.push([e.horse.name, places.length + 1, '1:41.00', 0]);
  }
  await recordRace(G, race, places);
}
/** The ration planner on a real plan's days: confirmed once, and read back. */
async function planner(setup) {
  const F = 'Lịch ăn theo kế hoạch';
  const route = `/feeding/calendar/${setup.plan?._id}`;
  const view = await demo.call('trainer', 'GET', route);
  if (view.status === 200 && !view.data?.problems?.length) {
    const done = await demo.call('trainer', 'POST', `${route}/confirm`, { expectedUpdatedAt: view.data.plan.updatedAt });
    log(F, 'trainer', `xác nhận lịch ăn cho ${setup.horse.name}`, done.status === 200, done.status === 200 ? `${done.data?.days} ngày` : `HTTP ${done.status}: ${done.message}`);
  } else log(F, 'trainer', `lịch ăn của ${setup.horse.name}`, view.status === 200, view.data?.problems?.join(' ') || view.message);
}
/** What the council will open. */
async function boardCheck() {
  const G = 'Thành tích';
  const board = await allHorses();
  for (const name of [ORION, PEGASUS, 'Dembele', READY, DRILL]) {
    const horse = board.find((h) => h.name === name);
    const got = (horse?.achievements || []).map((a) => `${a.race}: ${a.result}`).join('; ');
    log(G, 'manager', `${name}: thành tích trên hồ sơ`, Boolean(got), got || 'chưa có');
  }
  const money = (await read('manager', '/finance')) || [];
  const prizes = (money.records || money).filter?.((r) => r.source === 'race_prize') || [];
  log(G, 'manager', 'tiền thưởng vào báo cáo tài chính', prizes.length > 0, `${prizes.length} khoản, tổng ${demo.vnd(prizes.reduce((n, r) => n + r.amount, 0))}`);
  for (const name of [ORION, PEGASUS]) {
    const horse = board.find((h) => h.name === name);
    // eslint-disable-next-line no-await-in-loop
    if (horse) await demo.ownerSees('Chủ ngựa', horse);
  }
}

/** Work of a shift in the Monday–Sunday cycle other than the horses' main cases (day 0 = Mon .. 6 = Sun). */
const WEEK_EXTRAS = {
  '0/morning': {
    async before() {
      const cup = weeklyCup(ROTA_DAY);
      aim(cup);
      const taurus = await horseNamed('Taurus');
      if (taurus && !(await isFit(taurus))) {
        await refused('Giải', 'trainer', `đăng ký Taurus dự ${cup.name} → hệ thống từ chối (đang khóa tập)`, 'POST', '/races', {
          horse: taurus._id, raceName: cup.name, raceDate: new Date(`${cup.date}T15:00:00`).toISOString(), ...demo.RACE,
        });
      }
      await enterFitHorses('Giải tuần', cup);
    },
  },
  '1/morning': {
    // Pegasus (injured) and Drill (locked by vet) both want recovery stalls: verify placed or queued.
    async after() {
      const W = 'Chờ chuồng';
      const { waiting = [] } = await stallsNow();
      for (const name of [PEGASUS, DRILL]) {
        // eslint-disable-next-line no-await-in-loop
        const horse = await horseNamed(name);
        // eslint-disable-next-line no-await-in-loop
        const stall = await whereIs(horse);
        const waits = waiting.find((w) => idOf(w.horse) === idOf(horse));
        log(W, 'manager', `${name}: ở chuồng hồi phục, hoặc được báo chờ chuồng trống`, stall?.type === 'recovery' || waits?.wants === 'recovery', waits ? `chờ, đang ở ${waits.now}` : stall?.code);
      }
    },
  },
  '2/morning': {
    async before() {
      const W = 'Hồi phục';
      for (const name of [PEGASUS, DRILL]) {
        // eslint-disable-next-line no-await-in-loop
        const horse = await horseNamed(name);
        // eslint-disable-next-line no-await-in-loop
        if (horse && (await ensureFit(W, horse))) {
          // eslint-disable-next-line no-await-in-loop
          await expectStall(W, horse, 'standard', `${name} đủ điều kiện: về chuồng thường`);
        }
      }
      await enterFitHorses('Giải tuần', weeklyCup(ROTA_DAY));
    },
  },
  '3/morning': {
    async before() {
      const ready = await horseNamed(READY);
      if (ready && (await ensureFit('Hồi phục', ready))) {
        await expectStall('Hồi phục', ready, 'standard', `${READY} hết tập nhẹ: về chuồng thường`);
      }
    },
  },
  '3/noon': {
    async after() {
      await careJob(await horseNamed(ORION));
    },
  },
  '3/evening': {
    async after() {
      await demo.waitUntil(atClock(HAY_CLOCK), 'giờ tạm ngưng cỏ (không có bữa nào tới giờ)');
      await hay(await horseNamed(READY));
    },
  },
  '4/morning': {
    async before() {
      const drill = await setupOf(DRILL);
      const ready = await horseNamed(READY);
      await clearHorse('Hồi phục', ready);
      await expectStall('Hồi phục', ready, 'standard', 'đủ điều kiện: ở chuồng thường');
      // Placed by hand: a follow-up with the same conclusion leaves it; a changed conclusion moves it to isolation.
      const M = 'Xếp tay';
      const home = (await stallsNow()).stalls.find((s) => idOf(s.reservedFor?.horse) === idOf(drill.horse));
      if (home) {
        await must(M, 'manager', `Quản lý tự xếp ngựa chấn thương về chuồng thường ${home.code}`, 'POST', '/stable/assignments', { horse: drill.horse._id, stall: home._id, assignedCaretaker: ids.groom }, 201);
        await exam(M, drill.horse, 'phiếu theo dõi cùng kết luận', FAST_EXAM('Theo dõi: còn căng cơ, chưa cho tập.', 'injured', { clearedLevel: 'none' }));
        await expectStall(M, drill.horse, 'standard', 'cùng kết luận: ngựa ở nguyên chỗ Quản lý xếp');
      }
      await exam(M, drill.horse, 'kết luận đổi: nghi bệnh truyền nhiễm, cách ly', FAST_EXAM('Sốt nhẹ, chảy mũi; nghi cúm ngựa, cách ly để theo dõi.', 'quarantined', { clearedLevel: 'none' }));
      await expectStall(M, drill.horse, 'isolation', 'cách ly: ngựa tự sang chuồng cách ly');
    },
  },
  '5/morning': {
    async before() {
      const drill = await horseNamed(DRILL);
      await clearHorse('Hồi phục', drill);
      await expectStall('Hồi phục', drill, 'standard', 'hết cách ly: về chuồng cũ');
    },
  },
  '6/morning': {
    async before() {
      const cup = weeklyCup(ROTA_DAY);
      await enterFitHorses('Giải tuần', cup);
      await verdict(cup, TEST_HORSES);
    },
  },
  '6/noon': {
    async after(ctx) {
      await restock(ctx);
    },
  },
  '6/evening': {
    async before() {
      await recordWeeklyRace(weeklyCup(ROTA_DAY));
      await boardCheck();
      await enterFitHorses('Giải tuần sau', weeklyCup(ROTA_DAY, 1));
    },
    async after() {
      await planner(await setupOf(ORION));
    },
  },
};
const extrasKeyFor = (dayStr, shift) => `${weekDayIndex(dayStr)}/${shift}`;

async function runShift(ctx) {
  const plan = planForDay(ROTA_DAY, SHIFT);
  if (!plan) {
    console.log(`${ROTA_DAY} ${SHIFT}: không có việc.`);
    return;
  }
  const extras = WEEK_EXTRAS[extrasKeyFor(ROTA_DAY, SHIFT)] || {};
  const guarded = async (name, job) => {
    try {
      await job();
    } catch (error) {
      log(`${SHIFT_WORDS[SHIFT]} · ${name}`, '-', 'việc thêm của ca dừng giữa chừng', false, error.message);
    }
  };
  if (extras.before) await guarded('đầu ca', () => extras.before(ctx));
  // Safety net: ensure every horse with an active non-light case today is medically fit before its shift starts.
  for (let i = 0; i < TEST_HORSES.length; i += 1) {
    if (!['-', 'light'].includes(plan[i])) {
      // eslint-disable-next-line no-await-in-loop
      const h = await horseNamed(TEST_HORSES[i]);
      // eslint-disable-next-line no-await-in-loop
      if (h) await ensureFit(`${h.name} · chuẩn bị ca`, h);
    }
  }
  // Read after the above, which may update a plan's targetRace. Resting horses ('-') still get meals & care.
  const setups = await Promise.all(TEST_HORSES.map(setupOf));
  let running = true;
  const resting = setups.filter((_, i) => plan[i] === '-');
  const carers = (async () => {
    while (running) {
      // eslint-disable-next-line no-await-in-loop
      await tidy(resting);
      // eslint-disable-next-line no-await-in-loop
      await sleep(minutes(SLEEP_MIN || 0.2));
    }
  })();
  await Promise.all(setups.map((setup, i) => (plan[i] === '-' ? null : runCase(ctx, setup, plan[i]))));
  running = false;
  await carers;
  if (extras.after) await guarded('cuối ca', () => extras.after(ctx));
  await guarded('kho', () => topUpGrainIfNeeded(ctx));
  await tidyUntilShiftEnds(setups);
}
/** Whether this shift has begun today: a meal of its slot on one of the four is no longer waiting. */
async function shiftBegun() {
  const today = (await read('groom', `/stable/tasks?date=${TODAY}`)) || [];
  return today.some((t) => TEST_HORSES.includes(t.horse?.name) && t.taskType === 'feeding' && t.mealSlot === SHIFT && !t.makeUpOf && ['completed', 'skipped'].includes(t.status));
}

const DONE = ['completed', 'evaluated'];
const shiftOfTime = (at) => {
  const hour = new Date(at).getHours();
  if (hour < 11) return 'morning';
  return hour < 16 ? 'noon' : 'evening';
};
const sessionWord = (s) => {
  if (DONE.includes(s.status)) {
    if (s.outcome?.met === true) return 'đạt';
    return s.outcome?.met === false ? 'chưa đạt' : 'xong';
  }
  return { missed: 'lỡ giờ', aborted: 'dừng', blocked: 'bị chặn', scheduled: 'chưa chạy', ready: 'chưa chạy', in_progress: 'đang chạy' }[s.status] || null;
};
const tally = (sessions) => {
  const counts = new Map();
  for (const s of sessions) {
    const word = sessionWord(s);
    if (word) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts].map(([word, n]) => `${word} ${n}`).join(', ') || '—';
};
const dayOf = (at) => new Date(at).toLocaleDateString('sv-SE');
const mdTable = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ')).join(' | ')} |`)].join('\n');

/** Per horse, per shift: what ran today, and what the system concludes about its fitness to race. */
async function dayReport(date) {
  const sessions = ((await read('trainer', '/training/sessions')) || []).filter((s) => s.scheduledAt && dayOf(s.scheduledAt) === date);
  const tasks = (await read('trainer', `/stable/tasks?date=${date}`)) || [];
  const plans = ((await read('trainer', '/training/plans')) || []).filter((p) => p.status === 'active');
  const rows = plans.map((p) => {
    const name = p.horse?.name;
    const mine = sessions.filter((s) => s.horse?.name === name);
    const meals = tasks.filter((t) => t.horse?.name === name && t.taskType === 'feeding');
    const form = p.progress?.form;
    return [
      name,
      ...['morning', 'noon', 'evening'].map((shift) => tally(mine.filter((s) => shiftOfTime(s.scheduledAt) === shift))),
      `${meals.filter((t) => t.status === 'completed').length}/${meals.length}`,
      form?.label || '—',
      `tập ${form?.done ?? 0}/${form?.due ?? 0}, đạt ${form?.met ?? 0}/${form?.rated ?? 0}${p.targetRace?.raceName ? ` · ${p.targetRace.raceName}` : ''}`,
      (form?.reasons || []).join(' '),
    ];
  });
  const run = sessions.filter((s) => sessionWord(s) && !['chưa chạy'].includes(sessionWord(s)));
  const fed = tasks.filter((t) => t.taskType === 'feeding' && t.status === 'completed').length;
  return `### Ngày ${date}: ${run.length} buổi tập, ${fed} bữa ăn\n\n${mdTable(['Ngựa', 'Ca sáng', 'Ca trưa', 'Ca tối', 'Bữa đã ăn', 'Kết luận', 'Quá trình', 'Vì sao'], rows)}\n`;
}
async function raceReport() {
  const cups = new Set([-1, 0, 1].map((w) => weeklyCup(REPORT_DAY, w).name));
  const since = addDays(REPORT_DAY, -14);
  const entries = ((await read('trainer', '/races')) || []).filter((e) => cups.has(e.raceName) || (e.raceDate && dayOf(e.raceDate) >= since));
  const rows = [...entries].sort((a, b) => new Date(a.raceDate) - new Date(b.raceDate)).map((e) => [e.raceName, dayOf(e.raceDate), e.horse?.name, e.status, e.result || '', e.prizeMoney ? demo.vnd(e.prizeMoney) : '', e.decision?.reason || '']);
  return `### Các giải\n\n${mdTable(['Giải', 'Ngày', 'Ngựa', 'Trạng thái', 'Kết quả', 'Thưởng', 'Lý do quyết định'], rows)}\n`;
}
/** Last 7 days summary, today's breakdown, races, horse achievements, and current grain/forage stock. */
async function finalReport() {
  const sessions = (await read('trainer', '/training/sessions')) || [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i - 6));
  const rows = [];
  for (const date of days) {
    const mine = sessions.filter((s) => s.scheduledAt && dayOf(s.scheduledAt) === date);
    // eslint-disable-next-line no-await-in-loop
    const tasks = (await read('trainer', `/stable/tasks?date=${date}`)) || [];
    const fed = tasks.filter((t) => t.taskType === 'feeding');
    const count = (word) => mine.filter((s) => sessionWord(s) === word).length;
    rows.push([date, mine.filter((s) => sessionWord(s) && sessionWord(s) !== 'chưa chạy').length, count('đạt'), count('chưa đạt'), count('xong'), count('lỡ giờ'), count('dừng'), `${fed.filter((t) => t.status === 'completed').length}/${fed.length}`]);
  }
  const board = (await allHorses()).filter((h) => h.achievements?.length).map((h) => [h.name, h.achievements.map((a) => `${a.race}: ${a.result}`).join('; ')]);
  const stock = ((await read('manager', '/inventory')) || []).filter((i) => i.category === 'feed').map((i) => [i.name, `${i.quantity} ${i.unit}`]);
  return [
    `### Tổng kết 7 ngày (${days[0]} → ${days[days.length - 1]})\n\n${mdTable(['Ngày', 'Buổi đã chạy', 'Đạt', 'Chưa đạt', 'Xong', 'Lỡ giờ', 'Dừng', 'Bữa đã ăn'], rows)}\n`,
    await dayReport(days[days.length - 1]),
    await raceReport(),
    `### Bảng thành tích\n\n${mdTable(['Ngựa', 'Thành tích'], board)}\n`,
    `### Kho thức ăn\n\n${mdTable(['Món', 'Còn'], stock)}\n`,
  ].join('\n');
}

let reportText = '';
// The shift's work started here: only then does this run ask for the next one (defenseClock.nextAfter).
let began = false;
async function main() {
  if (SHIFT === 'early') {
    console.log(`${hhmm(new Date())}: chưa tới 05:00, không có việc.`);
    return;
  }
  if (SHIFT === 'relay') {
    log('Chờ qua đêm', '-', 'không làm gì trên API; tới giờ thì gọi ca sáng', true);
    return;
  }
  // Before any call to the API: a run asked for a few minutes early waits for its shift here.
  const wait = clock.waitBefore(SHIFT, new Date());
  if (wait === null) {
    log('Kiểm tra trước', '-', `${hhmm(new Date())}: còn quá xa giờ ${SHIFT_WORDS[SHIFT]}, không chờ`, true);
    return;
  }
  if (wait > 0) {
    console.log(`${hhmm(new Date())}: chờ tới ${clock.START[SHIFT]} để bắt đầu ${SHIFT_WORDS[SHIFT]}.`);
    await sleep(wait);
  }
  const accounts = JSON.parse(process.env.DEFENSE_ACCOUNTS || process.env.DEMO_ACCOUNTS || '{}');
  if (SHIFT === 'report' || SHIFT === 'final') {
    if (!(await demo.wake())) throw new Error('API không trả lời.');
    for (const role of ['manager', 'trainer']) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await demo.login('Kiểm tra trước', accounts, role))) return;
    }
    reportText = SHIFT === 'final' ? await finalReport() : `${await dayReport(REPORT_DAY)}\n${await raceReport()}`;
    began = true;
    return;
  }
  const ctx = await demo.preflight(accounts);
  if (!ctx) return;
  const plan = planForDay(ROTA_DAY, SHIFT);
  if (!plan) {
    log('Kiểm tra trước', '-', `${ROTA_DAY} ${SHIFT}: không có lịch chạy`, true);
    return;
  }
  if (!WRITE) {
    const { stalls = [], waiting = [] } = await stallsNow();
    log('Kiểm tra trước', '-', `chỉ đọc: ${ROTA_DAY} ${SHIFT} sẽ chạy khi có DEFENSE_CONFIRM=write`, true, `${TEST_HORSES.map((w, i) => `${w}: ${plan[i]}`).join('; ')}. ${stalls.filter((s) => !s.occupied && !s.reservedFor).length} chuồng trống, ${waiting.length} ngựa chờ chuồng`);
    return;
  }
  if (await shiftBegun()) {
    log('Kiểm tra trước', '-', `${TODAY} ${SHIFT} đã chạy, không chạy lại`, true);
    return;
  }
  began = true;
  await prepare(ctx);
  await runShift(ctx);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      log('Lỗi', '-', 'kịch bản dừng', false, error.message);
    })
    .finally(() => {
      if (SHIFT === 'early') return;
      const head = `### Auto test 3 ca · ${TODAY} · ${SHIFT_WORDS[SHIFT] || 'Báo cáo'} (${hhmm(new Date())})`;
      const caseTable = cases.length ? `${mdTable(['Ngựa', 'Case', 'Kết quả'], cases.map((c) => [c.horse, c.label, c.result]))}\n\n` : '';
      demo.summary(`${head}\n\n${reportText}${caseTable}${demo.steps.length ? demo.table(demo.steps) : ''}`);
      if (reportText) console.log(reportText);
      // Annotations: the public API shows them without a token, so the end-of-day diagnosis can read them.
      if (process.env.GITHUB_ACTIONS) for (const s of demo.steps.filter((x) => !x.ok).slice(0, 10)) console.log(`::error::${s.flow}: ${s.action}. ${s.detail}`);
      // The run the workflow asks for next (its last step), even when a case failed: the day goes on.
      const now = new Date();
      const ask = WRITE ? clock.nextAfter({ shift: SHIFT, now, began, hasDay: () => true }) : null;
      if (ask) {
        const waitSec = Math.max(0, Math.round((ask.at - now) / 1000));
        console.log(`Lượt kế: ${ask.next} lúc ${hhmm(ask.at)} (chờ ${Math.round(waitSec / 60)} phút).`);
        if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `next=${ask.next}\nwait=${waitSec}\n`);
      }
      if (demo.hasFailed()) process.exitCode = 1;
    });
}

module.exports = {
  addDays,
  weekDayIndex,
  weeklyCup,
  drillRace,
  TEST_HORSES,
  RATION_TIMES,
  WORK,
  WEEK_ROTA,
  WEEK_EXTRAS,
  planForDay,
  extrasKeyFor,
};
