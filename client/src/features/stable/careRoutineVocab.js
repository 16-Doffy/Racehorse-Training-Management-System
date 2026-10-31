import dayjs from 'dayjs';

// Each kind of care the trainer hands out for many days, with how it is usually done: the form starts
// from it, the trainer changes what this horse needs.
export const ROUTINE_TEMPLATES = {
  cleaning: {
    times: ['07:00', '16:00'],
    durationMinutes: 30,
    hint: 'Hai lần mỗi ngày: sáng sau bữa sáng, chiều trước bữa chiều.',
    instructions: [
      '1. Dắt ngựa ra khu buộc tạm, buộc chắc.',
      '2. Hốt hết phân và rơm/mùn cưa ướt; rải lót mới dày 15–20 cm, dày hơn ở góc ngựa hay nằm.',
      '3. Cọ rửa máng ăn, xô nước; thay nước sạch đầy xô.',
      '4. Kiểm tra vách, cửa, chốt chuồng: không đinh nhô, cạnh sắc, gỗ mục.',
      '5. Báo trên app nếu thấy phân lỏng, phân khô, ít phân hoặc ngựa bỏ ăn.',
    ].join('\n'),
  },
  bathing: {
    times: ['09:00'],
    durationMinutes: 20,
    hint: 'Một lần sau buổi tập sáng, khi ngựa đã hết thở dốc.',
    instructions: [
      '1. Chờ ngựa hết thở dốc, khoảng 15–20 phút sau khi tập.',
      '2. Xả nước ấm từ chân lên thân, tránh đầu và trong tai.',
      '3. Dùng dầu tắm cho ngựa ở lưng, vùng yên và ngực; xả thật sạch.',
      '4. Gạt nước bằng thanh gạt, lau khô chân và khe móng.',
      '5. Dắt đi bộ 10 phút cho khô hẳn rồi mới đưa vào chuồng.',
    ].join('\n'),
  },
  icing: {
    times: ['09:30', '16:30'],
    durationMinutes: 20,
    hint: 'Hai lần mỗi ngày: sau buổi tập và buổi chiều, mỗi lần không quá 30 phút.',
    instructions: [
      '1. Ngâm hai chân trước (hoặc chân được chỉ định) trong xô/ủng nước đá 5–10°C, ngập tới dưới gối.',
      '2. Giữ đủ thời gian, không quá 30 phút; thêm đá khi tan hết.',
      '3. Lau khô chân, sờ so nhiệt độ và độ sưng gân với chân bên kia.',
      '4. Báo ngay trên app nếu chân nóng, sưng tăng hoặc ngựa đau khi chạm.',
    ].join('\n'),
  },
  hoof_care: {
    times: ['17:00'],
    durationMinutes: 15,
    hint: 'Một lần mỗi ngày, cuối buổi chiều.',
    instructions: [
      '1. Nhấc từng chân, dùng móc móng làm sạch đất đá ở đế và rãnh ếch.',
      '2. Kiểm tra nứt móng, đinh lỏng, móng sắt lệch, mùi hôi (thối ếch).',
      '3. Bôi dầu dưỡng lên thành móng nếu móng khô.',
      '4. Ghi lại móng nào có vấn đề để báo thợ móng hoặc bác sĩ.',
    ].join('\n'),
  },
  other: { times: ['08:00'], durationMinutes: 30, hint: 'Đặt tên việc và ghi rõ cách làm.', instructions: '' },
};

export const ROUTINE_TYPE_OPTIONS = [
  { value: 'cleaning', label: 'Vệ sinh chuồng' },
  { value: 'bathing', label: 'Tắm rửa' },
  { value: 'icing', label: 'Ngâm chân nước đá' },
  { value: 'hoof_care', label: 'Chăm sóc móng' },
  { value: 'other', label: 'Việc khác' },
];
export const ROUTINE_TYPE_LABELS = Object.fromEntries(ROUTINE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

// Monday first, as the week is read here (values are JS getDay()).
export const WEEK = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
];

/** "Mỗi ngày", "T2, T4, T6". */
export const weekDaysText = (days = []) => (days.length === 7 || !days.length ? 'Mỗi ngày' : WEEK.filter((w) => days.includes(w.value)).map((w) => w.label).join(', '));

/** How many times the job is done between the days given (null without an end). */
export function countTimes({ startDate, endDate, weekDays, times }) {
  if (!startDate || !endDate) return null;
  let n = 0;
  for (let d = dayjs(startDate).startOf('day'); !d.isAfter(dayjs(endDate), 'day'); d = d.add(1, 'day')) {
    if (!weekDays?.length || weekDays.includes(d.day())) n += 1;
  }
  return n * (times?.length || 0);
}

/** "1 giờ 30 phút", "45 phút". */
export const minutesText = (m) => (m >= 60 ? `${Math.floor(m / 60)} giờ${m % 60 ? ` ${m % 60} phút` : ''}` : `${m} phút`);
