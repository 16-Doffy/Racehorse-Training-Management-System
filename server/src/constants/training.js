// Vietnamese labels for the training vocabulary, kept server-side because the server writes them
// into notification text and auto-generated task notes that the client renders verbatim.
const OBJECTIVE_LABELS = {
  endurance: 'Tăng sức bền',
  speed: 'Tăng tốc độ',
  interval: 'Chạy biến tốc',
  recovery: 'Hồi phục nhẹ',
  technique: 'Kỹ thuật',
  race_simulation: 'Mô phỏng thi đấu',
};

const INTENSITY_LABELS = {
  light: 'Nhẹ',
  moderate: 'Vừa',
  high: 'Cao',
};

// Training session lifecycle. Single source of truth for which status may follow which: the
// controller reads it, and nothing else should hard-code a status string for a transition.
// Completed and cancelled are final: a session the vet's lock cancelled must not be reopened
// into in_progress, which is what re-arms the sensor feed.
const SESSION_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  READY: 'ready', // pre-check passed; the only status a session can be started from (T2-04/T2-05)
  BLOCKED: 'blocked', // held back by a vet restriction or a failed pre-check; reopens by itself
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  EVALUATED: 'evaluated', // trainer's evaluation filed after completion
  ABORTED: 'aborted', // stopped mid-run, with a reason
  CANCELLED: 'cancelled',
  MISSED: 'missed', // never started and past its grace period
});

// Edges are added together with the endpoint that uses them. ABORTED, EVALUATED and MISSED have no
// way in yet (end/abort, evaluation and the missed job come later). SCHEDULED -> IN_PROGRESS and
// -> COMPLETED are legacy edges that the start/end endpoints replace.
const SESSION_TRANSITIONS = Object.freeze({
  [SESSION_STATUS.SCHEDULED]: [
    SESSION_STATUS.READY,
    SESSION_STATUS.BLOCKED,
    SESSION_STATUS.IN_PROGRESS,
    SESSION_STATUS.COMPLETED,
    SESSION_STATUS.CANCELLED,
  ],
  [SESSION_STATUS.READY]: [SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.CANCELLED],
  [SESSION_STATUS.BLOCKED]: [SESSION_STATUS.READY, SESSION_STATUS.CANCELLED],
  [SESSION_STATUS.IN_PROGRESS]: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED],
  [SESSION_STATUS.COMPLETED]: [],
  [SESSION_STATUS.EVALUATED]: [],
  [SESSION_STATUS.ABORTED]: [],
  [SESSION_STATUS.CANCELLED]: [],
  [SESSION_STATUS.MISSED]: [],
});

// Statuses a client may ask for with a bare `status` (PUT, evaluation). Everything else - ready,
// blocked, and later aborted/evaluated - is reached only through the endpoint that checks its
// conditions, so a request body can never skip them.
const SESSION_BODY_STATUSES = Object.freeze([SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED]);

// The pre-check is done close to the session, not days ahead: the horse's condition has to be
// judged for now. CONFIGURABLE, simplified for the capstone: move to SystemSetting (T8-01).
const PRECHECK_WINDOW = Object.freeze({ opensBeforeMin: 60, closesAfterMin: 30 });

/** When a session's pre-check may be filed, and whether `now` falls inside that window. */
function preCheckWindow(scheduledAt, now = new Date()) {
  const at = new Date(scheduledAt).getTime();
  const opensAt = new Date(at - PRECHECK_WINDOW.opensBeforeMin * 60 * 1000);
  const closesAt = new Date(at + PRECHECK_WINDOW.closesAfterMin * 60 * 1000);
  const t = new Date(now).getTime();
  return { opensAt, closesAt, open: t >= opensAt.getTime() && t <= closesAt.getTime() };
}

// Sessions that are booked or running, i.e. not yet finished one way or another. What an archived
// horse's sessions are cancelled from.
const SESSION_OPEN_STATUSES = Object.freeze([
  SESSION_STATUS.SCHEDULED,
  SESSION_STATUS.READY,
  SESSION_STATUS.BLOCKED,
  SESSION_STATUS.IN_PROGRESS,
]);

