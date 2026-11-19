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
  recovery: 'Sau buổi chạy thử, trước ngày đua: đi bộ, phi nhẹ để ngựa hồi sức rồi mới đi thi đấu.',
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
// A trial is run over its race's distance (SESSION_KINDS.trial). Shorter is allowed (the trainer
// decides), but below this share of the race the form says so: such a run says little about the race.
export const TRIAL_MIN_RACE_SHARE = 0.75;
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
  // Spelled out: the browser's vi-VN format writes 09-10 on some systems, 09/10 on others.
  const date = `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
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
const durationText = (sec) => (sec < 60 ? `${Math.max(0, Math.round(sec))} giây` : `${Math.round(sec / 60)} phút`);

/**
 * The real clock of a run (when the server started and closed it), and apart from it the work covered on
 * the sensor simulator's compressed clock: "10:00–10:01 (41 giây) · vận động mô phỏng 4 phút".
 */
export function actualTimeLabel(s) {
  if (!s?.actualStartAt) return null;
  if (!s.actualEndAt) return `Bắt đầu ${hhmm(s.actualStartAt)} — đang chạy`;
  const real = `${hhmm(s.actualStartAt)}–${hhmm(s.actualEndAt)} (${durationText(s.actualDurationSec || 0)})`;
  return s.simulatedWorkSec ? `${real} · vận động mô phỏng ${durationText(s.simulatedWorkSec)}` : real;
}

// Why a run was stopped part-way (server: ABORT_CATEGORY_LABELS). The last two are set by the system.
export const ABORT_CATEGORY_LABELS = {
  health: 'Sức khỏe ngựa bất thường',
  injury: 'Nghi chấn thương',
  behaviour: 'Ngựa không hợp tác',
  weather: 'Thời tiết / mặt sân',
  equipment: 'Thiết bị / cảm biến',
  other: 'Lý do khác',
  medical_lock: 'Bác sĩ khóa tập',
  horse_left: 'Ngựa ngừng quản lý',
};
export const TRAINER_ABORT_OPTIONS = ['health', 'injury', 'behaviour', 'weather', 'equipment', 'other'].map((value) => ({
  value,
  label: ABORT_CATEGORY_LABELS[value],
}));
// A completed run and an evaluated one are both done work.
export const DONE_STATUSES = ['completed', 'evaluated'];

// How long a session of each kind takes when nothing says (warm-up and cool-down around the work).
const KIND_MINUTES = { walk: 30, canter: 60, hill: 75, breeze: 60, trial: 60 };

/**
 * The main work of a session in a few words — "Phi chậm 2400 + 1600 m", "Chạy kiệu 20' + 15'" — the
 * warm-up, breathers and cool-down around it left out. Empty when it has no parts.
 */
export function mainWorkLine(segments = []) {
  const parts = (segments || []).filter((s) => s?.kind);
  if (!parts.length) return '';
  const work = parts.filter((s) => s.kind !== 'walk');
  if (work.length) {
    const byKind = new Map();
    for (const s of work) byKind.set(s.kind, [...(byKind.get(s.kind) || []), s]);
    return [...byKind]
      .map(([kind, list]) => {
        const metres = list.every((s) => s.distanceM);
        return `${SESSION_KINDS[kind]?.short || kind} ${list.map((s) => (metres ? s.distanceM : `${s.durationMinutes}'`)).join(' + ')}${metres ? ' m' : ''}`;
      })
      .join(' · ');
  }
  const trots = parts.filter((s) => Number(s.targetSpeedKmh) >= 10);
  if (trots.length) return `Chạy kiệu ${trots.map((s) => `${s.durationMinutes}'`).join(' + ')}`;
  return `Đi bộ ${parts.reduce((n, s) => n + (Number(s.durationMinutes) || 0), 0)}'`;
}

