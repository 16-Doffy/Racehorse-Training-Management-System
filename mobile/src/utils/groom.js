// Labels, lookups and small calculations shared by the Groom screens.
// `icon` values are names from components/Icon.jsx — never raw emoji.

export const TASK_CONFIG = {
  feeding: { label: 'Cho ăn', icon: 'feeding', color: '#ea580c', bg: '#ffedd5' },
  cleaning: { label: 'Vệ sinh chuồng', icon: 'cleaning', color: '#2563eb', bg: '#dbeafe' },
  bathing: { label: 'Tắm rửa', icon: 'bathing', color: '#0891b2', bg: '#cffafe' },
  icing: { label: 'Ngâm chân nước đá', icon: 'icing', color: '#4f46e5', bg: '#e0e7ff' },
  // Ordered by the vet through a treatment, not assigned by hand.
  medication: { label: 'Cho dùng thuốc', icon: 'medication', color: '#dc2626', bg: '#fee2e2' },
  monitoring: { label: 'Theo dõi theo y lệnh', icon: 'monitoring', color: '#7c3aed', bg: '#ede9fe' },
};

export const TASK_TYPE_ORDER = ['feeding', 'medication', 'monitoring', 'cleaning', 'bathing', 'icing'];

export const TASK_STATUS = {
  pending: { label: 'Chưa xong', color: '#6b7280', bg: '#f3f4f6' },
  completed: { label: 'Hoàn thành', color: '#16a34a', bg: '#dcfce7' },
  skipped: { label: 'Không thực hiện', color: '#ea580c', bg: '#ffedd5' },
};

/** Where the work came from — a vet's order carries more weight than a routine chore. */
export const TASK_SOURCE = {
  vet: { label: 'Y lệnh bác sĩ', icon: 'vet', color: '#dc2626', bg: '#fee2e2' },
  trainer: { label: 'HLV giao', icon: 'trainer', color: '#2563eb', bg: '#dbeafe' },
  system: { label: 'Tự động', icon: 'system', color: '#6b7280', bg: '#f3f4f6' },
};

export const HEALTH_STATUS = {
  eligible: { label: 'Đủ điều kiện', color: '#16a34a', bg: '#dcfce7' },
  monitoring: { label: 'Cần theo dõi', color: '#ca8a04', bg: '#fef9c3' },
  injured: { label: 'Chấn thương', color: '#dc2626', bg: '#fee2e2' },
  quarantined: { label: 'Cách ly', color: '#ea580c', bg: '#ffedd5' },
};

/**
 * The server decides when a task may be ticked (server/src/utils/taskTiming.js) and sends that
 * decision with every task as `timing`. The app shows the same words rather than guessing.
 */
export const TIMING_STATE = {
  upcoming: { label: 'Chưa tới giờ', color: '#6b7280', bg: '#f3f4f6' },
  open: { label: 'Làm được bây giờ', color: '#16a34a', bg: '#dcfce7' },
  late: { label: 'Trễ hạn', color: '#ea580c', bg: '#ffedd5' },
  missed: { label: 'Quá hạn ghi nhận', color: '#dc2626', bg: '#fee2e2' },
  closed: { label: 'Đã chốt', color: '#6b7280', bg: '#f3f4f6' },
};

// FeedingSchedule.mealTime stores the slot; `timeOfDay` carries its clock time when the trainer
// set one. These defaults match server/src/realtime/dailyTaskGenerator.js.
export const MEAL_CONFIG = {
  morning: { label: 'Bữa sáng', icon: 'morning', defaultTime: '06:00' },
  noon: { label: 'Bữa trưa', icon: 'noon', defaultTime: '11:30' },
  evening: { label: 'Bữa tối', icon: 'evening', defaultTime: '17:30' },
};
export const MEAL_ORDER = ['morning', 'noon', 'evening'];

export const SEVERITY = {
  low: { label: 'Nhẹ', color: '#2563eb', bg: '#dbeafe' },
  medium: { label: 'Trung bình', color: '#ea580c', bg: '#ffedd5' },
  high: { label: 'Nghiêm trọng', color: '#dc2626', bg: '#fee2e2' },
};

/**
 * Whether the groom may tick this task now: the server's timing window, and enough stock for what
 * it uses up (`supplyStatus`). Completing without the supplies is refused by the server anyway.
 */
