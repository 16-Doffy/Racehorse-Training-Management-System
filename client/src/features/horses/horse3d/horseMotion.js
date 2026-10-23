/**
 * The horse that moves (client/public/models/horse-animated.glb, made by
 * tools/horse-model/prepare-animated.mjs) and what it does: its gait at a speed, the workout of a
 * session kind, a running session as the sensors report it, a horse at rest by its health.
 *
 * Its clips run on the spot (the horse gallops in place); the track under it scrolls with the speed
 * (MovingHorse3D). Each motion is { clip, timeScale, label, kmh, tilt, then?, tone? }: `then` is the
 * clip that follows a clip played once, `tilt` the slope in degrees (uphill work).
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

// How fast each clip carries a horse at normal speed (km/h), so it is played at the horse's own pace.
const WALK_KMH = 6;
const GALLOP_KMH = 48;
// Uphill work is shown on a slope this steep.
export const HILL_TILT = 12;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The gait at a speed: standing, walk, trot, canter, gallop (the clip played faster or slower). */
export function gaitAt(kmh) {
  const v = Number(kmh) || 0;
  if (v < 1) return { clip: 'Idle', timeScale: 1, label: 'Đứng yên', kmh: 0 };
  if (v < 9) return { clip: 'Walk', timeScale: clamp(v / WALK_KMH, 0.6, 1.5), label: 'Đi bộ', kmh: v };
  if (v < 20) return { clip: 'Walk', timeScale: clamp((v / WALK_KMH) * 0.75, 1.5, 2.4), label: 'Chạy kiệu', kmh: v };
  if (v < 45) return { clip: 'Gallop', timeScale: clamp(v / GALLOP_KMH, 0.55, 0.95), label: 'Phi chậm', kmh: v };
  return { clip: 'Gallop', timeScale: clamp(v / GALLOP_KMH, 0.95, 1.35), label: 'Phi nước đại', kmh: v };
}

/** The workout of a session kind (trainingVocab SESSION_KINDS), at its usual speed or the one given. */
export const KIND_SPEEDS = { walk: 10, canter: 35, hill: 30, breeze: 58, trial: 60 };
export function motionOfKind(kind, kmh) {
  const motion = gaitAt(kmh ?? KIND_SPEEDS[kind] ?? 0);
  return kind === 'hill' ? { ...motion, tilt: HILL_TILT, label: `${motion.label} lên dốc` } : motion;
}

/**
 * A running session as the sensors report it: the gait of the latest speed, on a slope for hill
 * work, tiring when the "tired" scenario plays. `stopped`: the feed stopped the run as a suspected
 * injury — the horse pulls up and stands, head low.
 */
export function liveMotion(session, speed, { stopped = false } = {}) {
  if (stopped) return { clip: 'Run_Stop', then: 'Idle_Look', timeScale: 1, label: 'Nghi chấn thương: đã dừng', kmh: 0, tone: 'alert' };
  const motion = motionOfKind(session?.kind, speed ?? 0);
  if (session?.simScenario === 'tired' && motion.kmh) return { ...motion, label: `${motion.label} · đang đuối sức`, tone: 'warn' };
  if (session?.simScenario === 'injury' && motion.kmh) return { ...motion, label: `${motion.label} · bước hụt, nghi đau chân`, tone: 'alert' };
  return motion;
}

/**
 * A horse at rest by what the vet says: locked or injured, it stands still in its stall; recovering
 * at a lower level, it is walked; fit, it grazes. `clearance` is the server's trainingClearance.
 */
export function restingMotion(horse) {
  const level = horse?.trainingClearance?.level;
  if (level === 'none' || ['injured', 'quarantined'].includes(horse?.healthStatus)) {
    return { clip: 'Sleep', timeScale: 0.8, label: horse?.healthStatus === 'injured' ? 'Đang chấn thương · nghỉ tại chuồng' : 'Bác sĩ khóa tập · nghỉ tại chuồng', kmh: 0, tone: 'alert' };
  }
  if (horse?.trainingClearance?.restricted) return { ...gaitAt(5), label: 'Đang hồi phục · chỉ đi bộ nhẹ', tone: 'warn' };
  return { clip: 'Eat', timeScale: 1, label: 'Khỏe · thư giãn gặm cỏ', kmh: 0 };
}
