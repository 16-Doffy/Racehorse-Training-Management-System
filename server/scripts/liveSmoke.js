// Read-only check of the deployed API, run on a schedule by GitHub Actions (.github/workflows/test.yml).
// It wakes the Render service, then — when LIVE_MANAGER_EMAIL / LIVE_MANAGER_PASSWORD are set — signs
// in as the Manager and reads a few lists. It only sends GET requests and the login, which writes
// nothing: never add a request here that creates or changes data, this is the real club's database.
const fs = require('node:fs');

const BASE = (process.env.LIVE_API_URL || 'https://racehorse-tms-server.onrender.com/api/v1').replace(/\/$/, '');
const READS = [
  ['Tài khoản đang đăng nhập', '/auth/me'],
  ['Danh sách ngựa', '/horses'],
  ['Việc cần làm của từng ngựa', '/horses/checklist'],
  ['Nhân sự', '/users'],
  ['Phân chuồng', '/stable/assignments'],
  ['Sự cố chưa xử lý', '/stable/incidents?status=unresolved'],
  ['Kho', '/inventory'],
  ['Tài chính', '/finance'],
  ['Nhật ký hệ thống', '/audit-logs?limit=1'],
];

async function call(path, { method = 'GET', token, body, timeoutMs = 30000 } = {}) {
  const started = Date.now();
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, ms: Date.now() - started };
}

/** Render's free plan sleeps; the first request can take a minute or more to wake it. */
async function wake() {
  const deadline = Date.now() + 4 * 60 * 1000;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await call('/health-check', { timeoutMs: 60000 });
      if (last.status === 200 && last.json?.success) return last;
    } catch (error) {
      last = { status: 0, error: error.message };
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error(`API không trả lời health-check sau 4 phút (lần cuối: ${last?.status || last?.error}).`);
}

const count = (data) => (Array.isArray(data) ? data.length : Array.isArray(data?.items) ? data.items.length : null);

async function main() {
  const rows = [];
  const health = await wake();
  rows.push(['Health-check', '/health-check', health.status, health.ms, '']);

  const email = process.env.LIVE_MANAGER_EMAIL;
  const password = process.env.LIVE_MANAGER_PASSWORD;
  let failed = false;
  if (!email || !password) {
    rows.push(['Đăng nhập Manager', '/auth/login', '—', '—', 'bỏ qua: chưa đặt secret LIVE_MANAGER_EMAIL / LIVE_MANAGER_PASSWORD']);
  } else {
    const login = await call('/auth/login', { method: 'POST', body: { email, password } });
    const token = login.json?.data?.token;
    rows.push(['Đăng nhập Manager', '/auth/login', login.status, login.ms, token ? '' : login.json?.message || 'không nhận được token']);
    if (!token) failed = true;
    else {
      for (const [label, path] of READS) {
        const r = await call(path, { token }).catch((error) => ({ status: 0, ms: 0, json: { message: error.message } }));
        const ok = r.status === 200 && r.json?.success !== false;
        if (!ok) failed = true;
        const n = count(r.json?.data);
        rows.push([label, path, r.status, r.ms, ok ? (n === null ? '' : `${n} bản ghi`) : r.json?.message || 'lỗi']);
      }
    }
  }

  const table = ['| Kiểm tra | API | Mã | ms | Ghi chú |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
  console.log(`Live API: ${BASE}\n${table}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Kiểm tra web thật (chỉ đọc)\n${BASE}\n\n${table}\n`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