// Sessions a vet's training lock must stop. Blocked is left out on purpose: it is already held back,
// and T4-03 decides how it reopens.
const SESSION_LOCK_CANCELS = Object.freeze([SESSION_STATUS.SCHEDULED, SESSION_STATUS.READY, SESSION_STATUS.IN_PROGRESS]);

// Why a trainer stopped a running session.
const ABORT_CATEGORIES = Object.freeze(['health', 'weather', 'equipment', 'other']);

// Sessions whose results count as done work in charts.
const SESSION_DONE_STATUSES = Object.freeze([SESSION_STATUS.COMPLETED, SESSION_STATUS.EVALUATED]);

// Vietnamese, lower-case: used inside sentences ("Không thể chuyển từ … sang …").
const SESSION_STATUS_LABELS = Object.freeze({
  [SESSION_STATUS.SCHEDULED]: 'đã lên lịch',
  [SESSION_STATUS.READY]: 'sẵn sàng',
  [SESSION_STATUS.BLOCKED]: 'bị chặn',
  [SESSION_STATUS.IN_PROGRESS]: 'đang diễn ra',
  [SESSION_STATUS.COMPLETED]: 'đã hoàn thành',
  [SESSION_STATUS.EVALUATED]: 'đã đánh giá',
  [SESSION_STATUS.ABORTED]: 'đã dừng giữa chừng',
  [SESSION_STATUS.CANCELLED]: 'đã hủy',
  [SESSION_STATUS.MISSED]: 'đã lỡ giờ',
});

/** Whether a session in `from` may move to `to`. Unknown statuses never can. */
function canTransition(from, to) {
  return Boolean(SESSION_TRANSITIONS[from]?.includes(to));
}

// Machine-readable reason sent as `data.code` on a refused request, so a screen can tell
// "wrong state" apart from "validation" without parsing the Vietnamese message.
const SESSION_ERROR = Object.freeze({
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  NOT_EDITABLE: 'SESSION_NOT_EDITABLE',
  NOT_DELETABLE: 'SESSION_NOT_DELETABLE',
  PRECHECK_NOT_CONFIRMED: 'PRECHECK_NOT_CONFIRMED',
  OUTSIDE_PRECHECK_WINDOW: 'OUTSIDE_PRECHECK_WINDOW',
  READINESS_BLOCKED: 'READINESS_BLOCKED',
});

const PHASE_LABELS = {
  base_building: 'Nền tảng — sức bền',
  strength: 'Sức mạnh',
  speed: 'Tốc độ',
  peak: 'Giảm tải trước giải',
  recovery: 'Hồi phục',
};

/**
 * The kinds of work a racehorse actually does in a week, each with the workout it normally means.
 * A kind decides the session's objective, intensity and type, so every screen that already reads
 * those (owner, mobile, reports) keeps working; the numbers are the defaults a session starts from.
 *
 * Speeds and heart rates are a thoroughbred's: a canter around 35 km/h, a breeze (fast work) near
 * race pace at 55–60 km/h, a working heart rate of 150–220 bpm.
 */
const SESSION_KINDS = {
  walk: {
    label: 'Đi bộ & chạy kiệu',
    objective: 'recovery',
    intensity: 'light',
    sessionType: 'training',
    prescription: { distanceM: 4000, reps: 1, targetSpeedKmh: 12, targetHeartRateMax: 120, durationMinutes: 30 },
  },
  canter: {
    label: 'Phi chậm',
    objective: 'endurance',
    intensity: 'moderate',
    sessionType: 'training',
    prescription: { distanceM: 2400, reps: 1, targetSpeedKmh: 35, targetHeartRateMax: 170 },
  },
  hill: {
    label: 'Tập dốc',
    objective: 'endurance',
    intensity: 'high',
    sessionType: 'training',
    prescription: { distanceM: 400, reps: 6, restMinutes: 3, targetSpeedKmh: 30, targetHeartRateMax: 190 },
  },
  breeze: {
    label: 'Phi nhanh',
    objective: 'speed',
    intensity: 'high',
    sessionType: 'training',
    prescription: { distanceM: 800, reps: 1, targetSpeedKmh: 58, targetHeartRateMax: 215 },
  },
  trial: {
    label: 'Chạy thử',
    objective: 'race_simulation',
    intensity: 'high',
    sessionType: 'trial_run',
    prescription: { distanceM: 1200, reps: 1, targetSpeedKmh: 60, targetHeartRateMax: 225 },
  },
};

