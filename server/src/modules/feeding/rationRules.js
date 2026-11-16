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
 * - A horse injured or in isolation is not worked, whatever its plan says: its days take the sick diet
 *   (`diet: 'sick'`) the vet ordered on the exam (dietOrder.js): box rest by default — forage as on a rest
 *   day, the least concentrate (none at lunch), minerals only — or one fitted to the illness (colic,
 *   laminitis, a cough, ulcers). Back on its feet, its concentrate builds back up over a week (`ramp`).
 * - The main hay and the main grain stay the same every day (a sudden change upsets the gut); what is
 *   mixed in with them follows the day's work (`dayFocus`, `focusFeeds`): grass hay and a mash on a
 *   rest day, alfalfa for the protein after hill work, an energy grain on a speed day.
 */
const { feedTypeOf } = require('../inventory/feedType');
const { DIET_KINDS, SICK_STATUSES } = require('./dietOrder');

const SHARES = {
  rest: { forage: 0.02, concentrate: 0.0025 },
  light: { forage: 0.02, concentrate: 0.005 },
  moderate: { forage: 0.0175, concentrate: 0.0075 },
  high: { forage: 0.015, concentrate: 0.01 },
  // Box rest while injured or isolated: plenty of forage to keep the gut moving, little energy to burn.
  sick: { forage: 0.02, concentrate: 0.001 },
};
const SPLITS = {
  training: { morning: { forage: 0.3, concentrate: 0.25 }, noon: { forage: 0.2, concentrate: 0.2 }, evening: { forage: 0.5, concentrate: 0.55 } },
  rest: { morning: { forage: 0.3, concentrate: 0.35 }, noon: { forage: 0.2, concentrate: 0.25 }, evening: { forage: 0.5, concentrate: 0.4 } },
  sick: { morning: { forage: 0.3, concentrate: 0.5 }, noon: { forage: 0.25, concentrate: 0 }, evening: { forage: 0.45, concentrate: 0.5 } },
};
// The meals spread evenly: small meals, the gut never long empty (concentrate, if any, morning and evening).
const EVEN = { morning: { forage: 0.34, concentrate: 0.5 }, noon: { forage: 0.33, concentrate: 0 }, evening: { forage: 0.33, concentrate: 0.5 } };
// Each sick diet the vet can order (dietOrder.js): its daily shares of body weight and their split over the meals.
const SICK_RATIONS = {
  rest: { shares: SHARES.sick, split: SPLITS.sick },
  // After colic: less hay, spread thin, no grain until the vet says so.
  colic: { shares: { forage: 0.015, concentrate: 0 }, split: EVEN },
  // Laminitis: hay low in sugar and no grain at all.
  laminitis: { shares: { forage: 0.018, concentrate: 0 }, split: EVEN },
  // A cough: the box-rest amounts, the hay damped (the groom's note).
  respiratory: { shares: SHARES.sick, split: SPLITS.sick },
  // Ulcers: forage spread over the day, the little grain after it.
  ulcer: { shares: SHARES.sick, split: EVEN },
};
const sickRation = (kind) => SICK_RATIONS[kind] || SICK_RATIONS.rest;
const dietOf = (healthStatus) => (SICK_STATUSES.includes(healthStatus) ? 'sick' : 'normal');
const MAX_CONCENTRATE_PER_MEAL = 0.005;
const SLOTS = ['morning', 'noon', 'evening'];
// A racehorse in training weighs about 450–550 kg; outside this the weight was most likely mistyped.
const WEIGHT_RANGE = [350, 700];
const DEFAULT_WEIGHT_KG = 500;

const HIGH_SWEAT_KINDS = new Set(['hill', 'breeze', 'gallop', 'trial']);

