// Labels, lookups and small calculations shared by the Groom screens.
// `icon` values are names from components/Icon.jsx — never raw emoji.

export const TASK_CONFIG = {
  feeding: { label: 'Cho ăn', icon: 'feeding', color: '#ea580c', bg: '#ffedd5' },
  cleaning: { label: 'Vệ sinh chuồng', icon: 'cleaning', color: '#2563eb', bg: '#dbeafe' },
  bathing: { label: 'Tắm rửa', icon: 'bathing', color: '#0891b2', bg: '#cffafe' },
  icing: { label: 'Ngâm chân nước đá', icon: 'icing', color: '#4f46e5', bg: '#e0e7ff' },
  hoof_care: { label: 'Chăm sóc móng', icon: 'farrier', color: '#92400e', bg: '#fef3c7' },
  // Ordered by the vet through a treatment, not assigned by hand.
  medication: { label: 'Cho dùng thuốc', icon: 'medication', color: '#dc2626', bg: '#fee2e2' },
  monitoring: { label: 'Theo dõi theo y lệnh', icon: 'monitoring', color: '#7c3aed', bg: '#ede9fe' },
  // Any job the list doesn't name; the trainer's note says what it is.
  other: { label: 'Việc khác', icon: 'note', color: '#475569', bg: '#f1f5f9' },
};

export const TASK_TYPE_ORDER = ['feeding', 'medication', 'monitoring', 'cleaning', 'bathing', 'icing', 'hoof_care', 'other'];

// The three parts of the day's work, as the "Chăm sóc" tab splits them.
export const CARE_TYPES = ['medication', 'monitoring'];
export const CHORE_TYPES = ['cleaning', 'bathing', 'icing', 'hoof_care', 'other'];

/** How a medicine is given (Treatment.medications[].route); null on prescriptions written before it existed. */
export const MEDICATION_ROUTE = {
  oral: 'Uống',
  im: 'Tiêm bắp',
  iv: 'Tiêm tĩnh mạch',
  sc: 'Tiêm dưới da',
  topical: 'Bôi ngoài da',
  eye: 'Nhỏ mắt',
  other: 'Khác (theo dặn dò)',
};

/** Routine care the vet records (GET /horses/:id/care-events). */
export const CARE_EVENT_KIND = {
  vaccination: { label: 'Tiêm phòng', icon: 'syringe' },
  deworming: { label: 'Tẩy giun', icon: 'deworm' },
  farrier: { label: 'Đóng móng', icon: 'farrier' },
};

/**
 * What a notification is about, for the ones a groom receives. Unknown types fall back to the
 * severity's look, so a type added on the server later still shows.
 */
export const NOTIFICATION_TYPE = {
  task_assigned: { label: 'Việc được giao', icon: 'tasks' },
  care_order: { label: 'Y lệnh bác sĩ', icon: 'vet' },
  meal_missed: { label: 'Bữa bị bỏ lỡ', icon: 'clock' },
  session_scheduled: { label: 'Lịch tập', icon: 'session' },
  restock_decision: { label: 'Đề xuất kho', icon: 'supplies' },
  low_stock: { label: 'Kho sắp hết', icon: 'supplies' },
  incident_report: { label: 'Sự cố', icon: 'warning' },
  incident_update: { label: 'Sự cố', icon: 'warning' },
  exam_request: { label: 'Lịch khám', icon: 'exam' },
  injury_lock: { label: 'Khóa tập', icon: 'lock' },
  training_restricted: { label: 'Hạn chế tập', icon: 'lock' },
  training_unlocked: { label: 'Mở khóa tập', icon: 'check' },
  horse_assigned: { label: 'Phân công', icon: 'stall' },
};

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

/** The supplies a task is short of, or an empty list. */
export const missingSupplies = (task) => (task?.supplyStatus?.ok === false ? task.supplyStatus.missing || [] : []);

