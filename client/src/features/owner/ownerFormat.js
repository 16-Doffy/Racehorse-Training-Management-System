import dayjs from 'dayjs';
import { HEALTH_LABELS, TRAINING_LEVEL_META } from '../../constants/health';
import { HORSE_SEX_LABELS, formatVnd } from '../../constants/horse';
import { SESSION_STATUS_LABELS } from '../training/sessionStatus';
import { INTENSITY_LABELS, OBJECTIVE_LABELS, PHASE_LABELS, SESSION_KINDS, SURFACE_LABELS } from '../training/trainingVocab';
import { breedLabel, coatFor } from '../horses/horse3d/horseBreeds';

/**
 * The words and tones of the Horse Owner's pages, from the vocabulary every other role uses, so a
 * status never reads differently from one screen to the next.
 */

export const money = formatVnd;
export { HEALTH_LABELS, INTENSITY_LABELS, OBJECTIVE_LABELS, PHASE_LABELS, SURFACE_LABELS, SESSION_STATUS_LABELS };

/** A horse's health as the vet concluded it: label and tone (good · watch · bad · quar). */
export const HEALTH_TONES = { eligible: 'good', monitoring: 'watch', injured: 'bad', quarantined: 'quar' };
export const healthOf = (status) => ({ label: HEALTH_LABELS[status] || status || '—', tone: HEALTH_TONES[status] || 'neutral' });

/** How hard the horse may train now (horse.trainingClearance or the owner summary's health). */
export function clearanceOf(horse) {
  const level = horse?.trainingClearance?.level || 'high';
  const meta = TRAINING_LEVEL_META[level] || TRAINING_LEVEL_META.high;
  return {
    level,
    restricted: level !== 'high',
    label: meta.label,
    tone: level === 'none' ? 'bad' : level === 'high' ? 'good' : 'watch',
    reason: horse?.trainingClearance?.reason || null,
  };
}

export const SESSION_TONES = {
  scheduled: 'neutral',
  ready: 'info',
  blocked: 'watch',
  in_progress: 'info',
  completed: 'good',
  evaluated: 'good',
  aborted: 'bad',
  cancelled: 'neutral',
  missed: 'neutral',
};
export const OPEN_SESSION = ['scheduled', 'ready', 'blocked', 'in_progress'];
export const DONE_SESSION = ['completed', 'evaluated'];
export const sessionKind = (s) => SESSION_KINDS[s?.kind]?.label || OBJECTIVE_LABELS[s?.objective] || (s?.sessionType === 'trial_run' ? 'Chạy thử' : 'Buổi tập');

export const RACE_STATUS = {
  registered: { label: 'Chờ HLV quyết định', tone: 'watch' },
  confirmed: { label: 'Đã xác nhận tham gia', tone: 'info' },
  completed: { label: 'Đã thi đấu', tone: 'good' },
  withdrawn: { label: 'Đã rút', tone: 'neutral' },
};
export const placeText = (position) => (position === 1 ? 'Về nhất' : position ? `Hạng ${position}` : '—');

export const ratingTone = (r) => (r >= 7 ? 'good' : r >= 5 ? 'watch' : 'bad');

/** "Thuần chủng Anh · 5 tuổi · Ngựa cái". */
export function horseFacts(horse) {
  if (!horse) return '';
  const age = horse.dob ? dayjs().diff(horse.dob, 'year') : null;
  return [breedLabel(horse.breed)?.split(' (')[0], age !== null && age >= 0 ? `${age} tuổi` : null, HORSE_SEX_LABELS[horse.sex]].filter(Boolean).join(' · ');
}

/** The colour of the horse's coat, for its avatar (its own coat, or the one its breed is known for). */
export const coatSwatch = (horse) => coatFor({ breed: horse?.breed, color: horse?.color })?.swatch || '#8a5a3c';
/** Dark ink on a light coat (grey, white, palomino), white on a dark one. */
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.62 ? '#2b2a26' : '#fff';
}
/** "không được tập" → "Không được tập". */
export const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const idOf = (ref) => String(ref?._id || ref || '');
export const ofHorse = (rows, horseId) => (horseId ? rows.filter((r) => idOf(r.horse) === String(horseId)) : rows);

// ---------- Dates ----------
export const fmtDate = (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '—');
export const fmtShort = (d) => (d ? dayjs(d).format('DD/MM') : '—');
export const fmtTime = (d) => (d ? dayjs(d).format('HH:mm') : '');
export const fmtDateTime = (d) => (d ? dayjs(d).format('DD/MM HH:mm') : '—');
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const weekday = (d) => WEEKDAYS[dayjs(d).day()];
const WEEKDAYS_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** "Thứ Ba, 21/10/2026". */
export const longDate = (d = new Date()) => `${WEEKDAYS_LONG[dayjs(d).day()]}, ${dayjs(d).format('DD/MM/YYYY')}`;

/** "hôm nay", "ngày mai", "3 ngày nữa", "2 ngày trước". */
export function relDay(d) {
  if (!d) return '';
  const days = dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (days === 0) return 'hôm nay';
  if (days === 1) return 'ngày mai';
  if (days === -1) return 'hôm qua';
  return days > 0 ? `${days} ngày nữa` : `${-days} ngày trước`;
}
export const daysFromToday = (d) => dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day');

/** Routine care due on a horse (horse.careSchedule), soonest first: [{ key, label, due, days }]. */
export function careDue(horse) {
  const s = horse?.careSchedule || {};
  return [
    ['vaccination', 'Tiêm phòng', s.nextVaccinationDue],
    ['deworming', 'Tẩy giun', s.nextDewormingDue],
    ['farrier', 'Đóng móng', s.nextFarrierDue],
    ['exam', 'Khám định kỳ', s.nextExamDue],
  ]
    .filter(([, , due]) => due)
    .map(([key, label, due]) => ({ key, label, due, days: daysFromToday(due) }))
    .sort((a, b) => a.days - b.days);
}

/** "+12%" / "−3" against last month, or null with nothing to compare. */
export const percentChange = (now, before) => {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 1000) / 10;
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, up: pct >= 0 };
};
export const countChange = (now, before) => (now === before ? null : { text: `${now - before > 0 ? '+' : ''}${now - before}`, up: now > before });
