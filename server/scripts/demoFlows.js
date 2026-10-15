// Demo rounds driven through the live API on the morning of a demo, by GitHub Actions
// (.github/workflows/demo-flows.yml) or by hand. Unlike liveSmoke.js this WRITES to the real club
// database, so it only writes when DEMO_CONFIRM=write; otherwise it stops after the preflight.
//
// A round is two new horses taken through every role:
//   "Đạt": the manager stables it, the vet examines it, the trainer sets a breakfast ration and a
//   plan, the groom feeds it, the trainer books a canter after the club's digestion wait,
//   pre-checks, starts it, the sensor feed finishes it ("Đạt mục tiêu"), the trainer evaluates it
//   and the owner sees it.
//   "Không đạt": breakfast time passes unfed, so the canter is refused (also with a reason); the
//   groom feeds it late, the canter runs after the digestion wait,
//   the horse struggles and the trainer ends it early ("Chưa đạt mục tiêu"), evaluates it low and
//   asks the vet for an exam, which the vet takes on. Round 1 leaves this horse refused instead,
//   so the block can be shown live.
// The first round starts at once; another starts every DEMO_ROUND_EVERY_MIN until DEMO_LAST_START.
// Every round uses new horses named "Test Demo …" and takes 2.5 kg of grain out of stock per meal.
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

