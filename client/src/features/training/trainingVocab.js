// What a training session is for, in the trainer's own words. The descriptions are shown in the
// scheduling form because "interval" on its own tells a reader nothing about why the horse is
// running — which was exactly the gap reviewers pointed at.
export const OBJECTIVE_LABELS = {
  endurance: 'Tăng sức bền',
  speed: 'Tăng tốc độ',
  interval: 'Chạy biến tốc',
  recovery: 'Hồi phục nhẹ',
  technique: 'Kỹ thuật',
  race_simulation: 'Mô phỏng thi đấu',
};

export const OBJECTIVE_DESCRIPTIONS = {
  endurance: 'Chạy dài, tốc độ đều — xây nền thể lực, tăng dung tích tim phổi.',
  speed: 'Cự ly ngắn, tốc độ tối đa — rèn sức bật và tốc độ nước rút.',
  interval: 'Xen kẽ hiệp nhanh và nghỉ — nâng ngưỡng chịu đựng, giống nhịp một cuộc đua.',
  recovery: 'Đi bộ hoặc chạy chậm — giãn cơ, hồi phục sau buổi nặng hoặc sau chấn thương.',
  technique: 'Tập xuất phát, vào cua, phối hợp với nài — không nhắm vào thể lực.',
  race_simulation: 'Chạy đủ cự ly thi đấu với tốc độ thật — kiểm tra độ sẵn sàng trước giải.',
};

export const OBJECTIVE_COLORS = {
  endurance: 'blue',
  speed: 'volcano',
  interval: 'purple',
  recovery: 'green',
  technique: 'cyan',
  race_simulation: 'magenta',
};

export const INTENSITY_LABELS = { light: 'Nhẹ', moderate: 'Vừa', high: 'Cao' };
export const INTENSITY_COLORS = { light: 'green', moderate: 'gold', high: 'red' };

// The stages of a training cycle, in order. Same words as the server (constants/training.js).
export const PHASE_LABELS = {
  base_building: 'Nền tảng — sức bền',
  strength: 'Sức mạnh',
  speed: 'Tốc độ',
  peak: 'Giảm tải trước giải',
  recovery: 'Hồi phục',
};
export const PHASE_DESCRIPTIONS = {
  base_building: 'Phi chậm nhiều, cự ly dài vừa phải — xây sức bền và gân xương.',
  strength: 'Thêm tập dốc — tăng sức mạnh cơ chân sau.',
  speed: 'Hai buổi phi nhanh mỗi tuần ở gần tốc độ đua.',
  peak: 'Giảm khối lượng, giữ một buổi phi nhanh ngắn để ngựa vào giải sung sức.',
  recovery: 'Sau giải: đi bộ, phi nhẹ để cơ thể hồi lại.',
};
// Short names for tight spots (the timeline bar).
export const PHASE_SHORT = { base_building: 'Nền tảng', strength: 'Sức mạnh', speed: 'Tốc độ', peak: 'Giảm tải', recovery: 'Hồi phục' };
// Timeline colours, light to dark as the work gets harder; recovery back to a calm green.
export const PHASE_COLORS = {
  base_building: '#7FB685',
  strength: '#C9A227',
  speed: '#D9733B',
  peak: '#B3261E',
  recovery: '#5B8FB9',
};

/**
 * The kinds of work in a racehorse's week, with the workout each normally means — mirrors
 * SESSION_KINDS on the server, which fills in whatever the form leaves out.
 */
