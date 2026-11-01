#!/usr/bin/env node
// The data the council sees on 13/11/2026, made on the REAL site through the same API people use
// (.github/workflows/defense-data.yml). From 02/11 to 12/11 each day has three shifts, one for each meal:
//
//   morning  05:00–11:00  the only shift with trials: the club allows them before noon
//   noon     11:00–16:00
//   evening  16:00–22:00  the day's results, and at 23:30 a report
//
// Two new horses, Orion and Pegasus, and the two "Demo ·" horses take the cases (ROTA), so no false illness
// goes on a real horse's record. The real horses only race; autoOperate.js runs their days. On a race's
// morning each horse's own record decides (verdict): one far from its targets is withdrawn, as is one the
// vet has stopped. The report says, per horse and shift, what ran and whether it is fit to race; the
// morning of 13/11 the last one adds up the whole campaign.
//
// Reads only unless DEFENSE_CONFIRM=write. DEFENSE_DAY (YYYY-MM-DD) and DEFENSE_SHIFT (morning, noon,
// evening, report, final) replace what the clock says. A shift that has begun does not begin again, so any
// number of triggers is harmless. GitHub runs this repo's schedules 2 to 3.5 hours late, so the workflow
// starts asking hours ahead: before 05:00 the script does nothing, and a report delayed past midnight is
// still the day before's.
if (process.env.DEMO_TZ) process.env.TZ = process.env.DEMO_TZ;
const shiftByClock = (hour) => {
  if (hour < 3) return 'report';
  if (hour < 5) return 'early';
  if (hour < 11) return 'morning';
  if (hour < 16) return 'noon';
  return hour < 22 ? 'evening' : 'report';
};
const TODAY = new Date().toLocaleDateString('sv-SE');
// The day of the rota to run: today, or another for a rehearsal.
const ROTA_DAY = process.env.DEFENSE_DAY || TODAY;
const FINAL_DAY = '2026-11-13';
const REPORT_DAY = new Date().getHours() < 3 ? new Date(Date.now() - 24 * 3600000).toLocaleDateString('sv-SE') : TODAY;
const SHIFT = process.env.DEFENSE_SHIFT || (TODAY === FINAL_DAY ? 'final' : shiftByClock(new Date().getHours()));
if (['morning', 'noon', 'evening'].includes(SHIFT)) process.env.DEMO_MEAL_SLOT = SHIFT;
process.env.DEMO_LATEST_START = process.env.DEMO_LATEST_START || '23:30';
const demo = require('./demoFlows');

const { ids, must, refused, read, log, minutes, hhmm } = demo;
const WRITE = process.env.DEFENSE_CONFIRM === 'write';
const SLEEP_MIN = Number(process.env.DEFENSE_TIDY_MIN ?? 5);
const SHIFT_ENDS = { morning: '10:50', noon: '15:50', evening: '21:50' };
const SHIFT_WORDS = { morning: 'Ca sáng', noon: 'Ca trưa', evening: 'Ca tối' };
const HAY_CLOCK = process.env.DEFENSE_HAY_CLOCK || '20:10';
const ORION = 'Orion';
const PEGASUS = 'Pegasus';
const READY = 'Demo · Sẵn sàng tập';
const DRILL = 'Demo · Diễn tập chấn thương';
const FIRST = { name: 'Cúp Mùa Thu CLB 2026', date: process.env.DEFENSE_FIRST_DATE || '2026-11-06' };
const SECOND = { name: 'Cúp Tiền Mùa Đông CLB 2026', date: process.env.DEFENSE_SECOND_DATE || '2026-11-10' };
const THIRD = { name: 'Cúp Khai Đông CLB 2026', date: process.env.DEFENSE_THIRD_DATE || '2026-11-12' };
const LATER = { name: 'Cúp Mùa Đông CLB 2026', date: process.env.DEFENSE_LATER_DATE || '2026-11-20' };
const OLD_RENAME = { from: 'TEST Cúp Demo 28/10', to: 'Cúp Giao Hữu CLB 28/10' };
const NEW_HORSES = {
  [ORION]: { breed: 'Thoroughbred', sex: 'gelding', color: 'Bay', weightKg: 480, dob: '2021-03-18' },
  [PEGASUS]: { breed: 'Arabian', sex: 'mare', color: 'Grey', weightKg: 450, dob: '2022-02-09' },
};
const TEST_HORSES = [ORION, PEGASUS, READY, DRILL];
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

