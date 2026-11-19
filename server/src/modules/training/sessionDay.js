const TrainingSession = require('../../models/TrainingSession');
const { SESSION_KINDS, SESSION_ERROR } = require('../../constants/training');

/**
 * A horse's day of training: never two sessions at once, and one session a morning and one an afternoon.
 * The plan's week is booked the same way (trainingPlan.service.js, one session per slot); this holds the
 * bookings made by hand, moved or booked again to it.
 *   - Over the time of another session (as it ran, or as booked): refused — a horse is in one place.
 *   - A second session in a morning or afternoon that already has one — a session run early included, its
 *     work for that part of the day is done: the trainer's call, with a reason on record (like the amber
 *     readiness gates). More work in one part of the day is usually the same session in parts (segments).
 */

// Sessions that do not take the horse's time: called off, or never run.
const FREE_STATUSES = ['cancelled', 'missed'];
// A session stopped at its pre-check (a medical gate) does not run unless checked again: it holds its part
// of the day, but not the time itself — the trainer may book the horse again once the vet has cleared it.
const NOT_RUNNING = ['blocked'];
const DONE_STATUSES = ['completed', 'evaluated', 'aborted'];
// A booking with neither an end nor a duration (a canter ends when its distance is run) holds this long.
const DEFAULT_MINUTES = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const slotOf = (date) => (new Date(date).getHours() < 12 ? 'morning' : 'afternoon');
const SLOT_LABEL = { morning: 'sáng', afternoon: 'chiều' };
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(new Date(d).getHours())}:${pad(new Date(d).getMinutes())}`;
const ddmm = (d) => `${pad(new Date(d).getDate())}/${pad(new Date(d).getMonth() + 1)}`;

/** How long a booking holds the horse, in minutes: its own end, else its duration, else the default. */
function bookedMinutes({ scheduledAt, endAt, durationMinutes }) {
  if (endAt && scheduledAt) {
    const diff = Math.round((new Date(endAt) - new Date(scheduledAt)) / 60000);
    if (diff > 0) return diff;
  }
  return Number(durationMinutes) > 0 ? Number(durationMinutes) : DEFAULT_MINUTES;
}

/** When a session takes the horse: as it ran, once it has run; else as booked. */
function spanOf(s, now = new Date()) {
  const minutes = bookedMinutes({ scheduledAt: s.scheduledAt, endAt: s.endAt, durationMinutes: s.prescription?.durationMinutes });
  if (s.actualStartAt) {
    const start = new Date(s.actualStartAt);
    let end = s.actualEndAt ? new Date(s.actualEndAt) : new Date(start.getTime() + minutes * 60000);
    if (s.status === 'in_progress' && end < now) end = now;
    return { start, end, ran: true };
  }
  const start = new Date(s.scheduledAt);
  return { start, end: new Date(start.getTime() + minutes * 60000), ran: false };
}

const kindLabel = (s) => SESSION_KINDS[s.kind]?.label || 'Buổi tập';

/** Where the other session stands, in a few words: "hẹn 14:30", "đã tập xong 13:42–14:10 (sớm hơn giờ hẹn 14:30)". */
function stateOf(s) {
  if (DONE_STATUSES.includes(s.status) && s.actualStartAt) {
    const span = spanOf(s);
    const early = new Date(s.actualStartAt) < new Date(s.scheduledAt) - 60000 ? ` (sớm hơn giờ hẹn ${hhmm(s.scheduledAt)})` : '';
    return `đã tập xong ${hhmm(span.start)}–${hhmm(span.end)}${early}`;
  }
  if (s.status === 'in_progress') return `đang tập từ ${hhmm(s.actualStartAt)}`;
  if (s.status === 'blocked') return `hẹn ${hhmm(s.scheduledAt)}, đang bị chặn ở bước kiểm tra sẵn sàng`;
  return `hẹn ${hhmm(s.scheduledAt)}`;
}

/**
 * Whether a booking for `horse` at `scheduledAt` fits its day: null, or { message, hard } — `hard` when it
 * is over the time of another session (refused), else it lands in a part of the day that already has one
 * (allowed with a reason). `excludeId`: the session being moved or changed.
 */
async function dayClashProblem({ horse, scheduledAt, endAt, durationMinutes, excludeId }) {
  if (!horse || !scheduledAt) return null;
  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime())) return null;
  const dayStart = new Date(at);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const filter = {
    horse,
    status: { $nin: FREE_STATUSES },
    $or: [{ scheduledAt: { $gte: dayStart, $lt: dayEnd } }, { actualStartAt: { $gte: dayStart, $lt: dayEnd } }],
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const others = await TrainingSession.find(filter).select('kind scheduledAt endAt actualStartAt actualEndAt status prescription.durationMinutes').lean();
  if (!others.length) return null;

  const mine = { start: at, end: new Date(at.getTime() + bookedMinutes({ scheduledAt: at, endAt, durationMinutes }) * 60000) };
  const over = others.find((s) => {
    if (NOT_RUNNING.includes(s.status)) return false;
    const span = spanOf(s);
    return mine.start < span.end && span.start < mine.end;
  });
  if (over) {
    const span = spanOf(over);
    return {
      hard: true,
      message: `Trùng giờ với buổi "${kindLabel(over)}" ${hhmm(span.start)}–${hhmm(span.end)}${span.ran ? ' (giờ tập thực tế)' : ''} của ngựa này — một ngựa không tập hai buổi cùng lúc.`,
    };
  }

  const slot = slotOf(at);
  const same = others.find((s) => slotOf(s.scheduledAt) === slot);
  if (!same) return null;
  const done = DONE_STATUSES.includes(same.status) || same.status === 'in_progress';
  const advice = done
    ? `Buổi ${SLOT_LABEL[slot]} này ngựa đã tập — tập thêm là vượt khối lượng trong ngày của kế hoạch. Cần vận động thêm thì nên xếp vào buổi ${SLOT_LABEL[slot === 'morning' ? 'afternoon' : 'morning']} còn trống hoặc ngày khác.`
    : same.status === 'blocked'
      ? 'Bác sĩ đã cho tập lại thì kiểm tra sẵn sàng lại buổi đó, hoặc hủy nó trước khi tạo buổi mới.'
      : 'Muốn thêm bài thì nên ghép đoạn vào buổi đó ("Đổi bài tập" → ghép nhiều bài) thay vì tạo buổi thứ hai.';
  return {
    hard: false,
    message: `Buổi ${SLOT_LABEL[slot]} ${ddmm(at)} ngựa đã có "${kindLabel(same)}" (${stateOf(same)}). Mỗi buổi sáng và chiều thường chỉ một buổi tập. ${advice}`,
  };
}

/**
 * The answer to a booking that does not fit the horse's day: { status, message, data } for `fail`, or null
 * when it fits — or when the trainer gave a reason for a second session in that part of the day. The data
 * reads like an amber readiness gate, so the forms ask for the reason the same way.
 */
function dayClashFailure(clash, overrideReason) {
  if (!clash || (!clash.hard && String(overrideReason || '').trim())) return null;
  return {
    status: 409,
    message: clash.message,
    data: {
      code: SESSION_ERROR.DAY_CLASH,
      requiresOverride: !clash.hard,
      ...(clash.hard ? {} : { readiness: { gates: [{ key: 'day', status: 'caution', label: 'Ngựa đã có buổi tập trong buổi sáng/chiều này', detail: clash.message }] } }),
    },
  };
}

module.exports = { dayClashProblem, dayClashFailure, bookedMinutes, slotOf };