// Easier kind to swap in when the vet only allows lighter work (recovering horse).
const KIND_BY_INTENSITY = { light: 'walk', moderate: 'canter', high: 'breeze' };

/**
 * A normal week in each phase, Monday first (day 1 … 6, Sunday 0). A missing day is a rest day.
 * Base: mostly cantering to build stamina. Strength: hill work twice. Speed: fast work twice.
 * Peak: one short breeze, the rest easy, so the horse arrives fresh. Recovery: walking, light canters.
 */
const PHASE_DEFAULTS = {
  base_building: {
    intensity: 'moderate',
    weeklyVolumeKm: 14,
    week: [
      { day: 1, kind: 'canter' }, { day: 2, kind: 'walk' }, { day: 3, kind: 'canter' },
      { day: 4, kind: 'walk' }, { day: 5, kind: 'canter' }, { day: 6, kind: 'canter', distanceM: 3200 },
    ],
  },
  strength: {
    intensity: 'high',
    weeklyVolumeKm: 16,
    week: [
      { day: 1, kind: 'canter' }, { day: 2, kind: 'hill' }, { day: 3, kind: 'walk' },
      { day: 4, kind: 'canter' }, { day: 5, kind: 'hill' }, { day: 6, kind: 'canter', distanceM: 3200 },
    ],
  },
  speed: {
    intensity: 'high',
    weeklyVolumeKm: 15,
    week: [
      { day: 1, kind: 'canter' }, { day: 2, kind: 'breeze' }, { day: 3, kind: 'walk' },
      { day: 4, kind: 'canter' }, { day: 5, kind: 'breeze', distanceM: 1000 }, { day: 6, kind: 'canter', distanceM: 3200 },
    ],
  },
  peak: {
    intensity: 'moderate',
    weeklyVolumeKm: 10,
    week: [
      { day: 1, kind: 'canter' }, { day: 2, kind: 'breeze', distanceM: 600 }, { day: 3, kind: 'walk' },
      { day: 4, kind: 'canter', distanceM: 2000 }, { day: 5, kind: 'walk' },
    ],
  },
  recovery: {
    intensity: 'light',
    weeklyVolumeKm: 8,
    week: [
      { day: 1, kind: 'walk' }, { day: 2, kind: 'walk' }, { day: 3, kind: 'canter', distanceM: 1600 },
      { day: 4, kind: 'walk' }, { day: 5, kind: 'canter', distanceM: 1600 },
    ],
  },
};

const BUILD_UP = ['base_building', 'strength', 'speed', 'peak'];
const BUILD_UP_SHARE = { base_building: 0.35, strength: 0.25, speed: 0.25, peak: 0.15 };
const RECOVERY_WEEKS_AFTER_RACE = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The phases leading to a race: the weeks between start and race day shared out base 35%,
 * strength 25%, speed 25%, peak 15% (at least one week each, dropping the earliest phases when
 * time is short), then two weeks of recovery. Without a race: 4 weeks base, 3 strength, 3 speed.
 */
function suggestPhases(startDate, raceDate) {
  let plan;
  if (raceDate) {
    // The race's own week belongs to the build-up; recovery starts the Monday after.
    const totalWeeks = Math.max(1, Math.ceil((new Date(raceDate) - new Date(startDate) + 1) / (7 * DAY_MS)));
    const keys = BUILD_UP.slice(Math.max(0, BUILD_UP.length - totalWeeks)); // too few weeks: keep the last phases
    const weeks = keys.map((k) => Math.max(1, Math.round(totalWeeks * BUILD_UP_SHARE[k])));
    // Make the build-up end on race week: give or take from the longest phases.
    let diff = totalWeeks - weeks.reduce((a, b) => a + b, 0);
    while (diff !== 0) {
      const order = weeks.map((w, i) => i).sort((a, b) => weeks[b] - weeks[a]);
      const i = diff > 0 ? order[0] : order.find((j) => weeks[j] > 1);
      if (i === undefined) break;
      weeks[i] += diff > 0 ? 1 : -1;
      diff += diff > 0 ? -1 : 1;
    }
    plan = keys.map((k, i) => ({ key: k, weeks: weeks[i] }));
    plan.push({ key: 'recovery', weeks: RECOVERY_WEEKS_AFTER_RACE });
  } else {
    plan = [{ key: 'base_building', weeks: 4 }, { key: 'strength', weeks: 3 }, { key: 'speed', weeks: 3 }];
  }
  return plan.map((p) => ({
    ...p,
    intensity: PHASE_DEFAULTS[p.key].intensity,
    weeklyVolumeKm: PHASE_DEFAULTS[p.key].weeklyVolumeKm,
    week: PHASE_DEFAULTS[p.key].week.map((d) => ({ ...d })),
  }));
}

