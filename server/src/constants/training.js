// Vietnamese labels for the training vocabulary, kept server-side because the server writes them
// into notification text and auto-generated task notes that the client renders verbatim.
const OBJECTIVE_LABELS = {
  endurance: 'Tăng sức bền',
  speed: 'Tăng tốc độ',
  interval: 'Chạy biến tốc',
  recovery: 'Hồi phục nhẹ',
  technique: 'Kỹ thuật',
  race_simulation: 'Mô phỏng thi đấu',
};

const INTENSITY_LABELS = {
  light: 'Nhẹ',
  moderate: 'Vừa',
  high: 'Cao',
};

module.exports = { OBJECTIVE_LABELS, INTENSITY_LABELS };

// Training session lifecycle. Single source of truth for which status may follow which: the
// controller reads it, and nothing else should hard-code a status string for a transition.
// Completed and cancelled are final: a session the vet's lock cancelled must not be reopened
// into in_progress, which is what re-arms the sensor feed.
const SESSION_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  READY: 'ready', // pre-check passed; the only status a session can be started from (T2-04/T2-05)
  BLOCKED: 'blocked', // held back by a vet restriction or a failed pre-check; reopens by itself
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  EVALUATED: 'evaluated', // trainer's evaluation filed after completion
  ABORTED: 'aborted', // stopped mid-run, with a reason
  CANCELLED: 'cancelled',
  MISSED: 'missed', // never started and past its grace period
});

// Edges are added together with the endpoint that uses them. ABORTED, EVALUATED and MISSED have no
// way in yet (end/abort, evaluation and the missed job come later). SCHEDULED -> IN_PROGRESS and
// -> COMPLETED are legacy edges that the start/end endpoints replace.
const SESSION_TRANSITIONS = Object.freeze({
  [SESSION_STATUS.SCHEDULED]: [
    SESSION_STATUS.READY,
    SESSION_STATUS.BLOCKED,
    SESSION_STATUS.IN_PROGRESS,
    SESSION_STATUS.COMPLETED,
    SESSION_STATUS.CANCELLED,
  ],
  [SESSION_STATUS.READY]: [SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.CANCELLED],
  [SESSION_STATUS.BLOCKED]: [SESSION_STATUS.READY, SESSION_STATUS.CANCELLED],
  [SESSION_STATUS.IN_PROGRESS]: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED],
  [SESSION_STATUS.COMPLETED]: [],
  [SESSION_STATUS.EVALUATED]: [],
  [SESSION_STATUS.ABORTED]: [],
  [SESSION_STATUS.CANCELLED]: [],
  [SESSION_STATUS.MISSED]: [],
});

// Statuses a client may ask for with a bare `status` (PUT, evaluation). Everything else - ready,
// blocked, and later aborted/evaluated - is reached only through the endpoint that checks its
// conditions, so a request body can never skip them.
const SESSION_BODY_STATUSES = Object.freeze([SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED]);

// The pre-check is done close to the session, not days ahead: the horse's condition has to be
// judged for now. CONFIGURABLE, simplified for the capstone: move to SystemSetting (T8-01).
const PRECHECK_WINDOW = Object.freeze({ opensBeforeMin: 60, closesAfterMin: 30 });

/** When a session's pre-check may be filed, and whether `now` falls inside that window. */
function preCheckWindow(scheduledAt, now = new Date()) {
  const at = new Date(scheduledAt).getTime();
  const opensAt = new Date(at - PRECHECK_WINDOW.opensBeforeMin * 60 * 1000);
  const closesAt = new Date(at + PRECHECK_WINDOW.closesAfterMin * 60 * 1000);
  const t = new Date(now).getTime();
  return { opensAt, closesAt, open: t >= opensAt.getTime() && t <= closesAt.getTime() };
}

// Sessions that are booked or running, i.e. not yet finished one way or another. What an archived
// horse's sessions are cancelled from.
const SESSION_OPEN_STATUSES = Object.freeze([
  SESSION_STATUS.SCHEDULED,
  SESSION_STATUS.READY,
  SESSION_STATUS.BLOCKED,
  SESSION_STATUS.IN_PROGRESS,
]);

// Sessions a vet's training lock must stop. Blocked is left out on purpose: it is already held back,
// and T4-03 decides how it reopens.
const SESSION_LOCK_CANCELS = Object.freeze([SESSION_STATUS.SCHEDULED, SESSION_STATUS.READY, SESSION_STATUS.IN_PROGRESS]);

// Why a trainer stopped a running session.
const ABORT_CATEGORIES = Object.freeze(['health', 'weather', 'equipment', 'other']);

// Sessions whose results count as done work in charts.
const SESSION_DONE_STATUSES = Object.freeze([SESSION_STATUS.COMPLETED, SESSION_STATUS.EVALUATED]);

// Vietnamese, lower-case: used inside sentences ("Không thể chuyển từ … sang …").
const SESSION_STATUS_LABELS = Object.freeze({
  [SESSION_STATUS.SCHEDULED]: 'đã lên lịch',
  [SESSION_STATUS.READY]: 'sẵn sàng',
  [SESSION_STATUS.BLOCKED]: 'bị chặn',
  [SESSION_STATUS.IN_PROGRESS]: 'đang diễn ra',
  [SESSION_STATUS.COMPLETED]: 'đã hoàn thành',
  [SESSION_STATUS.EVALUATED]: 'đã đánh giá',
  [SESSION_STATUS.ABORTED]: 'đã dừng giữa chừng',
  [SESSION_STATUS.CANCELLED]: 'đã hủy',
  [SESSION_STATUS.MISSED]: 'đã lỡ giờ',
});

/** Whether a session in `from` may move to `to`. Unknown statuses never can. */
function canTransition(from, to) {
  return Boolean(SESSION_TRANSITIONS[from]?.includes(to));
}

// Machine-readable reason sent as `data.code` on a refused request, so a screen can tell
// "wrong state" apart from "validation" without parsing the Vietnamese message.
const SESSION_ERROR = Object.freeze({
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  NOT_EDITABLE: 'SESSION_NOT_EDITABLE',
  NOT_DELETABLE: 'SESSION_NOT_DELETABLE',
  PRECHECK_NOT_CONFIRMED: 'PRECHECK_NOT_CONFIRMED',
  OUTSIDE_PRECHECK_WINDOW: 'OUTSIDE_PRECHECK_WINDOW',
  READINESS_BLOCKED: 'READINESS_BLOCKED',
});

module.exports = {
  ...module.exports,
  SESSION_STATUS,
  SESSION_TRANSITIONS,
  SESSION_STATUS_LABELS,
  SESSION_OPEN_STATUSES,
  SESSION_LOCK_CANCELS,
  SESSION_DONE_STATUSES,
  SESSION_BODY_STATUSES,
  PRECHECK_WINDOW,
  preCheckWindow,
  ABORT_CATEGORIES,
  SESSION_ERROR,
  canTransition,
};