async function preflight(accounts) {
  const P = 'Kiểm tra trước';
  if (!(await wake())) {
    log(P, '-', 'API trả lời health-check', false, 'không trả lời sau 4 phút');
    return null;
  }
  log(P, '-', 'API trả lời health-check', true, BASE);
  for (const role of Object.keys(ROLE_OF)) {
    const login = await call(null, 'POST', '/auth/login', { email: accounts[role], password: accounts.password });
    const token = login.data?.token;
    const user = login.data?.user;
    const ok = Boolean(token) && user?.role === ROLE_OF[role];
    log(P, role, 'đăng nhập', ok, ok ? user.name : login.message || `vai trò ${user?.role}`);
    if (!ok) return null;
    tokens[role] = token;
    ids[role] = user.id || user._id;
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
const gateLine = (readiness) => (readiness?.gates || []).map((g) => `${g.label}: ${g.status}`).join(', ');
const readinessAt = (horse, at) => read('trainer', `/training/sessions/readiness?horse=${horse._id}&scheduledAt=${at.toISOString()}&intensity=moderate`);
const FED_WELL = { observation: { appetite: 'Tốt', manure: 'Bình thường', waterIntake: 'Bình thường' }, amountEatenPercent: 100 };

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

async function flowPass(ctx, F, setup) {
  const { horse } = setup;
  const tasks = (await read('groom', `/stable/tasks?horse=${horse._id}`)) || [];
  const breakfast = tasks.find((t) => t.taskType === 'feeding' && t.mealSlot === 'morning' && t.status === 'pending');
  log(F, 'groom', 'thấy việc cho ăn bữa sáng trong danh sách', Boolean(breakfast));
  if (!breakfast) return 'lỗi';
  const session = await feedThenRun(F, ctx, setup, breakfast._id, 'cho ăn bữa sáng');
  let done;
  for (let i = 0; i < 60 && !done; i += 1) {
    await sleep(10000);
    const s = await read('trainer', `/training/sessions/${session._id}`);
    if (s?.status === 'completed') done = s;
  }
  log(F, 'trainer', 'cảm biến chạy hết cự ly, buổi tập tự kết thúc', Boolean(done), done ? `${done.metrics?.distance} m, nhịp tim TB ${done.metrics?.avgHeartRate} bpm, tốc độ tối đa ${done.metrics?.maxSpeed} km/h` : 'sau 10 phút vẫn chưa kết thúc');
  if (!done) return 'lỗi';
  await must(F, 'trainer', 'đánh giá buổi tập: 8/10', 'PATCH', `/training/sessions/${session._id}/evaluation`, {
    performanceRating: 8,
    trainerComment: 'Ngựa phi đều, nhịp tim luôn dưới ngưỡng, hồi sức nhanh sau buổi. Tuần sau tăng cự ly lên 2800 m.',
  });
  const final = await read('trainer', `/training/sessions/${session._id}`);
  const met = final?.outcome?.met === true;
  log(F, 'trainer', 'kết quả so với chỉ tiêu: đạt', met, final?.outcome?.summary || 'không có kết luận');
  await ownerSees(F, horse);
  return met ? 'Đạt' : 'lỗi';
}

/** Breakfast time has passed unfed: the canter is refused, also with the trainer's reason. Returns the refused gate. */
async function refusedWhenUnfed(ctx, F, { horse, plan }) {
  const at = slotAfter(new Date(), 30);
  log(F, 'groom', 'không cho ăn: giờ bữa sáng đã qua, chưa ghi nhận', true, `bữa sáng ${hhmm(ctx.missedBreakfastAt)}`);
  const nutrition = ((await readinessAt(horse, at))?.gates || []).find((g) => g.key === 'nutrition');
  log(F, 'trainer', `bảng sẵn sàng cho buổi phi chậm ${hhmm(at)}: Dinh dưỡng đỏ`, nutrition?.status === 'blocked', nutrition?.detail);
  const body = { horse: horse._id, trainingPlan: plan._id, ...CANTER, scheduledAt: at.toISOString(), coachNote: 'Phi chậm 2400 m.' };
  const refused = await call('trainer', 'POST', '/training/sessions', body);
  log(F, 'trainer', 'lên lịch buổi phi chậm → hệ thống từ chối', refused.status === 409, `HTTP ${refused.status}: ${refused.message}`);
  const overridden = await call('trainer', 'POST', '/training/sessions', { ...body, overrideReason: 'HLV vẫn muốn cho tập, sẽ theo dõi sát' });
  log(F, 'trainer', 'ghi lý do để vẫn tạo → vẫn bị từ chối (ô đỏ không bỏ qua được)', overridden.status === 409, `HTTP ${overridden.status}: ${overridden.message}`);
  return refused.status === 409 && overridden.status === 409 && nutrition?.status === 'blocked' ? nutrition : null;
}

async function flowBlocked(ctx, F, setup) {
  const gate = await refusedWhenUnfed(ctx, F, setup);
  log(F, '-', 'giữ nguyên ngựa này ở trạng thái bị chặn để demo trực tiếp', Boolean(gate));
  return gate ? 'Bị chặn (lỡ bữa)' : 'lỗi';
}

async function flowFail(ctx, F, setup) {
  const { horse } = setup;
  const gate = await refusedWhenUnfed(ctx, F, setup);
  if (!gate?.taskId) return 'lỗi';
  // Within 4 hours of its time the groom can still record the meal itself (a make-up is only for a
  // meal that can no longer be recorded), so the horse is fed late and the digestion wait restarts.
  const session = await feedThenRun(F, ctx, setup, gate.taskId, 'cho ăn muộn bữa sáng (quá giờ)');

  // The horse struggles: the trainer stops it after the first sensor readings, well short of the distance.
  let s;
  for (let i = 0; i < 30; i += 1) {
    await sleep(2000);
    s = await read('trainer', `/training/sessions/${session._id}`);
    if (s?.metrics?.sampleCount >= 1 || (s && s.status !== 'in_progress')) break;
  }
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
  return notMet ? 'Chưa đạt (dừng sớm)' : 'lỗi';
}

const results = [];
async function round(ctx, r, startAt) {
  await waitUntil(startAt, `bắt đầu lượt ${r}`);
  const tag = `${ddmm()} R${r}`;
  const now = new Date();
  ctx.missedBreakfastAt = slotFloor(new Date(now.getTime() - minutes(45)));
  const passF = `R${r} · Đạt`;
  const failF = `R${r} · ${r === 1 ? 'Lỡ bữa' : 'Không đạt'}`;
  const outcome = { r, start: hhmm(now), pass: 'lỗi', fail: 'lỗi' };
  const runPass = async () => {
    const setup = await setUpHorse(passF, `Test Demo ${tag} · Đạt`, `Test Demo ${tag}-A`, slotFloor(now), ctx.feed);
    outcome.pass = await flowPass(ctx, passF, setup);
  };
  const runFail = async () => {
    const setup = await setUpHorse(failF, `Test Demo ${tag} · ${r === 1 ? 'Lỡ bữa' : 'Không đạt'}`, `Test Demo ${tag}-B`, ctx.missedBreakfastAt, ctx.feed);
    outcome.fail = await (r === 1 ? flowBlocked : flowFail)(ctx, failF, setup);
  };
  // Set up one after the other (the missed breakfast time is per round), then run side by side.
  const runs = await Promise.allSettled([runFail(), runPass()]);
  for (const run of runs) {
    if (run.status === 'rejected') {
      console.error(run.reason?.message || run.reason);
      failed = true;
    }
  }
  results.push(outcome);
  summary(`\n#### Lượt ${r} (bắt đầu ${outcome.start}): ${outcome.pass} · ${outcome.fail}\n\n${table(steps.filter((s) => s.flow.startsWith(`R${r} `)))}`);
}

async function main() {
  const onlyDate = process.env.DEMO_ONLY_DATE;
  const today = new Date().toLocaleDateString('sv-SE');
  if (onlyDate && onlyDate !== today) {
    console.log(`Hôm nay ${today}, chỉ chạy ngày ${onlyDate}: bỏ qua.`);
    return;
  }
  let accounts;
  try {
    accounts = JSON.parse(process.env.DEMO_ACCOUNTS || '');
  } catch {
    log('Kiểm tra trước', '-', 'đọc DEMO_ACCOUNTS', false, 'thiếu hoặc không phải JSON');
    summary(table(steps));
    return;
  }
  const ctx = await preflight(accounts);
  summary(`### Demo flows · ${BASE}${WRITE ? '' : ' · chỉ kiểm tra trước, không ghi (DEMO_CONFIRM khác "write")'}\n\n${table(steps)}`);
  if (!ctx || !WRITE) return;

  const starts = [new Date()];
  for (let next = slotAfter(starts[0], ROUND_EVERY); next <= atClock(LAST_START); next = new Date(next.getTime() + minutes(ROUND_EVERY))) starts.push(next);
  console.log(`${starts.length} lượt: ${starts.map(hhmm).join(', ')}`);
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
      summary(`\n### Tổng kết ${failed ? '— CÓ BƯỚC LỖI' : '— mọi bước đạt'}\n\n| Lượt | Bắt đầu | Ngựa "Đạt" | Ngựa "Không đạt" |\n|---|---|---|---|\n${results.map((o) => `| ${o.r} | ${o.start} | ${o.pass} | ${o.fail} |`).join('\n')}`);
    }
    if (failed) process.exitCode = 1;
  });