/** Sensible bounds for a workout and for what is measured, so typing slips (10 km/h, 112 km) are refused. */
const PRESCRIPTION_RANGES = {
  distanceM: [100, 6000, 'm'],
  reps: [1, 20, 'hiệp'],
  restMinutes: [0, 30, 'phút'],
  targetSpeedKmh: [10, 75, 'km/h'],
  targetHeartRateMax: [60, 240, 'bpm'],
  durationMinutes: [5, 180, 'phút'],
};
const METRIC_RANGES = {
  avgHeartRate: [25, 250, 'bpm'],
  maxHeartRate: [25, 250, 'bpm'],
  maxSpeed: [0, 80, 'km/h'],
  distance: [0, 20000, 'm'],
};
const FIELD_LABELS = {
  distanceM: 'Cự ly',
  reps: 'Số hiệp',
  restMinutes: 'Nghỉ giữa hiệp',
  targetSpeedKmh: 'Tốc độ mục tiêu',
  targetHeartRateMax: 'Nhịp tim tối đa',
  durationMinutes: 'Thời lượng',
  avgHeartRate: 'Nhịp tim trung bình',
  maxHeartRate: 'Nhịp tim cao nhất',
  maxSpeed: 'Tốc độ cao nhất',
  distance: 'Cự ly đã chạy',
};

// Pace that makes sense for each kind of work: a breeze at 10 km/h is a typing slip, not a workout.
const KIND_SPEED_RANGES = { walk: [5, 20], canter: [25, 45], hill: [15, 45], breeze: [45, 70], trial: [45, 75] };

/** A target speed that doesn't fit the kind of work, as an error message, or null. */
function kindSpeedProblem(kind, speed) {
  const range = KIND_SPEED_RANGES[kind];
  if (!range || speed === undefined || speed === null || speed === '') return null;
  const n = Number(speed);
  if (n >= range[0] && n <= range[1]) return null;
  return `Tốc độ mục tiêu cho buổi "${SESSION_KINDS[kind].label.toLowerCase()}" phải trong khoảng ${range[0]}–${range[1]} km/h (đang nhập ${speed}).`;
}

/** The first value outside its range, as an error message, or null. Empty values are allowed. */
function rangeProblem(values, ranges) {
  for (const [field, [min, max, unit]] of Object.entries(ranges)) {
    const v = values?.[field];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) {
      return `${FIELD_LABELS[field]} phải trong khoảng ${min}–${max} ${unit} (đang nhập ${v}).`;
    }
  }
  return null;
}

module.exports = {
  SESSION_STATUS,
  SESSION_TRANSITIONS,
  SESSION_STATUS_LABELS,
  SESSION_OPEN_STATUSES,
  SESSION_LOCK_CANCELS,
  SESSION_DONE_STATUSES,
  SESSION_BODY_STATUSES,
  PRECHECK_WINDOW,
  preCheckWindow,
  ABORT_CATEGORIES,
  SESSION_ERROR,
  canTransition,
  OBJECTIVE_LABELS,
  INTENSITY_LABELS,
  PHASE_LABELS,
  SESSION_KINDS,
  KIND_BY_INTENSITY,
  PHASE_DEFAULTS,
  suggestPhases,
  PRESCRIPTION_RANGES,
  METRIC_RANGES,
  rangeProblem,
  kindSpeedProblem,
};