/** Planned end timestamp from explicit `endAt`, summed `segments`, or `prescription.durationMinutes`. */
export function plannedEndAt(session) {
  if (!session?.scheduledAt) return null;
  if (session.endAt) {
    const end = new Date(session.endAt);
    return Number.isNaN(end.getTime()) ? null : end;
  }
  const segs = Array.isArray(session.segments) ? session.segments.filter((s) => s?.kind) : [];
  if (segs.length > 0) {
    const mins = segs.reduce((sum, s) => sum + (Number(s.durationMinutes) || SESSION_KINDS[s.kind]?.prescription?.durationMinutes || 15), 0);
    return mins > 0 ? new Date(new Date(session.scheduledAt).getTime() + mins * 60000) : null;
  }
  const mins = Number(session.prescription?.durationMinutes) || SESSION_KINDS[session.kind]?.prescription?.durationMinutes || KIND_MINUTES[session.kind] || 0;
  return mins > 0 ? new Date(new Date(session.scheduledAt).getTime() + mins * 60000) : null;
}

/** Formats "07:30–08:15" when end time is known, otherwise "07:30". */
export function sessionWindowLabel(session) {
  if (!session?.scheduledAt) return '';
  const start = hhmm(session.scheduledAt);
  const end = plannedEndAt(session);
  return end ? `${start}–${hhmm(end)}` : start;
}

/** Real-world equestrian coaching safety soft warnings when chaining workouts in a single session. */
export function segmentSafetyWarnings(segments = []) {
  const list = (segments || []).filter((s) => s?.kind);
  if (list.length === 0) return [];
  const warnings = [];
  // Walking (warm-up, breathers, cool-down, the walker) is not the load: the work is from a canter up.
  const work = list.filter((s) => s.kind !== 'walk');
  const workMin = work.reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
  const totalMin = list.reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
  const heavyKinds = [...new Set(list.filter((s) => ['hill', 'breeze', 'trial'].includes(s.kind)).map((s) => s.kind))];
  const heavyIndices = list.map((s, idx) => (['hill', 'breeze', 'trial'].includes(s.kind) ? idx : -1)).filter((i) => i >= 0);

  if (work.length > 5) {
    warnings.push(`Buổi có ${work.length} hiệp tập chính (khuyến nghị tối đa 4–5 hiệp để tránh rối nhịp vận động).`);
  }
  if (workMin > 45) {
    warnings.push(`Phần phi/dốc/nước rút dài ${workMin} phút — vượt khoảng 45 phút/buổi dễ gây quá tải gân và tim mạch.`);
  }
  if (totalMin > 180) {
    warnings.push(`Cả buổi ${totalMin} phút — quá 3 giờ, nên tách bớt sang buổi chiều.`);
  }
  if (heavyKinds.length > 1) {
    warnings.push(`Có ${heavyKinds.length} loại bài nặng (tập dốc / phi nhanh / chạy thử) trong cùng 1 buổi — thực tế chỉ nên xếp 1 loại bài nặng mỗi buổi.`);
  }
  if (heavyIndices.length > 0) {
    if (list[0]?.kind !== 'walk') {
      warnings.push('Có bài tập nặng nhưng đoạn đầu chưa là "Đi bộ" khởi động làm nóng gân khớp.');
    }
    if (list.length >= 2 && list[list.length - 1]?.kind !== 'walk') {
      warnings.push('Sau bài tập nặng nên có đoạn "Đi bộ" thả lỏng ở cuối để hạ nhịp tim từ từ.');
    }
  }
  return warnings;
}