/** A horse new to the club: profile, a free ordinary stall and its groom, an exam, a breakfast, a plan. */
async function newHorse(F, name, ctx) {
  const horse = await must(F, 'manager', `thêm ngựa "${name}", giao chủ, HLV, bác sĩ`, 'POST', '/horses', {
    name, ...NEW_HORSES[name], owner: ids.owner, assignedTrainer: ids.trainer, assignedVet: ids.vet,
  }, 201);
  const free = (await stallsNow()).stalls.find((s) => (s.type || 'standard') === 'standard' && s.status !== 'maintenance' && !s.occupied && !s.reservedFor && s.zone === 'A');
  await must(F, 'manager', `xếp chuồng ${free?.code}, giao nhân viên chăm sóc`, 'POST', '/stable/assignments', { horse: horse._id, stall: free?._id, assignedCaretaker: ids.groom }, 201);
  await exam(F, horse, demo.INTAKE_EXAM.label, demo.INTAKE_EXAM.body);
  await must(F, 'trainer', `khẩu phần bữa sáng ${RATION_TIMES.morning}: 2,5 ${ctx.feed.unit} ${ctx.feed.name}`, 'POST', '/feeding', {
    horse: horse._id, mealTime: 'morning', timeOfDay: RATION_TIMES.morning, items: [{ inventoryItem: ctx.feed._id, amount: 2.5 }],
  }, 201);
  await must(F, 'trainer', 'kế hoạch nền tảng sức bền (đang áp dụng)', 'POST', '/training/plans', {
    horse: horse._id, phase: 'base_building', distanceTarget: 1600, weeklyVolumeKm: 20, intensity: 'moderate', surface: 'dirt',
    startDate: new Date().toISOString(), status: 'active', goal: 'Sức bền trước các giải mùa đông',
  }, 201);
}
/** Whatever a shift needs and is not there yet: the new horses, and a meal for each shift of the four. */
async function prepare(ctx) {
  const F = 'Chuẩn bị';
  const horses = await allHorses();
  for (const name of [ORION, PEGASUS]) {
    // eslint-disable-next-line no-await-in-loop
    if (!horses.some((h) => h.name === name)) await newHorse(F, name, ctx);
  }
  const rations = (await read('trainer', '/feeding')) || [];
  for (const name of TEST_HORSES) {
    // eslint-disable-next-line no-await-in-loop
    const horse = await horseNamed(name);
    if (!horse) throw new Error(`Không thấy ngựa "${name}".`);
    for (const slot of ['noon', 'evening']) {
      if (!rations.some((r) => idOf(r.horse) === idOf(horse) && r.mealTime === slot)) {
        // eslint-disable-next-line no-await-in-loop
        await must(F, 'trainer', `${name}: thêm bữa ${RATION_TIMES[slot]}, 1 ${ctx.feed.unit} ${ctx.feed.name}`, 'POST', '/feeding', {
          horse: horse._id, mealTime: slot, timeOfDay: RATION_TIMES[slot], items: [{ inventoryItem: ctx.feed._id, amount: 1 }],
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
  return `${canter} · ${await demo.trialThenDecide(F, setup, entry)}`;
};
const WORK = {
  pass: ['flow chính', (ctx, F, s) => demo.flowPass({ ...ctx, incidents: false }, F, s, false)],
  scrape: ['flow chính, có sự cố nhỏ', (ctx, F, s) => demo.flowPass({ ...ctx, incidents: true }, F, s, false)],
  trial1: [`chạy thử ${FIRST.name}`, withTrial(FIRST)],
  trial2: [`chạy thử ${SECOND.name}`, withTrial(SECOND)],
  trial3: [`chạy thử ${THIRD.name}`, withTrial(THIRD)],
  tired: ['ngựa mệt', demo.flowTired],
  missed: ['lỡ giờ, xếp lại', demo.flowMissed],
  makeup: ['bỏ bữa, ăn bù', demo.flowMakeUp],
  weather: ['dừng vì mưa', demo.flowWeather],
  lock: ['khóa giữa buổi', demo.flowVetLock],
  injured: ['chấn thương', (ctx, F, s) => {
    aim(FIRST);
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

/** A shift's cases per horse, in TEST_HORSES' order; '-' means only its meal and care. */
const ROTA = {
  '2026-11-02': { morning: ['trial1', 'pass', 'tired', 'weather'], noon: ['pass', 'pass', 'pass', 'pass'], evening: ['scrape', 'makeup', 'tired', 'missed'] },
  '2026-11-03': { morning: ['makeup', 'injured', 'missed', 'lock'], noon: ['pass', '-', 'pass', '-'], evening: ['pass', '-', 'tired', '-'] },
  '2026-11-04': { morning: ['trial1', '-', 'late', '-'], noon: ['pass', '-', 'light', '-'], evening: ['pass', '-', 'light', '-'] },
  '2026-11-05': { morning: ['pass', '-', 'light', '-'], noon: ['pass', 'pass', 'pass', '-'], evening: ['pass', 'pass', 'pass', '-'] },
  '2026-11-06': { morning: ['-', 'pass', 'pass', '-'], noon: ['-', 'pass', 'pass', '-'], evening: ['-', 'makeup', 'pass', '-'] },
  '2026-11-07': { morning: ['-', 'trial2', 'pass', '-'], noon: ['pass', 'pass', 'pass', 'pass'], evening: ['pass', 'pass', 'tired', 'pass'] },
  '2026-11-08': { morning: ['trial2', 'trial2', 'pass', 'missed'], noon: ['pass', 'pass', 'pass', 'pass'], evening: ['pass', 'scrape', 'pass', 'weather'] },
  '2026-11-09': { morning: ['trial2', 'trial2', 'makeup', 'tired'], noon: ['pass', 'pass', 'pass', 'pass'], evening: ['pass', 'pass', 'pass', 'pass'] },
  '2026-11-10': { morning: ['-', '-', 'trial3', 'pass'], noon: ['-', '-', 'pass', 'pass'], evening: ['-', '-', 'pass', 'tired'] },
  '2026-11-11': { morning: ['trial3', 'trial3', 'trial3', 'pass'], noon: ['pass', 'pass', 'pass', 'pass'], evening: ['pass', 'pass', 'pass', 'missed'] },
  '2026-11-12': { morning: ['-', '-', '-', 'pass'], noon: ['-', '-', '-', 'pass'], evening: ['-', '-', '-', 'pass'] },
};

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
  for (const name of [ORION, PEGASUS, 'Dembele', READY, 'chú bé', 'demo']) {
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

/** Work of a shift other than the horses' cases: before them, then after them. */
const EXTRAS = {
  '2026-11-03/morning': {
    // Pegasus (injured) and the drill horse (locked by the vet, which also counts as injured) both want recovery,
    // and only one of its stalls is free: whichever came first has it, the other is shown waiting.
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
  '2026-11-02/morning': {
    async before() {
      aim(FIRST);
      const taurus = await horseNamed('Taurus');
      if (taurus) {
        await refused('Giải', 'trainer', `đăng ký Taurus dự ${FIRST.name} → hệ thống từ chối (đang khóa tập)`, 'POST', '/races', {
          horse: taurus._id, raceName: FIRST.name, raceDate: new Date(`${FIRST.date}T15:00:00`).toISOString(), ...demo.RACE,
        });
      }
      await enterAll('Giải', FIRST, ['Dembele', 'demo', READY]);
    },
  },
  '2026-11-04/noon': {
    async after(ctx) {
      await restock(ctx);
    },
  },
  '2026-11-05/noon': {
    // Pegasus goes home fit, and the waiting horse moves into its stall.
    async before() {
      const W = 'Chờ chuồng';
      const pegasus = await horseNamed(PEGASUS);
      const drill = await horseNamed(DRILL);
      const ready = await setupOf(READY);
      await clearHorse(W, pegasus);
      await expectStall(W, pegasus, 'standard', 'Pegasus đủ điều kiện: về chuồng cũ được giữ chỗ');
      await expectStall(W, drill, 'recovery', 'ngựa còn lại ở chuồng hồi phục');
      await clearHorse('Hồi phục', ready.horse);
    },
    async after() {
      await careJob(await horseNamed(ORION));
    },
  },
  '2026-11-05/evening': {
    async after() {
      await demo.waitUntil(atClock(HAY_CLOCK), 'giờ tạm ngưng cỏ (không có bữa nào tới giờ)');
      await hay(await horseNamed(READY));
    },
  },
  '2026-11-06/morning': {
    async before() {
      const drill = await setupOf(DRILL);
      const ready = await horseNamed(READY);
      await clearHorse('Hồi phục', ready);
      await expectStall('Hồi phục', ready, 'standard', 'đủ điều kiện: ở chuồng thường');
      await verdict(FIRST, [ORION, READY, 'Dembele', 'demo']);
      // Placed by hand: a follow-up with the same conclusion leaves it; a changed conclusion moves it.
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
  '2026-11-06/evening': {
    async before() {
      const G = 'Thành tích';
      await recordRace(G, FIRST, [
        [ORION, 1, '1:37.40', 100000000],
        ['Dembele', 2, '1:38.15', 50000000],
        ['demo', 3, '1:38.92', 25000000],
        [READY, 6, '1:41.30', 0],
      ]);
      // Two older races that were never closed: results recorded late, one renamed first.
      const entries = (await read('trainer', '/races')) || [];
      const old = entries.find((e) => e.raceName === OLD_RENAME.from && e.status !== 'completed');
      if (old) {
        await must(G, 'trainer', `đổi tên giải "${OLD_RENAME.from}" thành "${OLD_RENAME.to}"`, 'PUT', `/races/${old._id}`, { raceName: OLD_RENAME.to });
        await must(G, 'trainer', `${OLD_RENAME.to}: ${old.horse?.name} hạng 4, không có thưởng`, 'PATCH', `/races/${old._id}/results`, { position: 4, finishTime: '1:39.80', prizeMoney: 0 });
      }
      const winter = entries.find((e) => e.raceName === 'Winnter Fu' && e.status !== 'completed' && e.status !== 'withdrawn');
      if (winter) await must(G, 'trainer', `Winnter Fu (nhập muộn): ${winter.horse?.name} hạng 2, thưởng 60.000.000 đ`, 'PATCH', `/races/${winter._id}/results`, { position: 2, finishTime: '1:37.95', prizeMoney: 60000000 });
      await enterAll('Giải', SECOND, [ORION, PEGASUS, 'Dembele']);
    },
  },
  '2026-11-07/morning': {
    async before() {
      const drill = await horseNamed(DRILL);
      await clearHorse('Hồi phục', drill);
      await expectStall('Hồi phục', drill, 'standard', 'hết cách ly: về chuồng cũ');
    },
  },
  '2026-11-08/noon': {
    async after(ctx) {
      await restock(ctx);
    },
  },
  '2026-11-10/morning': {
    async before() {
      await verdict(SECOND, [ORION, PEGASUS, 'Dembele']);
    },
  },
  '2026-11-10/evening': {
    async before() {
      await recordRace('Thành tích', SECOND, [
        [PEGASUS, 1, '1:36.85', 100000000],
        [ORION, 2, '1:37.20', 50000000],
        ['Dembele', 5, '1:40.10', 0],
      ]);
      await enterAll('Giải', THIRD, [ORION, PEGASUS, 'Dembele', 'demo']);
    },
  },
  '2026-11-12/morning': {
    async before() {
      await verdict(THIRD, [ORION, PEGASUS, READY, 'Dembele', 'demo']);
      await planner(await setupOf(PEGASUS));
    },
  },
  '2026-11-12/evening': {
    async before() {
      await recordRace('Thành tích', THIRD, [
        ['Dembele', 1, '1:36.60', 100000000],
        [PEGASUS, 2, '1:36.95', 50000000],
        [READY, 3, '1:38.40', 25000000],
        [ORION, 4, '1:38.75', 0],
        ['demo', 7, '1:42.05', 0],
      ]);
      await enterAll('Giải', LATER, [ORION]);
      await boardCheck();
    },
  },
};

async function runShift(ctx) {
  const plan = ROTA[ROTA_DAY]?.[SHIFT];
  if (!plan) {
    console.log(`${ROTA_DAY} ${SHIFT}: không có việc.`);
    return;
  }
  const extras = EXTRAS[`${ROTA_DAY}/${SHIFT}`] || {};
  const guarded = async (name, job) => {
    try {
      await job();
    } catch (error) {
      log(`${SHIFT_WORDS[SHIFT]} · ${name}`, '-', 'việc thêm của ca dừng giữa chừng', false, error.message);
    }
  };
  if (extras.before) await guarded('đầu ca', () => extras.before(ctx));
  // Read after the above, which may change a plan's race. A horse with no case only eats and is cared for,
  // in its time, while the others run.
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
  const entries = ((await read('trainer', '/races')) || []).filter((e) => [FIRST, SECOND, THIRD, LATER].some((r) => r.name === e.raceName) || e.raceName === OLD_RENAME.to || e.raceName === 'Winnter Fu');
  const rows = [...entries].sort((a, b) => new Date(a.raceDate) - new Date(b.raceDate)).map((e) => [e.raceName, dayOf(e.raceDate), e.horse?.name, e.status, e.result || '', e.prizeMoney ? demo.vnd(e.prizeMoney) : '', e.decision?.reason || '']);
  return `### Các giải\n\n${mdTable(['Giải', 'Ngày', 'Ngựa', 'Trạng thái', 'Kết quả', 'Thưởng', 'Lý do quyết định'], rows)}\n`;
}
/** The morning of 13/11: the whole campaign, day by day, then the horses' last word and the board. */
async function finalReport() {
  const sessions = (await read('trainer', '/training/sessions')) || [];
  const days = Object.keys(ROTA);
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
    `### Tổng kết ${days[0]} → ${days[days.length - 1]}\n\n${mdTable(['Ngày', 'Buổi đã chạy', 'Đạt', 'Chưa đạt', 'Xong', 'Lỡ giờ', 'Dừng', 'Bữa đã ăn'], rows)}\n`,
    await dayReport(days[days.length - 1]),
    await raceReport(),
    `### Bảng thành tích\n\n${mdTable(['Ngựa', 'Thành tích'], board)}\n`,
    `### Kho thức ăn\n\n${mdTable(['Món', 'Còn'], stock)}\n`,
  ].join('\n');
}

let reportText = '';
async function main() {
  if (SHIFT === 'early') {
    console.log(`${hhmm(new Date())}: chưa tới 05:00, không có việc.`);
    return;
  }
  const accounts = JSON.parse(process.env.DEFENSE_ACCOUNTS || process.env.DEMO_ACCOUNTS || '{}');
  if (SHIFT === 'report' || SHIFT === 'final') {
    if (!(await demo.wake())) throw new Error('API không trả lời.');
    for (const role of ['manager', 'trainer']) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await demo.login('Kiểm tra trước', accounts, role))) return;
    }
    reportText = SHIFT === 'final' ? await finalReport() : `${await dayReport(REPORT_DAY)}\n${await raceReport()}`;
    return;
  }
  const ctx = await demo.preflight(accounts);
  if (!ctx) return;
  if (!ROTA[ROTA_DAY]) {
    log('Kiểm tra trước', '-', `${ROTA_DAY}: ngoài các ngày của đợt này, không có việc`, true);
    return;
  }
  if (!WRITE) {
    const { stalls = [], waiting = [] } = await stallsNow();
    log('Kiểm tra trước', '-', `chỉ đọc: ${ROTA_DAY} ${SHIFT} sẽ chạy khi có DEFENSE_CONFIRM=write`, true, `${TEST_HORSES.map((w, i) => `${w}: ${ROTA[ROTA_DAY][SHIFT][i]}`).join('; ')}. ${stalls.filter((s) => !s.occupied && !s.reservedFor).length} chuồng trống, ${waiting.length} ngựa chờ chuồng`);
    return;
  }
  if (await shiftBegun()) {
    log('Kiểm tra trước', '-', `${TODAY} ${SHIFT} đã chạy, không chạy lại`, true);
    return;
  }
  await prepare(ctx);
  await runShift(ctx);
}

main()
  .catch((error) => {
    console.error(error);
    log('Lỗi', '-', 'kịch bản dừng', false, error.message);
  })
  .finally(() => {
    if (SHIFT === 'early') return;
    const head = `### Dữ liệu cho hội đồng · ${TODAY} · ${SHIFT_WORDS[SHIFT] || 'Báo cáo'} (${hhmm(new Date())})`;
    const caseTable = cases.length ? `${mdTable(['Ngựa', 'Case', 'Kết quả'], cases.map((c) => [c.horse, c.label, c.result]))}\n\n` : '';
    demo.summary(`${head}\n\n${reportText}${caseTable}${demo.steps.length ? demo.table(demo.steps) : ''}`);
    if (reportText) console.log(reportText);
    // Annotations: the public API shows them without a token, so the end-of-day diagnosis can read them.
    if (process.env.GITHUB_ACTIONS) for (const s of demo.steps.filter((x) => !x.ok).slice(0, 10)) console.log(`::error::${s.flow}: ${s.action}. ${s.detail}`);
    if (demo.hasFailed()) process.exitCode = 1;
  });
