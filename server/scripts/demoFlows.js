// Demo rounds driven through the live API on the morning of a demo, by GitHub Actions
// (.github/workflows/demo-flows.yml) or by hand. Unlike liveSmoke.js this WRITES to the real club
// database, so it only writes when DEMO_CONFIRM=write; otherwise it stops after the preflight.
//
// A round is new horses taken through every role, each a different case:
//   "Đạt": the head trainer enters it for the demo race (tomorrow), the manager stables it, the vet
//   examines it, the trainer sets a breakfast ration and a plan, the groom feeds it, the trainer books
//   a canter after the club's digestion wait, pre-checks, starts it, the sensor feed finishes it
//   ("Đạt mục tiêu"), the trainer evaluates it and the owner sees it. Then a trial over the race
//   distance, and the race decision taken on that trial: confirmed, with the trainer's reason when the
//   trial missed its targets (the simulated pace is random, so either can happen).
//   "Không đạt": breakfast time passes unfed, so the canter is refused (also with a reason); the
//   groom feeds it late, the canter runs after the digestion wait, the horse struggles and the trainer
//   ends it early ("Chưa đạt mục tiêu"), evaluates it low and asks the vet for an exam, which the vet
//   takes on.
// Round 1 adds one horse per other case, most of them running at the same time as the "Đạt" horse:
//   "Chấn thương": entered for the race; the trainer plays out a lame left foreleg, the sensors stop the
//   run and ask the vet for an urgent exam, the groom ices the leg, the vet records a tendon injury
//   (marked on the leg), prescribes doses and locks training; the trial and the race confirmation are
//   refused, the trainer withdraws it, the groom takes the first doses on and gives them.
//   "Mệt": the trainer plays out a tired horse: the canter runs its distance too slowly ("Chưa đạt").
//   "Chỉ tập nhẹ": back from a sprain, cleared for light work only: the canter is refused, a walk runs.
//   "Khóa giữa buổi": a blood result comes in while it canters; the vet's lock stops the run.
//   "Dừng vì mưa": the trainer stops the canter for a storm, then a light session runs when it clears.
//   "Ăn bù": the horse refuses breakfast, the trainer asks for a make-up meal, then it trains.
//   "Lỡ giờ": nobody pre-checks the canter, it turns "Đã lỡ", the trainer books it again and it runs.
// Also in round 1: the groom reports two incidents (one the vet closes, one left open for the vet), and
// asks for more grain, which the manager approves in part.
// The first round starts at once; another starts every DEMO_ROUND_EVERY_MIN until DEMO_LAST_START.
// Every round uses new horses named "Test Demo …" and takes 2.5 kg of grain out of stock per meal.
// On race day (DEMO_MODE=results, or DEMO_RESULT_DATE is today) the trainer records the race's results
// instead: the horses that ran, ranked by their trial, prize money for the first three.
//
// DEMO_ACCOUNTS (a GitHub secret): {"password":"…","manager":"…","trainer":"…","vet":"…","groom":"…","owner":"…"}
// TZ must be the club's time zone (Asia/Ho_Chi_Minh): rations are clock times on the server's day.
const fs = require('node:fs');

// Node on Windows cannot read a TZ given at startup, only one assigned while it runs: a rehearsal there
// passes the zone as DEMO_TZ. Linux reads TZ at startup anyway.
const zone = process.env.DEMO_TZ || process.env.TZ;
if (zone) process.env.TZ = String(zone);