// Daily doses by the item's unit; an item counted in another unit (a salt lick in "viên") is left out.
const SUPPLEMENTS = [
  { key: 'mineral', match: /(khoáng|mineral)/i, dose: { kg: 0.05, g: 50 }, applies: () => true },
  { key: 'oil', match: /(dầu|oil)/i, dose: { 'lít': 0.1, l: 0.1, ml: 100 }, applies: ({ phase }) => phase === 'strength' || phase === 'speed' },
  {
    key: 'electrolyte',
    match: /(điện giải|electrolyte)/i,
    dose: { kg: 0.05, g: 50 },
    applies: ({ work, phase, sessions = [] }) =>
      work === 'high' || phase === 'recovery' || sessions.some((s) => HIGH_SWEAT_KINDS.has(s.kind)),
  },
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

const WORK_RANK = { rest: 0, light: 1, moderate: 2, high: 3 };
/** The harder of two days' work (rest < light < moderate < high): a day's meals follow its hardest session. */
const heavierWork = (a, b) => ((WORK_RANK[b] ?? 2) > (WORK_RANK[a] ?? 0) ? b : a);

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

/**
 * A second item of the same kind to mix in (Timothy with alfalfa, oats with barley or pellets), when the club
 * stocks another one that is usable and lasts its share of a week: a varied diet, the main item still the most.
 */
function pickSecond(stock, kind, first, { weekNeed = 0, day = new Date() } = {}) {
  if (!first) return null;
  const share = kind === 'forage' ? MIX.forage : MIX.concentrate;
  const usable = stock.filter((i) => String(i._id) !== String(first._id) && feedTypeOf(i) === kind && unitOf(i) === 'kg' && usableOn(i, day) && i.quantity >= weekNeed * share);
  return usable.sort((a, b) => b.quantity - a.quantity)[0] || null;
}

// What a day's work asks of the feed mixed in with the main hay and grain. `prefer`: names to look for in
// stock, in order; `share`: the mixed-in item's part of its kind; `why`: what it brings, for the trainer.
const GRASS_HAY = /(timothy|cỏ thường|cỏ voi|cỏ sả|bermuda|grass|orchard|rye)/i;
const ALFALFA = /(alfalfa|linh lăng|lucerne)/i;
const MASH = /(cám gạo|cám mì|bran|mash|củ cải|beet|bã)/i;
const PELLET = /(viên|pellet|cube)/i;
const ENERGY_GRAIN = /(lúa mạch|barley|ngô|bắp|corn|maize|ngũ cốc|grain|sweet)/i;
const FOCUS = {
  rest: {
    label: 'Ngày nghỉ',
    forage: { prefer: [GRASS_HAY], share: 0.4, why: 'nhiều xơ, ít đạm' },
    concentrate: { prefer: [MASH, PELLET], share: 0.4, why: 'nhẹ bụng ngày nghỉ' },
  },
  easy: {
    label: 'Ngày tập nhẹ',
    forage: { prefer: [GRASS_HAY], share: 0.3, why: 'nhiều xơ, ít đạm' },
    concentrate: { prefer: [MASH, PELLET], share: 0.3, why: 'nhẹ bụng' },
  },
  aerobic: {
    label: 'Ngày phi bền',
    forage: { prefer: [], share: 0.3 },
    concentrate: { prefer: [PELLET], share: 0.4, why: 'đủ chất, giữ sức bền' },
  },
  strength: {
    label: 'Ngày leo dốc',
    forage: { prefer: [ALFALFA], share: 0.4, why: 'giàu đạm, phục hồi cơ' },
    concentrate: { prefer: [PELLET], share: 0.4, why: 'đủ chất cho cơ' },
  },
  speed: {
    label: 'Ngày nước rút',
    forage: { prefer: [ALFALFA], share: 0.3, why: 'giàu canxi, đệm dạ dày' },
    concentrate: { prefer: [ENERGY_GRAIN], share: 0.5, why: 'nhiều năng lượng' },
  },
  // The sick diets that ask for a particular hay (the others eat as on a rest day).
  sick_colic: {
    label: 'Đau bụng',
    forage: { prefer: [GRASS_HAY], share: 0.5, why: 'dễ tiêu' },
    concentrate: { prefer: [MASH], share: 0.4 },
  },
  sick_laminitis: {
    label: 'Viêm móng',
    forage: { prefer: [GRASS_HAY], share: 0.5, why: 'ít đường' },
    concentrate: { prefer: [MASH], share: 0.4 },
  },
  sick_ulcer: {
    label: 'Dạ dày',
    forage: { prefer: [ALFALFA], share: 0.4, why: 'đệm dạ dày' },
    concentrate: { prefer: [MASH, PELLET], share: 0.4 },
  },
};
const FOCUS_OF_KIND = { walk: 'easy', canter: 'aerobic', hill: 'strength', breeze: 'speed', gallop: 'speed', trial: 'speed' };
const FOCUS_RANK = { rest: 0, easy: 1, aerobic: 2, strength: 3, speed: 4 };
// When the main item is already what the day asks for, the other one is mixed in at this smaller part.
const MAIN_FITS_SHARE = 0.2;
// "Cỏ khô Timothy (Timothy Hay)" → "Cỏ khô Timothy": the note stays one line.
const shortName = (item) => String(item.name).replace(/\s*\([^)]*\)\s*$/, '') || item.name;

