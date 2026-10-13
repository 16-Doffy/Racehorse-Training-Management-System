// What a groom records when completing a task (DailyTask.observation). The API stores these as
// codes whatever the screen sent, so every screen that shows an observation — trainer, owner,
// groom — should turn the code into a label through these maps instead of printing it as-is.
export const APPETITE_LABELS = { full: 'Ăn hết', partial: 'Ăn dở', refused: 'Bỏ ăn' };
export const APPETITE_COLORS = { full: 'green', partial: 'gold', refused: 'red' };

export const MANURE_LABELS = {
  normal: 'Bình thường',
  dry: 'Khô / Táo bón',
  loose: 'Lỏng / Tiêu chảy',
  none: 'Không thấy phân',
};

export const WATER_INTAKE_LABELS = { normal: 'Bình thường', high: 'Uống nhiều', low: 'Uống ít' };

// Daily task types. The last two are the vet's care orders: they are created from a treatment and
// can't be assigned by hand; the assignment form offers only ASSIGNABLE_TASK_TYPES (below).
export const TASK_TYPE_LABELS = {
  feeding: 'Cho ăn',
  cleaning: 'Vệ sinh chuồng',
  bathing: 'Tắm rửa',
  icing: 'Ngâm chân nước đá',
  hoof_care: 'Chăm sóc móng',
  medication: 'Cho dùng thuốc',
  monitoring: 'Theo dõi theo y lệnh',
  other: 'Khác',
};

// The real-clock window every task carries (task.timing.state, computed by the server):
// a meal can only be recorded around its time, a dose only on its day. 'open' needs no tag.
export const TASK_TIMING_META = {
  upcoming: { label: 'Chưa tới giờ', color: 'default' },
  late: { label: 'Trễ hạn', color: 'orange' },
  missed: { label: 'Đã lỡ', color: 'red' },
};
export const ASSIGNABLE_TASK_TYPES = ['cleaning', 'bathing', 'icing', 'hoof_care', 'other']; // meals come from rations

// Where a task came from (DailyTask.source).
export const TASK_SOURCE_META = {
  trainer: { label: 'HLV giao', color: 'default' },
  vet: { label: 'Y lệnh bác sĩ', color: 'magenta' },
  system: { label: 'Tự động', color: 'blue' },
};

// Lifecycle of a groom's incident report. Reports filed before the status existed have none and
// count as open — use incidentStatusOf() rather than reading the field directly.
export const INCIDENT_STATUS_META = {
  open: { label: 'Chờ bác sĩ xử lý', color: 'red' },
  acknowledged: { label: 'Bác sĩ đã tiếp nhận', color: 'gold' },
  resolved: { label: 'Đã xử lý', color: 'green' },
};
export const incidentStatusOf = (incident) => incident?.status || 'open';

export const INCIDENT_SEVERITY_META = {
  low: { label: 'Nhẹ', color: 'gold' },
  medium: { label: 'Trung bình', color: 'orange' },
  high: { label: 'Nghiêm trọng', color: 'red' },
};

export const INCIDENT_CATEGORY_META = {
  refused_feed: { label: 'Bỏ ăn', color: 'orange', bg: 'warning' },
  illness: { label: 'Nghi bệnh', color: 'red', bg: 'danger' },
  hoof_injury: { label: 'Chấn thương móng', color: 'volcano', bg: 'danger' },
  behaviour: { label: 'Hành vi bất thường', color: 'gold', bg: 'warning' },
  accident: { label: 'Tai nạn tại chuồng', color: 'magenta', bg: 'danger' },
  other: { label: 'Khác', color: 'default', bg: 'secondary' },
};

export const MEDICATION_ROUTE_OPTIONS = [
  { value: 'oral', label: 'Uống (Đường miệng)' },
  { value: 'im', label: 'Tiêm bắp (IM)' },
  { value: 'iv', label: 'Tiêm tĩnh mạch (IV)' },
  { value: 'sc', label: 'Tiêm dưới da (SC)' },
  { value: 'topical', label: 'Bôi ngoài da' },
  { value: 'eye', label: 'Nhỏ mắt' },
  { value: 'other', label: 'Khác' },
];

export const MEDICATION_ROUTE_LABELS = {
  oral: 'Uống',
  im: 'Tiêm bắp (IM)',
  iv: 'Tiêm tĩnh mạch (IV)',
  sc: 'Tiêm dưới da (SC)',
  topical: 'Bôi ngoài',
  eye: 'Nhỏ mắt',
  other: 'Khác',
};