/**
 * Whether a meal has an approved ration behind it: the trainer's ration for that horse and slot,
 * approved and not empty. A horse with no ration gets a plain "feed the horse" task with no slot,
 * which the server refuses to record (NO_APPROVED_RATION). `rations` null means "not loaded yet":
 * nothing is claimed either way.
 */
export function hasApprovedRation(task, rations) {
  if (task?.taskType !== 'feeding' || !rations) return true;
  if (!task.mealSlot) return false;
  return rations.some(
    (r) => refId(r.horse) === refId(task.horse) && r.mealTime === task.mealSlot && r.approvedBy && (r.items || []).length > 0
  );
}

/** Supplies of a task that the store holds past their expiry date (the server refuses them). */
export function expiredSupplies(task, inventory = []) {
  const today = startOfDay(new Date());
  return (task?.supplies || [])
    .map((s) => inventory.find((i) => String(i._id) === String(s.inventoryItem)))
    .filter((item) => item?.expiryDate && new Date(item.expiryDate) < today);
}

/**
 * Why a pending task cannot be recorded right now, apart from its time window: the same rules the
 * server applies on completion, so the button is never offered for something it will refuse.
 * `ctx` = { rations, inventory }; either may be omitted.
 */
export function taskBlockers(task, { rations = null, inventory = [] } = {}) {
  if (task?.status !== 'pending') return [];
  const blockers = [];
  if (!hasApprovedRation(task, rations)) {
    blockers.push({ code: 'NO_APPROVED_RATION', message: 'Chưa có khẩu phần được HLV duyệt cho bữa này.' });
  }
  const missing = missingSupplies(task);
  if (missing.length) blockers.push({ code: 'SHORT_OF_STOCK', message: `Thiếu trong kho: ${describeMissing(missing)}`, missing });
  const expired = expiredSupplies(task, inventory);
  if (expired.length) {
    blockers.push({ code: 'EXPIRED_SUPPLY', message: `Vật tư đã hết hạn: ${expired.map((i) => i.name).join(', ')}` });
  }
  return blockers;
}

/**
 * Whether the groom may tick this task now: the server's timing window, and nothing blocking it
 * (stock, an approved ration, an expired item). The server checks the same things again.
 */
export const canCompleteTask = (task, ctx) =>
  task?.status === 'pending' && task.timing?.canComplete !== false && taskBlockers(task, ctx).length === 0;

/**
 * Where a task stands for the groom, in one word. The stored status only knows pending / completed
 * / skipped; this adds the server's timing and what blocks it, and tells "I couldn't do it" (the
 * groom reported it) apart from "called off" (the trainer skipped it). Every list, badge and
 * counter reads this, so they agree with each other.
 */
export const TASK_STATE = {
  ready: { label: 'Làm được bây giờ', color: '#16a34a', bg: '#dcfce7', open: true },
  upcoming: { label: 'Chưa tới giờ', color: '#6b7280', bg: '#f3f4f6', open: true },
  late: { label: 'Trễ hạn', color: '#ea580c', bg: '#ffedd5', open: true },
  blocked: { label: 'Bị chặn', color: '#dc2626', bg: '#fee2e2', open: true },
  missed: { label: 'Quá hạn ghi nhận', color: '#dc2626', bg: '#fee2e2', open: false },
  completed: { label: 'Hoàn thành', color: '#16a34a', bg: '#dcfce7', open: false },
  unable: { label: 'Không thực hiện được', color: '#ea580c', bg: '#ffedd5', open: false },
  cancelled: { label: 'HLV cho bỏ qua', color: '#6b7280', bg: '#f3f4f6', open: false },
};