export const SESSION_KINDS = {
  walk: {
    label: 'Đi bộ & chạy kiệu',
    short: 'Đi bộ',
    color: 'green',
    hint: 'Ngày nhẹ: giãn cơ, hồi sức giữa các buổi nặng.',
    objective: 'recovery',
    intensity: 'light',
    sessionType: 'training',
    prescription: { distanceM: 4000, reps: 1, targetSpeedKmh: 12, targetHeartRateMax: 120, durationMinutes: 30 },
  },
  canter: {
    label: 'Phi chậm',
    short: 'Phi chậm',
    color: 'blue',
    hint: 'Buổi chính để xây sức bền: tốc độ đều khoảng 35 km/h.',
    objective: 'endurance',
    intensity: 'moderate',
    sessionType: 'training',
    prescription: { distanceM: 2400, reps: 1, targetSpeedKmh: 35, targetHeartRateMax: 170 },
  },
  hill: {
    label: 'Tập dốc',
    short: 'Tập dốc',
    color: 'gold',
    hint: 'Chạy lên dốc nhiều hiệp ngắn: tăng sức mạnh chân sau.',
    objective: 'endurance',
    intensity: 'high',
    sessionType: 'training',
    prescription: { distanceM: 400, reps: 6, restMinutes: 3, targetSpeedKmh: 30, targetHeartRateMax: 190 },
  },
  breeze: {
    label: 'Phi nhanh',
    short: 'Phi nhanh',
    color: 'volcano',
    hint: 'Đoạn ngắn ở gần tốc độ đua (55–60 km/h): rèn tốc độ.',
    objective: 'speed',
    intensity: 'high',
    sessionType: 'training',
    prescription: { distanceM: 800, reps: 1, targetSpeedKmh: 58, targetHeartRateMax: 215 },
  },
  trial: {
    label: 'Chạy thử',
    short: 'Chạy thử',
    color: 'magenta',
    hint: 'Chạy đủ cự ly giải, bấm giờ, quay video — khoảng một tuần trước giải.',
    objective: 'race_simulation',
    intensity: 'high',
    sessionType: 'trial_run',
    prescription: { distanceM: 1200, reps: 1, targetSpeedKmh: 60, targetHeartRateMax: 225 },
  },
};
export const kindOptions = Object.entries(SESSION_KINDS).map(([value, k]) => ({ value, label: k.label, hint: k.hint }));
// Same bands the server checks (constants/training.js).
export const KIND_SPEED_RANGES = { walk: [5, 20], canter: [25, 45], hill: [15, 45], breeze: [45, 70], trial: [45, 75] };
export const PRESCRIPTION_LIMITS = {
  distanceM: [100, 6000],
  reps: [1, 20],
  restMinutes: [0, 30],
  targetSpeedKmh: [10, 75],
  targetHeartRateMax: [60, 240],
  durationMinutes: [5, 180],
};
export const METRIC_LIMITS = { avgHeartRate: [25, 250], maxSpeed: [0, 80], distance: [0, 20000] };

/** Monday 00:00 of the week containing the given dayjs date. */
export const mondayOf = (d) => d.startOf('day').subtract((d.day() + 6) % 7, 'day');

// Monday first, the way a training week is read. Values are JS getDay() numbers.
export const WEEK_DAYS = [
  { day: 1, short: 'T2' },
  { day: 2, short: 'T3' },
  { day: 3, short: 'T4' },
  { day: 4, short: 'T5' },
  { day: 5, short: 'T6' },
  { day: 6, short: 'T7' },
  { day: 0, short: 'CN' },
];

/** "T5 09/10 · 07:30" */
export const sessionTimeLabel = (d) => {
  const x = new Date(d);
  const wd = WEEK_DAYS.find((w) => w.day === x.getDay())?.short;
  const date = x.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  const time = x.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `${wd} ${date} · ${time}`;
};

export const objectiveOptions = Object.entries(OBJECTIVE_LABELS).map(([value, label]) => ({
  value,
  label,
  description: OBJECTIVE_DESCRIPTIONS[value],
}));

export const intensityOptions = Object.entries(INTENSITY_LABELS).map(([value, label]) => ({ value, label }));

export const SURFACE_LABELS = { turf: 'Cỏ (Turf)', dirt: 'Đất (Dirt)', synthetic: 'Tổng hợp', sand: 'Cát' };
export const surfaceOptions = Object.entries(SURFACE_LABELS).map(([value, label]) => ({ value, label }));