/** Active segment target at `coveredDistance` m when `session.segments` is present (matches server targetsOf). */
export function segmentAtDistance(session, coveredDistance = 0) {
  if (!Array.isArray(session?.segments) || session.segments.length === 0) return null;
  let cursor = 0;
  let maxHr = 120;
  let peakSpeed = 0;
  const timeline = [];
  for (const seg of session.segments) {
    if (!seg?.kind) continue;
    const rx = SESSION_KINDS[seg.kind]?.prescription || {};
    const speed = Number(seg.targetSpeedKmh) || rx.targetSpeedKmh || 35;
    const hr = Number(seg.targetHeartRateMax) || rx.targetHeartRateMax || 180;
    const dur = Number(seg.durationMinutes) || rx.durationMinutes || (seg.distanceM ? Math.max(5, Math.round(seg.distanceM / ((speed * 1000) / 60))) : 15);
    let segDist;
    if (Number(seg.distanceM) > 0) {
      segDist = Math.round(Number(seg.distanceM));
    } else if (rx.distanceM) {
      segDist = rx.durationMinutes ? Math.max(200, Math.round(rx.distanceM * (dur / rx.durationMinutes))) : rx.distanceM * (rx.reps ?? 1);
    } else {
      segDist = Math.max(200, Math.round((speed / 3.6) * dur * 60));
    }
    const startDistance = cursor;
    cursor += segDist;
    if (hr > maxHr) maxHr = hr;
    if (speed > peakSpeed) peakSpeed = speed;
    timeline.push({
      index: timeline.length,
      kind: seg.kind,
      label: SESSION_KINDS[seg.kind]?.short || SESSION_KINDS[seg.kind]?.label || seg.kind,
      note: seg.note || null,
      speed,
      heartRateMax: hr,
      startDistance,
      endDistance: cursor,
      segDist,
    });
  }
  if (!timeline.length) return null;
  const covered = Math.max(0, Number(coveredDistance) || 0);
  const active = timeline.find((s) => covered < s.endDistance) || timeline[timeline.length - 1];
  return {
    totalDistance: cursor,
    maxHr,
    peakSpeed,
    segmentIndex: active.index,
    segmentCount: timeline.length,
    segmentKind: active.kind,
    segmentLabel: active.label,
    segmentNote: active.note,
    speed: active.speed,
    heartRateMax: active.heartRateMax,
  };
}

/** The workout a session is measured against (same fallbacks as the server's sensor simulator). */
export function sessionTargets(session) {
  const seg = segmentAtDistance(session, session?.metrics?.distance || 0);
  if (seg && seg.totalDistance > 0) {
    return { heartRateMax: seg.maxHr, speed: seg.peakSpeed, distance: seg.totalDistance };
  }

  const kind = SESSION_KINDS[session?.kind]?.prescription || {};
  const p = session?.prescription || {};
  const pick = (f) => p[f] ?? kind[f];
  return {
    heartRateMax: pick('targetHeartRateMax') || 180,
    speed: pick('targetSpeedKmh'),
    distance: (pick('distanceM') || 2000) * (p.reps ?? kind.reps ?? 1),
  };
}

/** A run that can be played back: it ran, it is over, and the sensors reported during it. */
export const canReplay = (s) => Boolean(s?.actualStartAt) && (DONE_STATUSES.includes(s.status) || s.status === 'aborted') && s.metrics?.lastSpeed != null;

// Only light work in the afternoon: the main workout is in the morning (server: AFTERNOON_KINDS).
export const AFTERNOON_KINDS = ['walk', 'canter'];

// The pieces a session is built from, as a trainer writes them on the board.
const walkIn = (min = 15) => ({ kind: 'walk', durationMinutes: min, targetSpeedKmh: 6, note: 'Đi bộ khởi động' });
const trot = (min, note = 'Chạy kiệu đều') => ({ kind: 'walk', durationMinutes: min, targetSpeedKmh: 14, targetHeartRateMax: 140, note });
const breather = (min = 5) => ({ kind: 'walk', durationMinutes: min, targetSpeedKmh: 6, note: 'Đi bộ nghỉ giữa hiệp' });
const walkOut = (min = 20) => ({ kind: 'walk', durationMinutes: min, targetSpeedKmh: 6, note: 'Đi bộ thả lỏng, hạ nhịp tim' });
const walker = (min = 30) => ({ kind: 'walk', durationMinutes: min, targetSpeedKmh: 5, note: 'Máy đi bộ, tắm & làm mát' });
const canterPart = (min, distanceM, speed, note, hr = 170) => ({ kind: 'canter', durationMinutes: min, distanceM, targetSpeedKmh: speed, targetHeartRateMax: hr, note });