export function taskState(task, ctx) {
  if (!task) return null;
  if (task.status === 'completed') return { key: 'completed', ...TASK_STATE.completed };
  if (task.status === 'skipped') {
    const byAssignee = task.skippedBy ? refId(task.skippedBy) === refId(task.assignedTo) : !!task.skipReason;
    const key = byAssignee ? 'unable' : 'cancelled';
    return { key, ...TASK_STATE[key], reason: task.skipReason };
  }
  const timing = task.timing || {};
  if (timing.state === 'missed') {
    // The server's reason is about ticking it now; what is left is to say what happened.
    const by = timing.closesAt ? ` (hạn ${formatTime(timing.closesAt)})` : '';
    return {
      key: 'missed',
      ...TASK_STATE.missed,
      reason: `Đã quá giờ ghi nhận${by}. Đã làm mà quên bấm: chọn "quên ghi" với giờ thật; chưa làm được: báo để HLV/bác sĩ biết.`,
    };
  }
  const blockers = taskBlockers(task, ctx);
  if (blockers.length) return { key: 'blocked', ...TASK_STATE.blocked, reason: blockers[0].message, blockers };
  if (timing.state === 'upcoming') return { key: 'upcoming', ...TASK_STATE.upcoming, reason: timing.reason };
  if (timing.state === 'late') return { key: 'late', ...TASK_STATE.late, reason: timing.reason };
  return { key: 'ready', ...TASK_STATE.ready };
}

/**
 * The day's counters, from one pass over the worklist. "Today" is work scheduled today; `overdue`
 * is earlier work that can still be done (a chore from yesterday). Meals and doses whose window
 * closed are `missed`: shown, never counted as something still to do.
 */
export function summarizeTasks(tasks = [], ctx, now = new Date()) {
  const today = startOfDay(now);
  const states = tasks.map((task) => ({ task, state: taskState(task, ctx) }));
  const todays = states.filter(({ task }) => isSameDay(task.scheduledDate, now));
  const earlier = states.filter(({ task }) => new Date(task.scheduledDate) < today);
  const of = (list, key) => list.filter(({ state }) => state?.key === key).map(({ task }) => task);
  const open = (list) => list.filter(({ state }) => state?.open).map(({ task }) => task);

  const todayOpen = open(todays);
  const overdue = open(earlier);
  const cancelled = of(todays, 'cancelled');
  return {
    today: todays.map(({ task }) => task),
    // What the progress bar measures: the day's work, minus what the trainer called off.
    planned: todays.length - cancelled.length,
    completed: of(todays, 'completed'),
    unable: of(todays, 'unable'),
    cancelled,
    missed: of(todays, 'missed'),
    blocked: [...of(todays, 'blocked'), ...of(earlier, 'blocked')],
    ready: of(todays, 'ready'),
    upcoming: of(todays, 'upcoming'),
    todayOpen,
    overdue,
    // Everything still to do, today or carried over: what the tab badges count.
    open: [...todayOpen, ...overdue],
    stateOf: (task) => states.find((s) => s.task === task)?.state || taskState(task, ctx),
  };
}

// How far back a record may be sent (server dailyTask.controller.js MAX_OFFLINE_HOURS).
const LATE_RECORD_HOURS = 24;
const LATE_STEP_MINUTES = 30;

/**
 * The times a meal or dose that was done but not ticked may be recorded at: inside its own window
 * (the server judges the window at the time given, not at the time sent) and within the last 24
 * hours. Every 30 minutes, plus the scheduled time itself. Empty when it can't be recorded late.
 */
export function lateRecordTimes(task, now = new Date()) {
  const { opensAt, closesAt } = task?.timing || {};
  if (!opensAt || !closesAt) return [];
  const from = Math.max(new Date(opensAt).getTime(), now.getTime() - LATE_RECORD_HOURS * 3600000 + 60000);
  const to = Math.min(new Date(closesAt).getTime(), now.getTime());
  if (from > to) return [];
  const step = LATE_STEP_MINUTES * 60000;
  const times = new Set();
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) times.add(t);
  const scheduled = new Date(task.scheduledDate).getTime();
  if (scheduled >= from && scheduled <= to) times.add(scheduled);
  return [...times].sort((a, b) => a - b).map((t) => new Date(t));
}

/**
 * A missed meal or dose the groom did give but forgot to record: it can still be recorded at its
 * real time (shown as recorded late). Not when a make-up meal already stands in for it, and not
 * when something would block it anyway (no ration, short of stock, expired).
 */