export const canCompleteTask = (task) =>
  task?.status === 'pending' && task.timing?.canComplete !== false && task.supplyStatus?.ok !== false;

/** The supplies a task is short of, or an empty list. */
export const missingSupplies = (task) => (task?.supplyStatus?.ok === false ? task.supplyStatus.missing || [] : []);

/**
 * How hard a horse may be worked right now, decided by the vet's ongoing treatments and sent with
 * every horse as `trainingClearance`. A groom needs it before leading one out.
 */
export const TRAINING_LEVEL = {
  none: { label: 'Không được tập', color: '#dc2626', bg: '#fee2e2' },
  light: { label: 'Chỉ tập nhẹ', color: '#ea580c', bg: '#ffedd5' },
  moderate: { label: 'Cường độ vừa', color: '#ca8a04', bg: '#fef9c3' },
  high: { label: 'Tập bình thường', color: '#16a34a', bg: '#dcfce7' },
};

/**
 * Stock as the storeroom reads it: the counted unit first, then the packs it comes in
 * ("250 kg · 10 bao"), because an order is placed in packs but a ration is measured in kilos.
 */
export function formatStock(item, quantity = item?.quantity) {
  if (!item) return '';
  const base = `${quantity} ${item.unit}`;
  if (!item.packUnit || !item.packSize) return base;
  const packs = Math.floor(quantity / item.packSize + 1e-9);
  if (!packs) return base;
  const rest = Math.round((quantity - packs * item.packSize) * 100) / 100;
  return `${base} · ${packs} ${item.packUnit}${rest > 0 ? ` + ${rest} ${item.unit}` : ''}`;
}

/**
 * The shortage a rejected complete reports back: the API answers 409 with
 * { message, data: { missing } } when the store cannot cover the task.
 */
export const shortageFromError = (err) => err?.data?.missing || [];

/**
 * Turns a missing-supply line into what <RestockSheet> needs. The real stock item carries the
 * pack size and code, so prefer it; if the storeroom list has not loaded, the shortage line alone
 * still describes the item well enough to ask for more.
 */
export function restockRequestFor({ entry, missing = [], task, inventory = [] }) {
  const line = entry || missing[0];
  if (!line) return null;
  const item =
    inventory.find((i) => String(i._id) === String(line.inventoryItem)) || {
      _id: line.inventoryItem,
      name: line.name,
      unit: line.unit,
      quantity: line.available,
    };
  return { item, task, missing: missing.length ? missing : [line] };
}
/** One line per missing supply: "Cỏ khô: cần 5 kg, còn 2 kg". */
export const describeMissing = (missing = []) =>
  missing.map((m) => `${m.name}: cần ${m.needed} ${m.unit}, còn ${m.available} ${m.unit}`).join(' · ');

/** Lifecycle of an incident the groom filed: the vet picks it up and closes it. */
export const INCIDENT_STATUS = {
  open: { label: 'Chờ bác sĩ', color: '#dc2626', bg: '#fee2e2' },
  acknowledged: { label: 'Bác sĩ đã tiếp nhận', color: '#ca8a04', bg: '#fef9c3' },
  resolved: { label: 'Đã xử lý', color: '#16a34a', bg: '#dcfce7' },
};

export const INCIDENT_PRESETS = [
  'Ngựa bỏ ăn',
  'Có dấu hiệu đau bụng',
  'Có dấu hiệu sốt',
  'Móng bị xước',
  'Đi khập khiễng',
  'Vết thương ngoài da',
];

/** The codes the server stores an observation under, in the words a groom used to enter them. */
export const OBSERVATION_LABELS = {
  appetite: { full: 'Ăn hết', partial: 'Ăn dở', refused: 'Bỏ ăn' },
  manure: { normal: 'Phân bình thường', dry: 'Phân khô', loose: 'Phân lỏng', none: 'Không thấy phân' },
  waterIntake: { normal: 'Uống bình thường', high: 'Uống nhiều', low: 'Uống ít' },
};

/** "Ăn hết · Phân bình thường · Uống bình thường" — one line of what was seen at a meal. */
export const describeObservation = (observation) =>
  ['appetite', 'manure', 'waterIntake']
    .map((key) => OBSERVATION_LABELS[key][observation?.[key]] || observation?.[key])
    .filter(Boolean)
    .join(' · ');
