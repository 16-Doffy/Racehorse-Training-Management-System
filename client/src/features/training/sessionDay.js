/**
 * A horse's day of training, as the server holds it (server: modules/training/sessionDay.js): never two
 * sessions at once, and one session a morning and one an afternoon — a session run early still uses its part
 * of the day. Over another session is refused; a second one in a part of the day goes ahead with a reason.
 * Here so the booking form says it before the trainer presses "Tạo".
 */
import dayjs from 'dayjs';
import { SESSION_KINDS } from './trainingVocab';

const FREE = ['cancelled', 'missed'];
const DONE = ['completed', 'evaluated', 'aborted'];
const NOT_RUNNING = ['blocked'];
const DEFAULT_MINUTES = 60;

export const slotOf = (d) => (dayjs(d).hour() < 12 ? 'morning' : 'afternoon');
export const SLOT_LABEL = { morning: 'sáng', afternoon: 'chiều' };
const horseIdOf = (s) => String(s.horse?._id || s.horse);
const kindLabel = (s) => SESSION_KINDS[s.kind]?.label || 'Buổi tập';

function bookedMinutes(s) {
  if (s.endAt && s.scheduledAt) {
    const diff = dayjs(s.endAt).diff(dayjs(s.scheduledAt), 'minute');
    if (diff > 0) return diff;
  }
  return Number(s.prescription?.durationMinutes) > 0 ? Number(s.prescription.durationMinutes) : DEFAULT_MINUTES;
}

/** When a session takes the horse: as it ran, once it has run; else as booked. */
function spanOf(s) {
  const minutes = bookedMinutes(s);
  if (s.actualStartAt) {
    const start = dayjs(s.actualStartAt);
    let end = s.actualEndAt ? dayjs(s.actualEndAt) : start.add(minutes, 'minute');
    if (s.status === 'in_progress' && end.isBefore(dayjs())) end = dayjs();
    return { start, end, ran: true };
  }
  const start = dayjs(s.scheduledAt);
  return { start, end: start.add(minutes, 'minute'), ran: false };
}

/** "đã tập xong 13:45–14:15 (sớm hơn giờ hẹn 14:30)", "đang tập", "hẹn 07:30". */
export function stateOf(s) {
  if (DONE.includes(s.status) && s.actualStartAt) {
    const span = spanOf(s);
    const early = dayjs(s.actualStartAt).isBefore(dayjs(s.scheduledAt).subtract(1, 'minute')) ? ` (sớm hơn giờ hẹn ${dayjs(s.scheduledAt).format('HH:mm')})` : '';
    return `đã tập xong ${span.start.format('HH:mm')}–${span.end.format('HH:mm')}${early}`;
  }
  if (s.status === 'in_progress') return 'đang tập';
  if (s.status === 'blocked') return `hẹn ${dayjs(s.scheduledAt).format('HH:mm')}, bị chặn`;
  return `hẹn ${dayjs(s.scheduledAt).format('HH:mm')}`;
}

/** The horse's sessions on the day of `at` that take its time, by part of the day. */
export function horseDay(sessions, horseId, at, excludeId) {
  const day = dayjs(at);
  const list = (sessions || []).filter(
    (s) =>
      horseIdOf(s) === String(horseId) &&
      String(s._id) !== String(excludeId) &&
      !FREE.includes(s.status) &&
      (dayjs(s.scheduledAt).isSame(day, 'day') || (s.actualStartAt && dayjs(s.actualStartAt).isSame(day, 'day')))
  );
  const bySlot = (slot) => list.filter((s) => slotOf(s.scheduledAt) === slot).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  return { all: list, morning: bySlot('morning'), afternoon: bySlot('afternoon') };
}

/**
 * Whether a booking at `at` lasting `minutes` fits the horse's day: null, or { hard, message } — hard when
 * it is over another session's time (refused), else it lands in a part of the day that has one (asked).
 */
export function dayClash(sessions, horseId, { at, minutes, excludeId }) {
  if (!horseId || !at) return null;
  const day = horseDay(sessions, horseId, at, excludeId);
  if (!day.all.length) return null;
  const start = dayjs(at);
  const end = start.add(Number(minutes) > 0 ? Number(minutes) : DEFAULT_MINUTES, 'minute');
  const over = day.all.find((s) => {
    if (NOT_RUNNING.includes(s.status)) return false;
    const span = spanOf(s);
    return start.isBefore(span.end) && span.start.isBefore(end);
  });
  if (over) {
    const span = spanOf(over);
    return { hard: true, message: `Trùng giờ với buổi "${kindLabel(over)}" ${span.start.format('HH:mm')}–${span.end.format('HH:mm')}${span.ran ? ' (giờ tập thực tế)' : ''} — một ngựa không tập hai buổi cùng lúc.` };
  }
  const slot = slotOf(at);
  const same = day[slot][0];
  if (!same) return null;
  const done = DONE.includes(same.status) || same.status === 'in_progress';
  return {
    hard: false,
    message: `Buổi ${SLOT_LABEL[slot]} ${start.format('DD/MM')} ngựa đã có "${kindLabel(same)}" (${stateOf(same)}). ${
      done ? 'Buổi đó đã tập, tập thêm là vượt khối lượng trong ngày của kế hoạch.' : 'Muốn thêm bài thì nên ghép đoạn vào buổi đó thay vì tạo buổi thứ hai.'
    }`,
  };
}