export const canRecordLate = (task, ctx, now = new Date()) =>
  task?.status === 'pending' &&
  task.timing?.state === 'missed' &&
  !task.makeUpTask &&
  taskBlockers(task, ctx).length === 0 &&
  lateRecordTimes(task, now).length > 0;

/** A meal or dose whose window closed can still be reported as not done (the trainer / vet is told). */
export const canReportNotDone = (task) => task?.status === 'pending';

/** What the Manager approved of a request: all of it unless they approved less (approvedQuantity). */
export const approvedOf = (request) => request?.approvedQuantity ?? request?.quantity;

/** One id per action the groom takes, so a resend of the same tap is recognised by the server. */
export const newOpId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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

/**
 * A request to the Manager: pending → approved (ordered, the goods are on their way) → received
 * (counted into stock), or rejected. Approved is not stock: nothing can be used until it arrives.
 */
export const RESTOCK_STATUS = {
  pending: { label: 'Chờ duyệt', color: '#ca8a04', bg: '#fef9c3' },
  approved: { label: 'Đã duyệt · chờ hàng về', color: '#2563eb', bg: '#dbeafe' },
  received: { label: 'Đã nhận hàng', color: '#16a34a', bg: '#dcfce7' },
  rejected: { label: 'Từ chối', color: '#dc2626', bg: '#fee2e2' },
};

/** The status of one request. Requests approved before the delivery step were counted on approval. */
export function restockState(request) {
  if (request?.status === 'approved' && !request.awaitingDelivery) {
    return { key: 'received', label: 'Đã duyệt · đã cộng kho', color: '#16a34a', bg: '#dcfce7' };
  }
  // The Manager approved less than asked: say how much is on its way.
  if (request?.status === 'approved' && request.approvedQuantity != null && request.approvedQuantity < request.quantity) {
    return { key: 'approved', ...RESTOCK_STATUS.approved, label: `Duyệt ${request.approvedQuantity}/${request.quantity} · chờ hàng về`, partial: true };
  }
  return { key: request?.status, ...(RESTOCK_STATUS[request?.status] || { label: request?.status, color: '#6b7280', bg: '#f3f4f6' }) };
}

/** Still in the Manager's hands: asked for, or ordered and not yet arrived. */
export const isOpenRequest = (request) =>
  request?.status === 'pending' || (request?.status === 'approved' && request.awaitingDelivery && !request.receivedAt);

// Same rule as the server's low-stock warning (inventory/stock.service.js): low at or under the
// Manager's minimum, or when what the rations and prescriptions use runs out within this many days.
export const LOW_STOCK_DAYS = 3;
const EXPIRING_DAYS = 14;

const LEVELS = {
  expired: { key: 'expired', label: 'Hết hạn', color: '#dc2626', bg: '#fee2e2', short: true },
  out: { key: 'out', label: 'Hết hàng', color: '#dc2626', bg: '#fee2e2', short: true },
  low: { key: 'low', label: 'Sắp hết', color: '#ea580c', bg: '#ffedd5', short: true },
  expiring: { key: 'expiring', label: 'Sắp hết hạn', color: '#ca8a04', bg: '#fef9c3', short: false },
  ok: { key: 'ok', label: 'Còn đủ', color: '#16a34a', bg: '#dcfce7', short: false },
};

/**
 * How one stock item stands. `usage` is its line from GET /inventory/forecast ({ dailyUsage,
 * daysLeft }) when known. `short` marks the levels that call for asking the Manager.
 */
export function getStockLevel(item, usage) {
  if (item === null || item === undefined) return LEVELS.ok;
  const entry = typeof item === 'number' ? { quantity: item } : item;
  const quantity = Number(entry.quantity) || 0;
  const today = startOfDay(new Date());
  if (entry.expiryDate && new Date(entry.expiryDate) < today) return LEVELS.expired;
  if (quantity <= 0) return LEVELS.out;
  const reorder = Number(entry.reorderLevel) || 0;
  const daysLeft = usage?.daysLeft ?? entry.daysLeft;
  if ((reorder > 0 && quantity <= reorder) || (daysLeft !== null && daysLeft !== undefined && daysLeft < LOW_STOCK_DAYS)) {
    return LEVELS.low;
  }
  if (entry.expiryDate && new Date(entry.expiryDate) < addDays(today, EXPIRING_DAYS)) return LEVELS.expiring;
  return LEVELS.ok;
}

