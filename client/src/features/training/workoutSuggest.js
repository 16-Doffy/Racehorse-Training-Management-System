/**
 * The workout to book, worked out from what the trainer picked (a kind of work, or a purpose) and from the
 * horse: its age, the vet's word on it, the stage of its plan and what it did in the last days. Every number
 * stays editable in the form; `notes` say why each one moved away from the kind's usual workout, so the
 * trainer can see and judge the suggestion rather than take it on trust.
 */
import dayjs from 'dayjs';
import { INTENSITY_RANK, LEVEL_RANK } from '../../constants/health';
import { KIND_SPEED_RANGES, PRESCRIPTION_LIMITS, SESSION_KINDS } from './trainingVocab';

// The kinds of work that serve each purpose, the most fitting first.
export const OBJECTIVE_KINDS = {
  endurance: ['canter', 'hill'],
  speed: ['breeze'],
  interval: ['canter', 'hill', 'breeze'],
  recovery: ['walk'],
  technique: ['canter', 'walk'],
  race_simulation: ['trial'],
};

// A kind's workout shaped for a purpose other than its own (its own is SESSION_KINDS[kind]).
const SHAPES = {
  'canter:interval': { intensity: 'high', prescription: { distanceM: 600, reps: 4, restMinutes: 4, targetSpeedKmh: 42, targetHeartRateMax: 195 } },
  'canter:technique': { intensity: 'moderate', prescription: { distanceM: 1000, reps: 3, restMinutes: 5, targetSpeedKmh: 30, targetHeartRateMax: 160 } },
  'hill:interval': { intensity: 'high', prescription: { distanceM: 300, reps: 8, restMinutes: 2, targetSpeedKmh: 32, targetHeartRateMax: 200 } },
  'breeze:interval': { intensity: 'high', prescription: { distanceM: 400, reps: 3, restMinutes: 6, targetSpeedKmh: 54, targetHeartRateMax: 210 } },
  'walk:technique': { intensity: 'light', prescription: { distanceM: 3000, reps: 1, targetSpeedKmh: 10, targetHeartRateMax: 110, durationMinutes: 30 } },
};

const DONE = ['completed', 'evaluated'];
const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));
const round100 = (m) => Math.round(m / 100) * 100;

export function ageOf(dob, at = new Date()) {
  if (!dob) return null;
  const d = dayjs(dob);
  return d.isValid() ? dayjs(at).diff(d, 'year') : null;
}

/** Whether a kind's own work fits the vet's clearance (the kind is the work: a canter is moderate however it is labelled). */
export const kindAllowed = (clearance, kind) => !clearance?.restricted || (INTENSITY_RANK[SESSION_KINDS[kind]?.intensity] || 0) <= LEVEL_RANK[clearance.level ?? 'high'];

/** The kind to run for a purpose: the current one if it serves it, else the first that does and is allowed. */
export function kindForObjective(objective, currentKind, clearance) {
  const kinds = OBJECTIVE_KINDS[objective] || [];
  if (currentKind && kinds.includes(currentKind) && kindAllowed(clearance, currentKind)) return currentKind;
  return kinds.find((k) => kindAllowed(clearance, k)) || null;
}

/** The phase of a plan running on a date (its own dates; else the one the plan is at now). */
export function phaseOn(plan, at) {
  const phases = plan?.phases || [];
  if (!phases.length) return null;
  if (at) {
    const day = dayjs(at);
    const hit = phases.find((p) => p.startDate && p.endDate && !day.isBefore(dayjs(p.startDate), 'day') && !day.isAfter(dayjs(p.endDate), 'day'));
    if (hit) return hit;
  }
  return phases[plan.progress?.phaseIndex ?? 0] || null;
}

/** What the plan's normal week has on that day and part of the day (morning before noon). */
export function templateDayOn(phase, at) {
  if (!phase?.week?.length || !at) return null;
  const d = dayjs(at);
  const slot = d.hour() < 12 ? 'morning' : 'afternoon';
  const days = phase.week.filter((w) => w.day === d.day());
  return days.find((w) => (w.slot || 'morning') === slot) || null;
}

