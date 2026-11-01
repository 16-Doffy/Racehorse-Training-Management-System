#!/usr/bin/env node
// Keeps the club's day going with nobody at the screen, on the REAL horses already in the system
// (GitHub Actions: .github/workflows/auto-operate.yml). It creates no horse and books no session. Each
// pass does only what is due: the groom records the meals and care work in their time, the trainer
// checks and starts the sessions booked now (the simulated sensors run them), and evaluates those that
// finished. Everything it does is said in its report and carries "Tự vận hành".
//
// It never goes past a block: a horse the vet locked or found injured stays refused, and is reported.
// A caution the system lets a trainer pass with a reason is passed, with that reason, and reported.
//
// Reads only, and says what it would do, unless OPERATE_CONFIRM=write. Stops by itself after OPERATE_UNTIL.
// Environment: DEMO_ACCOUNTS (the same secret as demoFlows.js), LIVE_API_URL, OPERATE_RUN_MIN (how long to
// keep going, 0 = one pass), OPERATE_SKIP (horse names, comma separated), OPERATE_REPORT (also write here).
const fs = require('node:fs');

const BASE = (process.env.LIVE_API_URL || 'https://racehorse-tms-server.onrender.com/api/v1').replace(/\/$/, '');
const WRITE = process.env.OPERATE_CONFIRM === 'write';
const UNTIL = process.env.OPERATE_UNTIL || '';
const RUN_MIN = Number(process.env.OPERATE_RUN_MIN ?? 25);
const SKIP = new Set((process.env.OPERATE_SKIP || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const ZONE = 'Asia/Ho_Chi_Minh';
const TAG = 'Tự vận hành';
const OVERRIDE = `${TAG}: không có HLV tại sân, cảnh báo này được hệ thống ghi nhận để xem lại.`;
const FED_WELL = { observation: { appetite: 'Tốt', manure: 'Bình thường', waterIntake: 'Bình thường' }, amountEatenPercent: 100 };
const CHECK = { confirmed: true, bodyTempC: 37.7, trackCondition: 'Mặt sân tốt', weather: 'Trời mát' };
const MIN = 60000;
// A session is started from its time until shortly before the system would call it missed (30 minutes).
const START_LATE_MIN = 25;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const inZone = (date, options) => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, ...options }).format(date);
const clock = (date = new Date()) => inZone(date, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const idOf = (x) => String(x?._id || x || '');
const horseName = (x) => x.horse?.name || 'Ngựa';
const skipped = (x) => SKIP.has(horseName(x).toLowerCase());

const lines = [];
const said = new Set();
/** One line of the report; the same thing is said once, however many passes see it. */
function say(what, key = what) {
  if (said.has(key)) return;
  said.add(key);
  lines.push(`${clock()} ${what}`);
  console.log(`${clock()} ${what}`);
}
function report(text) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  if (process.env.OPERATE_REPORT) fs.appendFileSync(process.env.OPERATE_REPORT, `${text}\n`);
}

const tokens = {};
const TRANSIENT = new Set([502, 503, 504]);
/**
 * One API call, retried for up to 4 minutes while the server sleeps or redeploys. A request that timed
 * out may have reached the server, so only a read is sent again after a timeout.
 */
async function call(role, method, path, body) {
  const deadline = Date.now() + 4 * MIN;
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
      await sleep(15000);
      continue;
    }
    if (TRANSIENT.has(res.status) && Date.now() < deadline) {
      await sleep(15000);
      continue;
    }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.status < 300, data: json.data, message: json.message || '' };
  }
}
async function read(role, path) {
  const r = await call(role, 'GET', path);
  if (!r.ok) throw new Error(`${role} GET ${path}: HTTP ${r.status} ${r.message}`);
  return r.data;
}
async function login(accounts, role) {
  const r = await call(null, 'POST', '/auth/login', { email: accounts[role], password: accounts.password });
  if (!r.data?.token) throw new Error(`${role} không đăng nhập được: ${r.message || `HTTP ${r.status}`}`);
  tokens[role] = r.data.token;
}

/** A meal is given from about its time; other work from its time if it has one, else as soon as it is open. */
function workIsDue(task, now) {
  if (task.status !== 'pending' || !['open', 'late'].includes(task.timing?.state)) return false;
  if (task.taskType === 'feeding') return now >= new Date(task.scheduledDate).getTime() - 5 * MIN;
  return !task.dueTime || clock(new Date(now)) >= task.dueTime;
}

