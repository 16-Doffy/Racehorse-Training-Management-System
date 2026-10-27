/**
 * What a horse eats at each meal, and from which stock items. General guidance for horses in work
 * (NRC 2007): about 2–2.5% of body weight a day in all, forage never under 1.5%, concentrate rising
 * with the work and no more than 0.5% of body weight in one meal (more at once risks colic).
 *
 * - Each meal has a role. On a training day breakfast is mostly forage with a little concentrate (it
 *   must be digested before work), lunch is light, the evening meal is the main one. On a rest day
 *   the concentrate is spread more evenly.
 * - The day's work sets the amounts: the plan's phase intensity on a training day, "rest" otherwise.
 * - Supplements go in the evening meal: minerals every day, oil in the strength and speed phases,
 *   electrolytes on a hard day.
 * - From stock, for each kind: the item the horse already eats, else one with enough for the coming
 *   week, expiring first, then the fullest.
 */
const { feedTypeOf } = require('../inventory/feedType');

const SHARES = {
  rest: { forage: 0.02, concentrate: 0.0025 },
  light: { forage: 0.02, concentrate: 0.005 },
  moderate: { forage: 0.0175, concentrate: 0.0075 },
  high: { forage: 0.015, concentrate: 0.01 },
};
const SPLITS = {
  training: { morning: { forage: 0.3, concentrate: 0.25 }, noon: { forage: 0.2, concentrate: 0.2 }, evening: { forage: 0.5, concentrate: 0.55 } },
  rest: { morning: { forage: 0.3, concentrate: 0.35 }, noon: { forage: 0.2, concentrate: 0.25 }, evening: { forage: 0.5, concentrate: 0.4 } },
};
const MAX_CONCENTRATE_PER_MEAL = 0.005;
const SLOTS = ['morning', 'noon', 'evening'];
// A racehorse in training weighs about 450–550 kg; outside this the weight was most likely mistyped.
const WEIGHT_RANGE = [350, 700];
const DEFAULT_WEIGHT_KG = 500;

// Daily doses by the item's unit; an item counted in another unit (a salt lick in "viên") is left out.
const SUPPLEMENTS = [
  { key: 'mineral', match: /(khoáng|mineral)/i, dose: { kg: 0.05, g: 50 }, applies: () => true },
  { key: 'oil', match: /(dầu|oil)/i, dose: { 'lít': 0.1, l: 0.1, ml: 100 }, applies: ({ phase }) => phase === 'strength' || phase === 'speed' },
  { key: 'electrolyte', match: /(điện giải|electrolyte)/i, dose: { kg: 0.05, g: 50 }, applies: ({ work }) => work === 'high' },
];

const halfKg = (amount) => Math.max(0.5, Math.round(amount * 2) / 2);
// Rounded down at the cap: rounding up would put more grain in one meal than is safe.
const cappedHalfKg = (amount, cap) => Math.min(halfKg(amount), Math.max(0.5, Math.floor(cap * 2) / 2));
const unitOf = (item) => String(item?.unit || '').trim().toLowerCase();
const usableOn = (item, day) => item.isActive !== false && item.quantity > 0 && (!item.expiryDate || new Date(item.expiryDate) >= day);

/** A warning when the weight is missing or outside what a racehorse weighs (the amounts follow it). */
function weightWarning(weightKg) {
  const w = Number(weightKg);
  if (!(w > 0)) return `Chưa nhập cân nặng của ngựa: tạm tính ${DEFAULT_WEIGHT_KG} kg.`;
  if (w < WEIGHT_RANGE[0] || w > WEIGHT_RANGE[1]) return `Cân nặng ${w} kg bất thường (ngựa đua thường 450–550 kg): kiểm tra lại trước khi xác nhận, lượng ăn tính theo cân nặng.`;
  return null;
}

/** The work of the phase's training days (what a standing ration is set for): rest if its template trains on no day. */
function trainingDayWork(phase) {
  if (!phase || !(phase.week || []).length) return 'rest';
  return phase.key === 'recovery' ? 'light' : phase.intensity || 'moderate';
}

/** The work of a day: the phase's intensity on a day its week template trains, else rest. */
function workOf(phase, date) {
  const trains = (phase?.week || []).some((w) => Number(w.day) === date.getDay());
  return trains ? trainingDayWork(phase) : 'rest';
}

/** The stock item of one kind (forage | concentrate) to use: the horse's current one, else enough for a week, expiring first, then the fullest. */
function pickFeed(stock, kind, { keep = [], weekNeed = 0, day = new Date() } = {}) {
  // feedTypeOf: an item stocked before kinds existed has none stored, and the guess from its name is
  // only filled in when its category is read — a query selecting a few fields would see no hay at all.
  const usable = stock.filter((i) => feedTypeOf(i) === kind && unitOf(i) === 'kg' && usableOn(i, day));
  const current = usable.find((i) => keep.includes(String(i._id)));
  if (current) return current;
  const expiry = (i) => (i.expiryDate ? new Date(i.expiryDate).getTime() : Infinity);
  return [...usable].sort((a, b) => Number(b.quantity >= weekNeed) - Number(a.quantity >= weekNeed) || expiry(a) - expiry(b) || b.quantity - a.quantity)[0] || null;
}

/** The supplement items to use, one per kind that the club stocks in a unit with a known dose. */
function pickSupplements(stock, day = new Date()) {
  return SUPPLEMENTS.map((rule) => {
    const item = stock
      .filter((i) => feedTypeOf(i) === 'supplement' && rule.match.test(i.name) && rule.dose[unitOf(i)] && usableOn(i, day))
      .sort((a, b) => (a.expiryDate ? new Date(a.expiryDate) : Infinity) - (b.expiryDate ? new Date(b.expiryDate) : Infinity))[0];
    return item ? { rule, item } : null;
  }).filter(Boolean);
}

const line = (item, amount) => ({ inventoryItem: item._id, name: item.name, amount, unit: item.unit });

/**
 * The three meals of one day: [{ slot, time, items: [{ inventoryItem, name, amount, unit }] }].
 * `feeds` = { forage, concentrate, supplements } as picked above; `clocks` = meal times by slot.
 */
function dayMeals({ weightKg, work, phase, clocks, feeds }) {
  const weight = Number(weightKg) > 0 ? Number(weightKg) : DEFAULT_WEIGHT_KG;
  const share = SHARES[work] || SHARES.moderate;
  const split = SPLITS[work === 'rest' ? 'rest' : 'training'];
  return SLOTS.map((slot) => {
    const items = [];
    if (feeds.forage) items.push(line(feeds.forage, halfKg(weight * share.forage * split[slot].forage)));
    if (feeds.concentrate) items.push(line(feeds.concentrate, cappedHalfKg(weight * share.concentrate * split[slot].concentrate, weight * MAX_CONCENTRATE_PER_MEAL)));
    if (slot === 'evening') {
      for (const { rule, item } of feeds.supplements || []) {
        if (rule.applies({ phase: phase?.key, work })) items.push(line(item, rule.dose[unitOf(item)]));
      }
    }
    return { slot, time: clocks[slot], items };
  });
}

/** Roughly what a week of meals takes of each kind (to prefer an item that lasts the week). */
function weekNeed(weightKg, kind) {
  const weight = Number(weightKg) > 0 ? Number(weightKg) : DEFAULT_WEIGHT_KG;
  return 7 * weight * SHARES.moderate[kind];
}

module.exports = { SLOTS, SHARES, SPLITS, weightWarning, trainingDayWork, workOf, pickFeed, pickSupplements, dayMeals, weekNeed, DEFAULT_WEIGHT_KG };
