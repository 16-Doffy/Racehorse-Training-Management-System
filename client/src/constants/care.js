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
// What happened to a meal (server feeding/feedingTimetable.service.js; today's from the task's timing).
export const MEAL_STATUS_META = {
  fed: { label: 'Đã cho ăn', color: 'green' },
  open: { label: 'Đang trong giờ', color: 'blue' },
  upcoming: { label: 'Chưa tới giờ', color: 'default' },
  late: { label: 'Trễ hạn', color: 'orange' },
  missed: { label: 'Đã lỡ', color: 'red' },
  skipped: { label: 'Bỏ bữa', color: 'orange' },
  closed: { label: 'Đã đóng', color: 'default' },
  planned: { label: 'Dự kiến', color: 'default' },
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

export const CARE_EVENT_META = {
  vaccination: { label: 'Tiêm phòng', icon: 'bi-eyedropper', color: 'primary', bg: 'primary', badgeColor: 'blue' },
  deworming: { label: 'Tẩy giun', icon: 'bi-capsule', color: 'success', bg: 'success', badgeColor: 'green' },
  farrier: { label: 'Đóng móng', icon: 'bi-hammer', color: 'dark', bg: 'dark', badgeColor: 'purple' },
};

// The details recorded with routine care, by kind — the same keys as the server
// (server/src/constants/careEvent.js), which checks them.
export const VACCINE_TARGETS = {
  influenza: 'Cúm ngựa',
  tetanus: 'Uốn ván',
  ehv: 'Herpes (EHV-1/4)',
  encephalomyelitis: 'Viêm não tủy',
  west_nile: 'Tây sông Nile',
  rabies: 'Dại',
  strangles: 'Viêm hạch (Strangles)',
};
export const SHOT_TYPES = { primary_1: 'Mũi cơ bản 1', primary_2: 'Mũi cơ bản 2', booster: 'Mũi nhắc lại' };
export const CARE_ROUTES = { im: 'Tiêm bắp', sc: 'Tiêm dưới da', intranasal: 'Nhỏ mũi', oral: 'Uống (gel)', feed: 'Trộn thức ăn' };
export const CARE_REACTIONS = { none: 'Không phản ứng', swelling: 'Sưng chỗ tiêm', fever: 'Sốt nhẹ', lethargy: 'Mệt, bỏ ăn', other: 'Phản ứng khác' };
export const FARRIER_WORK = { trim: 'Gọt sửa móng', new_shoes: 'Đóng móng mới', reset: 'Đóng lại móng cũ', corrective: 'Móng chỉnh hình', remove: 'Tháo móng' };
export const HOOF_LIMBS = { fore_left: 'Trước trái', fore_right: 'Trước phải', hind_left: 'Sau trái', hind_right: 'Sau phải' };
export const HOOF_CONDITIONS = { good: 'Móng tốt', cracked: 'Nứt móng', thin_sole: 'Đế móng mỏng', abscess: 'Áp xe móng', thrush: 'Thối gót', laminitis: 'Viêm lá móng' };
export const INJECTION_SITES = ['Cổ trái', 'Cổ phải', 'Ngực', 'Mông trái', 'Mông phải'];
export const DEWORM_INGREDIENTS = ['Ivermectin', 'Moxidectin', 'Fenbendazole', 'Pyrantel', 'Ivermectin + Praziquantel'];

/**
 * Products the vet usually picks, filling in what goes with them: what a vaccine covers, a dewormer's
 * active ingredient and how it is given, the usual dose. Typing another name is fine.
 */
export const CARE_PRODUCTS = {
  vaccination: [
    { name: 'Equilis Prequenza Te', targets: ['influenza', 'tetanus'], dose: '1 ml', route: 'im' },
    { name: 'ProteqFlu-Te', targets: ['influenza', 'tetanus'], dose: '1 ml', route: 'im' },
    { name: 'Equilis Te (uốn ván)', targets: ['tetanus'], dose: '1 ml', route: 'im' },
    { name: 'Equip EHV 1,4', targets: ['ehv'], dose: '1,5 ml', route: 'im' },
    { name: 'Equilis StrepE', targets: ['strangles'], dose: '0,2 ml', route: 'sc' },
    { name: 'Rabisin', targets: ['rabies'], dose: '1 ml', route: 'im' },
  ],
  deworming: [
    { name: 'Ivermectin gel 1,87%', activeIngredient: 'Ivermectin', route: 'oral' },
    { name: 'Equest (Moxidectin 2%)', activeIngredient: 'Moxidectin', route: 'oral' },
    { name: 'Panacur (Fenbendazole 10%)', activeIngredient: 'Fenbendazole', route: 'oral' },
    { name: 'Strongid-P (Pyrantel)', activeIngredient: 'Pyrantel', route: 'oral' },
    { name: 'Equimax (Ivermectin + Praziquantel)', activeIngredient: 'Ivermectin + Praziquantel', route: 'oral' },
  ],
  farrier: [{ name: 'Móng sắt thường' }, { name: 'Móng nhôm thi đấu' }, { name: 'Móng chỉnh hình (egg bar)' }, { name: 'Đế lót cao su' }],
};

const labelsOf = (keys, vocabulary) => (keys || []).map((k) => vocabulary[k]).filter(Boolean).join(', ');

/** The details of a care event as short phrases, for its history line. */
export function careEventDetails(e) {
  const allFour = (e.limbs || []).length === 4;
  return [
    e.targets?.length > 0 && `Phòng: ${labelsOf(e.targets, VACCINE_TARGETS)}`,
    SHOT_TYPES[e.shotType],
    e.activeIngredient && `Hoạt chất: ${e.activeIngredient}`,
    CARE_ROUTES[e.route],
    e.site && `Vị trí: ${e.site}`,
    e.weightKg && `Liều theo ${e.weightKg} kg`,
    typeof e.fecEpg === 'number' && `Trứng giun ${e.fecEpg} EPG`,
    e.work?.length > 0 && labelsOf(e.work, FARRIER_WORK),
    e.limbs?.length > 0 && (allFour ? 'Cả 4 chân' : labelsOf(e.limbs, HOOF_LIMBS)),
    e.hoofCondition?.length > 0 && labelsOf(e.hoofCondition, HOOF_CONDITIONS),
    e.farrierName && `Thợ móng: ${e.farrierName}`,
    e.reaction && e.reaction !== 'none' && CARE_REACTIONS[e.reaction],
    e.lotExpiry && `Lô hết hạn ${new Date(e.lotExpiry).toLocaleDateString('vi-VN')}`,
  ].filter(Boolean);
}