// The observation form sends these Vietnamese labels; the server maps them to its own codes
// (see server/src/modules/stable/dailyTask.controller.js).
export const APPETITE_OPTIONS = ['Bình thường', 'Tốt', 'Kém', 'Bỏ ăn'];
export const MANURE_OPTIONS = ['Bình thường', 'Khô / Táo bón', 'Lỏng / Tiêu chảy', 'Không thấy phân'];
export const WATER_OPTIONS = ['Bình thường', 'Uống nhiều', 'Uống ít'];

export const INVENTORY_CATEGORY = {
  feed: { label: 'Thức ăn', icon: 'feed', color: '#16a34a', bg: '#dcfce7' },
  medicine: { label: 'Thuốc', icon: 'medicineBox', color: '#dc2626', bg: '#fee2e2' },
  equipment: { label: 'Dụng cụ', icon: 'equipment', color: '#2563eb', bg: '#dbeafe' },
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
  { match: /grain|oat|ngũ cốc|yến mạch|cám/i, label: 'Ngũ cốc', icon: 'grain' },
  { match: /hay|grass|cỏ/i, label: 'Cỏ khô', icon: 'hay' },
  { match: /vitamin|supplement|bổ sung|khoáng/i, label: 'Vitamin', icon: 'vitamin' },
  { match: /carrot|cà rốt|củ/i, label: 'Cà rốt', icon: 'carrot' },
  { match: /water|electrolyte|điện giải|nước|muối/i, label: 'Nước điện giải', icon: 'water' },
];

export function getFeedTypeLabel(type = '') {
  const found = FEED_TYPES.find((f) => f.match.test(type));
  return found ? { label: found.label, icon: found.icon } : { label: type, icon: 'feedOther' };
}

/** "Block A - Stall 12" -> { block: "Block A", stall: "Stall 12" } */
export function parseStableBlock(stableBlock = '') {
  const match = stableBlock.match(/^(.*?)\s*-\s*(.+)$/);
  if (!match) return { block: stableBlock || 'Khác', stall: stableBlock || '—' };
  return { block: match[1], stall: match[2] };
}

export const refId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);

