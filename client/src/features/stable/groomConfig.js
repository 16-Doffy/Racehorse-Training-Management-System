import dayjs from 'dayjs';

// Shared labels/colors for the Groom screens (tasks, stable map, feeding, incidents, supplies).
// Visual language follows the Horse Owner screens: forest #022c22 + gold #eab308 on cream.

export const TASK_CONFIG = {
  feeding: { label: 'Cho ăn', emoji: '🥕', color: 'orange' },
  cleaning: { label: 'Vệ sinh chuồng', emoji: '🧹', color: 'blue' },
  bathing: { label: 'Tắm rửa', emoji: '🚿', color: 'cyan' },
  icing: { label: 'Ngâm chân nước đá', emoji: '🧊', color: 'geekblue' },
};

export const TASK_STATUS_CONFIG = {
  pending: { label: 'Chưa xong', color: 'default' },
  completed: { label: 'Hoàn thành', color: 'green' },
  skipped: { label: 'Bỏ qua', color: 'orange' },
};

export const HEALTH_STATUS_CONFIG = {
  eligible: { label: 'Đủ điều kiện', color: 'green', dot: 'bg-green-500', ring: 'border-green-200' },
  monitoring: { label: 'Cần theo dõi', color: 'gold', dot: 'bg-yellow-500', ring: 'border-yellow-200' },
  injured: { label: 'Chấn thương', color: 'red', dot: 'bg-red-500', ring: 'border-red-200' },
  quarantined: { label: 'Cách ly', color: 'volcano', dot: 'bg-orange-600', ring: 'border-orange-200' },
};

// FeedingSchedule.mealTime only stores the meal slot, not a clock time; these are the stable's
// default slots, used to order the daily routine and to work out which meal comes next.
export const MEAL_CONFIG = {
  morning: { label: 'Bữa sáng', time: '06:00', hour: 6, emoji: '🌅' },
  noon: { label: 'Bữa trưa', time: '11:30', hour: 11.5, emoji: '☀️' },
  evening: { label: 'Bữa tối', time: '17:30', hour: 17.5, emoji: '🌙' },
};
export const MEAL_ORDER = ['morning', 'noon', 'evening'];

export const SEVERITY_CONFIG = {
  low: { label: 'Nhẹ', color: 'blue' },
  medium: { label: 'Trung bình', color: 'orange' },
  high: { label: 'Nghiêm trọng', color: 'red' },
};

export const INCIDENT_PRESETS = [
  'Ngựa bỏ ăn',
  'Có dấu hiệu đau bụng',
  'Có dấu hiệu sốt',
  'Móng bị xước',
  'Đi khập khiễng',
  'Vết thương ngoài da',
];

export const INVENTORY_CATEGORY_CONFIG = {
  feed: { label: 'Thức ăn', emoji: '🌾', color: 'green' },
  medicine: { label: 'Thuốc', emoji: '💊', color: 'magenta' },
  equipment: { label: 'Dụng cụ', emoji: '🧰', color: 'blue' },
};

export const RESTOCK_STATUS_CONFIG = {
  pending: { label: 'Chờ duyệt', color: 'gold' },
  approved: { label: 'Đã duyệt', color: 'green' },
  rejected: { label: 'Từ chối', color: 'red' },
};

// InventoryItem has no reorder level, so "low stock" is a fixed UI threshold for now.
export const LOW_STOCK_THRESHOLD = 10;

export function getStockLevel(quantity) {
  if (quantity <= 0) return { key: 'out', label: 'Hết hàng', color: 'red' };
  if (quantity <= LOW_STOCK_THRESHOLD) return { key: 'low', label: 'Sắp hết', color: 'orange' };
  return { key: 'ok', label: 'Còn đủ', color: 'green' };
}

const FEED_TYPE_LABELS = [
  { match: /grain|oat|ngũ cốc|yến mạch/i, label: 'Ngũ cốc', emoji: '🌾' },
  { match: /hay|grass|cỏ/i, label: 'Cỏ khô', emoji: '🌿' },
  { match: /vitamin|supplement|bổ sung/i, label: 'Vitamin', emoji: '💊' },
  { match: /carrot|cà rốt/i, label: 'Cà rốt', emoji: '🥕' },
  { match: /water|electrolyte|điện giải|nước/i, label: 'Nước điện giải', emoji: '💧' },
];

/** Maps the free-text FeedingSchedule item type (e.g. "grain", "hay") to a Vietnamese label. */
export function getFeedTypeLabel(type = '') {
  const found = FEED_TYPE_LABELS.find((f) => f.match.test(type));
  return found ? { label: found.label, emoji: found.emoji } : { label: type, emoji: '🍽️' };
}