// A plan's lifecycle. Only draft/active plans accept new sessions (enforced by the server).
export const PLAN_STATUS_LABELS = { draft: 'Nháp', active: 'Đang áp dụng', completed: 'Đã hoàn thành', cancelled: 'Đã hủy' };
export const PLAN_STATUS_COLORS = { draft: 'default', active: 'blue', completed: 'green', cancelled: 'red' };
export const planStatusOptions = Object.entries(PLAN_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export const phaseOptions = Object.entries(PHASE_LABELS).map(([value, label]) => ({ value, label }));

const hhmm = (d) => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * When the session really ran, next to its booked time: "07:42–07:50 (8 phút)", "Bắt đầu 07:42 —
 * đang chạy", or null when it never ran (booked, cancelled, or closed by hand without starting).
 */
export function actualTimeLabel(s) {
  if (!s?.actualStartAt) return null;
  if (!s.actualEndAt) return `Bắt đầu ${hhmm(s.actualStartAt)} — đang chạy`;
  const minutes = Math.max(1, Math.round((s.actualDurationSec || 0) / 60));
  return `${hhmm(s.actualStartAt)}–${hhmm(s.actualEndAt)} (${minutes} phút)`;
}

// Only light work in the afternoon: the main workout is in the morning (server: AFTERNOON_KINDS).
export const AFTERNOON_KINDS = ['walk', 'canter'];

const DAY_MS = 24 * 60 * 60 * 1000;
const PHASE_ORDER = { base_building: 0, strength: 1, speed: 2, peak: 3, recovery: 4 };
const ddmmOf = (d) => {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
};

/** The phases laid end to end from the start date: [{ key, weeks, start, end }] (Dates). */
export function layPhases(startDate, phases) {
  const first = new Date(startDate);
  first.setHours(0, 0, 0, 0);
  let cursor = first.getTime();
  return phases.map((p) => {
    const start = new Date(cursor);
    cursor += (Number(p.weeks) || 0) * 7 * DAY_MS;
    return { key: p.key, weeks: Number(p.weeks) || 0, start, end: new Date(cursor - 1) };
  });
}

/**
 * What is wrong or risky about a cycle's phases — the same rules as the server (constants/training.js
 * planWarnings): 'error' blocks the plan, 'warning' is the trainer's call.
 */
export function planWarnings(phases, { startDate, raceDate, distance } = {}) {
  const out = [];
  if (!phases?.length || !startDate) return out;
  const laid = layPhases(startDate, phases);
  const buildUp = laid.filter((p) => p.key !== 'recovery');
  const buildUpWeeks = buildUp.reduce((n, p) => n + p.weeks, 0);
  const firstRecovery = laid.findIndex((p) => p.key === 'recovery');
  if (firstRecovery >= 0 && laid.slice(firstRecovery).some((p) => p.key !== 'recovery')) {
    out.push({ level: 'error', text: 'Giai đoạn Hồi phục phải đứng cuối, sau ngày đua.' });
  }
  if (raceDate) {
    const race = new Date(raceDate);
    const inPhase = laid.find((p) => race >= p.start && race <= p.end);
    const buildUpEnd = buildUp.length ? buildUp[buildUp.length - 1].end : null;
    const daysLeft = Math.ceil((race - new Date(startDate)) / DAY_MS);
    if (!inPhase) {
      out.push({ level: 'error', text: `Ngày đua ${ddmmOf(race)} nằm ngoài lộ trình (${ddmmOf(laid[0].start)} – ${ddmmOf(laid[laid.length - 1].end)}).` });
    } else if (inPhase.key === 'recovery') {
      out.push({ level: 'error', text: `Ngày đua ${ddmmOf(race)} rơi vào giai đoạn Hồi phục — cần thêm tuần cho các giai đoạn trước giải.` });
    } else if (buildUpEnd && buildUpEnd - race > 7 * DAY_MS) {
      out.push({ level: 'error', text: `Các giai đoạn trước giải kéo dài tới ${ddmmOf(buildUpEnd)}, quá ngày đua ${ddmmOf(race)} hơn một tuần — bớt số tuần.` });
    } else if (inPhase.key !== 'peak') {
      out.push({ level: 'warning', text: `Ngày đua rơi vào giai đoạn ${PHASE_LABELS[inPhase.key]} — thường đua ở cuối giai đoạn Giảm tải.` });
    }
    if (daysLeft < 14) out.push({ level: 'warning', text: `Chỉ còn ${daysLeft} ngày tới giải — không đủ thời gian xây thể lực, chỉ nên giữ phong độ.` });
  }
  if (buildUpWeeks > 0 && buildUpWeeks < 6) {
    out.push({ level: 'warning', text: `Chỉ ${buildUpWeeks} tuần chuẩn bị — thực tế cần 8–12 tuần, chuẩn bị gấp dễ chấn thương.` });
  }
  const base = laid.filter((p) => p.key === 'base_building').reduce((n, p) => n + p.weeks, 0);
  if (base > 0 && base < 2) out.push({ level: 'warning', text: 'Nền tảng chỉ 1 tuần — nền sức bền mỏng, nên ít nhất 2 tuần.' });
  const peak = laid.filter((p) => p.key === 'peak').reduce((n, p) => n + p.weeks, 0);
  if (peak > 2) out.push({ level: 'warning', text: `Giảm tải ${peak} tuần là quá dài — ngựa mất thể lực, thường 1–2 tuần.` });
  const order = buildUp.map((p) => PHASE_ORDER[p.key]);
  if (order.some((o, i) => i > 0 && o < order[i - 1])) {
    out.push({ level: 'warning', text: 'Thứ tự giai đoạn khác thông lệ (nền tảng → sức mạnh → tốc độ → giảm tải).' });
  }
  if (distance > 2000 && buildUpWeeks > 0 && base / buildUpWeeks < 0.35) {
    out.push({ level: 'warning', text: `Giải ${distance}m là cự ly dài — nên dành ít nhất 35% thời gian cho Nền tảng (đang ${Math.round((base / buildUpWeeks) * 100)}%).` });
  }
  if (distance > 3200) out.push({ level: 'warning', text: `Đua phẳng hiếm khi vượt 3200m — kiểm tra lại cự ly ${distance}m.` });
  return out;
}
