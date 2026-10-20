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
//   "Chấn thương" (round 1): entered for the same race; it goes lame in its canter, the trainer stops it
//   and calls the vet, the vet records a tendon injury, so the trial and the race confirmation are
//   refused and the trainer withdraws it.
// The first round starts at once; another starts every DEMO_ROUND_EVERY_MIN until DEMO_LAST_START.
// Every round uses new horses named "Test Demo …" and takes 2.5 kg of grain out of stock per meal.
// On race day (DEMO_MODE=results, or DEMO_RESULT_DATE is today) the trainer records the race's results
// instead: the horses that ran, ranked by their trial, prize money for the first three.
//
// DEMO_ACCOUNTS (a GitHub secret): {"password":"…","manager":"…","trainer":"…","vet":"…","groom":"…","owner":"…"}
// TZ must be the club's time zone (Asia/Ho_Chi_Minh): rations are clock times on the server's day.
const fs = require('node:fs');

// Node on Windows ignores a TZ given at startup; assigning it again applies it (Linux reads it anyway).
if (process.env.TZ) process.env.TZ = String(process.env.TZ);

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

/**
 * A new horse with everything a training day needs except the meal: stall + groom, an exam, a
 * breakfast ration, a plan. Breakfast only: a stabled horse gets its meals as groom tasks every day
 * until it is archived, so the fewer meals a test horse has the less it clutters the groom's list.
 */