/** What the day's work asks of the feed: its hardest session's (rest when it has none); a sick horse's, its diet's. */
function dayFocus(sessions = [], diet = 'normal', sickKind = 'rest') {
  if (diet === 'sick') return FOCUS[`sick_${sickKind}`] ? `sick_${sickKind}` : 'rest';
  return (sessions || []).reduce((f, s) => {
    const of = FOCUS_OF_KIND[s.kind] || 'aerobic';
    return FOCUS_RANK[of] > FOCUS_RANK[f] ? of : f;
  }, 'rest');
}

/**
 * The items to mix in with the main hay and grain on a day of this focus, and their parts:
 * { forageMix, forageShare, concentrateMix, concentrateShare, notes }. An item the day asks for is used
 * when the club stocks it (usable, in kg, enough for its part of a few such days); when the main item is
 * already that, the other one goes in at a smaller part; otherwise the usual second item, at the usual part.
 */
function focusFeeds(stock, { forage, concentrate }, focus, { weekNeed = {}, day = new Date() } = {}) {
  const rules = FOCUS[focus] || FOCUS.aerobic;
  const out = { notes: [] };
  for (const [kind, main] of [['forage', forage], ['concentrate', concentrate]]) {
    const rule = rules[kind];
    let mix = null;
    let share = MIX[kind];
    if (main) {
      const need = (weekNeed[kind] || 0) * rule.share * 0.5;
      const usable = stock.filter((i) => String(i._id) !== String(main._id) && feedTypeOf(i) === kind && unitOf(i) === 'kg' && usableOn(i, day) && i.quantity >= need);
      const wanted = rule.prefer.map((re) => usable.filter((i) => re.test(i.name)).sort((a, b) => b.quantity - a.quantity)[0]).find(Boolean);
      if (wanted) {
        mix = wanted;
        share = rule.share;
        if (rule.why) out.notes.push(`thêm ${shortName(wanted)} (${rule.why})`);
      } else {
        mix = pickSecond(stock, kind, main, { weekNeed: weekNeed[kind] || 0, day });
        if (rule.prefer.some((re) => re.test(main.name))) {
          share = MAIN_FITS_SHARE;
          if (rule.why) out.notes.push(`nhiều ${shortName(main)} hơn (${rule.why})`);
        }
      }
    }
    out[kind === 'forage' ? 'forageMix' : 'concentrateMix'] = mix;
    out[kind === 'forage' ? 'forageShare' : 'concentrateShare'] = share;
  }
  return out;
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
// The second item's share of its kind when two are mixed; the first keeps the rest.
const MIX = { forage: 0.3, concentrate: 0.4 };
/** `total` kg of one kind as lines: split between the two items when there is a second and enough to split. */
function mixedLines(first, second, total, share) {
  if (!second || total < 1) return [line(first, total)];
  const part = Math.min(halfKg(total * share), total - 0.5);
  return [line(first, total - part), line(second, part)];
}

/**
 * The three meals of one day: [{ slot, time, items: [{ inventoryItem, name, amount, unit }] }].
 * `feeds` = { forage, concentrate, supplements } as picked above; `clocks` = meal times by slot;
 * `diet` = 'sick' while the horse is injured or isolated (its plan's work does not count then), `sickKind`
 * the sick diet the vet ordered (dietOrder.js); `ramp` the part of the concentrate it gets on its way back
 * to the training ration after an illness (1 = all of it).
 */
function dayMeals({ weightKg, work, phase, clocks, feeds, diet = 'normal', sickKind = 'rest', ramp = 1, sessions = [] }) {
  const weight = Number(weightKg) > 0 ? Number(weightKg) : DEFAULT_WEIGHT_KG;
  const sick = diet === 'sick';
  const phaseKey = phase?.key || null;
  const share = sick ? sickRation(sickKind).shares : SHARES[work] || SHARES.moderate;
  const split = sick ? sickRation(sickKind).split : SPLITS[work === 'rest' ? 'rest' : 'training'];
  const hasHardSession = !sick && (sessions || []).some((s) => HIGH_SWEAT_KINDS.has(s.kind));
  const forageFactor = !sick && phaseKey === 'peak' ? 0.9 : 1;
  return SLOTS.map((slot) => {
    const items = [];
    if (feeds.forage) {
      items.push(...mixedLines(feeds.forage, feeds.forageMix, halfKg(weight * share.forage * forageFactor * split[slot].forage), feeds.forageShare ?? MIX.forage));
    }
    if (feeds.concentrate && share.concentrate > 0 && split[slot].concentrate > 0) {
      const concFactor = !sick && phaseKey === 'recovery' ? 0.8 : hasHardSession && slot === 'evening' ? 1.1 : 1;
      const back = sick ? 1 : Math.min(1, Math.max(0, Number(ramp) || 1));
      const grain = cappedHalfKg(weight * share.concentrate * concFactor * back * split[slot].concentrate, weight * MAX_CONCENTRATE_PER_MEAL);
      items.push(...mixedLines(feeds.concentrate, feeds.concentrateMix, grain, feeds.concentrateShare ?? MIX.concentrate));
    }
    if (slot === 'evening') {
      for (const { rule, item } of feeds.supplements || []) {
        // Sick: no oil (no strength or speed work) and no electrolytes (no hard work); minerals still.
        if (rule.applies(sick ? { phase: null, work: 'rest', sessions: [] } : { phase: phaseKey, work, sessions })) {
          items.push(line(item, rule.dose[unitOf(item)]));
        }
      }
    }
    return { slot, time: clocks[slot], items };
  });
}

const PHASE_RATION_HINT = {
  base_building: 'Xây nền: ưu tiên cỏ thô, tinh bột vừa phải',
  strength: 'Sức mạnh: tăng năng lượng + dầu thực vật giữ cơ',
  speed: 'Tốc độ: khẩu phần cao năng lượng + dầu & điện giải',
  peak: 'Về đích: tinh gọn cỏ thô, giữ năng lượng sát giải',
  recovery: 'Hồi phục: giảm 20% tinh bột, bổ sung điện giải',
};

// What each sick diet does to the meals, in a few words.
const SICK_BASIS = {
  rest: 'nhiều cỏ thô giữ tiêu hóa, rất ít tinh bột',
  colic: 'ít cỏ chia đều 3 bữa, không thức ăn tinh',
  laminitis: 'cỏ ít đường chia đều, không thức ăn tinh',
  respiratory: 'cỏ nhúng ướt hết bụi, rất ít tinh bột',
  ulcer: 'cỏ chia đều cả ngày, rất ít tinh bột',
};

/**
 * Why the day eats what it eats, in a line: the phase, a hard session, and what the day's work mixes in
 * (`mixNotes`); a sick horse's diet; the week back to the training ration after an illness (`ramp` < 1).
 */
function rationBasis(phaseKey, work, sessions = [], diet = 'normal', mixNotes = [], { sickKind = 'rest', ramp = 1 } = {}) {
  const mixes = mixNotes.length ? ` · ${mixNotes.join(', ')}` : '';
  if (diet === 'sick') return `Chế độ bệnh · ${DIET_KINDS[sickKind]?.label || DIET_KINDS.rest.label}: ${SICK_BASIS[sickKind] || SICK_BASIS.rest}${mixes}`;
  const back = ramp < 1 ? `Tập ăn lại sau bệnh: thức ăn tinh ${Math.round(ramp * 100)}% · ` : '';
  if (work === 'rest') return `${back}Ngày nghỉ: cân bằng cỏ thô, giảm nhẹ tinh bột buổi tối${mixes}`;
  const base = PHASE_RATION_HINT[phaseKey] || 'Theo cường độ buổi tập';
  const hard = (sessions || []).some((s) => HIGH_SWEAT_KINDS.has(s.kind));
  const mixed = mixNotes.length ? ` · ${FOCUS[dayFocus(sessions, diet)].label}: ${mixNotes.join(', ')}` : '';
  return `${back}${base}${hard ? ' · Sau bài nặng tăng tinh bột tối + điện giải' : ''}${mixed}`;
}

/** Roughly what a week of meals takes of each kind (to prefer an item that lasts the week). */
function weekNeed(weightKg, kind) {
  const weight = Number(weightKg) > 0 ? Number(weightKg) : DEFAULT_WEIGHT_KG;
  return 7 * weight * SHARES.moderate[kind];
}

module.exports = {
  heavierWork,
  pickSecond,
  dayFocus,
  focusFeeds,
  FOCUS,
  SLOTS,
  SHARES,
  SPLITS,
  SICK_RATIONS,
  SICK_STATUSES,
  dietOf,
  weightWarning,
  trainingDayWork,
  workOf,
  pickFeed,
  pickSupplements,
  dayMeals,
  rationBasis,
  weekNeed,
  DEFAULT_WEIGHT_KG,
};