/** The horse's finished sessions before `at`, newest first. */
export function recentDone(sessions, horseId, at) {
  const before = at ? dayjs(at) : dayjs();
  return (sessions || [])
    .filter((s) => String(s.horse?._id || s.horse) === String(horseId) && DONE.includes(s.status))
    .map((s) => ({ ...s, ranAt: s.actualStartAt || s.scheduledAt }))
    .filter((s) => dayjs(s.ranAt).isBefore(before))
    .sort((a, b) => new Date(b.ranAt) - new Date(a.ranAt));
}

/**
 * The workout for `kind` and `objective`, fitted to the horse.
 * @returns {{ kind, objective, intensity, sessionType, prescription, notes: {text, tone}[] }}
 */
export function suggestWorkout({ kind, objective, horse, clearance, phase, templateDay, race, recent = [], at }) {
  const base = SESSION_KINDS[kind];
  if (!base) return null;
  const shape = objective && objective !== base.objective ? SHAPES[`${kind}:${objective}`] : null;
  // Every field is set, so what a previous kind left (rest between reps…) does not stay behind.
  const rx = { distanceM: undefined, reps: 1, restMinutes: undefined, targetSpeedKmh: undefined, targetHeartRateMax: undefined, durationMinutes: undefined, ...base.prescription, ...(shape?.prescription || {}) };
  let intensity = shape?.intensity || base.intensity;
  const notes = [];
  const note = (text, tone = 'info') => notes.push({ text, tone });

  // The plan's week for this day, when it has this kind of work: its numbers first.
  if (templateDay && templateDay.kind === kind && !shape) {
    const own = ['distanceM', 'reps', 'targetSpeedKmh', 'targetHeartRateMax'].filter((f) => templateDay[f]);
    own.forEach((f) => {
      rx[f] = templateDay[f];
    });
    note(`Theo lịch tuần của kế hoạch${own.length ? '' : ' (bài mặc định)'}`);
  }
  // A trial is run over its race's distance.
  if (kind === 'trial' && race?.distance) {
    rx.distanceM = race.distance;
    note(`Cự ly bằng cự ly giải ${race.raceName || ''} (${race.distance} m)`.replace('  ', ' '));
  }

  let volume = 1; // the share of the usual volume (distance, reps, time)
  let pace = 1; // the share of the usual speed
  let hrCut = 0; // bpm under the usual heart-rate ceiling
  let restPlus = 0;

  const age = ageOf(horse?.dob, at);
  if (age !== null && age < 3) {
    volume *= 0.85;
    hrCut += 5;
    note(`Ngựa non ${age} tuổi: bớt 15% khối lượng, trần nhịp tim thấp hơn 5 bpm`);
  } else if (age !== null && age >= 12) {
    volume *= 0.9;
    restPlus += 1;
    note(`Ngựa ${age} tuổi: bớt 10% khối lượng, nghỉ giữa hiệp thêm 1 phút`);
  }

  if (horse?.healthStatus === 'monitoring') {
    volume *= 0.8;
    pace *= 0.95;
    hrCut += 10;
    note('Bác sĩ đang theo dõi: bớt 20% khối lượng, chậm hơn 5%, trần nhịp tim thấp hơn 10 bpm', 'warning');
  }
  if (clearance?.restricted) {
    const cap = LEVEL_RANK[clearance.level ?? 'high'];
    if ((INTENSITY_RANK[intensity] || 0) > cap) {
      intensity = Object.keys(INTENSITY_RANK).filter((i) => INTENSITY_RANK[i] <= cap && INTENSITY_RANK[i] >= (INTENSITY_RANK[base.intensity] || 0)).pop() || intensity;
    }
    if (clearance.level === 'moderate') rx.targetHeartRateMax = Math.min(rx.targetHeartRateMax || 180, 180);
    note(`Bác sĩ chỉ cho ${String(clearance.label || 'tập hạn chế').toLowerCase()}: giữ cường độ trong mức cho phép`, 'warning');
  }

  if (phase?.key === 'peak' && kind !== 'trial') {
    volume *= 0.75;
    note('Giai đoạn giảm tải trước giải: bớt 25% khối lượng, giữ tốc độ');
  } else if (phase?.key === 'recovery' && kind !== 'walk') {
    volume *= 0.8;
    pace *= 0.95;
    note('Giai đoạn hồi phục: bớt 20% khối lượng, chậm hơn 5%');
  }

  // What the horse did lately.
  const when = at ? dayjs(at) : dayjs();
  const last = recent[0];
  const lastHard = recent.find((s) => s.intensity === 'high');
  if (lastHard && intensity === 'high' && when.diff(dayjs(lastHard.ranAt), 'hour') < 48) {
    volume *= 0.8;
    note(`Đã có buổi nặng lúc ${dayjs(lastHard.ranAt).format('HH:mm DD/MM')} (chưa đủ 48 giờ): bớt 20% khối lượng`, 'warning');
  }
  if (last) {
    const idle = when.diff(dayjs(last.ranAt), 'day');
    if (idle >= 7 && kind !== 'walk') {
      volume *= 0.85;
      note(`Đã nghỉ ${idle} ngày: bớt 15% để ngựa vào lại nhịp`);
    }
  }
  const rated = recent.find((s) => s.performanceRating);
  if (rated && rated.performanceRating <= 4) {
    volume *= 0.9;
    note(`Buổi gần nhất chỉ đạt ${rated.performanceRating}/10: bớt 10% khối lượng`, 'warning');
  } else if (rated && rated.performanceRating >= 9 && !clearance?.restricted && horse?.healthStatus !== 'monitoring' && !['peak', 'recovery'].includes(phase?.key) && kind !== 'trial') {
    volume *= 1.1;
    note(`Buổi gần nhất đạt ${rated.performanceRating}/10: thêm 10% khối lượng`, 'success');
  }

  // Volume: fewer reps when there are several, else a shorter distance; a timed walk is shorter too.
  if (Math.abs(volume - 1) > 0.001 && kind !== 'trial') {
    if ((rx.reps || 1) > 1) rx.reps = clamp(Math.round(rx.reps * volume), PRESCRIPTION_LIMITS.reps);
    else if (rx.distanceM) rx.distanceM = clamp(round100(rx.distanceM * volume), PRESCRIPTION_LIMITS.distanceM);
    if (rx.durationMinutes) rx.durationMinutes = clamp(Math.round(rx.durationMinutes * volume), PRESCRIPTION_LIMITS.durationMinutes);
  }
  if (pace !== 1 && rx.targetSpeedKmh) rx.targetSpeedKmh = clamp(Math.round(rx.targetSpeedKmh * pace), KIND_SPEED_RANGES[kind] || PRESCRIPTION_LIMITS.targetSpeedKmh);
  if (hrCut && rx.targetHeartRateMax) rx.targetHeartRateMax = clamp(rx.targetHeartRateMax - hrCut, PRESCRIPTION_LIMITS.targetHeartRateMax);
  if (restPlus && rx.reps > 1) rx.restMinutes = clamp((rx.restMinutes || 0) + restPlus, PRESCRIPTION_LIMITS.restMinutes);

  return {
    kind,
    objective: shape || objective === base.objective ? objective : base.objective,
    intensity,
    sessionType: base.sessionType,
    prescription: rx,
    notes,
  };
}