const BASE = (process.env.LIVE_API_URL || 'https://racehorse-tms-server.onrender.com/api/v1').replace(/\/$/, '');
const WRITE = process.env.DEMO_CONFIRM === 'write';
// Minutes past the club's digestion wait before the canter (a rehearsal on a local server can shorten it).
const MARGIN = Number(process.env.DEMO_MARGIN_MIN ?? 10);
const ROUND_EVERY = Number(process.env.DEMO_ROUND_EVERY_MIN ?? 45);
const LAST_START = process.env.DEMO_LAST_START || '08:00';
// Minutes between the end of the canter and the trial (a breather; a rehearsal can shorten it).
const TRIAL_GAP = Number(process.env.DEMO_TRIAL_GAP_MIN ?? 30);
// A breakfast is grain or pellets weighed in kg — not hay (the readiness check treats that as lighter),
// nor the supplements also filed under feed (electrolytes, vitamins, oil, salt).
const GRAIN = /(yến mạch|oats|cám|grain|viên|pellet|ngô|corn|lúa mạch|barley)/i;
const FORAGE = /(cỏ|hay|rơm|alfalfa|timothy|chaff|straw)/i;
const ROLE_OF = { manager: 'manager', trainer: 'head_trainer', vet: 'veterinarian', groom: 'groom', owner: 'owner' };

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const clock = (d = new Date()) => `${hhmm(d)}:${pad(d.getSeconds())}`;
const ddmm = (d = new Date()) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const minutes = (n) => n * 60000;
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;
/** n minutes after `from`, on a 5-minute mark (up), as trainers book. */
const slotAfter = (from, n) => {
  const d = new Date(from.getTime() + minutes(n));
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return d;
};
/** `d` moved back to a 5-minute mark. */
const slotFloor = (d) => {
  const x = new Date(d);
  x.setMinutes(Math.floor(x.getMinutes() / 5) * 5, 0, 0);
  return x;
};
const atClock = (text) => {
  const [h, m] = text.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

// The demo race: tomorrow unless DEMO_RACE_DATE (YYYY-MM-DD) says otherwise. A trial must be run before
// race day, and results can only be recorded from race day on — hence a race the day after the rounds.
const RACE = { distance: 1600, surface: 'dirt', venue: 'Trường đua Đại Nam' };
function raceDay() {
  const d = process.env.DEMO_RACE_DATE ? new Date(`${process.env.DEMO_RACE_DATE}T00:00:00`) : new Date(Date.now() + minutes(24 * 60));
  d.setHours(15, 0, 0, 0);
  return d;
}
const raceName = (d) => `TEST Cúp Demo ${ddmm(d)}`;

const steps = [];
let failed = false;
function log(flow, role, action, ok, detail = '') {
  steps.push({ at: clock(), flow, role, action, ok, detail: String(detail).replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, 300) });
  console.log(`${clock()} [${flow}] ${ok ? 'OK ' : 'ERR'} ${role}: ${action}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}
function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  if (process.env.DEMO_REPORT) fs.appendFileSync(process.env.DEMO_REPORT, `${text}\n`);
}
const table = (rows) =>
  ['| Giờ | Flow | Vai trò | Bước | Kết quả | Chi tiết |', '|---|---|---|---|---|---|', ...rows.map((s) => `| ${s.at} | ${s.flow} | ${s.role} | ${s.action} | ${s.ok ? '✅' : '❌'} | ${s.detail} |`)].join('\n');

const tokens = {};
const ids = {};
// Render answers 502–504 while it swaps in a new deploy (a push touching server/ redeploys it).
const TRANSIENT = new Set([502, 503, 504]);
/**
 * One API call, retried for up to 4 minutes while the server is unreachable or being redeployed.
 * A request that timed out may have reached the server, so only a read is sent again after a timeout:
 * repeating a write could create the horse or the session twice.
 */
async function call(role, method, path, body) {
  const deadline = Date.now() + minutes(4);
  for (;;) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: { ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90000),
      });
    } catch (error) {
      if ((error.name === 'TimeoutError' && method !== 'GET') || Date.now() > deadline) throw error;
      console.log(`${clock()} ${method} ${path}: ${error.message} — thử lại sau 15 giây`);
      await sleep(15000);
      continue;
    }
    if (TRANSIENT.has(res.status) && Date.now() < deadline) {
      console.log(`${clock()} ${method} ${path}: HTTP ${res.status} (server đang khởi động lại) — thử lại sau 15 giây`);
      await sleep(15000);
      continue;
    }
    const json = await res.json().catch(() => null);
    return { status: res.status, json, data: json?.data, message: json?.message || '' };
  }
}
/** A call that must answer `expected`; anything else stops the flow. */
async function must(flow, role, action, method, path, body, expected = [200, 201]) {
  const r = await call(role, method, path, body);
  const ok = [].concat(expected).includes(r.status);
  log(flow, role, action, ok, ok ? '' : `HTTP ${r.status}: ${r.message}`);
  if (!ok) throw new Error(`${action}: HTTP ${r.status} ${r.message}`);
  return r.data;
}
/** A write the club's rules must refuse: the step passes when it is refused. */
async function refused(flow, role, action, method, path, body) {
  const r = await call(role, method, path, body);
  const ok = r.status === 400 || r.status === 409;
  log(flow, role, action, ok, `HTTP ${r.status}: ${r.message}`);
  return ok;
}
/** A read that must not end the flow when one request drops. */
const read = async (role, path) => (await call(role, 'GET', path).catch(() => ({}))).data;

async function wake() {
  const deadline = Date.now() + minutes(4);
  while (Date.now() < deadline) {
    try {
      const r = await call(null, 'GET', '/health-check');
      if (r.status === 200) return true;
    } catch {
      /* still waking */
    }
    await sleep(10000);
  }
  return false;
}

/** Waits until `until`, pinging the API every 5 minutes so the free Render instance does not sleep. */
async function waitUntil(until, label) {
  console.log(`${clock()} chờ tới ${hhmm(until)} (${label})`);
  while (Date.now() < until.getTime()) {
    await sleep(Math.min(minutes(5), until.getTime() - Date.now()));
    await call(null, 'GET', '/health-check').catch(() => {});
  }
}

async function login(P, accounts, role) {
  const r = await call(null, 'POST', '/auth/login', { email: accounts[role], password: accounts.password });
  const token = r.data?.token;
  const user = r.data?.user;
  const ok = Boolean(token) && user?.role === ROLE_OF[role];
  log(P, role, 'đăng nhập', ok, ok ? user.name : r.message || `vai trò ${user?.role}`);
  if (ok) {
    tokens[role] = token;
    ids[role] = user.id || user._id;
  }
  return ok;
}

async function preflight(accounts) {
  const P = 'Kiểm tra trước';
  if (!(await wake())) {
    log(P, '-', 'API trả lời health-check', false, 'không trả lời sau 4 phút');
    return null;
  }
  log(P, '-', 'API trả lời health-check', true, BASE);
  for (const role of Object.keys(ROLE_OF)) {
    if (!(await login(P, accounts, role))) return null;
  }
  const policy = (await call('trainer', 'GET', '/settings/policy')).data || {};
  const digest = Number(policy.digestMinutes) || 90;
  log(P, 'trainer', 'đọc quy định CLB', true, `chờ tiêu hóa ${policy.digestHardMinutes}/${digest} phút, chiều từ ${policy.afternoonTime}, nhịn tối đa ${policy.maxFastHours} giờ`);

  // Breakfast must sit before 11:00, and the canter ~digest+15 minutes later must end before the afternoon.
  // Every check runs, so one preflight shows every problem at once.
  const now = new Date();
  const earlyEnough = now >= atClock('01:00') && now <= atClock('10:00');
  log(P, '-', 'giờ chạy', earlyEnough, earlyEnough
    ? `${hhmm(now)} — buổi sáng, đủ thời gian`
    : `${hhmm(now)}: phải chạy từ 01:00 đến 10:00 (bữa sáng trước 11:00, buổi phi chậm xong trước buổi chiều).`);

  const stock = (await call('manager', 'GET', '/inventory')).data || [];
  const feed = stock
    .filter((i) => i.category === 'feed' && i.isActive !== false && GRAIN.test(i.name) && !FORAGE.test(i.name) && /^kg$/i.test(i.unit) && Number(i.quantity) >= 30)
    .sort((a, b) => b.quantity - a.quantity)[0];
  log(P, 'manager', 'chọn thức ăn tinh trong kho', Boolean(feed), feed ? `${feed.name}: còn ${feed.quantity} ${feed.unit}` : 'không có ngũ cốc/thức ăn viên (kg) nào còn từ 30 kg');
  return earlyEnough && feed ? { policy, digest, feed } : null;
}

// The vet's first exam of a new horse: cleared for all work.
const INTAKE_EXAM = {
  label: 'khám tiếp nhận: đủ điều kiện, không hạn chế (37,6 °C, 36 bpm)',
  body: {
    history: 'Ngựa mới về CLB, vận chuyển 6 giờ. Chủ báo đã tiêm cúm + uốn ván 3 tháng trước, tẩy giun 2 tháng trước; chưa từng chấn thương.',
    diagnosis: 'Khám tiếp nhận: niêm mạc hồng, tim phổi bình thường, chân không sưng nóng. Đủ điều kiện tập.',
    resultStatus: 'eligible', clearedLevel: 'high',
    vitalSigns: { temperatureC: 37.6, heartRate: 36, respiratoryRate: 12, weightKg: 485 },
    clinical: { mucousMembrane: 'pink', capillaryRefillSec: 1.5, gutSounds: 'normal', hydration: 'normal', lamenessGrade: 0 },
    notes: 'Cho tập nhẹ 2–3 ngày đầu để ngựa quen chuồng. Hẹn khám định kỳ sau 14 ngày.',
  },
};
// A horse back from a sprain: the vet clears it for light work only.
const RECOVERING_EXAM = {
  label: 'tái khám sau bong gân: hết sưng, chỉ cho tập nhẹ',
  body: {
    history: 'Ngựa bong gân cổ chân sau phải 3 tuần trước, đã chườm lạnh và băng ép ở CLB cũ.',
    diagnosis: 'Tái khám: cổ chân sau phải hết sưng nóng, đi bộ không khập khiễng. Cho tập nhẹ (đi bộ, chạy kiệu) 1 tuần rồi đánh giá lại.',
    resultStatus: 'monitoring', clearedLevel: 'light',
    vitalSigns: { temperatureC: 37.7, heartRate: 38, respiratoryRate: 12, weightKg: 470 },
    clinical: { mucousMembrane: 'pink', capillaryRefillSec: 1.5, gutSounds: 'normal', hydration: 'normal', lamenessGrade: 0 },
    notes: 'Chưa cho phi chậm hay chạy nhanh tới khi tái khám.',
  },
};

/**
 * A new horse with everything a training day needs except the meal: stall + groom, an exam, a
 * breakfast ration, a plan. Breakfast only: a stabled horse gets its meals as groom tasks every day
 * until it is archived, so the fewer meals a test horse has the less it clutters the groom's list.
 */
async function setUpHorse(F, name, stall, breakfastAt, feed, exam = INTAKE_EXAM) {
  const horse = await must(F, 'manager', `thêm ngựa "${name}", giao HLV, bác sĩ, chủ`, 'POST', '/horses', {
    name, breed: 'Thoroughbred', sex: 'gelding', owner: ids.owner, assignedTrainer: ids.trainer, assignedVet: ids.vet,
  });
  await must(F, 'manager', `xếp chuồng "${stall}", giao nhân viên chăm sóc`, 'POST', '/stable/assignments', {
    horse: horse._id, stableBlock: stall, assignedCaretaker: ids.groom,
  });
  await must(F, 'vet', exam.label, 'POST', '/health/records', { horse: horse._id, ...exam.body });
  await must(F, 'trainer', `khẩu phần bữa sáng ${hhmm(breakfastAt)}: 2,5 ${feed.unit} ${feed.name}`, 'POST', '/feeding', {
    horse: horse._id, mealTime: 'morning', timeOfDay: hhmm(breakfastAt), items: [{ inventoryItem: feed._id, amount: 2.5 }],
  });
  const plan = await must(F, 'trainer', 'kế hoạch nền tảng sức bền (đang áp dụng)', 'POST', '/training/plans', {
    horse: horse._id, phase: 'base_building', distanceTarget: 1600, weeklyVolumeKm: 20, intensity: 'moderate', surface: 'dirt',
    startDate: new Date().toISOString(), status: 'active', goal: 'Nền tảng sức bền trước mùa giải',
  });
  return { horse, plan };
}

const CANTER = { kind: 'canter', prescription: { distanceM: 2400, targetHeartRateMax: 170, targetSpeedKmh: null } };
const TRIAL = { kind: 'trial', prescription: { distanceM: RACE.distance, reps: 1, targetSpeedKmh: 60, targetHeartRateMax: 225 } };
// What a session asks for, how the step names it, and the trainer's note on it.
const CANTER_WORK = { spec: CANTER, label: 'buổi phi chậm 2400 m', detail: 'nhịp tim ≤ 170', coachNote: 'Khởi động đi bộ 10 phút, phi chậm đều 2400 m, giữ nhịp tim dưới 170.' };
const PACED_CANTER_WORK = {
  spec: { kind: 'canter', prescription: { distanceM: 2400, targetHeartRateMax: 170, targetSpeedKmh: 35 } },
  label: 'buổi phi chậm 2400 m',
  detail: 'tốc độ ≥ 35 km/h, nhịp tim ≤ 170',
  coachNote: 'Phi chậm 2400 m, giữ tốc độ 35 km/h và nhịp tim dưới 170.',
};
const WALK_WORK = {
  spec: { kind: 'walk', prescription: { distanceM: 2000, reps: 1, targetSpeedKmh: 12, targetHeartRateMax: 120, durationMinutes: 15 } },
  label: 'buổi đi bộ & chạy kiệu 2000 m',
  detail: 'nhịp tim ≤ 120 (bài nhẹ)',
  coachNote: 'Đi bộ 10 phút, chạy kiệu nhẹ 5 phút, theo dõi dáng đi.',
};
const gateLine = (readiness) => (readiness?.gates || []).map((g) => `${g.label}: ${g.status}`).join(', ');
const readinessAt = (horse, at, intensity = 'moderate') => read('trainer', `/training/sessions/readiness?horse=${horse._id}&scheduledAt=${at.toISOString()}&intensity=${intensity}`);
const intensityOf = (work) => (work.spec.kind === 'walk' ? 'light' : 'moderate');
const FED_WELL = { observation: { appetite: 'Tốt', manure: 'Bình thường', waterIntake: 'Bình thường' }, amountEatenPercent: 100 };
const metricsLine = (s) => `${s.metrics?.distance} m, nhịp tim TB ${s.metrics?.avgHeartRate} bpm, tốc độ tối đa ${s.metrics?.maxSpeed} km/h`;
const ENDED = ['completed', 'evaluated', 'aborted'];

/** The session once it has ended (the sensor feed finished it, or it was stopped), or null after `limit` minutes. */
async function untilEnded(id, limit = 10) {
  for (let i = 0; i < limit * 6; i += 1) {
    await sleep(10000);
    const s = await read('trainer', `/training/sessions/${id}`);
    if (ENDED.includes(s?.status)) return s;
  }
  return null;
}
/** The session once the sensor feed has finished it, or null after 10 minutes. */
async function untilFinished(id) {
  const s = await untilEnded(id);
  return s?.status === 'completed' ? s : null;
}
/** The session after its first sensor readings (or once it is no longer running). */
async function firstReadings(id) {
  let s;
  for (let i = 0; i < 30; i += 1) {
    await sleep(2000);
    s = await read('trainer', `/training/sessions/${id}`);
    if (s?.metrics?.sampleCount >= 1 || (s && s.status !== 'in_progress')) break;
  }
  return s;
}
const groomTasks = async (horse) => (await read('groom', `/stable/tasks?horse=${horse._id}`)) || [];
async function pendingBreakfast(F, horse) {
  const breakfast = (await groomTasks(horse)).find((t) => t.taskType === 'feeding' && t.mealSlot === 'morning' && !t.makeUpOf && t.status === 'pending');
  log(F, 'groom', 'thấy việc cho ăn bữa sáng trong danh sách', Boolean(breakfast));
  return breakfast;
}

/** The groom gives a meal; returns when it was recorded. */
async function feed(F, taskId, what) {
  const fed = await must(F, 'groom', `${what}: ăn hết, phân và nước uống bình thường`, 'PATCH', `/stable/tasks/${taskId}/complete`, {
    clientOpId: `demo-${taskId}`, ...FED_WELL,
  });
  return new Date(fed?.completedAt || Date.now());
}
/** The trainer pre-checks a booked session just before its time and starts it at its time. */
async function runAt(F, session, at) {
  await waitUntil(new Date(at.getTime() - minutes(2)), `${F}: mở kiểm tra sẵn sàng sát giờ tập`);
  await wake();
  await must(F, 'trainer', 'kiểm tra sẵn sàng: 37,7 °C, sân cát khô, trời mát', 'POST', `/training/sessions/${session._id}/pre-check`, {
    confirmed: true, bodyTempC: 37.7, trackCondition: 'Sân cát khô, mặt sân tốt', weather: 'Trời mát, 26 °C',
  });
  await waitUntil(at, `${F}: giờ tập`);
  await must(F, 'trainer', 'bắt đầu buổi tập (cảm biến bắt đầu gửi số liệu)', 'POST', `/training/sessions/${session._id}/start`, {});
}
/** The trainer books a session at `at` and runs it to its start. */
async function bookAndStart(F, { horse, plan }, at, work, why = '') {
  log(F, 'trainer', `xem bảng sẵn sàng cho ${work.label} ${hhmm(at)}`, true, gateLine(await readinessAt(horse, at, intensityOf(work))));
  const session = await must(F, 'trainer', `lên lịch ${work.label} lúc ${hhmm(at)}${why}, ${work.detail}`, 'POST', '/training/sessions', {
    horse: horse._id, trainingPlan: plan._id, ...work.spec, scheduledAt: at.toISOString(), coachNote: work.coachNote,
    // A warning on the readiness board (a horse the vet is watching) is booked past with the trainer's reason.
    ...(work.overrideReason ? { overrideReason: work.overrideReason } : {}),
  }, 201);
  await runAt(F, session, at);
  return session;
}
/** The groom gives a meal; the trainer books a session once the club's digestion wait has passed, then runs it to its start. */
async function feedThenRun(F, ctx, setup, taskId, what, work = CANTER_WORK) {
  const at = slotAfter(await feed(F, taskId, what), ctx.digest + MARGIN);
  return bookAndStart(F, setup, at, work, ` (${ctx.digest + MARGIN} phút sau bữa)`);
}
/** A session that ran to its end, evaluated; returns the session or null. */
async function evaluateWhenDone(F, session, rating, comment) {
  const done = await untilFinished(session._id);
  log(F, 'trainer', 'cảm biến chạy hết cự ly, buổi tập tự kết thúc', Boolean(done), done ? metricsLine(done) : 'sau 10 phút vẫn chưa kết thúc');
  if (!done) return null;
  await must(F, 'trainer', `đánh giá buổi tập: ${rating}/10`, 'PATCH', `/training/sessions/${session._id}/evaluation`, { performanceRating: rating, trainerComment: comment });
  return read('trainer', `/training/sessions/${session._id}`);
}

async function ownerSees(F, horse) {
  const mine = (await read('owner', '/horses/owner-summary')) || [];
  const found = [].concat(mine).find((h) => String(h._id || h.horse?._id || h.id) === String(horse._id) || h.name === horse.name);
  log(F, 'owner', `chủ ngựa thấy "${horse.name}" trong danh sách ngựa của mình`, Boolean(found));
}

async function registerRace(F, horse) {
  const date = raceDay();
  return must(F, 'trainer', `đăng ký giải "${raceName(date)}" ngày ${ddmm(date)}: ${RACE.distance} m mặt cát, ${RACE.venue}`, 'POST', '/races', {
    horse: horse._id, raceName: raceName(date), raceDate: date.toISOString(), ...RACE,
  }, 201);
}

/** The groom reports an incident on one of the horse's tasks; returns the task's id (the incident's) or null. */
async function reportIncident(F, taskId, what, body) {
  const r = await call('groom', 'POST', `/stable/tasks/${taskId}/incident`, { occurredAt: new Date().toISOString(), ...body });
  const ok = r.status === 200 || r.status === 201;
  log(F, 'groom', `báo sự cố: ${what}`, ok, ok ? `mức ${body.severity}` : `HTTP ${r.status}: ${r.message}`);
  return ok ? taskId : null;
}

/** A trial over the race distance after the canter, then the race decision taken on it. */
async function trialThenDecide(F, { horse, plan }, entry) {
  const at = slotAfter(new Date(), TRIAL_GAP);
  log(F, 'trainer', `xem bảng sẵn sàng cho buổi chạy thử ${hhmm(at)} (bài nặng)`, true, gateLine(await readinessAt(horse, at, 'high')));
  const trial = await must(F, 'trainer', `lên lịch chạy thử ${RACE.distance} m cho giải lúc ${hhmm(at)}: tốc độ ≥ 60 km/h, nhịp tim ≤ 225`, 'POST', '/training/sessions', {
    horse: horse._id, trainingPlan: plan._id, ...TRIAL, raceEntry: entry._id, scheduledAt: at.toISOString(),
    coachNote: 'Khởi động 15 phút, chạy thử đủ cự ly giải ở tốc độ thi đấu; ghi nhận tốc độ tối đa và nhịp tim.',
  }, 201);
  await waitUntil(new Date(at.getTime() - minutes(2)), `${F}: kiểm tra sẵn sàng trước chạy thử`);
  await wake();
  await must(F, 'trainer', 'kiểm tra sẵn sàng chạy thử: 37,6 °C, sân cát đã bừa', 'POST', `/training/sessions/${trial._id}/pre-check`, {
    confirmed: true, bodyTempC: 37.6, trackCondition: 'Sân cát đã bừa, mặt sân tốt', weather: 'Nắng nhẹ, 28 °C',
  });
  await waitUntil(at, `${F}: giờ chạy thử`);
  await must(F, 'trainer', 'bắt đầu chạy thử', 'POST', `/training/sessions/${trial._id}/start`, {});
  const done = await untilFinished(trial._id);
  log(F, 'trainer', 'chạy thử xong (cảm biến chạy hết cự ly)', Boolean(done), done ? metricsLine(done) : 'sau 10 phút vẫn chưa kết thúc');
  if (!done) return 'chạy thử lỗi';
  const met = done.outcome?.met === true;
  log(F, 'trainer', `kết quả chạy thử so với chỉ tiêu: ${met ? 'đạt' : 'chưa đạt'}`, true, done.outcome?.summary || '');
  await must(F, 'trainer', `đánh giá chạy thử: ${met ? 9 : 6}/10`, 'PATCH', `/training/sessions/${trial._id}/evaluation`, {
    performanceRating: met ? 9 : 6,
    trainerComment: met
      ? 'Chạy thử đạt tốc độ thi đấu, nhịp tim trong ngưỡng, về đích còn sức. Sẵn sàng cho giải.'
      : 'Tốc độ tối đa còn thiếu một chút so với chỉ tiêu; nhịp tim tốt, hồi sức nhanh. Có thể thi đấu, giữ sức ở nửa đầu.',
  });
  const decided = await must(F, 'trainer', met ? 'quyết định dự giải: tham gia, dựa trên buổi chạy thử đạt' : 'quyết định dự giải: vẫn tham gia dù chạy thử chưa đạt (ghi lý do)', 'POST', `/races/${entry._id}/decision`, {
    decision: 'confirmed', trialSession: trial._id,
    ...(met ? {} : { reason: 'Tốc độ chạy thử thiếu dưới 10% chỉ tiêu, nhịp tim và hồi sức tốt — HLV vẫn cho thi đấu, giữ sức nửa đầu.' }),
  });
  return `chạy thử ${met ? 'đạt' : 'chưa đạt'} → ${decided?.status === 'confirmed' ? 'xác nhận dự giải' : decided?.status}`;
}

async function flowPass(ctx, F, setup, withRace) {
  const { horse } = setup;
  const entry = withRace ? await registerRace(F, horse) : null;
  const breakfast = await pendingBreakfast(F, horse);
  if (!breakfast) return 'lỗi';
  const session = await feedThenRun(F, ctx, setup, breakfast._id, 'cho ăn bữa sáng');
  const final = await evaluateWhenDone(F, session, 8, 'Ngựa phi đều, nhịp tim luôn dưới ngưỡng, hồi sức nhanh sau buổi. Tuần sau tăng cự ly lên 2800 m.');
  if (!final) return 'lỗi';
  const met = final.outcome?.met === true;
  log(F, 'trainer', 'kết quả so với chỉ tiêu: đạt', met, final.outcome?.summary || 'không có kết luận');
  if (ctx.incidents) {
    // After the session the groom finds a scrape; the vet takes it on and closes it.
    const incident = await reportIncident(F, breakfast._id, 'trầy xước nhẹ bắp chân sau phải sau buổi tập', {
      description: 'Sau buổi tập thấy vết trầy xước nhẹ ở bắp chân sau phải, không chảy máu, ngựa đi lại bình thường.', severity: 'low',
    });
    if (incident) {
      await must(F, 'vet', 'bác sĩ tiếp nhận sự cố', 'PATCH', `/stable/incidents/${incident}`, { status: 'acknowledged' });
      await must(F, 'vet', 'bác sĩ xử lý xong: sát trùng, bôi thuốc mỡ', 'PATCH', `/stable/incidents/${incident}`, {
        status: 'resolved', response: 'Đã sát trùng, bôi thuốc mỡ kháng sinh. Không ảnh hưởng lịch tập, theo dõi 2 ngày.',
      });
    }
  }
  await ownerSees(F, horse);
  const canter = met ? 'Đạt' : 'lỗi';
  return entry ? `${canter} · ${await trialThenDecide(F, setup, entry)}` : canter;
}

/** Breakfast time has passed unfed: the canter is refused, also with the trainer's reason. Returns the refused gate. */
async function refusedWhenUnfed(ctx, F, { horse, plan }) {
  const at = slotAfter(new Date(), 30);
  log(F, 'groom', 'không cho ăn: giờ bữa sáng đã qua, chưa ghi nhận', true, `bữa sáng ${hhmm(ctx.missedBreakfastAt)}`);
  const nutrition = ((await readinessAt(horse, at))?.gates || []).find((g) => g.key === 'nutrition');
  log(F, 'trainer', `bảng sẵn sàng cho buổi phi chậm ${hhmm(at)}: Dinh dưỡng đỏ`, nutrition?.status === 'blocked', nutrition?.detail);
  const body = { horse: horse._id, trainingPlan: plan._id, ...CANTER, scheduledAt: at.toISOString(), coachNote: 'Phi chậm 2400 m.' };
  const first = await refused(F, 'trainer', 'lên lịch buổi phi chậm → hệ thống từ chối', 'POST', '/training/sessions', body);
  const again = await refused(F, 'trainer', 'ghi lý do để vẫn tạo → vẫn bị từ chối (ô đỏ không bỏ qua được)', 'POST', '/training/sessions', { ...body, overrideReason: 'HLV vẫn muốn cho tập, sẽ theo dõi sát' });
  return first && again && nutrition?.status === 'blocked' ? nutrition : null;
}

async function flowFail(ctx, F, setup) {
  const { horse } = setup;
  const gate = await refusedWhenUnfed(ctx, F, setup);
  if (!gate?.taskId) return 'lỗi';
  // Within 4 hours of its time the groom can still record the meal itself (a make-up is only for a
  // meal that can no longer be recorded), so the horse is fed late and the digestion wait restarts.
  const session = await feedThenRun(F, ctx, setup, gate.taskId, 'cho ăn muộn bữa sáng (quá giờ)');

  // The horse struggles: the trainer stops it after the first sensor readings, well short of the distance.
  const s = await firstReadings(session._id);
  if (s?.status === 'in_progress') {
    await must(F, 'trainer', 'ngựa thở gấp, bước rối — HLV kết thúc buổi sớm', 'POST', `/training/sessions/${session._id}/end`, {});
  }
  const ended = await read('trainer', `/training/sessions/${session._id}`);
  const notMet = ended?.outcome?.met === false;
  log(F, 'trainer', 'kết quả so với chỉ tiêu: chưa đạt', notMet, ended?.outcome?.summary || `trạng thái ${ended?.status}`);
  await must(F, 'trainer', 'đánh giá buổi tập: 4/10', 'PATCH', `/training/sessions/${session._id}/evaluation`, {
    performanceRating: 4,
    trainerComment: 'Ngựa thở gấp, nhịp bước rối sau vài trăm mét. HLV cho dừng sớm để an toàn, đề nghị bác sĩ kiểm tra hô hấp trước buổi tập tới.',
  });
  const request = await must(F, 'trainer', 'gửi yêu cầu khám ưu tiên cao cho bác sĩ', 'POST', '/health/exam-requests', {
    horse: horse._id, priority: 'high', reason: 'Ngựa thở gấp, phải dừng buổi phi chậm sớm. Đề nghị kiểm tra hô hấp.',
  }, 201);
  const visit = slotAfter(new Date(), 60);
  await must(F, 'vet', `bác sĩ nhận yêu cầu, hẹn khám lúc ${hhmm(visit)}`, 'PATCH', `/health/exam-requests/${request._id}`, {
    action: 'accept', scheduledFor: visit.toISOString(),
  });
  if (ctx.incidents) {
    // A cough the groom reports: the vet takes it on and will look at it with the exam — left open.
    const incident = await reportIncident(F, gate.taskId, 'ngựa ho khan sau bữa, nước mũi trong', {
      description: 'Ngựa ho khan 3–4 lần sau bữa sáng, nước mũi trong, vẫn ăn uống bình thường.', severity: 'medium',
    });
    if (incident) await must(F, 'vet', 'bác sĩ tiếp nhận sự cố, xem cùng buổi khám đã hẹn', 'PATCH', `/stable/incidents/${incident}`, { status: 'acknowledged' });
  }
  await ownerSees(F, horse);
  return notMet ? 'Chưa đạt (dừng sớm, chờ khám)' : 'lỗi';
}

/**
 * Entered for the race, lame in its canter: the sensors stop the run and ask for the vet, the groom ices
 * the leg, the vet records the injury, marks it and prescribes doses with a training lock; the trial and
 * the race are refused, so it is withdrawn; the groom gives the first doses.
 */
async function flowInjured(ctx, F, setup) {
  const { horse, plan } = setup;
  const entry = await registerRace(F, horse);
  const breakfast = await pendingBreakfast(F, horse);
  if (!breakfast) return 'lỗi';
  const session = await feedThenRun(F, ctx, setup, breakfast._id, 'cho ăn bữa sáng');
  await firstReadings(session._id);
  // The trainer plays out the horse going lame on its left foreleg; the sensor feed stops the run itself.
  const sim = await call('trainer', 'POST', `/training/sessions/${session._id}/simulate`, { scenario: 'injury', leg: 'fore_left' });
  log(F, 'trainer', 'mô phỏng sự cố: ngựa hụt bước, khập khiễng chân trước trái', sim.status === 200, sim.status === 200 ? '' : `HTTP ${sim.status}: ${sim.message}`);
  let request;
  if (sim.status === 200) {
    const stopped = await untilEnded(session._id, 3);
    log(F, '-', 'hệ thống tự dừng buổi: nghi chấn thương, gửi yêu cầu khám gấp, giao chườm lạnh', stopped?.status === 'aborted', stopped?.abortReason || `trạng thái ${stopped?.status}`);
    request = ((await read('vet', `/health/exam-requests?horse=${horse._id}`)) || []).find((q) => String(q.horse?._id || q.horse) === String(horse._id) && q.status === 'pending');
    log(F, 'vet', 'thấy yêu cầu khám gấp do hệ thống gửi', Boolean(request), request?.reason || '');
    const icing = (await groomTasks(horse)).find((t) => t.taskType === 'icing' && t.status === 'pending');
    if (icing) {
      await must(F, 'groom', 'chườm lạnh chân trước trái 15 phút, giữ ngựa trong chuồng', 'PATCH', `/stable/tasks/${icing._id}/complete`, {
        clientOpId: `demo-${icing._id}`, note: 'Chườm đá 15 phút, chân hơi nóng, ngựa đứng yên.',
      });
    } else log(F, 'groom', 'thấy việc chườm lạnh do hệ thống giao', false, 'không thấy');
  } else {
    // Without the simulated sensors the trainer stops it by hand and asks for the vet.
    await must(F, 'trainer', 'ngựa hụt bước, khập khiễng chân trước trái — HLV dừng buổi ngay', 'POST', `/training/sessions/${session._id}/end`, {});
    request = await must(F, 'trainer', 'gửi yêu cầu khám khẩn cho bác sĩ', 'POST', '/health/exam-requests', {
      horse: horse._id, priority: 'high', reason: 'Khập khiễng chân trước trái sau khi hụt bước trong buổi phi chậm.',
    }, 201);
  }
  if (!request) return 'lỗi';
  await must(F, 'vet', 'bác sĩ nhận yêu cầu, khám ngay', 'PATCH', `/health/exam-requests/${request._id}`, {
    action: 'accept', scheduledFor: slotAfter(new Date(), 15).toISOString(),
  });
  const record = await must(F, 'vet', 'khám: viêm gân gấp chân trước trái độ 1 — chấn thương, nghỉ tập 2 tuần', 'POST', '/health/records', {
    horse: horse._id,
    history: 'Ngựa hụt bước ở vòng đầu buổi phi chậm, sau đó khập khiễng chân trước trái; cảm biến dừng buổi, nhân viên đã chườm lạnh 15 phút.',
    diagnosis: 'Sưng nóng nhẹ vùng gân gấp chân trước trái, ngựa né chân khi bước. Viêm gân độ 1: chườm lạnh, băng ép, nghỉ tập 2 tuần rồi khám lại.',
    resultStatus: 'injured', clearedLevel: 'none',
    vitalSigns: { temperatureC: 38.2, heartRate: 46, respiratoryRate: 16 },
    clinical: { mucousMembrane: 'pink', capillaryRefillSec: 2, gutSounds: 'normal', hydration: 'normal', lamenessGrade: 2, lamenessLimb: 'fore_left' },
    notes: 'Siêu âm gân sau 7 ngày. Không cho ra sân tới khi khám lại.',
  });
  await must(F, 'vet', 'đánh dấu chấn thương trên mô hình: gân gấp chân trước trái', 'POST', '/health/injury-markers', {
    horse: horse._id, healthRecord: record._id, bodyPart: 'Gân gấp chân trước trái', severity: 'moderate', notes: 'Viêm gân độ 1, sưng nóng nhẹ.',
    // On the side picture (x from the nose, y from the back, both 0–1): low on the foreleg.
    coordinates: { x: 0.24, y: 0.76 },
  }, 201);
  const doseAt = slotAfter(new Date(), 20);
  await must(F, 'vet', `kê đơn: Bute uống + gel kháng viêm (liều đầu ${hhmm(doseAt)}), khóa tập`, 'POST', '/health/treatments', {
    healthRecord: record._id, horse: horse._id, trainingLevel: 'none', lockReason: 'Viêm gân gấp chân trước trái — nghỉ tập 2 tuần',
    careInstructions: 'Chườm lạnh 20 phút sáng và chiều, băng ép chân trước trái, nghỉ tại chuồng; báo bác sĩ nếu sưng tăng.',
    medications: [
      { name: 'Phenylbutazone (Bute) 1 g', dosage: '1 viên/lần', times: [hhmm(doseAt), '20:00'], instructions: 'Trộn vào thức ăn tinh, không cho khi bụng đói.' },
      { name: 'Gel kháng viêm bôi ngoài', dosage: '10 ml/lần', times: [hhmm(doseAt), '16:00'], instructions: 'Bôi lên vùng sưng sau khi chườm lạnh.' },
    ],
  }, 201);
  const at = slotAfter(new Date(), TRIAL_GAP);
  const medical = ((await readinessAt(horse, at, 'high'))?.gates || []).find((g) => g.key === 'medical');
  log(F, 'trainer', `bảng sẵn sàng cho buổi chạy thử ${hhmm(at)}: Y tế đỏ`, medical?.status === 'blocked', medical?.detail);
  await refused(F, 'trainer', 'lên lịch chạy thử cho giải → hệ thống từ chối (chấn thương)', 'POST', '/training/sessions', {
    horse: horse._id, trainingPlan: plan._id, ...TRIAL, raceEntry: entry._id, scheduledAt: at.toISOString(), coachNote: 'Chạy thử cho giải.',
  });
  await refused(F, 'trainer', 'xác nhận dự giải → bị chặn (bác sĩ ghi chấn thương)', 'POST', `/races/${entry._id}/decision`, {
    decision: 'confirmed', reason: 'HLV vẫn muốn cho thi đấu',
  });
  await must(F, 'trainer', 'quyết định rút khỏi giải, ghi lý do', 'POST', `/races/${entry._id}/decision`, {
    decision: 'withdrawn', reason: 'Viêm gân gấp chân trước trái, bác sĩ cho nghỉ tập 2 tuần — rút khỏi giải.',
  });
  await ownerSees(F, horse);
  // The groom takes the first doses on, and gives them at their time.
  const doses = (await groomTasks(horse)).filter((t) => t.taskType === 'medication' && t.status === 'pending' && t.dueTime === hhmm(doseAt));
  log(F, 'groom', `thấy ${doses.length} liều thuốc lúc ${hhmm(doseAt)} trong danh sách`, doses.length > 0);
  for (const d of doses) await must(F, 'groom', `tiếp nhận liều ${d.dueTime}`, 'PATCH', `/stable/tasks/${d._id}/acknowledge`, { clientOpId: `demo-ack-${d._id}` });
  await waitUntil(doseAt, `${F}: giờ cho thuốc`);
  for (const d of doses) await must(F, 'groom', `cho thuốc liều ${d.dueTime}`, 'PATCH', `/stable/tasks/${d._id}/complete`, { clientOpId: `demo-dose-${d._id}`, note: 'Đã cho đủ liều.' });
  return 'Chấn thương (cảm biến tự dừng) → kê đơn, khóa tập → rút khỏi giải';
}

/** The trainer plays out a tired horse: it runs its distance, too slowly for its targets. */
async function flowTired(ctx, F, setup) {
  const breakfast = await pendingBreakfast(F, setup.horse);
  if (!breakfast) return 'lỗi';
  const session = await feedThenRun(F, ctx, setup, breakfast._id, 'cho ăn bữa sáng', PACED_CANTER_WORK);
  const sim = await call('trainer', 'POST', `/training/sessions/${session._id}/simulate`, { scenario: 'tired' });
  log(F, 'trainer', 'mô phỏng sự cố: ngựa mệt (tốc độ giảm, nhịp tim tăng)', sim.status === 200, sim.status === 200 ? '' : `HTTP ${sim.status}: ${sim.message}`);
  const final = await evaluateWhenDone(F, session, 5, 'Ngựa xuống sức từ nửa sau, không giữ được 35 km/h, nhịp tim cao. Giảm tải 2 ngày, bổ sung điện giải.');
  if (!final) return 'lỗi';
  const met = final.outcome?.met === true;
  log(F, 'trainer', 'kết quả so với chỉ tiêu: chưa đạt (chạy hết cự ly nhưng chậm)', !met, final.outcome?.summary || '');
  return met ? 'Mệt nhưng vẫn đạt' : 'Mệt → chưa đạt (hết cự ly, chậm)';
}

/** Cleared for light work only: the canter is refused, a walk runs instead. */
async function flowLightOnly(ctx, F, setup) {
  const { horse, plan } = setup;
  const breakfast = await pendingBreakfast(F, horse);
  if (!breakfast) return 'lỗi';
  const at = slotAfter(await feed(F, breakfast._id, 'cho ăn bữa sáng'), ctx.digest + MARGIN);
  const medical = ((await readinessAt(horse, at))?.gates || []).find((g) => g.key === 'medical');
  log(F, 'trainer', `bảng sẵn sàng cho buổi phi chậm ${hhmm(at)}: Y tế chặn (chỉ tập nhẹ)`, medical?.status === 'blocked', medical?.detail);
  await refused(F, 'trainer', 'lên lịch phi chậm (cường độ vừa) → hệ thống từ chối: bác sĩ chỉ cho tập nhẹ', 'POST', '/training/sessions', {
    horse: horse._id, trainingPlan: plan._id, ...CANTER, scheduledAt: at.toISOString(), coachNote: 'Phi chậm 2400 m.',
  });
  const session = await bookAndStart(F, setup, at, { ...WALK_WORK, overrideReason: 'Bác sĩ cho tập nhẹ: chỉ đi bộ và chạy kiệu, HLV theo dõi chân sau phải suốt buổi.' }, ' thay cho phi chậm');
  const final = await evaluateWhenDone(F, session, 7, 'Đi bộ và chạy kiệu đều, không khập khiễng chân sau phải. Giữ bài nhẹ đến khi bác sĩ tái khám.');
  return final ? 'Chỉ tập nhẹ: phi chậm bị từ chối → đi bộ xong' : 'lỗi';
}

/** A blood result comes in while the horse canters: the vet locks training and the run stops. */
async function flowVetLock(ctx, F, setup) {
  const { horse } = setup;
  const breakfast = await pendingBreakfast(F, horse);
  if (!breakfast) return 'lỗi';
  const session = await feedThenRun(F, ctx, setup, breakfast._id, 'cho ăn bữa sáng');
  await firstReadings(session._id);
  const record = await must(F, 'vet', 'kết quả xét nghiệm máu: men cơ CK tăng cao — nghi viêm cơ', 'POST', '/health/records', {
    horse: horse._id,
    history: 'Mẫu máu lấy lúc khám tiếp nhận vừa có kết quả: men cơ CK 2.800 U/L (bình thường dưới 400). HLV báo ngựa hơi cứng cơ mông khi khởi động.',
    diagnosis: 'Nghi viêm cơ do gắng sức (tying-up): men cơ CK tăng cao. Dừng tập ngay, cho nghỉ 3 ngày rồi xét nghiệm lại.',
    resultStatus: 'monitoring',
    vitalSigns: { temperatureC: 38.3, heartRate: 48, respiratoryRate: 18 },
    clinical: { mucousMembrane: 'pink', capillaryRefillSec: 2, gutSounds: 'normal', hydration: 'mild', lamenessGrade: 0 },
    notes: 'Xét nghiệm lại men CK sau 72 giờ.',
  });
  await must(F, 'vet', 'khóa tập khẩn cấp khi ngựa đang tập', 'POST', '/health/treatments', {
    healthRecord: record._id, horse: horse._id, trainingLevel: 'none', lockReason: 'Nghi viêm cơ (men CK cao) — khóa tập 3 ngày',
    careInstructions: 'Dắt ngựa về chuồng ngay, cho uống nước tự do, theo dõi màu nước tiểu; báo bác sĩ nếu ngựa đổ mồ hôi nhiều.',
  }, 201);
  const ended = await read('trainer', `/training/sessions/${session._id}`);
  const stopped = ended?.status === 'aborted';
  log(F, 'trainer', 'buổi đang tập tự dừng khi bác sĩ khóa tập (giữ số liệu đến lúc dừng)', stopped, ended?.abortReason || `trạng thái ${ended?.status}`);
  await ownerSees(F, horse);
  return stopped ? 'Bác sĩ khóa tập giữa buổi → buổi tự dừng' : 'lỗi';
}

/** The trainer stops the canter for a storm; when it clears, a light session runs instead. */
async function flowWeather(ctx, F, setup) {
  const breakfast = await pendingBreakfast(F, setup.horse);
  if (!breakfast) return 'lỗi';
  const session = await feedThenRun(F, ctx, setup, breakfast._id, 'cho ăn bữa sáng');
  await firstReadings(session._id);
  await must(F, 'trainer', 'mưa giông bất chợt, sân trơn — HLV dừng buổi (thời tiết)', 'POST', `/training/sessions/${session._id}/abort`, {
    category: 'weather', reason: 'Mưa giông bất chợt, sân trơn — dừng để an toàn cho ngựa.',
  });
  const again = await bookAndStart(F, setup, slotAfter(new Date(), 30), WALK_WORK, ' (trời tạnh, tập nhẹ bù)');
  const final = await evaluateWhenDone(F, again, 7, 'Sau mưa chỉ cho đi bộ và chạy kiệu trên sân đã thoát nước. Phi chậm dời sang ngày mai.');
  return final ? 'Dừng vì mưa → tập nhẹ bù xong' : 'lỗi';
}

/** The horse refuses breakfast: the trainer asks for a make-up meal, the groom gives it, then it trains. */
async function flowMakeUp(ctx, F, setup) {
  const { horse } = setup;
  const breakfast = await pendingBreakfast(F, horse);
  if (!breakfast) return 'lỗi';
  await must(F, 'groom', 'báo không cho ăn được: ngựa bỏ ăn, chỉ ăn khoảng 10%', 'PATCH', `/stable/tasks/${breakfast._id}/not-done`, {
    clientOpId: `demo-nd-${breakfast._id}`, reason: 'Ngựa bỏ ăn, ngửi rồi quay đi — chỉ ăn khoảng 10%.',
  });
  const at = slotAfter(new Date(), 30);
  const nutrition = ((await readinessAt(horse, at))?.gates || []).find((g) => g.key === 'nutrition');
  log(F, 'trainer', `bảng sẵn sàng cho buổi phi chậm ${hhmm(at)}: Dinh dưỡng (bữa sáng bị bỏ)`, true, `${nutrition?.status}: ${nutrition?.detail || ''}`);
  await must(F, 'trainer', 'báo nhân viên cho ăn bù bữa sáng', 'POST', `/stable/tasks/${breakfast._id}/make-up`, {});
  const makeUp = (await groomTasks(horse)).find((t) => String(t.makeUpOf?._id || t.makeUpOf) === String(breakfast._id) && t.status === 'pending');
  log(F, 'groom', 'thấy việc cho ăn bù trong danh sách', Boolean(makeUp));
  if (!makeUp) return 'lỗi';
  const session = await feedThenRun(F, ctx, setup, makeUp._id, 'cho ăn bù bữa sáng (lần này ăn hết)');
  const final = await evaluateWhenDone(F, session, 8, 'Ăn bù xong, chờ đủ thời gian tiêu hóa rồi mới tập. Ngựa phi đều, hồi sức tốt.');
  return final ? 'Bỏ bữa → ăn bù → phi chậm xong' : 'lỗi';
}

/** Nobody pre-checks the canter: it turns "Đã lỡ", the trainer books it again and it runs. */
async function flowMissed(ctx, F, setup) {
  const { horse, plan } = setup;
  const breakfast = await pendingBreakfast(F, horse);
  if (!breakfast) return 'lỗi';
  const at = slotAfter(await feed(F, breakfast._id, 'cho ăn bữa sáng'), ctx.digest + MARGIN);
  const session = await must(F, 'trainer', `lên lịch buổi phi chậm 2400 m lúc ${hhmm(at)}`, 'POST', '/training/sessions', {
    horse: horse._id, trainingPlan: plan._id, ...CANTER, scheduledAt: at.toISOString(), coachNote: CANTER_WORK.coachNote,
  }, 201);
  log(F, 'trainer', 'HLV bận ở sân khác, không kiểm tra sẵn sàng, không bắt đầu buổi', true, `quá ${hhmm(at)} 30 phút thì buổi thành "Đã lỡ"`);
  // The server marks it missed 30 minutes after its time; it looks every 5 minutes.
  await waitUntil(new Date(at.getTime() + minutes(31)), `${F}: chờ buổi thành "Đã lỡ"`);
  let s;
  for (let i = 0; i < 24; i += 1) {
    s = await read('trainer', `/training/sessions/${session._id}`);
    if (s?.status === 'missed') break;
    await sleep(30000);
  }
  log(F, '-', 'hệ thống chuyển buổi sang "Đã lỡ" và báo HLV', s?.status === 'missed', `trạng thái ${s?.status}`);
  if (s?.status !== 'missed') return 'lỗi';
  const next = slotAfter(new Date(), 10);
  const again = await must(F, 'trainer', `xếp lại buổi đã lỡ vào ${hhmm(next)}`, 'POST', `/training/sessions/${session._id}/reschedule`, { scheduledAt: next.toISOString() }, 201);
  await runAt(F, again, next);
  const final = await evaluateWhenDone(F, again, 7, 'Buổi xếp lại chạy đủ cự ly. Lần sau giao trợ lý kiểm tra sẵn sàng khi HLV bận.');
  return final ? 'Lỡ giờ → xếp lại → tập xong' : 'lỗi';
}

/** The groom asks for more grain; the manager approves part of it. */
async function flowRestock(ctx, F) {
  const item = await must(F, 'groom', `đề xuất nhập thêm 50 ${ctx.feed.unit} ${ctx.feed.name} (kho vơi sau các bữa demo)`, 'POST', `/inventory/${ctx.feed._id}/restock-request`, {
    quantity: 50, note: 'Kho vơi sau các bữa sáng của ngựa demo — đề xuất nhập thêm cho tuần tới.',
  });
  const request = [...(item?.restockRequests || [])].reverse().find((q) => q.status === 'pending' && String(q.requestedBy?._id || q.requestedBy) === String(ids.groom));
  log(F, 'manager', 'thấy đề xuất nhập kho của nhân viên', Boolean(request));
  if (!request) return 'lỗi';
  await must(F, 'manager', `duyệt một phần: 30/50 ${ctx.feed.unit}, phần còn lại tuần sau`, 'PATCH', `/inventory/${ctx.feed._id}/restock-requests/${request._id}`, {
    status: 'approved', approvedQuantity: 30, note: 'Duyệt trước 30 kg theo ngân sách tuần này; phần còn lại nhập tuần sau.',
  });
  return 'Đề xuất nhập kho → duyệt 30/50';
}

const results = [];
async function round(ctx, r, startAt) {
  await waitUntil(startAt, `bắt đầu lượt ${r}`);
  const tag = `${ddmm()} R${r}`;
  const now = new Date();
  ctx.missedBreakfastAt = slotFloor(new Date(now.getTime() - minutes(45)));
  ctx.incidents = r === 1;
  const outcome = { r, start: hhmm(now), cases: [] };
  // One horse per case: [label, stall letter, breakfast, the flow, the vet's first exam].
  const cases = [
    ['Đạt', 'A', slotFloor(now), (F, setup) => flowPass(ctx, F, setup, true)],
    ['Không đạt', 'B', ctx.missedBreakfastAt, (F, setup) => flowFail(ctx, F, setup)],
  ];
  if (r === 1) {
    cases.push(
      ['Chấn thương', 'C', slotFloor(now), (F, setup) => flowInjured(ctx, F, setup)],
      ['Mệt', 'D', slotFloor(now), (F, setup) => flowTired(ctx, F, setup)],
      ['Chỉ tập nhẹ', 'E', slotFloor(now), (F, setup) => flowLightOnly(ctx, F, setup), RECOVERING_EXAM],
      ['Khóa giữa buổi', 'F', slotFloor(now), (F, setup) => flowVetLock(ctx, F, setup)],
      ['Dừng vì mưa', 'G', slotFloor(now), (F, setup) => flowWeather(ctx, F, setup)],
      ['Ăn bù', 'H', slotFloor(now), (F, setup) => flowMakeUp(ctx, F, setup)],
      ['Lỡ giờ', 'I', slotFloor(now), (F, setup) => flowMissed(ctx, F, setup)],
    );
  }
  const flows = cases.map(([label, letter, breakfastAt, run, exam]) => async () => {
    const F = `R${r} · ${label}`;
    const slot = [label, 'lỗi'];
    outcome.cases.push(slot);
    slot[1] = await run(F, await setUpHorse(F, `Test Demo ${tag} · ${label}`, `Test Demo ${tag}-${letter}`, breakfastAt, ctx.feed, exam));
  });
  if (r === 1) {
    flows.push(async () => {
      const slot = ['Nhập kho', 'lỗi'];
      outcome.cases.push(slot);
      slot[1] = await flowRestock(ctx, `R${r} · Nhập kho`);
    });
  }
  const runs = await Promise.allSettled(flows.map((run) => run()));
  for (const run of runs) {
    if (run.status === 'rejected') {
      console.error(run.reason?.message || run.reason);
      failed = true;
    }
  }
  results.push(outcome);
  summary(`\n#### Lượt ${r} (bắt đầu ${outcome.start}): ${outcome.cases.map(([l, v]) => `${l}: ${v}`).join(' · ')}\n\n${table(steps.filter((s) => s.flow.startsWith(`R${r} `)))}`);
}

// ---- Demo data, clean (DEMO_MODE=prepare) ----
// The mentor's review (RV2): clean demo data — one horse just taken on, one fed and ready, one to play
// the injury out on — and the stable split into normal zones and an isolation zone. Safe to run again:
// what exists is kept, and the ready horses get today's open meal (run it on the demo morning).
const OLD_TEST_HORSE = /^(Test Demo |TEST )|^Sao Mai Test$/i;
const DEMO_HORSES = {
  fresh: 'Demo 1 · Mới tiếp nhận',
  ready: 'Demo 2 · Sẵn sàng tập',
  injury: 'Demo 3 · Diễn tập chấn thương',
};
const DEMO_ZONES = [
  { zone: 'CL', count: 3, zoneName: 'Khu cách ly', zonePurpose: 'Ngựa bệnh có thể lây, chờ bác sĩ', type: 'isolation' },
  { zone: 'HP', count: 2, zoneName: 'Khu hồi phục', zonePurpose: 'Ngựa chấn thương đang điều trị', type: 'recovery' },
];
const DEMO_MEALS = [
  ['morning', '06:00', 3, 1],
  ['noon', '11:30', 2, 1],
  ['evening', '17:30', 5, 2],
];

async function prepareDemo(accounts) {
  const P = 'Dữ liệu demo';
  if (!(await wake())) {
    log(P, '-', 'API trả lời health-check', false, 'không trả lời sau 4 phút');
    return;
  }
  log(P, '-', 'API trả lời health-check', true, BASE);
  for (const role of Object.keys(ROLE_OF)) {
    if (!(await login(P, accounts, role))) return;
  }

  // 1. The old test horses leave every working list (archived: their records stay, "Khôi phục" brings one back).
  const horses = (await read('manager', '/horses')) || [];
  const old = horses.filter((h) => OLD_TEST_HORSE.test(h.name || ''));
  for (const h of old) {
    await must(P, 'manager', `ngừng quản lý ngựa test cũ "${h.name}"`, 'PATCH', `/horses/${h._id}/archive`, { reason: 'Dữ liệu demo cũ — dọn theo góp ý mentor (RV2)' });
  }
  log(P, 'manager', `dọn ${old.length} ngựa test cũ`, true, old.length ? '' : 'không còn ngựa test cũ');

  // 2. The isolation and recovery zones, if the stable has none of that kind yet.
  const stallsOf = async () => (await read('manager', '/stable/stalls'))?.stalls || [];
  let stalls = await stallsOf();
  for (const z of DEMO_ZONES) {
    if (stalls.some((s) => s.type === z.type)) {
      log(P, 'manager', `đã có ${z.zoneName.toLowerCase()}`, true);
      continue;
    }
    await must(P, 'manager', `tạo ${z.zoneName} (${z.count} chuồng, ${z.zonePurpose.toLowerCase()})`, 'POST', '/stable/stalls/generate', z, 201);
  }
  stalls = await stallsOf();

  // 3. The three demo horses.
  const feedStock = ((await read('manager', '/inventory')) || []).filter((i) => i.category === 'feed' && i.isActive !== false && /^kg$/i.test(i.unit));
  const grain = feedStock.filter((i) => GRAIN.test(i.name) && !FORAGE.test(i.name)).sort((a, b) => b.quantity - a.quantity)[0];
  const hay = feedStock.filter((i) => FORAGE.test(i.name)).sort((a, b) => b.quantity - a.quantity)[0];
  log(P, 'manager', 'chọn cỏ và thức ăn tinh trong kho', Boolean(grain && hay), `${hay?.name || 'thiếu cỏ'} · ${grain?.name || 'thiếu thức ăn tinh'}`);
  const existing = (name) => horses.find((h) => h.name === name && !h.isArchived);
  const profile = { breed: 'Thoroughbred', sex: 'gelding', color: 'Bay', weightKg: 480, dob: '2021-04-12', owner: ids.owner, assignedTrainer: ids.trainer, assignedVet: ids.vet };

  const fresh = existing(DEMO_HORSES.fresh) || (await must(P, 'manager', `thêm "${DEMO_HORSES.fresh}" (chưa xếp chuồng, chưa khám, chưa có khẩu phần)`, 'POST', '/horses', { name: DEMO_HORSES.fresh, ...profile, color: 'Grey' }));
  log(P, 'manager', `"${fresh.name}" chờ tiếp nhận: xếp chuồng → bác sĩ khám → HLV lập khẩu phần và kế hoạch`, true);

  /** A horse set up for training: stall in a normal zone and its groom, an exam, three meals, a plan. */
  const setUp = async (name, extra) => {
    let horse = existing(name);
    if (horse) {
      log(P, 'manager', `"${name}" đã có — giữ nguyên`, true);
      return horse;
    }
    horse = await must(P, 'manager', `thêm "${name}"`, 'POST', '/horses', { name, ...profile, ...extra });
    const free = stalls.find((s) => s.type === 'standard' && s.status !== 'maintenance' && !s.occupied && !s.taken);
    const stallBody = free ? { stall: free._id } : { stableBlock: `Demo ${name.slice(5, 6)}` };
    const placed = await must(P, 'manager', `xếp chuồng ${free?.code || stallBody.stableBlock} (khu thường), giao nhân viên chăm sóc`, 'POST', '/stable/assignments', { horse: horse._id, ...stallBody, assignedCaretaker: ids.groom });
    if (free) free.taken = Boolean(placed);
    await must(P, 'vet', `khám tiếp nhận "${name}": đủ điều kiện, không hạn chế`, 'POST', '/health/records', { horse: horse._id, ...INTAKE_EXAM.body });
    if (grain && hay) {
      for (const [slot, time, hayKg, grainKg] of DEMO_MEALS) {
        await must(P, 'trainer', `khẩu phần ${slot === 'morning' ? 'sáng' : slot === 'noon' ? 'trưa' : 'chiều'} ${time}: ${hayKg} kg cỏ + ${grainKg} kg thức ăn tinh`, 'POST', '/feeding', {
          horse: horse._id, mealTime: slot, timeOfDay: time, items: [{ inventoryItem: hay._id, amount: hayKg }, { inventoryItem: grain._id, amount: grainKg }],
        });
      }
    }
    await must(P, 'trainer', 'kế hoạch nền tảng sức bền (đang áp dụng)', 'POST', '/training/plans', {
      horse: horse._id, phase: 'base_building', distanceTarget: 1600, weeklyVolumeKm: 20, intensity: 'moderate', surface: 'dirt',
      startDate: new Date().toISOString(), status: 'active', goal: 'Nền tảng sức bền trước mùa giải',
    });
    return horse;
  };
  const ready = await setUp(DEMO_HORSES.ready, {});
  const injury = await setUp(DEMO_HORSES.injury, { color: 'Chestnut' });
  // The injury horse aims at a race, so the demo can show it withdrawn after the vet's lock.
  const entries = ((await read('trainer', '/races')) || []).filter((e) => String(e.horse?._id || e.horse) === String(injury._id) && !['withdrawn', 'completed'].includes(e.status));
  if (!entries.length) {
    const date = new Date(Date.now() + minutes(14 * 24 * 60));
    date.setHours(15, 0, 0, 0);
    await must(P, 'trainer', `đăng ký "${injury.name}" vào giải "Cúp Demo CLB" ngày ${ddmm(date)}`, 'POST', '/races', { horse: injury._id, raceName: 'Cúp Demo CLB', raceDate: date.toISOString(), ...RACE }, 201);
  }

  // 4. The ready horses are fed now: the groom records today's meal that is open (or late but still recordable).
  for (const horse of [ready, injury]) {
    const tasks = (await groomTasks(horse)).filter((t) => t.taskType === 'feeding' && t.status === 'pending' && !t.makeUpOf && ['open', 'late'].includes(t.timing?.state));
    const meal = tasks.sort((a, b) => new Date(b.scheduledDate) - new Date(a.scheduledDate))[0];
    if (meal) await feed(P, meal._id, `cho "${horse.name}" ăn bữa ${hhmm(new Date(meal.scheduledDate))}`);
    else log(P, 'groom', `"${horse.name}": chưa có bữa nào mở để cho ăn lúc này`, true, 'chạy lại vào buổi sáng hôm demo để ngựa vừa được cho ăn');
  }
}

// The race itself is not simulated: the horses that ran finish in the order of their trial (a trial
// that met its targets first, then the faster pace), and the first three take prize money.
const PRIZES = [30000000, 15000000, 8000000];
const raceTime = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(2).padStart(5, '0')}`;
async function raceResults(accounts) {
  const P = 'Kết quả giải';
  if (!(await wake())) {
    log(P, '-', 'API trả lời health-check', false, 'không trả lời sau 4 phút');
    return;
  }
  log(P, '-', 'API trả lời health-check', true, BASE);
  if (!(await login(P, accounts, 'trainer'))) return;
  const name = raceName(new Date());
  const entries = ((await read('trainer', '/races')) || []).filter((e) => e.raceName === name);
  log(P, 'trainer', `tìm giải "${name}" đua hôm nay`, entries.length > 0, `${entries.length} ngựa đăng ký`);
  const runners = [];
  for (const e of entries) {
    const horse = e.horse?.name || e.horse;
    if (e.status === 'withdrawn') log(P, 'trainer', `${horse}: đã rút khỏi giải`, true, e.decision?.reason || '');
    else if (e.status === 'completed') log(P, 'trainer', `${horse}: đã có kết quả`, true, e.result);
    else if (e.status !== 'confirmed') log(P, 'trainer', `${horse}: HLV chưa xác nhận tham gia — không thi đấu`, true, e.status);
    else {
      const trial = ((await read('trainer', `/races/${e._id}/trials`)) || []).find((t) => ['completed', 'evaluated'].includes(t.status));
      runners.push({ e, horse, met: trial?.outcome?.met === true, speed: Number(trial?.metrics?.maxSpeed) || 0 });
    }
  }
  runners.sort((a, b) => Number(b.met) - Number(a.met) || b.speed - a.speed);
  for (const [i, r] of runners.entries()) {
    const body = { position: i + 1, finishTime: raceTime(97.4 + i * 0.85 + (r.met ? 0 : 1.1)), prizeMoney: PRIZES[i] || 0 };
    await must(P, 'trainer', `${r.horse}: hạng ${body.position}, ${body.finishTime}, tiền thưởng ${vnd(body.prizeMoney)}`, 'PATCH', `/races/${r.e._id}/results`, body);
  }
}

async function main() {
  const today = new Date().toLocaleDateString('sv-SE');
  let accounts;
  try {
    accounts = JSON.parse(process.env.DEMO_ACCOUNTS || '');
  } catch {
    log('Kiểm tra trước', '-', 'đọc DEMO_ACCOUNTS', false, 'thiếu hoặc không phải JSON');
    summary(table(steps));
    return;
  }

  if (process.env.DEMO_MODE === 'prepare') {
    if (!WRITE) {
      console.log('Dữ liệu demo: chỉ ghi khi DEMO_CONFIRM=write.');
      return;
    }
    try {
      await prepareDemo(accounts);
    } catch (error) {
      console.error(error);
      failed = true;
    } finally {
      summary(`### Dữ liệu demo · ${BASE}\n\n${table(steps)}`);
    }
    return;
  }
  if (process.env.DEMO_MODE === 'results' || process.env.DEMO_RESULT_DATE === today) {
    if (!WRITE) {
      console.log('Ngày đua: chỉ nhập kết quả khi DEMO_CONFIRM=write.');
      return;
    }
    try {
      await raceResults(accounts);
    } finally {
      summary(`### Kết quả giải · ${BASE}\n\n${table(steps)}`);
    }
    return;
  }
  const onlyDate = process.env.DEMO_ONLY_DATE;
  if (onlyDate && onlyDate !== today) {
    console.log(`Hôm nay ${today}, chỉ chạy ngày ${onlyDate}: bỏ qua.`);
    return;
  }

  const ctx = await preflight(accounts);
  // A backup trigger later the same morning finds the first round already made and stops.
  if (ctx && ((await read('manager', '/horses')) || []).some((h) => h.name === `Test Demo ${ddmm()} R1 · Đạt`)) {
    log('Kiểm tra trước', 'manager', 'các lượt sáng nay đã chạy (đã có ngựa R1) — không chạy lại', true);
    summary(`### Demo flows · ${BASE}\n\n${table(steps)}`);
    return;
  }
  summary(`### Demo flows · ${BASE}${WRITE ? '' : ' · chỉ kiểm tra trước, không ghi (DEMO_CONFIRM khác "write")'}\n\n${table(steps)}`);
  if (!ctx || !WRITE) return;

  const starts = [new Date()];
  for (let next = slotAfter(starts[0], ROUND_EVERY); next <= atClock(LAST_START); next = new Date(next.getTime() + minutes(ROUND_EVERY))) starts.push(next);
  console.log(`${starts.length} lượt: ${starts.map(hhmm).join(', ')} · giải ${raceName(raceDay())}`);
  // Rounds run side by side; each one's breakfast and canter follow its own start.
  await Promise.allSettled(starts.map((at, i) => round({ ...ctx }, i + 1, at)));
}

main()
  .catch((error) => {
    console.error(error);
    failed = true;
  })
  .finally(() => {
    if (results.length) {
      results.sort((a, b) => a.r - b.r);
      summary(`\n### Tổng kết ${failed ? '— CÓ BƯỚC LỖI' : '— mọi bước đạt'}\n\n| Lượt | Bắt đầu | Từng ngựa |\n|---|---|---|\n${results.map((o) => `| ${o.r} | ${o.start} | ${o.cases.map(([l, v]) => `**${l}**: ${v}`).join('<br>')} |`).join('\n')}`);
    }
    if (failed) process.exitCode = 1;
  });