/**
 * Ready-made sessions in parts — warm-up, the work, the breathers, cool-down and the walker — the way a
 * trainer writes a day on the board: a morning of about an hour and a half (07:30 → ~09:15), a light
 * afternoon of about forty minutes. `kind`: the session's kind (its hardest part); `short`: its name in
 * a list of the same kind. The trainer starts from one and changes it.
 */
export const WORKOUT_PRESETS = {
  trot: {
    kind: 'walk',
    label: 'Đi bộ + chạy kiệu',
    short: 'Chạy kiệu 2 hiệp',
    segments: [walkIn(), trot(20), breather(), trot(15, 'Chạy kiệu hiệp 2'), walkOut(15), walker(20)],
  },
  walk: {
    kind: 'walk',
    label: 'Đi bộ hồi sức',
    short: "Hồi sức 60'",
    segments: [{ kind: 'walk', durationMinutes: 20, targetSpeedKmh: 5, note: 'Dắt bộ giãn cơ' }, { kind: 'walk', durationMinutes: 25, targetSpeedKmh: 7, note: 'Đi bộ có người cưỡi' }, walker(15)],
  },
  afternoon_walk: {
    kind: 'walk',
    label: 'Đi bộ buổi chiều',
    short: "Đi bộ chiều 40'",
    segments: [{ kind: 'walk', durationMinutes: 20, targetSpeedKmh: 5, note: 'Dắt bộ giãn cơ' }, { kind: 'walk', durationMinutes: 20, targetSpeedKmh: 5, note: 'Máy đi bộ' }],
  },
  afternoon_trot: {
    kind: 'walk',
    label: 'Chạy kiệu nhẹ buổi chiều',
    short: "Chạy kiệu chiều 40'",
    segments: [walkIn(10), trot(15, 'Chạy kiệu nhẹ'), walkOut(15)],
  },
  canter: {
    kind: 'canter',
    label: 'Phi chậm 2 hiệp',
    short: 'Phi chậm 2 hiệp · 4 km',
    segments: [walkIn(), trot(15), canterPart(5, 2400, 32, 'Phi chậm hiệp 1'), breather(8), canterPart(3, 1600, 32, 'Phi chậm hiệp 2'), walkOut(), walker()],
  },
  canter_long: {
    kind: 'canter',
    label: 'Phi chậm dài',
    short: 'Phi chậm dài · 5,2 km',
    segments: [walkIn(), trot(20), canterPart(7, 3200, 30, 'Phi chậm dài, đều nhịp', 165), breather(8), canterPart(4, 2000, 33, 'Phi chậm hiệp 2'), walkOut(), walker()],
  },
  canter_easy: {
    kind: 'canter',
    label: 'Phi chậm nhẹ',
    short: 'Phi chậm nhẹ · 4 km',
    segments: [walkIn(), trot(15), canterPart(5, 2000, 28, 'Phi chậm nhẹ hiệp 1', 155), breather(), canterPart(4, 2000, 28, 'Phi chậm nhẹ hiệp 2', 155), walkOut(), walker(20)],
  },
  afternoon_canter: {
    kind: 'canter',
    label: 'Phi chậm nhẹ buổi chiều',
    short: "Phi chậm chiều 40'",
    segments: [walkIn(10), trot(10), canterPart(4, 1600, 28, 'Phi chậm nhẹ', 155), walkOut(15)],
  },
  hill: {
    kind: 'hill',
    label: 'Tập dốc 6 hiệp',
    short: '6 hiệp × 400 m',
    segments: [
      walkIn(),
      trot(15),
      canterPart(3, 1200, 30, 'Phi chậm làm nóng'),
      { kind: 'hill', durationMinutes: 25, distanceM: 2400, targetSpeedKmh: 30, targetHeartRateMax: 190, restMinutes: 3, note: '6 hiệp × 400 m lên dốc, đi bộ xuống nghỉ 3 phút' },
      walkOut(),
      walker(),
    ],
  },
  hill_short: {
    kind: 'hill',
    label: 'Tập dốc 4 hiệp + phi chậm',
    short: '4 hiệp + phi chậm',
    segments: [
      walkIn(),
      trot(15),
      { kind: 'hill', durationMinutes: 18, distanceM: 1600, targetSpeedKmh: 30, targetHeartRateMax: 185, restMinutes: 3, note: '4 hiệp × 400 m lên dốc' },
      breather(8),
      canterPart(4, 1600, 32, 'Phi chậm đều'),
      walkOut(),
      walker(25),
    ],
  },
  breeze: {
    kind: 'breeze',
    label: 'Phi nhanh 800 m',
    short: '800 m',
    segments: [
      walkIn(),
      trot(15),
      canterPart(4, 1600, 32, 'Phi chậm làm nóng'),
      breather(),
      { kind: 'breeze', durationMinutes: 1, distanceM: 800, targetSpeedKmh: 58, targetHeartRateMax: 215, note: 'Phi nhanh gần tốc độ đua' },
      walkOut(25),
      walker(),
    ],
  },
  breeze_short: {
    kind: 'breeze',
    label: 'Phi nhanh 2 × 400 m',
    short: '2 × 400 m',
    segments: [
      walkIn(),
      trot(15),
      canterPart(3, 1200, 30, 'Phi chậm làm nóng'),
      { kind: 'breeze', durationMinutes: 1, distanceM: 400, targetSpeedKmh: 55, targetHeartRateMax: 210, note: 'Phi nhanh hiệp 1' },
      breather(8),
      { kind: 'breeze', durationMinutes: 1, distanceM: 400, targetSpeedKmh: 56, targetHeartRateMax: 210, note: 'Phi nhanh hiệp 2' },
      walkOut(25),
      walker(25),
    ],
  },
  breeze_sharp: {
    kind: 'breeze',
    label: 'Phi nhanh ngắn giữ độ sắc',
    short: '600 m giữ độ sắc',
    segments: [
      walkIn(),
      trot(10),
      canterPart(3, 1200, 30, 'Phi chậm làm nóng'),
      { kind: 'breeze', durationMinutes: 1, distanceM: 600, targetSpeedKmh: 57, targetHeartRateMax: 212, note: 'Phi nhanh 600 m' },
      walkOut(),
      walker(20),
    ],
  },
};
// The ready-made sessions of each kind, the usual one first; the afternoon ones are light and short.
export const PRESETS_BY_KIND = {
  walk: ['trot', 'walk', 'afternoon_walk', 'afternoon_trot'],
  canter: ['canter', 'canter_long', 'canter_easy', 'afternoon_canter'],
  hill: ['hill', 'hill_short'],
  breeze: ['breeze', 'breeze_short', 'breeze_sharp'],
};
const AFTERNOON_PRESET = { walk: 'afternoon_walk', canter: 'afternoon_canter' };
/** The ready-made session a day of this kind starts with (the light, short one in the afternoon). */
export const defaultPreset = (kind, slot = 'morning') => (slot === 'afternoon' ? AFTERNOON_PRESET[kind] : null) || PRESETS_BY_KIND[kind]?.[0] || null;
/** A fresh copy of a ready-made workout's parts. */
export const presetSegments = (name) => (WORKOUT_PRESETS[name]?.segments || []).map((s) => ({ ...s }));
/** The ready-made session these parts are, by name, or null when the trainer changed them. */
export function presetOf(segments = []) {
  const key = (list) => JSON.stringify(list.map((x) => [x.kind, Number(x.durationMinutes) || 0, Number(x.distanceM) || 0, Number(x.targetSpeedKmh) || 0]));
  const mine = key(segments.filter((x) => x?.kind));
  return Object.keys(WORKOUT_PRESETS).find((name) => key(WORKOUT_PRESETS[name].segments) === mine) || null;
}

