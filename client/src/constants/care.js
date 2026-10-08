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
export const ASSIGNABLE_TASK_TYPES = ['cleaning', 'bathing', 'icing', 'other']; // meals come from rations

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
