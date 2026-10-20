/**
 * Words, colours and date helpers for the vet's pages, in one place so a status reads the same on
 * every screen (and the same as on the trainer's and owner's screens: constants/health.js, care.js).
 */
import { HEALTH_LABELS, TRAINING_LEVEL_META, LEVEL_RANK } from '../../constants/health';
import { INCIDENT_CATEGORY_META, INCIDENT_SEVERITY_META, MEDICATION_ROUTE_LABELS } from '../../constants/care';
import { HORSE_SEX_LABELS } from '../../constants/horse';
import { breedLabel } from '../../features/horses/horse3d/horseBreeds';

export { LEVEL_RANK };

/** The id of a populated reference or of a bare id, as a string ('' when missing). */
export const idOf = (ref) => {
  const id = ref && typeof ref === 'object' ? ref._id : ref;
  return id ? String(id) : '';
};

// ---------- Health status (the vet's conclusion) ----------
export const HEALTH_META = {
  eligible: { label: HEALTH_LABELS.eligible, tone: 'good', icon: 'bi-check-circle-fill' },
  monitoring: { label: HEALTH_LABELS.monitoring, tone: 'watch', icon: 'bi-eye-fill' },
  injured: { label: HEALTH_LABELS.injured, tone: 'bad', icon: 'bi-bandaid-fill' },
  quarantined: { label: HEALTH_LABELS.quarantined, tone: 'quar', icon: 'bi-shield-fill-exclamation' },
};
export const HEALTH_ORDER = ['eligible', 'monitoring', 'injured', 'quarantined'];
export const healthMeta = (status) =>
  HEALTH_META[status === 'isolated' ? 'quarantined' : status] || { label: 'Chưa rõ', tone: 'neutral', icon: 'bi-question-circle' };

// ---------- Training level (how hard the horse may work) ----------
export const LEVEL_META = {
  none: { label: TRAINING_LEVEL_META.none.label, short: 'Khóa tập', tone: 'bad', icon: 'bi-lock-fill', desc: 'Nghỉ hoàn toàn tại chuồng. Mọi buổi tập bị hủy và chặn.' },
  light: { label: 'Chỉ tập nhẹ', short: 'Tập nhẹ', tone: 'watch', icon: 'bi-person-walking', desc: 'Đi bộ, vận động nhẹ có người dắt.' },
  moderate: { label: 'Tối đa cường độ vừa', short: 'Tập vừa', tone: 'watch', icon: 'bi-speedometer2', desc: 'Buổi tập vượt cường độ vừa bị chặn.' },
  high: { label: 'Tập bình thường', short: 'Bình thường', tone: 'good', icon: 'bi-check2-circle', desc: 'Không hạn chế mức tập.' },
};
export const LEVEL_ORDER = ['none', 'light', 'moderate', 'high'];
export const levelMeta = (level) => LEVEL_META[level] || LEVEL_META.high;

/** A treatment's own level; an ended one restricts nothing by itself (trainingClearance.js levelOf). */
export const treatmentLevel = (treatment) => {
  if (!treatment || treatment.status !== 'ongoing') return 'high';
  if (LEVEL_META[treatment.trainingLevel]) return treatment.trainingLevel;
  return treatment.isTrainingLocked ? 'none' : 'high';
};

/** The training level that applies to a horse now, as the server worked it out (GET /horses adds it). */
export const clearanceOf = (horse) => horse?.trainingClearance || { level: 'high', restricted: false };

export const CLEARANCE_SOURCE = {
  treatment: 'Theo phác đồ đang điều trị',
  awaiting_return: 'Đã kết thúc điều trị — chờ bác sĩ đánh giá cho tập lại',
  assessment: 'Theo lần đánh giá gần nhất',
};

// ---------- Injuries ----------
export const SEVERITY_META = {
  mild: { label: 'Nhẹ', tone: 'info' },
  moderate: { label: 'Trung bình', tone: 'watch' },
  severe: { label: 'Nặng', tone: 'bad' },
};
export const RECOVERY_STEPS = [
  { key: 'new', label: 'Mới phát hiện', tone: 'bad' },
  { key: 'in_treatment', label: 'Đang điều trị', tone: 'watch' },
  { key: 'recovering', label: 'Đang hồi phục', tone: 'info' },
  { key: 'recovered', label: 'Đã khỏi', tone: 'good' },
];
export const recoveryMeta = (key) => RECOVERY_STEPS.find((s) => s.key === key) || RECOVERY_STEPS[0];
export const isActiveInjury = (marker) => marker?.recoveryStatus !== 'recovered';
/** "Khớp Bàn & Móng Trước (Hoof & Fetlock)" → "Khớp Bàn & Móng Trước". */
export const shortBodyPart = (text) => String(text || '').split(' (')[0].trim() || 'Chưa ghi vị trí';