/** The level a stock item carries (set once when the list loads), or worked out now. */
export const levelOf = (item) => item?.level || getStockLevel(item);

/** Kinds of incident, the same codes the server stores (stable/dailyTask.controller.js). */
export const INCIDENT_CATEGORY = {
  refused_feed: { label: 'Bỏ ăn', icon: 'feeding' },
  illness: { label: 'Nghi bệnh', icon: 'monitoring' },
  hoof_injury: { label: 'Chấn thương móng', icon: 'farrier' },
  behaviour: { label: 'Hành vi bất thường', icon: 'alert' },
  accident: { label: 'Tai nạn tại chuồng', icon: 'warning' },
  other: { label: 'Khác', icon: 'note' },
};

/** How much of the meal the horse ate, as the share the readiness check reads (amountEatenPercent). */
export const EATEN_OPTIONS = [
  { value: 100, label: 'Ăn hết' },
  { value: 75, label: 'Khoảng 3/4' },
  { value: 50, label: 'Khoảng 1/2' },
  { value: 25, label: 'Khoảng 1/4' },
  { value: 0, label: 'Không ăn' },
];

/** "Xuất 3 kg Cỏ khô, 1 kg Yến mạch" — what a task takes out of stock when it is recorded. */
export const describeSupplies = (supplies = []) =>
  supplies
    .filter((s) => s.amount)
    .map((s) => `${s.amount} ${s.unit || ''} ${s.name || ''}`.replace(/\s+/g, ' ').trim())
    .join(', ');

/** Training session statuses, as the trainer's screens name them (server constants/training.js). */
export const SESSION_STATUS = {
  scheduled: { label: 'Đã lên lịch', color: '#6b7280', bg: '#f3f4f6' },
  ready: { label: 'Sẵn sàng', color: '#16a34a', bg: '#dcfce7' },
  blocked: { label: 'Bị chặn', color: '#dc2626', bg: '#fee2e2' },
  in_progress: { label: 'Đang diễn ra', color: '#2563eb', bg: '#dbeafe' },
  completed: { label: 'Đã xong', color: '#16a34a', bg: '#dcfce7' },
  evaluated: { label: 'Đã đánh giá', color: '#16a34a', bg: '#dcfce7' },
  aborted: { label: 'Dừng giữa chừng', color: '#ea580c', bg: '#ffedd5' },
  cancelled: { label: 'Đã hủy', color: '#6b7280', bg: '#f3f4f6' },
  missed: { label: 'Đã lỡ giờ', color: '#dc2626', bg: '#fee2e2' },
};

// A dose can be recorded until this many hours after its time (server utils/taskTiming.js).
const DOSE_CLOSES_AFTER_HOURS = 4;

/** Whether a medicine with its own date range is given on `day` (server treatmentCare.service.js). */
export function medicineDueOn(medication, day = new Date()) {
  const start = startOfDay(day);
  const end = addDays(start, 1);
  if (medication?.startDate && new Date(medication.startDate) >= end) return false;
  if (medication?.endDate && new Date(medication.endDate) < start) return false;
  return true;
}

/**
 * The server writes a dose task's note as "Tên thuốc — Liều — [giờ] — (dặn dò)"
 * (health/treatmentCare.service.js), so a task belongs to the medicine whose name and dose open it.
 */
const doseNoteMatches = (note, medication) => {
  const [name, dosage] = String(note || '').split(' — ');
  return name === medication.name && (!medication.dosage || dosage === medication.dosage);
};

