// Labels and small helpers shared by the Groom screens.

export const TASK_CONFIG = {
  feeding: { label: 'Cho ăn', emoji: '🥕' },
  cleaning: { label: 'Vệ sinh chuồng', emoji: '🧹' },
  bathing: { label: 'Tắm rửa', emoji: '🚿' },
  icing: { label: 'Ngâm chân nước đá', emoji: '🧊' },
};

export const TASK_STATUS = {
  pending: { label: 'Chưa xong', color: '#6b7280', bg: '#f3f4f6' },
  completed: { label: 'Hoàn thành', color: '#16a34a', bg: '#dcfce7' },
  skipped: { label: 'HLV cho bỏ qua', color: '#ea580c', bg: '#ffedd5' },
};

export const HEALTH_STATUS = {
  eligible: { label: 'Đủ điều kiện', color: '#16a34a', bg: '#dcfce7' },
  monitoring: { label: 'Cần theo dõi', color: '#ca8a04', bg: '#fef9c3' },
  injured: { label: 'Chấn thương', color: '#dc2626', bg: '#fee2e2' },
  quarantined: { label: 'Cách ly', color: '#ea580c', bg: '#ffedd5' },
};

// Fallback clock times only: a ration that carries its own `timeOfDay` always wins. These match
// server/src/realtime/dailyTaskGenerator.js so the app and the generator agree.
export const MEAL_CONFIG = {
  morning: { label: 'Bữa sáng', emoji: '🌅', defaultTime: '06:00' },
  noon: { label: 'Bữa trưa', emoji: '☀️', defaultTime: '11:30' },
  evening: { label: 'Bữa tối', emoji: '🌙', defaultTime: '17:30' },
};
export const MEAL_ORDER = ['morning', 'noon', 'evening'];

export const SEVERITY = {
  low: { label: 'Nhẹ', color: '#2563eb', bg: '#dbeafe' },
  medium: { label: 'Trung bình', color: '#ea580c', bg: '#ffedd5' },
  high: { label: 'Nghiêm trọng', color: '#dc2626', bg: '#fee2e2' },
};

export const INCIDENT_PRESETS = [
  'Ngựa bỏ ăn',
  'Có dấu hiệu đau bụng',
  'Có dấu hiệu sốt',
  'Móng bị xước',
  'Đi khập khiễng',
  'Vết thương ngoài da',
];

// The observation form sends these Vietnamese labels; the server maps them to its own codes
// (see server/src/modules/stable/dailyTask.controller.js).
export const APPETITE_OPTIONS = ['Bình thường', 'Tốt', 'Kém', 'Bỏ ăn'];
export const MANURE_OPTIONS = ['Bình thường', 'Khô / Táo bón', 'Lỏng / Tiêu chảy', 'Không thấy phân'];
export const WATER_OPTIONS = ['Bình thường', 'Uống nhiều', 'Uống ít'];

export const INVENTORY_CATEGORY = {
  feed: { label: 'Thức ăn', emoji: '🌾' },
  medicine: { label: 'Thuốc', emoji: '💊' },
  equipment: { label: 'Dụng cụ', emoji: '🧰' },
};

export const RESTOCK_STATUS = {
  pending: { label: 'Chờ duyệt', color: '#ca8a04', bg: '#fef9c3' },
  approved: { label: 'Đã duyệt', color: '#16a34a', bg: '#dcfce7' },
  rejected: { label: 'Từ chối', color: '#dc2626', bg: '#fee2e2' },
};

// InventoryItem has no reorder level yet, so "low stock" is a fixed threshold in the UI.
export const LOW_STOCK_THRESHOLD = 10;

export function getStockLevel(quantity) {
  if (quantity <= 0) return { key: 'out', label: 'Hết hàng', color: '#dc2626', bg: '#fee2e2' };
  if (quantity <= LOW_STOCK_THRESHOLD) return { key: 'low', label: 'Sắp hết', color: '#ea580c', bg: '#ffedd5' };
  return { key: 'ok', label: 'Còn đủ', color: '#16a34a', bg: '#dcfce7' };
}