/** "Block A - Stall 12" -> { block: "Block A", stall: "Stall 12" }. */
export function parseStableBlock(stableBlock = '') {
  const match = stableBlock.match(/^(.*?)\s*-\s*(.+)$/);
  if (!match) return { block: stableBlock || 'Khác', stall: stableBlock || '—' };
  return { block: match[1], stall: match[2] };
}

/** Uploaded incident photos are served from the API host root (/uploads/...), not /api/v1. */
export function toUploadUrl(relativePath) {
  if (!relativePath || /^https?:\/\//.test(relativePath)) return relativePath;
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
  const origin = apiBase.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');
  return `${origin}${relativePath}`;
}

export const refId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);

export const isSameDay = (date, day) => dayjs(date).isSame(day, 'day');

const VI_WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** "Thứ Năm, 17/09/2026" — dayjs has no Vietnamese locale loaded in this app. */
export const formatViDate = (date) => `${VI_WEEKDAYS[dayjs(date).day()]}, ${dayjs(date).format('DD/MM/YYYY')}`;

/**
 * One horse-day timeline for the Groom: approved meal slots + training sessions, sorted by time.
 * Tasks are not included — DailyTask has a date but no time of day.
 */
export function buildDailyRoutine({ horseIds, feedings, sessions, day }) {
  const events = [];

  feedings
    .filter((f) => horseIds.has(refId(f.horse)))
    .forEach((f) => {
      const meal = MEAL_CONFIG[f.mealTime];
      if (!meal) return;
      events.push({
        key: `meal-${f._id}`,
        kind: 'meal',
        sortHour: meal.hour,
        time: meal.time,
        title: `${meal.emoji} ${meal.label}`,
        horse: f.horse,
        detail: (f.items || []).map((i) => `${getFeedTypeLabel(i.type).label} ${i.quantity}`).join(' • '),
        approved: !!f.approvedBy,
      });
    });

  sessions
    .filter((s) => horseIds.has(refId(s.horse)) && isSameDay(s.scheduledAt, day) && s.status !== 'cancelled')
    .forEach((s) => {
      const at = dayjs(s.scheduledAt);
      events.push({
        key: `session-${s._id}`,
        kind: 'training',
        sortHour: at.hour() + at.minute() / 60,
        time: at.format('HH:mm'),
        title: s.sessionType === 'trial_run' ? '🏁 Chạy thử' : '🏇 Buổi tập',
        horse: s.horse,
        detail: s.status === 'in_progress' ? 'Đang diễn ra' : s.status === 'completed' ? 'Đã hoàn thành' : 'Đã lên lịch',
        status: s.status,
      });
    });

  return events.sort((a, b) => a.sortHour - b.sortHour);
}

/** The meal slot that is current (within 1h of its start) or next; wraps to tomorrow's breakfast. */
export function getNextMeal(now = dayjs()) {
  const hour = now.hour() + now.minute() / 60;
  const key = MEAL_ORDER.find((k) => hour < MEAL_CONFIG[k].hour + 1) || 'morning';
  const meal = MEAL_CONFIG[key];
  let at = now.startOf('day').add(meal.hour * 60, 'minute');
  if (at.add(1, 'hour').isBefore(now)) at = at.add(1, 'day');
  return { key, ...meal, at, isNow: !now.isBefore(at) };
}

/** Upcoming vet/farrier care dates for a horse within `withinDays`, soonest first. */
export function getUpcomingCare(horse, withinDays = 14) {
  const items = [
    { key: 'vaccination', label: 'Tiêm phòng', emoji: '💉', date: horse?.careSchedule?.nextVaccinationDue },
    { key: 'deworming', label: 'Tẩy giun', emoji: '💊', date: horse?.careSchedule?.nextDewormingDue },
    { key: 'farrier', label: 'Kiểm tra móng', emoji: '🔧', date: horse?.careSchedule?.nextFarrierDue },
  ];
  const today = dayjs().startOf('day');
  return items
    .filter((i) => i.date)
    .map((i) => ({ ...i, daysLeft: dayjs(i.date).startOf('day').diff(today, 'day') }))
    .filter((i) => i.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export const describeDaysLeft = (daysLeft) =>
  daysLeft < 0 ? `Quá hạn ${-daysLeft} ngày` : daysLeft === 0 ? 'Hôm nay' : `Còn ${daysLeft} ngày`;

// Georgia mangles stacked Vietnamese diacritics ("Sơ đồ" renders with a detached grave accent),
// so Groom headings use Lora (loaded in index.html with its Vietnamese subset) and fall back to Georgia.
export const HEADING_FONT = "'Lora', Georgia, serif";