/** "07:30" plus some minutes, as a clock. */
export const addClock = (clock, minutes) => {
  const [h, m] = String(clock || '07:30').split(':').map(Number);
  const t = (((h * 60 + m + Math.round(minutes)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
/** Minutes of one part: its own, else its metres at its pace. */
export const partMinutes = (s) => {
  if (Number(s?.durationMinutes) > 0) return Number(s.durationMinutes);
  const speed = Number(s?.targetSpeedKmh) || SESSION_KINDS[s?.kind]?.prescription?.targetSpeedKmh || 30;
  return Number(s?.distanceM) > 0 ? Math.max(1, Math.round(Number(s.distanceM) / ((speed * 1000) / 60))) : 0;
};
/**
 * A session's parts on the clock from `start`: { parts: [{ at, end, minutes, part }], end }. The way the
 * groom and the rider read the morning: 07:30 đi bộ khởi động, 07:45 chạy kiệu, … xong 09:15.
 */
export function partsTimeline(segments = [], start = '07:30') {
  let t = 0;
  const parts = segments.filter((x) => x?.kind).map((part) => {
    const minutes = partMinutes(part);
    const at = addClock(start, t);
    t += minutes;
    return { at, end: addClock(start, t), minutes, part };
  });
  return { parts, end: addClock(start, t), minutes: t };
}

const KIND_RANK = { walk: 1, canter: 2, hill: 3, breeze: 4, trial: 5 };
/** A day in parts is as hard as its hardest part (the server sets the same). */
export const heaviestKind = (segments = []) =>
  segments.filter((s) => s?.kind).reduce((a, s) => (!a || KIND_RANK[s.kind] > KIND_RANK[a] ? s.kind : a), null);
/** Metres of one part: its distance, else its pace over its minutes. */
export const segmentMetres = (s) => {
  if (Number(s?.distanceM) > 0) return Number(s.distanceM);
  const speed = Number(s?.targetSpeedKmh) || SESSION_KINDS[s?.kind]?.prescription?.targetSpeedKmh || 0;
  return Math.round(((speed * 1000) / 60) * (Number(s?.durationMinutes) || 0));
};
/** { minutes, metres } of a workout in parts (a part's minutes include its rests, as the server sums them). */
export const segmentsTotals = (segments = []) =>
  segments
    .filter((s) => s?.kind)
    .reduce((t, s) => ({ minutes: t.minutes + (Number(s.durationMinutes) || 0), metres: t.metres + segmentMetres(s) }), { minutes: 0, metres: 0 });
/** "Đi bộ 10' → Tập dốc 2400 m → Đi bộ 15'": the parts in a line. */
export const segmentsLine = (segments = []) =>
  segments
    .filter((s) => s?.kind)
    .map((s) => `${s.note && s.kind === 'walk' && /kiệu/i.test(s.note) ? 'Chạy kiệu' : SESSION_KINDS[s.kind]?.short || s.kind}${s.distanceM ? ` ${s.distanceM} m` : s.durationMinutes ? ` ${s.durationMinutes}'` : ''}`)
    .join(' → ');

const DAY_MS = 24 * 60 * 60 * 1000;
const PHASE_ORDER = { base_building: 0, strength: 1, speed: 2, peak: 3, recovery: 4 };
const ddmmOf = (d) => {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
};

// The end of a plan for a race (server constants/training.js): the build-up ends with the timed trial
// TRIAL_DAYS_BEFORE_RACE before race day, then RECOVERY_DAYS_BEFORE_RACE of light work, and the plan is
// done PRE_RACE_DAYS before the race — those days are for rest, the vet's pre-race check and the trip.
export const PRE_RACE_DAYS = 3;
export const RECOVERY_DAYS_BEFORE_RACE = 4;
export const TRIAL_DAYS_BEFORE_RACE = PRE_RACE_DAYS + RECOVERY_DAYS_BEFORE_RACE + 1;
// The least time a race can be prepared for, by its distance (server constants/training.js minPrepFor):
// weeks of build-up, then recovery, the days before the race and up to a week before the plan starts.
const MIN_BUILD_UP_WEEKS = [
  { upTo: 1200, weeks: 6, label: 'nước rút' },
  { upTo: 2000, weeks: 7, label: 'trung bình' },
  { upTo: Infinity, weeks: 8, label: 'đường dài' },
];
const PLAN_START_DAYS = 7;
const MAX_TAPER_WEEKS = 2;
/** What a race of this distance needs: { weeks (build-up), prepDays, days, label }. */
export function minPrepFor(distance) {
  const band = MIN_BUILD_UP_WEEKS.find((b) => (Number(distance) || 1600) <= b.upTo);
  const prepDays = RECOVERY_DAYS_BEFORE_RACE + PRE_RACE_DAYS + PLAN_START_DAYS;
  return { weeks: band.weeks, label: band.label, prepDays, days: band.weeks * 7 + prepDays };
}
/** The earliest race day a horse can be entered for today, for a race of this distance (a Date at midnight). */
export function earliestRaceDate(distance, today = new Date()) {
  return new Date(new Date(today).setHours(0, 0, 0, 0) + minPrepFor(distance).days * 24 * 60 * 60 * 1000);
}
const midnightOf = (d) => new Date(d).setHours(0, 0, 0, 0);

// How the weeks before a race are shared out by its distance (server constants/training.js SHARE_BY_DISTANCE).
const RACE_SHARES = [
  { upTo: 1200, share: { base_building: 0.3, strength: 0.25, speed: 0.3, peak: 0.15 } },
  { upTo: 2000, share: { base_building: 0.35, strength: 0.25, speed: 0.25, peak: 0.15 } },
  { upTo: Infinity, share: { base_building: 0.45, strength: 0.25, speed: 0.15, peak: 0.15 } },
];
const BUILD_UP_KEYS = ['base_building', 'strength', 'speed', 'peak'];

/**
 * The phases for a race, as the server suggests them (constants/training.js suggestPhases): the days
 * from the start to the trial in whole weeks, shared out by the distance (at least one each, the
 * earliest dropped when time is short), the odd days on the taper; then RECOVERY_DAYS_BEFORE_RACE of
 * recovery, done PRE_RACE_DAYS before race day. [{ key, weeks, extraDays }]
 */
export function racePhaseWeeks(startDate, raceDate, distance) {
  const share = RACE_SHARES.find((b) => (distance || 1600) <= b.upTo).share;
  const days = Math.max(1, Math.round((midnightOf(raceDate) - midnightOf(startDate)) / DAY_MS) - PRE_RACE_DAYS - RECOVERY_DAYS_BEFORE_RACE);
  const total = Math.max(1, Math.floor(days / 7));
  const keys = BUILD_UP_KEYS.slice(Math.max(0, BUILD_UP_KEYS.length - total));
  const weeks = keys.map((k) => Math.max(1, Math.round(total * share[k])));
  // A long build-up keeps the taper short: what it would take beyond MAX_TAPER_WEEKS goes to the base.
  const taper = keys.indexOf('peak');
  if (taper > 0 && weeks[taper] > MAX_TAPER_WEEKS) {
    weeks[0] += weeks[taper] - MAX_TAPER_WEEKS;
    weeks[taper] = MAX_TAPER_WEEKS;
  }
  let diff = total - weeks.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const order = weeks.map((w, i) => i).sort((a, b) => weeks[b] - weeks[a]);
    const i = diff > 0 ? order[0] : order.find((j) => weeks[j] > 1);
    if (i === undefined) break;
    weeks[i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  const extra = days - total * 7;
  return [
    ...keys.map((key, i) => ({ key, weeks: weeks[i], extraDays: i === keys.length - 1 ? extra : 0 })),
    { key: 'recovery', weeks: 1, extraDays: RECOVERY_DAYS_BEFORE_RACE - 7 },
  ];
}

/** The phases laid end to end from the start date, each its weeks plus any days added or taken off. */
export function layPhases(startDate, phases) {
  const first = new Date(startDate);
  first.setHours(0, 0, 0, 0);
  let cursor = first.getTime();
  return phases.map((p) => {
    const start = new Date(cursor);
    cursor += Math.max(1, (Number(p.weeks) || 0) * 7 + (Number(p.extraDays) || 0)) * DAY_MS;
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
    out.push({ level: 'error', text: `Giai đoạn Hồi phục phải đứng cuối kế hoạch${raceDate ? ', ngay trước ngày đua' : ''}.` });
  }
  if (raceDate) {
    const race = new Date(raceDate);
    const daysLeft = Math.ceil((race - new Date(startDate)) / DAY_MS);
    // Light work after the trial, before the race.
    const recoveryDays = laid.filter((p) => p.key === 'recovery').reduce((n, p) => n + Math.round((p.end - p.start + 1) / DAY_MS), 0);
    if (!recoveryDays) {
      out.push({ level: 'warning', text: `Chưa có giai đoạn Hồi phục trước giải — nên cho ngựa tập nhẹ khoảng ${RECOVERY_DAYS_BEFORE_RACE} ngày sau buổi chạy thử rồi mới đi thi đấu.` });
    } else if (recoveryDays > 10) {
      out.push({ level: 'warning', text: `Hồi phục trước giải ${recoveryDays} ngày là dài — ngựa dễ xuống phong độ; thường ${RECOVERY_DAYS_BEFORE_RACE}–7 ngày.` });
    }
    // The days left free between the plan's last day and race day.
    const lastDay = laid[laid.length - 1].end;
    const free = Math.round((midnightOf(race) - midnightOf(lastDay)) / DAY_MS) - 1;
    if (free < PRE_RACE_DAYS) {
      const cut = PRE_RACE_DAYS - free;
      out.push({
        level: 'error',
        text: `Kế hoạch kéo dài tới ${ddmmOf(lastDay)}${free < 0 ? `, qua cả ngày đua ${ddmmOf(race)}` : `, chỉ còn ${free} ngày trước ngày đua ${ddmmOf(race)}`} — kế hoạch phải xong trước ngày đua ít nhất ${PRE_RACE_DAYS} ngày để ngựa nghỉ, khám trước giải và di chuyển. Bớt ${cut} ngày (giảm số tuần một giai đoạn).`,
      });
    } else if (free > 7) {
      out.push({ level: 'warning', text: `Kế hoạch xong ${ddmmOf(lastDay)}, còn ${free} ngày mới tới ngày đua ${ddmmOf(race)} — ngựa dễ xuống phong độ và không kịp chạy thử trước giải; thêm tuần cho các giai đoạn.` });
    }
    if (buildUp.length && buildUp[buildUp.length - 1].key !== 'peak') {
      out.push({ level: 'warning', text: `Giai đoạn cuối trước giải là ${PHASE_LABELS[buildUp[buildUp.length - 1].key]} — thường kết thúc bằng Giảm tải để ngựa sung sức vào ngày đua.` });
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

const FORM_TRIAL_WORDS = { passed: 'chạy thử đạt', ran: 'đã chạy thử', failed: 'chạy thử chưa đạt', missing: 'chưa chạy thử' };

/** "Tập 9/10 buổi đến hạn · đạt 8/9 · ĐTB 7.5/10 · chạy thử 22/11": numbers behind race-form verdict. */
export function formFigures(form) {
  if (!form) return '';
  const parts = [`Tập ${form.done}/${form.due} buổi đến hạn`];
  if (form.rated) parts.push(`đạt chỉ tiêu ${form.met}/${form.rated}`);
  if (form.avgRating != null) parts.push(`ĐTB ${form.avgRating}/10`);
  if (form.trial === 'ahead') parts.push(`chạy thử ${ddmmOf(form.trialDay)}`);
  else if (form.trial) parts.push(FORM_TRIAL_WORDS[form.trial]);
  return parts.join(' · ');
}
