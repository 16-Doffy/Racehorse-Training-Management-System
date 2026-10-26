/**
 * The horse that moves (client/public/models/horse-animated.glb, made by
 * tools/horse-model/prepare-animated.mjs) and what it does: its gait at a speed, the workout of a
 * session kind, a running session as the sensors report it, a horse at rest by its health.
 *
 * Its clips run on the spot (the horse gallops in place); the track under it scrolls with the speed
 * (horseStage.js). Each motion is { clip, timeScale, label, kmh, tilt, then?, tone?, limp?, hold?,
 * leg?, marker?, markAt?, tired?, course? }: `then` is the clip that follows a clip played once, `tilt`
 * the slope in degrees (uphill work); `limp`, `hold`, `marker` and `tired` bend the bones on top of the
 * clip, on `leg` (RF, LF, RH, LH) or marking the body region `markAt`; `course` { remaining, finishIn }
 * is a trial's distance left and, once the next reading ends it, in how many seconds: the stage sets
 * the finish post where the horse will be by then.
 */
export const MOVING_HORSE = {
  src: `${import.meta.env.BASE_URL}models/horse-animated.glb`,
  // Its coat and mane textures are neutral grey: each horse's coat is painted on (horseBreeds.js).
  coatMaterials: { body: 'Horse', hair: 'Hair' },
  // Side on, head to the right: the legs read best. The turntable view is the one the still horse uses.
  sideOrbit: '-90deg 80deg 118%',
  turntableOrbit: '-60deg 76deg 115%',
  // Shown under the viewer, as the model's licence (CC BY 4.0) requires, with what was changed.
  credit: 'Mô hình 3D chuyển động: “Horse” · henrysteve973 (Sketchfab) · CC BY 4.0 · đã đổi lông sang xám để tô màu, lược bớt chuyển động',
};
// The pasture's tree and house (horseStage.js), shown under the stage when the horse is in the pasture,
// as their licence (CC BY 4.0) requires: short to fit under a card, in full on hover.
export const PASTURE_CREDIT = {
  short: 'Cây: atrodler · Nhà: BoredPain666 (Sketchfab, CC BY 4.0)',
  full: 'Cây: “Maple tree” · atrodler (Sketchfab) · CC BY 4.0 · đã gộp các mảnh. Nhà: “Farm House” · BoredPain666 (Sketchfab) · CC BY 4.0 · đã giảm texture',
};

// How fast each clip carries a horse at normal speed (km/h), so it is played at the horse's own pace.
const WALK_KMH = 6;
const TROT_KMH = 13;
const GALLOP_KMH = 48;
// Uphill work is shown on a slope this steep.
export const HILL_TILT = 12;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The gait at a speed: standing, walk, trot, canter, gallop (the clip played faster or slower). */
export function gaitAt(kmh) {
  const v = Number(kmh) || 0;
  if (v < 1) return { clip: 'Idle', timeScale: 1, label: 'Đứng yên', kmh: 0 };
  if (v < 9) return { clip: 'Walk', timeScale: clamp(v / WALK_KMH, 0.6, 1.5), label: 'Đi bộ', kmh: v };
  if (v < 20) return { clip: 'Trot', timeScale: clamp(v / TROT_KMH, 0.9, 1.6), label: 'Chạy kiệu', kmh: v };
  if (v < 45) return { clip: 'Gallop', timeScale: clamp(v / GALLOP_KMH, 0.55, 0.95), label: 'Phi chậm', kmh: v };
  return { clip: 'Gallop', timeScale: clamp(v / GALLOP_KMH, 0.95, 1.35), label: 'Phi nước đại', kmh: v };
}

/**
 * The workout of a session kind (trainingVocab SESSION_KINDS), at its usual speed or the one given:
 * hill work on a slope, a trial on a marked course.
 */
export const KIND_SPEEDS = { walk: 10, canter: 35, hill: 30, breeze: 58, trial: 60 };
export function motionOfKind(kind, kmh) {
  const motion = gaitAt(kmh ?? KIND_SPEEDS[kind] ?? 0);
  if (kind === 'hill') return { ...motion, tilt: HILL_TILT, label: `${motion.label} lên dốc` };
  return kind === 'trial' ? { ...motion, course: {} } : motion;
}

// The legs as the server names them (TrainingSession.simLeg, HealthRecord.lamenessLimb) and as the stage does.
export const LEG_OF = { fore_left: 'LF', fore_right: 'RF', hind_left: 'LH', hind_right: 'RH' };
const LEG_WORDS = { LF: 'chân trước trái', RF: 'chân trước phải', LH: 'chân sau trái', RH: 'chân sau phải' };

/**
 * A running session as the sensors report it: the gait of the latest speed, on a slope for hill
 * work, tiring when the "tired" scenario plays, lame on the leg the trainer picked (simLeg).
 * `stopped`: the feed stopped the run as a suspected injury — the horse stops and holds up the sore
 * leg. A trial: `remaining` metres left, `step` the metres the last reading added; when the next
 * reading (`finishIn` seconds away — the feed sends one every 5 s) will end the run, its finish post.
 */