const FEED_TYPES = [
  { match: /grain|oat|ngũ cốc|yến mạch/i, label: 'Ngũ cốc', emoji: '🌾' },
  { match: /hay|grass|cỏ/i, label: 'Cỏ khô', emoji: '🌿' },
  { match: /vitamin|supplement|bổ sung/i, label: 'Vitamin', emoji: '💊' },
  { match: /carrot|cà rốt/i, label: 'Cà rốt', emoji: '🥕' },
  { match: /water|electrolyte|điện giải|nước/i, label: 'Nước điện giải', emoji: '💧' },
];

export function getFeedTypeLabel(type = '') {
  const found = FEED_TYPES.find((f) => f.match.test(type));
  return found ? { label: found.label, emoji: found.emoji } : { label: type, emoji: '🍽️' };
}

/** "Block A - Stall 12" -> { block: "Block A", stall: "Stall 12" } */
export function parseStableBlock(stableBlock = '') {
  const match = stableBlock.match(/^(.*?)\s*-\s*(.+)$/);
  if (!match) return { block: stableBlock || 'Khác', stall: stableBlock || '—' };
  return { block: match[1], stall: match[2] };
}

export const refId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);

const VI_WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const isSameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

export const isToday = (date) => isSameDay(date, new Date());

const pad = (n) => String(n).padStart(2, '0');

export const formatTime = (date) => `${pad(new Date(date).getHours())}:${pad(new Date(date).getMinutes())}`;

export const formatDate = (date) => {
  const d = new Date(date);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export const formatDayLabel = (date) => {
  if (isToday(date)) return 'Hôm nay';
  if (isSameDay(date, addDays(new Date(), -1))) return 'Hôm qua';
  if (isSameDay(date, addDays(new Date(), 1))) return 'Ngày mai';
  return `${VI_WEEKDAYS[new Date(date).getDay()]}, ${formatDate(date)}`;
};

export const formatDateTime = (date) => `${formatTime(date)} ${formatDate(date)}`;

export function daysBetween(date) {
  return Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
}

export const describeDaysLeft = (days) =>
  days < 0 ? `Quá hạn ${-days} ngày` : days === 0 ? 'Hôm nay' : `Còn ${days} ngày`;

/** Recurring vet/farrier dates due within `withinDays`, soonest first. */
export function getUpcomingCare(horse, withinDays = 14) {
  const items = [
    { key: 'vaccination', label: 'Tiêm phòng', emoji: '💉', date: horse?.careSchedule?.nextVaccinationDue },
    { key: 'deworming', label: 'Tẩy giun', emoji: '💊', date: horse?.careSchedule?.nextDewormingDue },
    { key: 'farrier', label: 'Kiểm tra móng', emoji: '🔧', date: horse?.careSchedule?.nextFarrierDue },
  ];
  return items
    .filter((i) => i.date)
    .map((i) => ({ ...i, daysLeft: daysBetween(i.date) }))
    .filter((i) => i.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Clock time of a feeding task: the ration's own time when known, else the slot's default. */
export function mealTimeOf(mealSlot, schedules = []) {
  const withTime = schedules.find((s) => s.mealTime === mealSlot && s.timeOfDay);
  return withTime?.timeOfDay || MEAL_CONFIG[mealSlot]?.defaultTime || null;
}

/** Title for one task row: feeding tasks say which meal, everything else keeps its own label. */
export function describeTask(task, schedulesForHorse = []) {
  const base = TASK_CONFIG[task.taskType] || { label: task.taskType, emoji: '📋' };
  if (task.taskType !== 'feeding' || !task.mealSlot) return { ...base, time: null };
  const meal = MEAL_CONFIG[task.mealSlot];
  return {
    emoji: meal?.emoji || base.emoji,
    label: `${base.label} — ${meal?.label || task.mealSlot}`,
    time: mealTimeOf(task.mealSlot, schedulesForHorse) || formatTime(task.scheduledDate),
  };
}