// ---------- Routine care (careSchedule) ----------
export const CARE_KINDS = {
  exam: { label: 'Khám định kỳ', icon: 'bi-clipboard2-pulse', field: 'nextExamDue' },
  vaccination: { label: 'Tiêm phòng', icon: 'bi-eyedropper', field: 'nextVaccinationDue', product: 'Tên vắc-xin', placeholder: 'VD: Equilis Prequenza Te', needsProduct: true },
  deworming: { label: 'Tẩy giun', icon: 'bi-capsule', field: 'nextDewormingDue', product: 'Thuốc tẩy giun', placeholder: 'VD: Ivermectin paste 1.87%', needsProduct: true },
  farrier: { label: 'Đóng móng', icon: 'bi-hammer', field: 'nextFarrierDue', product: 'Vật tư / loại móng', placeholder: 'VD: Móng nhôm thi đấu' },
};
export const CARE_ORDER = ['exam', 'vaccination', 'deworming', 'farrier'];

// ---------- Requests and incidents ----------
export const PRIORITY_META = {
  urgent: { label: 'Khẩn cấp', tone: 'bad', rank: 0 },
  high: { label: 'Ưu tiên cao', tone: 'watch', rank: 1 },
  normal: { label: 'Bình thường', tone: 'neutral', rank: 2 },
};
const INCIDENT_TONE = { low: 'info', medium: 'watch', high: 'bad' };
export const incidentSeverity = (severity) => ({
  label: INCIDENT_SEVERITY_META[severity]?.label || 'Trung bình',
  tone: INCIDENT_TONE[severity] || 'watch',
});
export const incidentCategory = (category) => INCIDENT_CATEGORY_META[category]?.label || 'Sự cố';
/** Photos a groom attached. Stored as `images`; older screens looked for `photos`. */
export const incidentImages = (report) => report?.images || report?.photos || [];

// ---------- Medications ----------
export const DOSE_PRESETS = [
  { slot: 'morning', label: 'Sáng', time: '08:00' },
  { slot: 'noon', label: 'Trưa', time: '12:00' },
  { slot: 'afternoon', label: 'Chiều', time: '16:00' },
  { slot: 'evening', label: 'Tối', time: '20:00' },
];
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Which part of the day a clock time falls in — the groom's sheet labels doses by it. */
export const slotOfTime = (time) => {
  const h = Number(String(time).slice(0, 2));
  if (h < 11) return 'morning';
  if (h < 14) return 'noon';
  if (h < 18) return 'afternoon';
  return 'evening';
};
const SLOT_CLOCK = { morning: '08:00', noon: '12:00', afternoon: '16:00', evening: '20:00' };
/** The times a medicine is given, from whatever an older prescription stored. */
export function medTimes(med) {
  if (med?.times?.length) return [...med.times].sort();
  const typed = String(med?.specificTimes || '')
    .split(/[,;\s]+/)
    .map((t) => (/^\d:\d\d$/.test(t) ? `0${t}` : t))
    .filter((t) => TIME_RE.test(t));
  if (typed.length) return [...new Set(typed)].sort();
  return (med?.timeSlots || []).map((s) => SLOT_CLOCK[s]).filter(Boolean);
}
export const routeLabel = (route) => (route ? MEDICATION_ROUTE_LABELS[route] || route : null);
export const isMedActive = (med) => !['completed', 'cancelled'].includes(med?.status);

// ---------- Vital signs ----------
export const VITALS = [
  { key: 'temperatureC', label: 'Thân nhiệt', unit: '°C', min: 37.5, max: 38.5, step: '0.1', placeholder: '38.0' },
  { key: 'heartRate', label: 'Nhịp tim', unit: 'lần/phút', min: 28, max: 44, step: '1', placeholder: '36' },
  { key: 'respiratoryRate', label: 'Nhịp thở', unit: 'lần/phút', min: 8, max: 16, step: '1', placeholder: '12' },
];
export const vitalOff = (vital, value) =>
  value !== undefined && value !== null && value !== '' && (Number(value) < vital.min || Number(value) > vital.max);

