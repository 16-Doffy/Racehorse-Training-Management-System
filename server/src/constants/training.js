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
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const SESSION_TRANSITIONS = Object.freeze({
  [SESSION_STATUS.SCHEDULED]: [SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED],
  [SESSION_STATUS.IN_PROGRESS]: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED],
  [SESSION_STATUS.COMPLETED]: [],
  [SESSION_STATUS.CANCELLED]: [],
});

// Vietnamese, lower-case: used inside sentences ("Không thể chuyển từ … sang …").
const SESSION_STATUS_LABELS = Object.freeze({
  [SESSION_STATUS.SCHEDULED]: 'đã lên lịch',
  [SESSION_STATUS.IN_PROGRESS]: 'đang diễn ra',
  [SESSION_STATUS.COMPLETED]: 'đã hoàn thành',
  [SESSION_STATUS.CANCELLED]: 'đã hủy',
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
});

module.exports = {
  ...module.exports,
  SESSION_STATUS,
  SESSION_TRANSITIONS,
  SESSION_STATUS_LABELS,
  SESSION_ERROR,
  canTransition,
};