async function setUpHorse(F, name, stall, breakfastAt, feed) {
  const horse = await must(F, 'manager', `thêm ngựa "${name}", giao HLV, bác sĩ, chủ`, 'POST', '/horses', {
    name, breed: 'Thoroughbred', sex: 'gelding', owner: ids.owner, assignedTrainer: ids.trainer, assignedVet: ids.vet,
  });
  await must(F, 'manager', `xếp chuồng "${stall}", giao nhân viên chăm sóc`, 'POST', '/stable/assignments', {
    horse: horse._id, stableBlock: stall, assignedCaretaker: ids.groom,
  });
  await must(F, 'vet', 'khám tiếp nhận: đủ điều kiện, không hạn chế (37,6 °C, 36 bpm)', 'POST', '/health/records', {
    horse: horse._id, diagnosis: 'Khám tiếp nhận: niêm mạc hồng, tim phổi bình thường, chân không sưng nóng. Đủ điều kiện tập.',
    resultStatus: 'eligible', clearedLevel: 'high', vitalSigns: { temperatureC: 37.6, heartRate: 36 },
  });
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
const gateLine = (readiness) => (readiness?.gates || []).map((g) => `${g.label}: ${g.status}`).join(', ');
const readinessAt = (horse, at, intensity = 'moderate') => read('trainer', `/training/sessions/readiness?horse=${horse._id}&scheduledAt=${at.toISOString()}&intensity=${intensity}`);
const FED_WELL = { observation: { appetite: 'Tốt', manure: 'Bình thường', waterIntake: 'Bình thường' }, amountEatenPercent: 100 };
const metricsLine = (s) => `${s.metrics?.distance} m, nhịp tim TB ${s.metrics?.avgHeartRate} bpm, tốc độ tối đa ${s.metrics?.maxSpeed} km/h`;

/** The session once the sensor feed has finished it, or null after 10 minutes. */
async function untilFinished(id) {
  for (let i = 0; i < 60; i += 1) {
    await sleep(10000);
    const s = await read('trainer', `/training/sessions/${id}`);
    if (s?.status === 'completed') return s;
  }
  return null;
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
async function pendingBreakfast(F, horse) {
  const tasks = (await read('groom', `/stable/tasks?horse=${horse._id}`)) || [];
  const breakfast = tasks.find((t) => t.taskType === 'feeding' && t.mealSlot === 'morning' && t.status === 'pending');
  log(F, 'groom', 'thấy việc cho ăn bữa sáng trong danh sách', Boolean(breakfast));
  return breakfast;
}

/** The groom gives a meal; the trainer books a canter once the club's digestion wait has passed, then runs it to its start. */
async function feedThenRun(F, ctx, { horse, plan }, taskId, what) {
  const fed = await must(F, 'groom', `${what}: ăn hết, phân và nước uống bình thường`, 'PATCH', `/stable/tasks/${taskId}/complete`, {
    clientOpId: `demo-${taskId}`, ...FED_WELL,
  });
  const at = slotAfter(new Date(fed?.completedAt || Date.now()), ctx.digest + MARGIN);
  log(F, 'trainer', `xem bảng sẵn sàng cho buổi phi chậm ${hhmm(at)}`, true, gateLine(await readinessAt(horse, at)));
  const session = await must(F, 'trainer', `lên lịch buổi phi chậm 2400 m lúc ${hhmm(at)} (${ctx.digest + MARGIN} phút sau bữa), nhịp tim ≤ 170`, 'POST', '/training/sessions', {
    horse: horse._id, trainingPlan: plan._id, ...CANTER, scheduledAt: at.toISOString(),
    coachNote: 'Khởi động đi bộ 10 phút, phi chậm đều 2400 m, giữ nhịp tim dưới 170.',
  }, 201);
  await waitUntil(new Date(at.getTime() - minutes(2)), `${F}: mở kiểm tra sẵn sàng sát giờ tập`);
  await wake();
  await must(F, 'trainer', 'kiểm tra sẵn sàng: 37,7 °C, sân cát khô, trời mát', 'POST', `/training/sessions/${session._id}/pre-check`, {
    confirmed: true, bodyTempC: 37.7, trackCondition: 'Sân cát khô, mặt sân tốt', weather: 'Trời mát, 26 °C',
  });
  await waitUntil(at, `${F}: giờ tập`);
  await must(F, 'trainer', 'bắt đầu buổi tập (cảm biến bắt đầu gửi số liệu)', 'POST', `/training/sessions/${session._id}/start`, {});
  return session;
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
  const done = await untilFinished(session._id);
  log(F, 'trainer', 'cảm biến chạy hết cự ly, buổi tập tự kết thúc', Boolean(done), done ? metricsLine(done) : 'sau 10 phút vẫn chưa kết thúc');
  if (!done) return 'lỗi';
  await must(F, 'trainer', 'đánh giá buổi tập: 8/10', 'PATCH', `/training/sessions/${session._id}/evaluation`, {
    performanceRating: 8,
    trainerComment: 'Ngựa phi đều, nhịp tim luôn dưới ngưỡng, hồi sức nhanh sau buổi. Tuần sau tăng cự ly lên 2800 m.',
  });
  const final = await read('trainer', `/training/sessions/${session._id}`);
  const met = final?.outcome?.met === true;
  log(F, 'trainer', 'kết quả so với chỉ tiêu: đạt', met, final?.outcome?.summary || 'không có kết luận');
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
  await ownerSees(F, horse);
  return notMet ? 'Chưa đạt (dừng sớm, chờ khám)' : 'lỗi';
}

/** Entered for the race, lame in its canter, an injury on the vet's record: the trial and the race are refused, so it is withdrawn. */
async function flowInjured(ctx, F, setup) {
  const { horse, plan } = setup;
  const entry = await registerRace(F, horse);
  const breakfast = await pendingBreakfast(F, horse);
  if (!breakfast) return 'lỗi';
  const session = await feedThenRun(F, ctx, setup, breakfast._id, 'cho ăn bữa sáng');
  const s = await firstReadings(session._id);
  if (s?.status === 'in_progress') {
    await must(F, 'trainer', 'ngựa hụt bước, khập khiễng chân trước trái — HLV dừng buổi ngay', 'POST', `/training/sessions/${session._id}/end`, {});
  }
  await must(F, 'trainer', 'đánh giá buổi tập: 3/10', 'PATCH', `/training/sessions/${session._id}/evaluation`, {
    performanceRating: 3,
    trainerComment: 'Ngựa hụt bước ở vòng đầu, sau đó khập khiễng chân trước trái. Dừng ngay, chườm lạnh và gọi bác sĩ.',
  });
  const request = await must(F, 'trainer', 'gửi yêu cầu khám khẩn cho bác sĩ', 'POST', '/health/exam-requests', {
    horse: horse._id, priority: 'high', reason: 'Khập khiễng chân trước trái sau khi hụt bước trong buổi phi chậm.',
  }, 201);
  await must(F, 'vet', 'bác sĩ nhận yêu cầu, khám ngay', 'PATCH', `/health/exam-requests/${request._id}`, {
    action: 'accept', scheduledFor: slotAfter(new Date(), 15).toISOString(),
  });
  await must(F, 'vet', 'khám: viêm gân gấp chân trước trái độ 1 — chấn thương, nghỉ tập 2 tuần', 'POST', '/health/records', {
    horse: horse._id,
    diagnosis: 'Sưng nóng nhẹ vùng gân gấp chân trước trái, ngựa né chân khi bước. Viêm gân độ 1: chườm lạnh, băng ép, nghỉ tập 2 tuần rồi khám lại.',
    resultStatus: 'injured', clearedLevel: 'none', vitalSigns: { temperatureC: 38.2, heartRate: 46 },
  });
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
  return 'Chấn thương → rút khỏi giải';
}

const results = [];
async function round(ctx, r, startAt) {
  await waitUntil(startAt, `bắt đầu lượt ${r}`);
  const tag = `${ddmm()} R${r}`;
  const now = new Date();
  ctx.missedBreakfastAt = slotFloor(new Date(now.getTime() - minutes(45)));
  const outcome = { r, start: hhmm(now), pass: 'lỗi', fail: 'lỗi', injured: r === 1 ? 'lỗi' : '—' };
  const flows = [
    async () => {
      const F = `R${r} · Đạt`;
      outcome.pass = await flowPass(ctx, F, await setUpHorse(F, `Test Demo ${tag} · Đạt`, `Test Demo ${tag}-A`, slotFloor(now), ctx.feed), true);
    },
    async () => {
      const F = `R${r} · Không đạt`;
      outcome.fail = await flowFail(ctx, F, await setUpHorse(F, `Test Demo ${tag} · Không đạt`, `Test Demo ${tag}-B`, ctx.missedBreakfastAt, ctx.feed));
    },
  ];
  if (r === 1) {
    flows.push(async () => {
      const F = `R${r} · Chấn thương`;
      outcome.injured = await flowInjured(ctx, F, await setUpHorse(F, `Test Demo ${tag} · Chấn thương`, `Test Demo ${tag}-C`, slotFloor(now), ctx.feed));
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
  summary(`\n#### Lượt ${r} (bắt đầu ${outcome.start}): ${outcome.pass} · ${outcome.fail}${r === 1 ? ` · ${outcome.injured}` : ''}\n\n${table(steps.filter((s) => s.flow.startsWith(`R${r} `)))}`);
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
      summary(`\n### Tổng kết ${failed ? '— CÓ BƯỚC LỖI' : '— mọi bước đạt'}\n\n| Lượt | Bắt đầu | Ngựa "Đạt" (+ giải) | Ngựa "Không đạt" | Ngựa "Chấn thương" |\n|---|---|---|---|---|\n${results.map((o) => `| ${o.r} | ${o.start} | ${o.pass} | ${o.fail} | ${o.injured} |`).join('\n')}`);
    }
    if (failed) process.exitCode = 1;
  });
