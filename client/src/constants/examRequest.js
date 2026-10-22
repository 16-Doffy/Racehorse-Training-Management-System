// What a Head Trainer tells the vet when asking for an exam, and how fast each priority is answered.
// The same lists and windows as the server (server/src/constants/examRequest.js), which enforces them.

// How long the vet has from when the request was sent. An urgent request is seen now — the vet says
// they are on the way, never books it for later; a high or normal one is booked inside its window.
export const PRIORITY_RULES = {
  normal: { label: 'Bình thường', withinMinutes: 3 * 24 * 60, canSchedule: true, window: 'trong 3 ngày', desc: 'Kiểm tra định kỳ, dấu hiệu nhẹ. Bác sĩ hẹn giờ khám trong 3 ngày.' },
  high: { label: 'Ưu tiên cao', withinMinutes: 6 * 60, canSchedule: true, window: 'trong 6 giờ', desc: 'Dấu hiệu rõ nhưng ngựa vẫn đứng, đi được. Bác sĩ khám trong 6 giờ.' },
  urgent: { label: 'Khẩn cấp', withinMinutes: 60, canSchedule: false, window: 'trong 1 giờ', desc: 'Ngựa đau nhiều, không chịu đứng, đau bụng, chảy máu. Bác sĩ tới ngay, không hẹn giờ.' },
};
export const PRIORITY_ORDER = ['normal', 'high', 'urgent'];
export const ruleOf = (priority) => PRIORITY_RULES[priority] || PRIORITY_RULES.normal;

export const EXAM_SYMPTOMS = {
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

export const BODY_AREAS = {
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

/** When a request must have been seen by (older requests carry no dueBy: worked out from when they were sent). */
export const dueByOf = (request) =>
  request?.dueBy ? new Date(request.dueBy) : new Date(new Date(request?.createdAt || Date.now()).getTime() + ruleOf(request?.priority).withinMinutes * 60000);

/** "khập khiễng, sưng nóng ở chân" / "chân trước trái" from stored keys. */
export const symptomsText = (keys = []) => keys.map((k) => EXAM_SYMPTOMS[k]).filter(Boolean).join(', ');
export const areasText = (keys = []) => keys.map((k) => BODY_AREAS[k]).filter(Boolean).join(', ');
