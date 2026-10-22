/**
 * A ration suggested from the horse's training plan: how much forage and concentrate for one meal,
 * from its weight and how hard the current phase works it.
 *
 * General guidance for horses in work (NRC 2007): about 2–2.5% of body weight a day in all, forage
 * never under 1.5%, concentrate rising with the work, and no more than 0.5% of body weight of
 * concentrate in one meal (more at once risks colic). Supplements (oil, minerals) are left to the
 * trainer: they are not a meal.
 */
const DAILY_SHARE = {
  rest: { forage: 0.02, concentrate: 0.0025 },
  light: { forage: 0.02, concentrate: 0.005 },
  moderate: { forage: 0.0175, concentrate: 0.0075 },
  high: { forage: 0.015, concentrate: 0.01 },
};
// Three meals a day: the evening one carries the most hay, for the long night.
const MEAL_SPLIT = {
  morning: { forage: 0.3, concentrate: 0.35 },
  noon: { forage: 0.2, concentrate: 0.25 },
  evening: { forage: 0.5, concentrate: 0.4 },
};
const MAX_CONCENTRATE_PER_MEAL = 0.005;
// Used when the horse's weight was never entered: a typical racehorse in training.
export const DEFAULT_WEIGHT_KG = 500;
const WORK_LABELS = { rest: 'không có kế hoạch tập', light: 'tập nhẹ', moderate: 'tập vừa', high: 'tập nặng' };

const halfKg = (kg) => Math.max(0.5, Math.round(kg * 2) / 2);
const DAY_MS = 24 * 60 * 60 * 1000;

/** The phase of an active plan that today falls in ({ key, intensity, weeklyVolumeKm }), or null. */
export function currentPhase(plan, today = new Date()) {
  if (!plan) return null;
  const phases = plan.phases?.length ? plan.phases : [{ key: plan.phase, weeks: 52, intensity: plan.intensity, weeklyVolumeKm: plan.weeklyVolumeKm }];
  let cursor = new Date(plan.startDate || today);
  cursor.setHours(0, 0, 0, 0);
  for (const phase of phases) {
    const end = new Date(cursor.getTime() + (Number(phase.weeks) || 0) * 7 * DAY_MS);
    if (today < end) return phase;
    cursor = end;
  }
  return phases[phases.length - 1];
}

/**
 * The suggestion for one meal: { work, weightKg, weightGuessed, daily: { forage, concentrate },
 * meal: { forage, concentrate } } in kg, plus the stock items to use (forage / concentrate in kg,
 * the one with most in stock) when the club has them.
 */
export function suggestRation({ horse, plan, slot, feedItems = [] }) {
  const phase = currentPhase(plan);
  const work = phase ? (phase.key === 'recovery' ? 'light' : phase.intensity || 'moderate') : 'rest';
  const share = DAILY_SHARE[work] || DAILY_SHARE.moderate;
  const weightGuessed = !(Number(horse?.weightKg) > 0);
  const weightKg = weightGuessed ? DEFAULT_WEIGHT_KG : Number(horse.weightKg);
  const split = MEAL_SPLIT[slot] || MEAL_SPLIT.morning;
  const daily = { forage: weightKg * share.forage, concentrate: weightKg * share.concentrate };
  const meal = {
    forage: halfKg(daily.forage * split.forage),
    concentrate: halfKg(Math.min(daily.concentrate * split.concentrate, weightKg * MAX_CONCENTRATE_PER_MEAL)),
  };
  const inKg = (kind) =>
    feedItems
      .filter((i) => i.feedType === kind && String(i.unit).trim().toLowerCase() === 'kg' && i.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity)[0] || null;
  return {
    work,
    workLabel: WORK_LABELS[work],
    phase,
    weightKg,
    weightGuessed,
    daily: { forage: Math.round(daily.forage * 10) / 10, concentrate: Math.round(daily.concentrate * 10) / 10 },
    meal,
    items: { forage: inKg('forage'), concentrate: inKg('concentrate') },
  };
}

/** "05:30": the latest a breakfast with concentrate should be given before a morning session. */
export function breakfastBy(sessionTime, digestMinutes) {
  if (!/^\d{2}:\d{2}$/.test(sessionTime || '')) return null;
  const [h, m] = sessionTime.split(':').map(Number);
  const at = h * 60 + m - digestMinutes;
  if (at < 0) return null;
  return `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
}
