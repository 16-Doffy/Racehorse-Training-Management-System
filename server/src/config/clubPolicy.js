/**
 * The club's own rules for training and care. They are club policy, not veterinary law: each can be
 * set per deployment through the environment, and the screens word them as "theo quy định CLB".
 * The defaults follow common practice (a horse is not galloped on a full stomach of grain, light work
 * is in the afternoon, a fever means no training) without claiming one number fits every horse.
 *
 * GET /settings/policy hands the same values to the screens, so the wording there never drifts.
 */
const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const flag = (name, fallback) => {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(v).trim().toLowerCase());
};
const clock = (name, fallback) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(process.env[name] || '') ? process.env[name] : fallback);

const clubPolicy = Object.freeze({
  // After a meal with grain/pellets: no hard work under `digestHardMinutes` (blocked), a warning
  // under `digestMinutes`. A meal of forage only (hay) only warns under `forageDigestMinutes`.
  // Light work (walking) is never blocked by a meal, only warned about.
  digestHardMinutes: num('POLICY_DIGEST_HARD_MIN', 60),
  digestMinutes: num('POLICY_DIGEST_MIN', 90),
  forageDigestMinutes: num('POLICY_FORAGE_DIGEST_MIN', 60),
  maxFastHours: num('POLICY_MAX_FAST_HOURS', 6),
  // Pre-check: from this long before the booked time until this long after; valid this many hours.
  precheckOpensBeforeMin: num('POLICY_PRECHECK_BEFORE_MIN', 60),
  precheckClosesAfterMin: num('POLICY_PRECHECK_AFTER_MIN', 30),
  precheckValidHours: num('POLICY_PRECHECK_VALID_HOURS', 2),
  // From this body temperature (°C) a horse has a fever: it does not train and the vet is asked.
  feverC: num('POLICY_FEVER_C', 38.6),
  // How long an exam stays good for hard work and trials.
  clearanceDays: num('POLICY_CLEARANCE_DAYS', 14),
  // Default times of the two daily slots of a new plan.
  morningTime: clock('POLICY_MORNING_TIME', '07:30'),
  afternoonTime: clock('POLICY_AFTERNOON_TIME', '16:00'),
  // Afternoon work is light only (walk, canter) — checked on every way a session gets its time.
  afternoonLightOnly: flag('AFTERNOON_LIGHT_ONLY', true),
  // Care after a hard session, minutes after it really ended.
  icingAfterMin: num('POLICY_ICING_AFTER_MIN', 15),
  bathingAfterMin: num('POLICY_BATHING_AFTER_MIN', 45),
});

module.exports = clubPolicy;