/** A short brief for the rider, from the workout: what to do, how fast, the heart-rate ceiling. */
export function coachNoteFor({ kind, prescription: p, horse }) {
  const k = SESSION_KINDS[kind];
  if (!k || !p) return '';
  const parts = [];
  if (kind !== 'walk') parts.push('Khởi động đi bộ 10 phút');
  const work = p.reps > 1 ? `${p.reps} hiệp × ${p.distanceM} m${p.restMinutes ? `, nghỉ ${p.restMinutes}' giữa hiệp` : ''}` : p.distanceM ? `${p.distanceM} m` : '';
  parts.push(`${k.short || k.label} ${work}${p.targetSpeedKmh ? ` ở ~${p.targetSpeedKmh} km/h` : ''}`.trim());
  if (p.targetHeartRateMax) parts.push(`giữ nhịp tim ≤ ${p.targetHeartRateMax} bpm`);
  if (kind !== 'walk') parts.push('thả lỏng 10 phút cuối buổi');
  let text = `${parts.join('; ')}.`;
  if (horse?.healthStatus === 'monitoring') text += ' Ngựa đang được bác sĩ theo dõi — thấy bất thường thì dừng ngay và báo bác sĩ.';
  return text.charAt(0).toUpperCase() + text.slice(1);
}