/**
 * One entry per time of day a medicine is given today ("08:00", "16:00"), each with its own task:
 * giving the 08:00 dose leaves the 16:00 one open. A time with no task says why — not today, the
 * window had already closed when the order came in, or the horse is someone else's.
 */
export function doseSlots(treatment, medication, tasks = [], { mine = true, now = new Date() } = {}) {
  const todays = tasks.filter(
    (t) =>
      t.taskType === 'medication' &&
      refId(t.treatment) === treatment._id &&
      isSameDay(t.scheduledDate, now) &&
      doseNoteMatches(t.note, medication)
  );
  const times = (medication.times || []).length ? medication.times : [null];
  const dueToday = medicineDueOn(medication, now);
  return times.map((time) => {
    const task = todays.find((t) => (t.dueTime || null) === time) || (time === null ? todays[0] : null);
    if (task) return { time, task };
    let reason = 'Hệ thống chưa tạo việc cho liều này — kéo xuống để tải lại.';
    if (!mine) reason = 'Không phải ngựa bạn phụ trách.';
    else if (!dueToday) reason = 'Hôm nay không dùng thuốc này (ngoài ngày bắt đầu/kết thúc).';
    else if (time) {
      const [hh, mm] = time.split(':').map(Number);
      const closes = new Date(startOfDay(now));
      closes.setHours(hh + DOSE_CLOSES_AFTER_HOURS, mm, 0, 0);
      if (now > closes) reason = `Liều ${time} đã qua giờ trước khi có y lệnh — không có việc hôm nay.`;
    }
    return { time, task: null, reason };
  });
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

/**
 * One line of an approved ration as the groom measures it: the stock item's own name and the
 * amount in its unit ("Cỏ khô Timothy · 5 kg"). Older lines written as free text keep their kind
 * and text ("Cỏ khô · 2.5 kg").
 */
export function rationLine(item = {}) {
  const feed = getFeedTypeLabel(item.type);
  const linked = !!item.inventoryItem;
  const amount = item.amount && item.unit ? `${item.amount} ${item.unit}` : item.quantity || '';
  return { label: linked ? item.type : feed.label, icon: feed.icon, amount, linked };
}

// A stall on the Manager's stable map has a code: its zone (1-4 letters or digits) and its number,
// "A-03", "CL-01". A horse placed on the map carries that code as its stableBlock.
const STALL_CODE = /^([A-Z0-9]{1,4})-(\d{2,})$/;

/**
 * Where a stableBlock puts the horse. A stall code keeps the whole code as the stall and its zone as
 * the block: "A-03" -> { block: "Khu A", stall: "A-03" }. Free text from before the map is split at
 * its dash: "Block A - Stall 12" -> { block: "Block A", stall: "Stall 12" }.
 */
export function parseStableBlock(stableBlock = '') {
  const text = String(stableBlock || '').trim();
  const code = text.match(STALL_CODE);
  if (code) return { block: `Khu ${code[1]}`, stall: text, zone: code[1] };
  const match = text.match(/^(.*?)\s*-\s*(.+)$/);
  if (!match) return { block: text || 'Khác', stall: text || '—' };
  return { block: match[1], stall: match[2] };
}

/** "Block A", "Khu A" and the zone of "A-03" are one area: compared without the word in front. */
export function areaKey(block = '') {
  return normalize(block).replace(/^(block|khu|day)\s+/, '');
}

export const refId = (ref) => (ref && typeof ref === 'object' ? ref._id : ref);

// ---------- The stable map (GET /stable/stalls) ----------

export const STALL_TYPES = {
  standard: { label: 'Chuồng thường' },
  isolation: { label: 'Chuồng cách ly', color: '#ea580c', bg: '#ffedd5' },
  recovery: { label: 'Chuồng hồi phục', color: '#2563eb', bg: '#dbeafe' },
};

const STALL_STATES = {
  maintenance: { key: 'maintenance', label: 'Bảo trì', color: '#b45309', bg: '#fef3c7' },
  empty: { key: 'empty', label: 'Trống', color: '#9ca3af', bg: '#f3f4f6' },
  taken: { key: 'taken', label: 'Có ngựa', color: '#6b7280', bg: '#f3f4f6' },
};

/**
 * How a stall on the map stands: under maintenance, empty, or the health of the horse in it — the
 * same colours as the horse's health everywhere else in the app. A horse the server hides from this
 * user (`occupant: { hidden: true }`) is only "taken".
 */
export function stallState(stall) {
  if (!stall || stall.status === 'maintenance') return stall ? STALL_STATES.maintenance : STALL_STATES.empty;
  if (!stall.occupied || !stall.occupant) return STALL_STATES.empty;
  const health = stall.occupant.horse?.healthStatus;
  if (stall.occupant.hidden || !stall.occupant.horse) return STALL_STATES.taken;
  return { key: health || 'eligible', ...(HEALTH_STATUS[health] || HEALTH_STATUS.eligible) };
}

/** The zones in the map's own order (the server sorts by zone, then position), each with its stalls. */
export function groupZones(stalls = []) {
  const zones = new Map();
  for (const stall of stalls) {
    if (!zones.has(stall.zone)) {
      zones.set(stall.zone, { key: stall.zone, name: stall.zoneName || `Khu ${stall.zone}`, purpose: stall.zonePurpose || '', stalls: [] });
    }
    zones.get(stall.zone).stalls.push(stall);
  }
  return [...zones.values()];
}

/**
 * The groom's own stalls: those the Manager gave them (`caretaker`, empty stalls too) or whose horse
 * they look after, and their horses still on a free-text stall from before the map (`unplaced`), which
 * the Manager has yet to put on it.
 */
export function myStallsOf(map, userId) {
  const mine = (caretaker) => !!userId && String(refId(caretaker) || '') === String(userId);
  return {
    stalls: (map?.stalls || []).filter((s) => mine(s.caretaker) || (!s.occupant?.hidden && mine(s.occupant?.caretaker))),
    unplaced: (map?.unplaced || []).filter((u) => mine(u.caretaker)),
  };
}

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
  // "Việc khác" is only a category; the trainer's note is the job itself.
  const label = task.taskType === 'other' && task.note ? task.note : base.label;
  if (task.taskType === 'feeding' && !task.mealSlot) {
    return { ...base, label: `${base.label} trong ngày`, time: null, meal: null };
  }
  if (task.taskType !== 'feeding') {
    return { ...base, label, time: task.dueTime || (task.scheduledDate ? formatTime(task.scheduledDate) : null), meal: null };
  }
  const meal = MEAL_CONFIG[task.mealSlot];
  // A make-up the trainer asked for: given now, not at the ration's time.
  if (task.makeUpOf) {
    return {
      ...base,
      icon: meal?.icon || base.icon,
      label: `Cho ăn bù — ${meal?.label || task.mealSlot}`,
      meal: meal?.label,
      makeUp: true,
      time: formatTime(task.scheduledDate),
    };
  }
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

export const formatDays = (days) =>
  days >= 10 ? '10+ ngày' : days < 1 ? 'chưa tới 1 ngày' : `${Math.floor(days * 10) / 10} ngày`;

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
  const reorderLevel = matches.reduce((sum, item) => sum + (Number(item.reorderLevel) || 0), 0);
  return {
    quantity,
    unit: matches[0].unit || '',
    items: matches,
    level: matches.length === 1 ? levelOf(matches[0]) : getStockLevel({ quantity, reorderLevel }),
  };
}

/**
 * The stock item a ration line or a prescribed medicine is linked to, exactly (by id), with its
 * level. Falls back to matching by name only for older lines that were never linked.
 */
export function stockFor({ inventoryItem, name }, inventory = [], category) {
  const id = refId(inventoryItem);
  const linked = id ? inventory.find((i) => String(i._id) === String(id)) : null;
  if (linked) return { quantity: linked.quantity, unit: linked.unit, items: [linked], level: levelOf(linked), linked: true };
  return findStock(name, inventory, category);
}