async function doWork(today, now) {
  const mine = (await read('groom', `/stable/tasks?date=${today}`)) || [];
  const everyone = (await read('trainer', `/stable/tasks?date=${today}`)) || [];
  const mineIds = new Set(mine.map((t) => idOf(t)));
  for (const task of everyone) {
    if (workIsDue(task, now) && !skipped(task) && !mineIds.has(idOf(task))) {
      say(`${horseName(task)}: việc giao cho ${task.assignedTo?.name || 'chưa có ai'}, tài khoản này không làm thay.`, `other-${idOf(task)}`);
    }
  }
  for (const task of mine) {
    if (!workIsDue(task, now) || skipped(task)) continue;
    const isMeal = task.taskType === 'feeding';
    const what = isMeal ? `cho ăn ${task.mealSlot || ''}`.trim() : `việc ${task.taskType}`;
    if (!WRITE) {
      say(`Sẽ ghi nhận: ${horseName(task)}, ${what}.`, `work-${idOf(task)}`);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const r = await call('groom', 'PATCH', `/stable/tasks/${idOf(task)}/complete`, { clientOpId: `auto-${idOf(task)}`, ...(isMeal ? FED_WELL : {}), notes: TAG });
    say(r.ok ? `Đã ghi nhận: ${horseName(task)}, ${what}.` : `Chưa ghi nhận được: ${horseName(task)}, ${what}: ${r.message || `HTTP ${r.status}`}`, `work-${idOf(task)}-${r.ok}`);
  }
}

/** Sends the step; a caution the system asks a reason for is passed with one, and said. */
async function withReason(session, step, body) {
  const path = `/training/sessions/${idOf(session)}/${step}`;
  let r = await call('trainer', 'POST', path, body);
  if (!r.ok && r.data?.requiresOverride) {
    r = await call('trainer', 'POST', path, { ...body, overrideReason: OVERRIDE });
    if (r.ok) say(`${horseName(session)}: qua cảnh báo bằng lý do "${TAG}" (${step}).`, `override-${idOf(session)}-${step}`);
  }
  return r;
}

async function runSessions(today, now) {
  const sessions = (await read('trainer', '/training/sessions')) || [];
  const ofToday = sessions.filter((s) => s.scheduledAt && dayKey(new Date(s.scheduledAt)) === today && !skipped(s));
  for (const session of ofToday) {
    const at = new Date(session.scheduledAt).getTime();
    const label = `${horseName(session)}, buổi ${clock(new Date(at))}`;
    if (['scheduled', 'ready'].includes(session.status) && now >= at - MIN && now <= at + START_LATE_MIN * MIN) {
      if (!WRITE) {
        say(`Sẽ kiểm tra sẵn sàng và bắt đầu: ${label}.`, `start-${idOf(session)}`);
        continue;
      }
      if (session.status === 'scheduled') {
        // eslint-disable-next-line no-await-in-loop
        const checked = await withReason(session, 'pre-check', CHECK);
        if (!checked.ok) {
          say(`Không chạy: ${label}: ${checked.message || `HTTP ${checked.status}`}`, `refused-${idOf(session)}`);
          continue;
        }
      }
      // eslint-disable-next-line no-await-in-loop
      const started = await withReason(session, 'start', {});
      say(started.ok ? `Đã bắt đầu: ${label}.` : `Không chạy: ${label}: ${started.message || `HTTP ${started.status}`}`, `start-${idOf(session)}-${started.ok}`);
    }
    if (session.status === 'completed') {
      const met = session.outcome?.met;
      const rating = met === true ? 8 : met === false ? 6 : 7;
      if (!WRITE) {
        say(`Sẽ đánh giá ${rating}/10: ${label}.`, `rate-${idOf(session)}`);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const rated = await call('trainer', 'PATCH', `/training/sessions/${idOf(session)}/evaluation`, {
        performanceRating: rating,
        trainerComment: `${TAG}: tự đánh giá theo số đo cảm biến. ${session.outcome?.summary || ''}`.trim(),
      });
      say(rated.ok ? `Đã đánh giá ${rating}/10: ${label}.` : `Chưa đánh giá được: ${label}: ${rated.message || `HTTP ${rated.status}`}`, `rate-${idOf(session)}-${rated.ok}`);
    }
  }
  return ofToday;
}

async function main() {
  const today = dayKey();
  const head = `Tự vận hành ${today} ${clock()} (${WRITE ? 'ghi thật' : 'chạy thử, không ghi gì'})`;
  console.log(head);
  if (UNTIL && today > UNTIL) {
    report(`### ${head}\n\nĐã quá ngày dừng ${UNTIL}, không làm gì.`);
    console.log(`Đã quá ngày dừng ${UNTIL}, không làm gì.`);
    return;
  }
  const accounts = JSON.parse(process.env.DEMO_ACCOUNTS || '{}');
  if (!accounts.password) throw new Error('Thiếu DEMO_ACCOUNTS.');
  await login(accounts, 'groom');
  await login(accounts, 'trainer');

  const until = Date.now() + RUN_MIN * MIN;
  let sessions = [];
  for (;;) {
    const now = Date.now();
    // eslint-disable-next-line no-await-in-loop
    await doWork(today, now);
    // eslint-disable-next-line no-await-in-loop
    sessions = await runSessions(today, now);
    if (Date.now() >= until) break;
    // eslint-disable-next-line no-await-in-loop
    await sleep(MIN);
  }

  const count = (status) => sessions.filter((s) => s.status === status).length;
  const overview = `Buổi hôm nay: ${sessions.length}; đang chạy ${count('in_progress')}, đã đánh giá ${count('evaluated')}, bị chặn ${count('blocked')}, lỡ giờ ${count('missed')}.`;
  console.log(overview);
  report(`### ${head}\n\n${overview}\n\n${lines.length ? lines.map((l) => `- ${l}`).join('\n') : 'Lượt này không có việc tới giờ.'}\n`);
}

main().catch((error) => {
  console.error(error.message);
  report(`### Tự vận hành lỗi\n\n${error.message}\n`);
  process.exitCode = 1;
});
