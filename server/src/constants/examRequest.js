// What a Head Trainer tells the vet when asking for an exam, and how fast each priority must be
// answered. Keys are stored; labels go into notification text the client shows verbatim. The client
// keeps the same lists (client/src/constants/examRequest.js).

const EXAM_PRIORITIES = ['normal', 'high', 'urgent'];

// How long the vet has to see the horse, counted from when the request was sent. An urgent request is
// seen now: the vet can say they are on the way, never book it for later. A high or normal one may be
// booked, but only inside its window.
const PRIORITY_RULES = {
  urgent: { label: 'Khẩn cấp', withinMinutes: 60, canSchedule: false },
  high: { label: 'Ưu tiên cao', withinMinutes: 6 * 60, canSchedule: true },
  normal: { label: 'Bình thường', withinMinutes: 3 * 24 * 60, canSchedule: true },
};

const EXAM_SYMPTOMS = {
  lameness: 'Khập khiễng, đi bất thường',
  swelling: 'Sưng, nóng ở chân',
  wound: 'Vết thương, trầy xước',
  breathing: 'Thở gấp, ho',
  nasal: 'Chảy mũi',
  fever: 'Sốt',
  appetite: 'Kém ăn, bỏ ăn',
  colic: 'Đau bụng',
  fatigue: 'Mệt, hụt sức',
  behaviour: 'Hành vi bất thường',
  other: 'Khác',
};

const BODY_AREAS = {
  head: 'Đầu, cổ',
  chest: 'Ngực, hô hấp',
  back: 'Lưng, hông',
  belly: 'Bụng',
  fore_left: 'Chân trước trái',
  fore_right: 'Chân trước phải',
  hind_left: 'Chân sau trái',
  hind_right: 'Chân sau phải',
  hooves: 'Móng',
  skin: 'Da, lông',
  whole: 'Toàn thân',
};

const ruleOf = (priority) => PRIORITY_RULES[priority] || PRIORITY_RULES.normal;

/** When a request sent at `sentAt` must have been seen by. */
const dueByOf = (priority, sentAt = new Date()) => new Date(new Date(sentAt).getTime() + ruleOf(priority).withinMinutes * 60000);

/** The deadline a stored request carries (older ones are worked out from when they were sent). */
const dueByOfRequest = (request) => request.dueBy || dueByOf(request.priority, request.createdAt || new Date());

const fmtWhen = (date) => new Date(date).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

/** Why the vet may not book this request's exam for `at`, or null. `at` null means "taken on, no time". */
function scheduleProblem(request, at) {
  if (!at) return null;
  const rule = ruleOf(request.priority);
  if (!rule.canSchedule) return 'Yêu cầu khẩn cấp phải khám ngay, không hẹn giờ: báo "Đang tới" rồi lập phiếu khám.';
  const due = dueByOfRequest(request);
  if (at > due) return `Yêu cầu ${rule.label.toLowerCase()} cần khám trước ${fmtWhen(due)}: chọn giờ sớm hơn.`;
  return null;
}

/** Only the known keys of a list sent by the client, once each. */
const knownKeys = (list, vocabulary) => [...new Set((Array.isArray(list) ? list : []).filter((k) => typeof k === 'string' && vocabulary[k]))];

module.exports = {
  EXAM_PRIORITIES,
  PRIORITY_RULES,
  EXAM_SYMPTOMS,
  BODY_AREAS,
  ruleOf,
  dueByOf,
  dueByOfRequest,
  fmtWhen,
  scheduleProblem,
  knownKeys,
};