// ---------- Horses ----------
export function ageOf(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return Math.max(age, 0);
}
/** "Thuần chủng Anh · 5 tuổi · Ngựa thiến" */
export function horseFacts(horse) {
  if (!horse) return '';
  const breed = breedLabel(horse.breed).split(' (')[0];
  const age = ageOf(horse.dob);
  return [breed, age !== null ? `${age} tuổi` : null, HORSE_SEX_LABELS[horse.sex]].filter(Boolean).join(' · ');
}

// ---------- Dates ----------
const DAY_MS = 24 * 60 * 60 * 1000;
const valid = (d) => d && !Number.isNaN(new Date(d).getTime());
export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
/** Whole days from today to `date` (negative = in the past). */
export const daysUntil = (date) => Math.round((startOfDay(date) - startOfDay()) / DAY_MS);
const pad = (n) => String(n).padStart(2, '0');
/** A date as an <input type="date"> value, in local time (toISOString would shift it by the time zone); '' for none. */
export const toInputDate = (date) => {
  if (!valid(date)) return '';
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const toInputTime = (date) => {
  if (!valid(date)) return '';
  const d = new Date(date);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** An <input type="date"> value as local midnight (new Date('2026-10-20') would be UTC midnight). */
export const fromInputDate = (value, time = '00:00') => (value ? new Date(`${value}T${time}`) : null);
export const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};
export const addMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};
export const fmtDate = (date, fallback = '—') => (valid(date) ? new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : fallback);
export const fmtShort = (date, fallback = '—') => {
  if (!valid(date)) return fallback;
  const d = new Date(date);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
export const fmtTime = (date) => (valid(date) ? toInputTime(date) : '');
export const fmtDateTime = (date, fallback = '—') => (valid(date) ? `${fmtTime(date)} ${fmtShort(date)}` : fallback);

/** "vừa xong", "15 phút trước", "3 giờ trước", "hôm qua", "4 ngày trước", or the date. */
export function ago(date) {
  if (!valid(date)) return '';
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60 * 1000) return 'vừa xong';
  if (ms < 60 * 60 * 1000) return `${Math.floor(ms / 60000)} phút trước`;
  const days = -daysUntil(date);
  if (days <= 0) return `${Math.floor(ms / 3600000)} giờ trước`;
  if (days === 1) return 'hôm qua';
  if (days < 30) return `${days} ngày trước`;
  return fmtDate(date);
}

/** Where a due date stands: tone and words for a chip. `soonDays` = how far ahead counts as soon. */
export function dueInfo(date, soonDays = 7) {
  if (!valid(date)) return { key: 'none', tone: 'neutral', rel: 'Chưa đặt lịch', days: null };
  const days = daysUntil(date);
  if (days < 0) return { key: 'overdue', tone: 'bad', rel: `Quá ${-days} ngày`, days };
  if (days === 0) return { key: 'today', tone: 'watch', rel: 'Hôm nay', days };
  if (days <= soonDays) return { key: 'soon', tone: 'watch', rel: `Còn ${days} ngày`, days };
  return { key: 'later', tone: 'good', rel: `Còn ${days} ngày`, days };
}

/** "16/10 → 30/10 · ngày 5/15" for a treatment period. */
export function periodText(start, end) {
  if (!valid(start)) return '';
  const passed = -daysUntil(start) + 1;
  if (!valid(end)) return `Từ ${fmtShort(start)} · ngày ${Math.max(passed, 1)}`;
  const total = daysUntil(end) - daysUntil(start) + 1;
  const tail = passed > total ? 'đã quá hạn dự kiến' : `ngày ${Math.max(passed, 1)}/${total}`;
  return `${fmtShort(start)} → ${fmtShort(end)} · ${tail}`;
}

/** An API error as a sentence for the user. */
export const errorText = (err, fallback = 'Có lỗi xảy ra, vui lòng thử lại.') =>
  (typeof err === 'string' ? err : err?.message) || fallback;
