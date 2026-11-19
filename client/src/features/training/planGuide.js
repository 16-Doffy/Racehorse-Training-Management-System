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
    recovery: { weeks: [1, 1], km: [5, 8] },
  },
  middle: {
    base_building: { weeks: [4, 6], km: [12, 18] },
    strength: { weeks: [3, 4], km: [14, 20] },
    speed: { weeks: [2, 3], km: [13, 18] },
    peak: { weeks: [1, 2], km: [8, 12] },
    recovery: { weeks: [1, 1], km: [6, 10] },
  },
  staying: {
    base_building: { weeks: [6, 8], km: [16, 24] },
    strength: { weeks: [3, 4], km: [18, 24] },
    speed: { weeks: [2, 3], km: [15, 20] },
    peak: { weeks: [2, 2], km: [10, 14] },
    recovery: { weeks: [1, 1], km: [8, 12] },
  },
};

// The same in every class: what each phase is for, how hard it works, and recommended parameters.
export const PHASE_FOCUS = {
  base_building: {
    intensity: 'moderate',
    sessionsPerWeek: '5–6 buổi',
    speedKmh: '18–28 km/h',
    hrMax: 165,
    durationMin: '40–55 phút',
    rationHint: 'Cỏ thô ~75–80% + tinh bột vừa; chưa cần tăng năng lượng cao.',
    focus: 'Đi bộ, chạy kiệu, phi chậm dài: nền sức bền tim phổi.',
    recommendedWeek: [
      { day: 1, preset: 'trot' },
      { day: 2, preset: 'canter' },
      { day: 2, slot: 'afternoon', preset: 'afternoon_walk' },
      { day: 3, preset: 'trot' },
      { day: 4, preset: 'canter_long' },
      { day: 4, slot: 'afternoon', preset: 'afternoon_walk' },
      { day: 5, preset: 'trot' },
      { day: 6, preset: 'canter' },
    ],
  },
  strength: {
    intensity: 'high',
    sessionsPerWeek: '5 buổi',
    speedKmh: '25–38 km/h',
    hrMax: 180,
    durationMin: '35–50 phút',
    rationHint: 'Tăng tinh bột (yến mạch) + dầu thực vật giữ cơ, điện giải sau buổi dốc.',
    focus: 'Tập dốc, phi chậm dài hơn, một buổi nhanh mỗi tuần.',
    recommendedWeek: [
      { day: 1, preset: 'canter' },
      { day: 2, preset: 'hill' },
      { day: 2, slot: 'afternoon', preset: 'afternoon_walk' },
      { day: 3, preset: 'trot' },
      { day: 3, slot: 'afternoon', preset: 'afternoon_trot' },
      { day: 4, preset: 'hill_short' },
      { day: 4, slot: 'afternoon', preset: 'afternoon_walk' },
      { day: 5, preset: 'canter_long' },
      { day: 6, preset: 'breeze_short' },
      { day: 6, slot: 'afternoon', preset: 'afternoon_walk' },
    ],
  },
  speed: {
    intensity: 'high',
    sessionsPerWeek: '4–5 buổi',
    speedKmh: '45–60 km/h',
    hrMax: 195,
    durationMin: '30–40 phút',
    rationHint: 'Khẩu phần nặng: chia bữa tinh bột sau tập, bắt buộc điện giải + dầu.',
    focus: 'Hai buổi phi nhanh mỗi tuần (400–800 m gần tốc độ đua), các ngày khác tập nhẹ.',
    recommendedWeek: [
      { day: 1, preset: 'trot' },
      { day: 2, preset: 'breeze' },
      { day: 2, slot: 'afternoon', preset: 'afternoon_walk' },
      { day: 3, preset: 'walk' },
      { day: 3, slot: 'afternoon', preset: 'afternoon_trot' },
      { day: 4, preset: 'canter' },
      { day: 5, preset: 'breeze_short' },
      { day: 5, slot: 'afternoon', preset: 'afternoon_walk' },
      { day: 6, preset: 'canter_long' },
    ],
  },
  peak: {
    intensity: 'moderate',
    sessionsPerWeek: '4 buổi',
    speedKmh: '40–55 km/h',
    hrMax: 185,
    durationMin: '25–35 phút',
    rationHint: 'Giữ năng lượng tinh gọn, giảm cỏ quá nặng sát ngày đua 24–48h.',
    focus: 'Giảm 30–50% khối lượng, giữ một buổi nhanh ngắn; chạy thử đủ cự ly khoảng 8 ngày trước giải.',
    recommendedWeek: [
      { day: 1, preset: 'trot' },
      { day: 2, preset: 'breeze_sharp' },
      { day: 2, slot: 'afternoon', preset: 'afternoon_walk' },
      { day: 3, preset: 'walk' },
      { day: 4, preset: 'canter' },
      { day: 6, preset: 'canter_easy' },
    ],
  },
  recovery: {
    intensity: 'light',
    sessionsPerWeek: '3–4 buổi',
    speedKmh: '12–20 km/h',
    hrMax: 145,
    durationMin: '25–35 phút',
    rationHint: 'Giảm mạnh tinh bột, tăng cỏ thô mát + điện giải hồi phục.',
    focus: 'Sau buổi chạy thử, trước ngày đua (thường 4 ngày): đi bộ, chạy kiệu, phi nhẹ để ngựa hồi sức rồi mới đi thi đấu.',
    // Light work every day but Sunday, so any few days of it have some.
    recommendedWeek: [
      { day: 1, preset: 'walk' },
      { day: 2, preset: 'trot' },
      { day: 3, preset: 'walk' },
      { day: 4, preset: 'canter_easy' },
      { day: 5, preset: 'walk' },
      { day: 6, preset: 'trot' },
    ],
  },
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