export function liveMotion(session, speed, { stopped = false, remaining, step, finishIn = 5 } = {}) {
  const leg = LEG_OF[session?.simLeg] || 'RF';
  // Standing with the sore leg off the ground, marked (no rearing pull-up: a lame horse just stops).
  if (stopped) return { clip: 'Idle', timeScale: 1, hold: true, leg, marker: true, label: `Nghi chấn thương: đã dừng, ${LEG_WORDS[leg]} không chịu lực`, kmh: 0, tone: 'alert' };
  const motion = motionOfKind(session?.kind, speed ?? 0);
  if (session?.kind === 'trial' && motion.kmh) {
    motion.course = { remaining, finishIn: remaining != null && step > 0 && remaining <= step ? finishIn : null };
    if (remaining != null) motion.label = `Chạy thử, còn ${Math.max(0, Math.round(remaining))} m`;
  }
  if (session?.simScenario === 'tired' && motion.kmh) return { ...motion, tired: true, label: `${motion.label}, đang đuối sức`, tone: 'warn' };
  // Lame: a short, stiff stride on the sore leg, the head nodding as it lands, whatever the speed.
  if (session?.simScenario === 'injury' && motion.kmh) {
    return { clip: 'Walk', timeScale: clamp(motion.kmh / 10, 0.8, 1.3), limp: true, leg, marker: true, label: `Khập khiễng, nghi đau ${LEG_WORDS[leg]}`, kmh: motion.kmh, tilt: motion.tilt, tone: 'alert' };
  }
  return motion;
}

// The vet's body regions (horseRegions.js regionAt) that are not legs, by where the stage marks them.
const REGION_MARKS = [
  [/đầu|mắt|mõm|má|hàm|não|họng/, 'head'],
  [/cổ|bờm|khí quản/, 'neck'],
  [/lưng|thăn|u vai|cột sống/, 'back'],
  [/vai/, 'shoulder'],
  [/ngực|tim|phổi/, 'chest'],
  [/sườn|bụng|hông|dạ dày|gan|ruột|lách|thận|bàng quang/, 'belly'],
  [/mông|đuôi|chậu/, 'croup'],
];

/**
 * Where an injury is, from the vet's own record: the newest open injury mark (its body part, as the
 * vet's 3D map names it: "Khớp cổ chân trước trái"…), else the lame leg of the newest exam
 * (HealthRecord.clinical.lamenessLimb). Returns { leg } for a leg or { markAt } for another part of
 * the body, with `label` in the vet's words; or null.
 */
export function injuryFrom({ markers = [], records = [] } = {}) {
  const open = markers.filter((m) => m.recoveryStatus !== 'recovered').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (open?.bodyPart) {
    const text = open.bodyPart.split(' (')[0].trim();
    const t = text.toLowerCase();
    if (/móng|cổ chân|ống chân|khớp gối|cẳng tay|khuỷu|bắp chân|đùi|chân trước|chân sau/.test(t)) {
      const hind = t.includes('sau') || t.includes('đùi') || t.includes('bắp chân');
      return { leg: `${t.includes('trái') ? 'L' : 'R'}${hind ? 'H' : 'F'}`, label: t };
    }
    const region = REGION_MARKS.find(([pattern]) => pattern.test(t));
    return { markAt: region ? region[1] : 'back', label: t };
  }
  const exam = [...records].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.clinical;
  const limb = exam?.lamenessGrade > 0 && LEG_OF[exam.lamenessLimb];
  return limb ? { leg: limb, label: LEG_WORDS[limb] } : null;
}

/** The hour of the day in Vietnam (0–24) of a time, whatever the viewer's clock says; null without one. */
export function hourOf(date) {
  const t = date ? new Date(date).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 7 * 3600 * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** The track surface of a plan on a day: that day's phase's, else the plan's (trainingVocab SURFACE_LABELS). */
export function surfaceOf(plan, date = new Date()) {
  if (!plan) return 'dirt';
  const t = new Date(date).getTime();
  const phase = (plan.phases || []).find((p) => new Date(p.startDate).getTime() <= t && t <= new Date(p.endDate).getTime() + 86400000);
  return phase?.surface || plan.surface || 'dirt';
}

/**
 * A horse at rest by what the vet says (`horse.trainingClearance`, the server's): locked or injured, it
 * stands resting, the sore leg held up and marked when the vet's record says where (`injury`, from
 * injuryFrom); recovering at a lower level, it is walked, still favouring that leg; fit, it grazes.
 */
export function restingMotion(horse, injury = null) {
  const level = horse?.trainingClearance?.level;
  const where = injury ? { leg: injury.leg, markAt: injury.markAt, marker: true } : {};
  if (level === 'none' || ['injured', 'quarantined'].includes(horse?.healthStatus)) {
    if (injury) return { clip: 'Idle', timeScale: 0.8, ...where, hold: Boolean(injury.leg), label: `Chấn thương ${injury.label}, nghỉ không tập`, kmh: 0, tone: 'alert' };
    return { clip: 'Sleep', timeScale: 0.8, label: horse?.healthStatus === 'injured' ? 'Đang chấn thương, nghỉ không tập' : 'Bác sĩ khóa tập, đang nghỉ', kmh: 0, tone: 'alert' };
  }
  if (horse?.trainingClearance?.restricted) {
    return { ...gaitAt(5), ...where, limp: Boolean(injury?.leg), label: injury ? `Đang hồi phục ${injury.label}, chỉ đi bộ nhẹ` : 'Đang hồi phục · chỉ đi bộ nhẹ', tone: 'warn' };
  }
  return { clip: 'Eat', timeScale: 1, label: 'Khỏe · thư giãn gặm cỏ', kmh: 0 };
}
