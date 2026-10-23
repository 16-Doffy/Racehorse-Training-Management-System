/**
 * Reference numbers for a training cycle by race distance, shown beside the phases in the plan
 * wizard so the trainer sees whether a phase is in a sensible range. A starting point the trainer
 * adjusts to the horse, not a rule the server enforces (the server's own checks are planWarnings).
 *
 * The longer the race, the longer the base and the more weekly volume; the build-up never adds
 * more than about 10% volume a week; the taper before the race cuts volume by 30–50% and keeps one
 * short fast piece; a timed trial over the race distance about 8 days out (the plan books it).
 */
const CLASSES = [
  { key: 'sprint', upTo: 1400, label: 'nước rút (đến 1400 m)' },
  { key: 'middle', upTo: 2200, label: 'trung bình (1600–2200 m)' },
  { key: 'staying', upTo: Infinity, label: 'đường dài (từ 2400 m)' },
];

const GUIDE = {
  sprint: {
    base_building: { weeks: [3, 4], km: [10, 15] },
    strength: { weeks: [2, 3], km: [12, 16] },
    speed: { weeks: [2, 3], km: [12, 16] },
    peak: { weeks: [1, 2], km: [7, 10] },
    recovery: { weeks: [1, 2], km: [5, 8] },
  },
  middle: {
    base_building: { weeks: [4, 6], km: [12, 18] },
    strength: { weeks: [3, 4], km: [14, 20] },
    speed: { weeks: [2, 3], km: [13, 18] },
    peak: { weeks: [1, 2], km: [8, 12] },
    recovery: { weeks: [2, 2], km: [6, 10] },
  },
  staying: {
    base_building: { weeks: [6, 8], km: [16, 24] },
    strength: { weeks: [3, 4], km: [18, 24] },
    speed: { weeks: [2, 3], km: [15, 20] },
    peak: { weeks: [2, 2], km: [10, 14] },
    recovery: { weeks: [2, 2], km: [8, 12] },
  },
};

// The same in every class: what each phase is for and how hard it works.
export const PHASE_FOCUS = {
  base_building: { intensity: 'moderate', focus: 'Đi bộ, chạy kiệu, phi chậm dài: nền sức bền tim phổi.' },
  strength: { intensity: 'high', focus: 'Tập dốc, phi chậm dài hơn, một buổi nhanh mỗi tuần.' },
  speed: { intensity: 'high', focus: 'Hai buổi phi nhanh mỗi tuần (400–800 m gần tốc độ đua), các ngày khác tập nhẹ.' },
  peak: { intensity: 'moderate', focus: 'Giảm 30–50% khối lượng, giữ một buổi nhanh ngắn; chạy thử đủ cự ly khoảng 8 ngày trước giải.' },
  recovery: { intensity: 'light', focus: 'Đi bộ, chạy kiệu nhẹ để hồi phục sau giải.' },
};

export const PLAN_RULES = [
  'Khối lượng tăng không quá 10% mỗi tuần.',
  'Mỗi tuần ít nhất một ngày nghỉ.',
  'Đua phẳng thường từ 1000 đến 3200 m; cự ly ngoài khoảng này nên kiểm tra lại.',
];

/** The distance class of a race distance in metres: { key, label }. */
export function distanceClass(distance) {
  const d = Number(distance) || 1600;
  return CLASSES.find((c) => d <= c.upTo);
}

/** The reference for one phase at this race distance: { weeks: [min, max], km: [min, max], intensity, focus }. */
export function phaseGuide(distance, key) {
  const range = GUIDE[distanceClass(distance).key][key];
  return range ? { ...range, ...PHASE_FOCUS[key] } : null;
}

/** The middle of a range, rounded to whole km. */
export const midKm = ([low, high]) => Math.round((low + high) / 2);
