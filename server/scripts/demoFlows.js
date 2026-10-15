// Two demo flows driven through the live API, run once on the morning of a demo by GitHub Actions
// (.github/workflows/demo-flows.yml) or by hand. Unlike liveSmoke.js this WRITES to the real club
// database, so it only writes when DEMO_CONFIRM=write; otherwise it stops after the preflight.
//
//   Flow 1 "chuẩn": the groom gives breakfast, the trainer books a canter after the club's digestion
//   wait, pre-checks, starts it, the sensor feed finishes it, the trainer evaluates — all green.
//   Flow 2 "lỡ bữa": breakfast time passes and nobody feeds the horse; booking a canter is refused by
//   the nutrition gate, even with a trainer's reason. The horse is left in that state for the demo.
//
// Each flow gets its own new horse named "Test ...", so nothing the club already has is touched
// except the feed it takes out of stock (one 2.5 kg breakfast).
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
/** n minutes from now, on a 5-minute mark (up), as trainers book. */
const slotAfter = (from, n) => {
  const d = new Date(from.getTime() + minutes(n));
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return d;
};

const steps = [];
let failed = false;
function log(flow, role, action, ok, detail = '') {
  steps.push({ at: clock(), flow, role, action, ok, detail: String(detail).replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, 300) });
  console.log(`${clock()} [${flow}] ${ok ? 'OK ' : 'ERR'} ${role}: ${action}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}

const tokens = {};
const ids = {};
async function call(role, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, data: json?.data, message: json?.message || '' };
}
/** A call that must answer `expected`; anything else stops the flow. */
async function must(flow, role, action, method, path, body, expected = [200, 201]) {
  const r = await call(role, method, path, body);
  const ok = [].concat(expected).includes(r.status);
  log(flow, role, action, ok, ok ? '' : `HTTP ${r.status}: ${r.message}`);
  if (!ok) throw new Error(`${action}: HTTP ${r.status} ${r.message}`);
  return r.data;
}

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
  const lastStart = new Date(now);
  lastStart.setHours(10, 0, 0, 0);
  const earlyEnough = now >= new Date(new Date(now).setHours(1, 0, 0, 0)) && now <= lastStart;
  log(P, '-', 'giờ chạy', earlyEnough, earlyEnough
    ? `${hhmm(now)} — buổi sáng, đủ thời gian cho cả hai flow`
    : `${hhmm(now)}: phải chạy từ 01:00 đến 10:00 (bữa sáng trước 11:00, buổi phi chậm xong trước buổi chiều).`);

  const stock = (await call('manager', 'GET', '/inventory')).data || [];
  const feed = stock
    .filter((i) => i.category === 'feed' && i.isActive !== false && GRAIN.test(i.name) && !FORAGE.test(i.name) && /^kg$/i.test(i.unit) && Number(i.quantity) >= 10)
    .sort((a, b) => b.quantity - a.quantity)[0];
  log(P, 'manager', 'chọn thức ăn tinh trong kho', Boolean(feed), feed ? `${feed.name}: còn ${feed.quantity} ${feed.unit}` : 'không có ngũ cốc/thức ăn viên (kg) nào còn từ 10 kg');
  return earlyEnough && feed ? { policy, digest, feed } : null;
}

/**
 * A new horse with everything a training day needs except the meal: stall + groom, an exam, a
 * breakfast ration, a plan. Breakfast only: a stabled horse gets its meals as groom tasks every day
 * until it is archived, so the fewer meals a test horse has the less it clutters the groom's list.
 */
async function setUpHorse(flow, name, stall, breakfastAt, feed) {
  const horse = await must(flow, 'manager', `thêm ngựa "${name}", giao HLV, bác sĩ, chủ`, 'POST', '/horses', {
    name, breed: 'Thoroughbred', sex: 'gelding', owner: ids.owner, assignedTrainer: ids.trainer, assignedVet: ids.vet,
  });
  await must(flow, 'manager', `xếp chuồng "${stall}", giao nhân viên chăm sóc`, 'POST', '/stable/assignments', {
    horse: horse._id, stableBlock: stall, assignedCaretaker: ids.groom,
  });
  await must(flow, 'vet', 'khám tiếp nhận: đủ điều kiện, không hạn chế (37,6 °C, 36 bpm)', 'POST', '/health/records', {
    horse: horse._id, diagnosis: 'Khám tiếp nhận: niêm mạc hồng, tim phổi bình thường, chân không sưng nóng. Đủ điều kiện tập.',
    resultStatus: 'eligible', clearedLevel: 'high', vitalSigns: { temperatureC: 37.6, heartRate: 36 },
  });
  await must(flow, 'trainer', `khẩu phần bữa sáng ${hhmm(breakfastAt)}: 2,5 ${feed.unit} ${feed.name}`, 'POST', '/feeding', {
    horse: horse._id, mealTime: 'morning', timeOfDay: hhmm(breakfastAt), items: [{ inventoryItem: feed._id, amount: 2.5 }],
  });
  const plan = await must(flow, 'trainer', 'kế hoạch nền tảng sức bền (đang áp dụng)', 'POST', '/training/plans', {
    horse: horse._id, phase: 'base_building', distanceTarget: 1600, weeklyVolumeKm: 20, intensity: 'moderate', surface: 'dirt',
    startDate: new Date().toISOString(), status: 'active', goal: 'Nền tảng sức bền trước mùa giải',
  });
  return { horse, plan };
}

const CANTER = { kind: 'canter', prescription: { distanceM: 2400, targetHeartRateMax: 170, targetSpeedKmh: null } };
const gateLine = (readiness) => (readiness?.gates || []).map((g) => `${g.label}: ${g.status}`).join(', ');

async function flowGood(ctx, setup) {
  const F = 'Flow 1 · chuẩn';
  const { horse, plan } = setup;
  const tasks = (await call('groom', 'GET', `/stable/tasks?horse=${horse._id}`)).data || [];
  const breakfast = tasks.find((t) => t.taskType === 'feeding' && t.mealSlot === 'morning' && t.status === 'pending');
  log(F, 'groom', 'thấy việc cho ăn bữa sáng trong danh sách', Boolean(breakfast), breakfast ? '' : 'không có việc cho ăn bữa sáng');
  if (!breakfast) return;
  const fed = await must(F, 'groom', 'cho ăn bữa sáng: ăn hết, phân và nước uống bình thường', 'PATCH', `/stable/tasks/${breakfast._id}/complete`, {
    clientOpId: `demo-${horse._id}-breakfast`, observation: { appetite: 'Tốt', manure: 'Bình thường', waterIntake: 'Bình thường' }, amountEatenPercent: 100,
  });
  const fedAt = new Date(fed?.task?.completedAt || fed?.completedAt || Date.now());
  const at = slotAfter(fedAt, ctx.digest + MARGIN);

  const readiness = (await call('trainer', 'GET', `/training/sessions/readiness?horse=${horse._id}&scheduledAt=${at.toISOString()}&intensity=moderate`)).data;
  log(F, 'trainer', `xem bảng sẵn sàng cho buổi phi chậm ${hhmm(at)}`, true, gateLine(readiness));
  const session = await must(F, 'trainer', `tạo buổi phi chậm 2400 m lúc ${hhmm(at)} (${ctx.digest + MARGIN} phút sau bữa), nhịp tim ≤ 170`, 'POST', '/training/sessions', {
    horse: horse._id, trainingPlan: plan._id, ...CANTER, scheduledAt: at.toISOString(),
    coachNote: 'Khởi động đi bộ 10 phút, phi chậm đều 2400 m, giữ nhịp tim dưới 170.',
  }, 201);

  await waitUntil(new Date(at.getTime() - minutes(2)), 'mở kiểm tra sẵn sàng sát giờ tập');
  await wake();
  await must(F, 'trainer', 'kiểm tra sẵn sàng: 37,7 °C, sân cát khô, trời mát', 'POST', `/training/sessions/${session._id}/pre-check`, {
    confirmed: true, bodyTempC: 37.7, trackCondition: 'Sân cát khô, mặt sân tốt', weather: 'Trời mát, 26 °C',
  });
  await waitUntil(at, 'giờ tập');
  await must(F, 'trainer', 'bắt đầu buổi tập (cảm biến bắt đầu gửi số liệu)', 'POST', `/training/sessions/${session._id}/start`, {});

  let done;
  for (let i = 0; i < 60 && !done; i += 1) {
    await sleep(10000);
    // A dropped request while polling is retried on the next round, not the end of the flow.
    const s = (await call('trainer', 'GET', `/training/sessions/${session._id}`).catch(() => ({}))).data;
    if (s?.status === 'completed') done = s;
  }
  log(F, 'trainer', 'cảm biến chạy hết cự ly, buổi tập tự kết thúc', Boolean(done), done ? `${done.metrics?.distance} m, nhịp tim TB ${done.metrics?.avgHeartRate} bpm, tốc độ tối đa ${done.metrics?.maxSpeed} km/h` : 'sau 10 phút vẫn chưa kết thúc');
  if (!done) return;
  await must(F, 'trainer', 'đánh giá buổi tập: 8/10', 'PATCH', `/training/sessions/${session._id}/evaluation`, {
    performanceRating: 8,
    trainerComment: 'Ngựa phi đều, nhịp tim luôn dưới ngưỡng, hồi sức nhanh sau buổi. Tuần sau tăng cự ly lên 2800 m.',
  });
  const final = (await call('trainer', 'GET', `/training/sessions/${session._id}`)).data;
  log(F, 'trainer', 'kết quả so với chỉ tiêu', final?.outcome?.met === true, final?.outcome?.summary || 'không có kết luận');
}

async function flowMissed(ctx, setup) {
  const F = 'Flow 2 · lỡ bữa';
  const { horse, plan } = setup;
  const at = slotAfter(new Date(), 30);
  log(F, 'groom', 'không cho ăn: giờ bữa sáng đã qua, chưa ghi nhận', true, `bữa sáng ${hhmm(ctx.missedBreakfastAt)}`);
  const readiness = (await call('trainer', 'GET', `/training/sessions/readiness?horse=${horse._id}&scheduledAt=${at.toISOString()}&intensity=moderate`)).data;
  const nutrition = (readiness?.gates || []).find((g) => g.key === 'nutrition');
  log(F, 'trainer', `bảng sẵn sàng cho buổi phi chậm ${hhmm(at)}: Dinh dưỡng đỏ`, nutrition?.status === 'blocked', nutrition?.detail || gateLine(readiness));

  const body = { horse: horse._id, trainingPlan: plan._id, ...CANTER, scheduledAt: at.toISOString(), coachNote: 'Phi chậm 2400 m.' };
  const refused = await call('trainer', 'POST', '/training/sessions', body);
  log(F, 'trainer', 'tạo buổi phi chậm → hệ thống từ chối', refused.status === 409, `HTTP ${refused.status}: ${refused.message}`);
  const overridden = await call('trainer', 'POST', '/training/sessions', { ...body, overrideReason: 'HLV vẫn muốn cho tập, sẽ theo dõi sát' });
  log(F, 'trainer', 'thử ghi lý do để vẫn tạo → vẫn bị từ chối (ô đỏ không bỏ qua được)', overridden.status === 409, `HTTP ${overridden.status}: ${overridden.message}`);
  if (refused.status === 201 || overridden.status === 201) log(F, 'trainer', 'không được tạo buổi tập này', false, 'buổi tập đã bị tạo dù ngựa chưa ăn');
}

function report() {
  const table = ['| Giờ | Flow | Vai trò | Bước | Kết quả | Chi tiết |', '|---|---|---|---|---|---|', ...steps.map((s) => `| ${s.at} | ${s.flow} | ${s.role} | ${s.action} | ${s.ok ? '✅' : '❌'} | ${s.detail} |`)].join('\n');
  const head = `### Demo flows ${failed ? '— CÓ BƯỚC LỖI' : '— đạt'}\n${BASE}${WRITE ? '' : ' · chỉ kiểm tra trước, không ghi (DEMO_CONFIRM khác "write")'}\n\n`;
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, head + table + '\n');
  if (process.env.DEMO_REPORT) fs.writeFileSync(process.env.DEMO_REPORT, head + table + '\n');
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
    return;
  }
  const ctx = await preflight(accounts);
  if (!ctx || !WRITE) return;

  const suffix = `${ddmm()} ${hhmm(new Date())}`;
  const now = new Date();
  ctx.missedBreakfastAt = new Date(now.getTime() - minutes(45));
  ctx.missedBreakfastAt.setMinutes(Math.floor(ctx.missedBreakfastAt.getMinutes() / 5) * 5, 0, 0);
  const breakfastAt = new Date(now);
  breakfastAt.setMinutes(Math.floor(now.getMinutes() / 5) * 5, 0, 0);

  try {
    const good = await setUpHorse('Flow 1 · chuẩn', `Test Demo Chuẩn ${suffix}`, `Test Demo A (${suffix})`, breakfastAt, ctx.feed);
    const missed = await setUpHorse('Flow 2 · lỡ bữa', `Test Demo Lỡ Bữa ${suffix}`, `Test Demo B (${suffix})`, ctx.missedBreakfastAt, ctx.feed);
    // Side by side: flow 2 needs no waiting, flow 1 waits for the digestion time after breakfast.
    const runs = await Promise.allSettled([flowGood(ctx, good), flowMissed(ctx, missed)]);
    for (const run of runs) {
      if (run.status === 'rejected') {
        console.error(run.reason?.message || run.reason);
        failed = true;
      }
    }
  } catch (error) {
    console.error(error.message);
    failed = true;
  }
}

main()
  .catch((error) => {
    console.error(error);
    failed = true;
  })
  .finally(() => {
    report();
    if (failed) process.exitCode = 1;
  });
