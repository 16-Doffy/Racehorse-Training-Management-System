import dayjs from 'dayjs';

/** "hôm nay", "ngày mai", "còn 5 ngày", "đã qua 2 ngày" — how far off a date is, and the days. */
export function daysFromNow(date) {
  const days = dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day');
  if (days === 0) return { days, text: 'hôm nay' };
  if (days === 1) return { days, text: 'ngày mai' };
  if (days > 1) return { days, text: `còn ${days} ngày` };
  return { days, text: `đã qua ${-days} ngày` };
}
