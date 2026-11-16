/**
 * What a horse eats while it is not fit, as the vet orders it on the exam (HealthRecord.dietPlan, kept
 * on Horse.vetDiet while it is not fit), and how it goes back to its training ration once it is.
 *
 * - 'plan': it eats as its training plan says (only while under monitoring: an injured or isolated
 *   horse is not worked, so it is always on a sick diet).
 * - The sick diets differ by what the illness asks of the feed (rationRules.js SICK_RATIONS has the
 *   amounts); `care` is what the groom reads beside each meal.
 * - Back on its feet, the horse's concentrate builds back up over a week (RAMP): a gut that ate
 *   hardly any grain for days must not get a full training ration overnight (colic risk).
 */

const DIET_KINDS = {
  plan: { label: 'Theo kế hoạch tập', care: '' },
  rest: { label: 'Nghỉ chuồng', care: 'Nhiều cỏ thô giữ tiêu hóa, rất ít thức ăn tinh.' },
  colic: { label: 'Đau bụng (colic)', care: 'Cỏ ngâm ướt, chia nhỏ; không cho thức ăn tinh. Ngựa bỏ ăn hoặc không đi phân thì báo bác sĩ ngay.' },
  laminitis: { label: 'Viêm móng', care: 'Ngâm cỏ khô 30–60 phút rồi chắt nước cho bớt đường; không ngũ cốc, không cỏ tươi.' },
  respiratory: { label: 'Bệnh hô hấp', care: 'Nhúng ướt cỏ khô cho hết bụi, đặt máng ăn thấp; không rũ cỏ trong chuồng.' },
  ulcer: { label: 'Dạ dày', care: 'Không để ngựa đói quá 5 giờ; cho ăn cỏ (ưu tiên linh lăng) trước thức ăn tinh.' },
};
const SICK_DIET_KINDS = ['rest', 'colic', 'laminitis', 'respiratory', 'ulcer'];
const SICK_STATUSES = ['injured', 'quarantined'];
const DIET_NOTE_MAX = 300;

// The concentrate's part of the training ration on each day back (day 1 first), then all of it.
const RAMP = [0.5, 0.5, 0.75, 0.75, 0.75, 0.9, 0.9];
const DAY_MS = 86400000;
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** Day `n` (1…RAMP.length) of the way back to the training ration on `day`, or null when it is not on its way back. */
function rampDay(backToFeedAt, day = new Date()) {
  if (!backToFeedAt) return null;
  const n = Math.round((startOfDay(day) - startOfDay(backToFeedAt)) / DAY_MS) + 1;
  return n >= 1 && n <= RAMP.length ? n : null;
}

/** The concentrate's factor on `day` (1 = the whole training ration). */
const rampFactor = (backToFeedAt, day = new Date()) => {
  const n = rampDay(backToFeedAt, day);
  return n ? RAMP[n - 1] : 1;
};

/** The sick diet the vet ordered for this horse, or 'rest' when none was ordered. */
const sickKindOf = (horse) => (SICK_DIET_KINDS.includes(horse?.vetDiet?.kind) ? horse.vetDiet.kind : 'rest');

/**
 * What the horse eats today, said for the people who feed it (GET /horses): the sick diet with what to
 * mind and the vet's own words, the way back to the training ration, or null when it eats as planned.
 * Read from the horse alone (healthStatus, vetDiet, backToFeedAt), like the meals are made.
 */
function dietSummary(horse, now = new Date()) {
  if (!horse) return null;
  const ordered = horse.vetDiet?.kind;
  const sick = SICK_STATUSES.includes(horse.healthStatus) || (horse.healthStatus === 'monitoring' && SICK_DIET_KINDS.includes(ordered));
  if (sick) {
    const kind = sickKindOf(horse);
    return { diet: 'sick', kind, label: DIET_KINDS[kind].label, care: DIET_KINDS[kind].care, note: horse.vetDiet?.note || '' };
  }
  const day = rampDay(horse.backToFeedAt, now);
  if (day) {
    const percent = Math.round(RAMP[day - 1] * 100);
    return {
      diet: 'ramp',
      kind: null,
      label: 'Tập ăn lại sau bệnh',
      care: `Thức ăn tinh ${percent}% khẩu phần tập (ngày ${day}/${RAMP.length}), tăng dần để dạ dày quen lại.`,
      note: '',
      percent,
      day,
      days: RAMP.length,
    };
  }
  return null;
}

module.exports = { DIET_KINDS, SICK_DIET_KINDS, SICK_STATUSES, DIET_NOTE_MAX, RAMP, rampDay, rampFactor, sickKindOf, dietSummary };