/** Accent-insensitive contains, so searching "co kho" finds "Cỏ khô". */
export function normalize(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

export const matchesSearch = (haystack, needle) => !needle || normalize(haystack).includes(normalize(needle));

const VI_WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const VI_WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

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

export const weekdayShort = (date) => VI_WEEKDAYS_SHORT[new Date(date).getDay()];

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
    { key: 'vaccination', label: 'Tiêm phòng', icon: 'syringe', date: horse?.careSchedule?.nextVaccinationDue },
    { key: 'deworming', label: 'Tẩy giun', icon: 'deworm', date: horse?.careSchedule?.nextDewormingDue },
    { key: 'farrier', label: 'Kiểm tra móng', icon: 'farrier', date: horse?.careSchedule?.nextFarrierDue },
  ];
  return items
    .filter((i) => i.date)
    .map((i) => ({ ...i, daysLeft: daysBetween(i.date) }))
    .filter((i) => i.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Clock time of a meal: the ration's own time when known, else the slot's default. */
export function mealTimeOf(mealSlot, schedules = []) {
  const withTime = schedules.find((s) => s.mealTime === mealSlot && s.timeOfDay);
  return withTime?.timeOfDay || MEAL_CONFIG[mealSlot]?.defaultTime || null;
}

/** Title for one task row: feeding tasks say which meal, everything else keeps its own label. */
export function describeTask(task, schedulesForHorse = []) {
  const base = TASK_CONFIG[task.taskType] || { label: task.taskType, icon: 'note' };
  if (task.taskType !== 'feeding' || !task.mealSlot) {
    return { ...base, time: task.scheduledDate ? formatTime(task.scheduledDate) : null, meal: null };
  }
  const meal = MEAL_CONFIG[task.mealSlot];
  return {
    ...base,
    icon: meal?.icon || base.icon,
    label: `${base.label} — ${meal?.label || task.mealSlot}`,
    meal: meal?.label,
    time: mealTimeOf(task.mealSlot, schedulesForHorse) || formatTime(task.scheduledDate),
  };
}

/** The meal slot that is current or next, using each ration's own clock time. */
export function nextMealSlot(schedules = [], now = new Date()) {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const slots = MEAL_ORDER.map((slot) => {
    const time = mealTimeOf(slot, schedules) || MEAL_CONFIG[slot].defaultTime;
    const [hh, mm] = time.split(':').map(Number);
    return { slot, time, minutes: hh * 60 + mm };
  });
  const found = slots.find((s) => s.minutes + 60 > minutesNow);
  return found ? { ...found, tomorrow: false } : { ...slots[0], tomorrow: true };
}

/** "2.5kg" -> { value: 2.5, unit: 'kg' }; "5" -> { value: 5, unit: '' }; "nửa bó" -> null. */
export function parseQuantity(text) {
  const raw = String(text ?? '').replace(',', '.').trim();
  const match = raw.match(/([\d.]+)\s*(.*)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: match[2].trim() };
}

/**
 * How long the stock on hand covers the rations the groom has to serve.
 *
 * Rations name their feed in free text ("hay", "Cỏ khô") while the store names items ("Cỏ khô
 * Timothy"), so they are matched by feed kind — the same grouping the ration list already shows.
 *
 * "How many days is that" is only claimed when both sides are written in the same unit: a ration
 * in kilos against a store counted in bales would otherwise produce a confident, wrong number.
 */
export function buildFeedCoverage({ feedings, horseIds, inventory }) {
  const needByKind = new Map();

  feedings
    .filter((f) => !horseIds || horseIds.has(refId(f.horse)))
    .forEach((schedule) => {
      (schedule.items || []).forEach((item) => {
        const feed = getFeedTypeLabel(item.type);
        const amount = parseQuantity(item.quantity);
        const entry = needByKind.get(feed.label) || { kind: feed.label, icon: feed.icon, perDay: 0, units: new Set(), unknown: false };
        if (!amount) entry.unknown = true;
        else {
          entry.perDay += amount.value;
          if (amount.unit) entry.units.add(normalize(amount.unit));
        }
        needByKind.set(feed.label, entry);
      });
    });

  return [...needByKind.values()]
    .map((need) => {
      const items = inventory.filter(
        (item) => item.category === 'feed' && getFeedTypeLabel(item.name).label === need.kind
      );
      const stock = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const unit = items[0]?.unit || '';
      const rationUnits = [...need.units];
      // One unit on the ration, and the store counts in the same one.
      const comparable = items.length > 0 && rationUnits.length === 1 && normalize(unit) === rationUnits[0];
      const daysLeft = comparable && need.perDay > 0 ? stock / need.perDay : null;
      return {
        ...need,
        items,
        stock,
        unit,
        rationUnit: rationUnits.length === 1 ? rationUnits[0] : '',
        comparable,
        daysLeft,
        // Under a day of feed on hand is the point at which asking for more cannot wait.
        level:
          items.length === 0
            ? 'unknown'
            : stock <= 0
              ? 'critical'
              : daysLeft === null
                ? 'unknown'
                : daysLeft < 1
                  ? 'critical'
                  : daysLeft < 3
                    ? 'low'
                    : 'ok',
      };
    })
    .sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99));
}

export const formatDays = (days) => (days >= 10 ? '10+ ngày' : `${Math.floor(days * 10) / 10} ngày`);

/**
 * What the store has for one named thing — a medicine on a prescription, or a feed on a ration.
 *
 * Names are written by hand in two places ("Vitamin tổng hợp" on the shelf, "Vitamin" in the
 * ration), so matching is by containment either way, and feeds fall back to their kind. Returns
 * null when nothing in the catalogue looks like it, which the screens show as "chưa có trong kho"
 * rather than as zero stock.
 */
export function findStock(name, inventory = [], category) {
  if (!name) return null;
  const pool = category ? inventory.filter((i) => i.category === category) : inventory;
  const needle = normalize(name);

  const direct = pool.filter((item) => {
    const hay = normalize(item.name);
    return hay === needle || hay.includes(needle) || needle.includes(hay);
  });

  const matches =
    direct.length > 0
      ? direct
      : category === 'feed'
        ? pool.filter((item) => getFeedTypeLabel(item.name).label === getFeedTypeLabel(name).label)
        : [];

  if (matches.length === 0) return null;

  const quantity = matches.reduce((sum, item) => sum + (item.quantity || 0), 0);
  return {
    quantity,
    unit: matches[0].unit || '',
    items: matches,
    level: getStockLevel(quantity),
  };
}
