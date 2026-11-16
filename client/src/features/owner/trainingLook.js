import dayjs from 'dayjs';
import { canReplay } from '../training/trainingVocab';

/**
 * How a session reads on the owner's timetable and in its detail: one short word and a tone
 * (good · watch · bad · info · neutral · live), whatever its state.
 */
export function sessionLook(s) {
  if (s.status === 'in_progress') return { tone: 'live', label: 'Đang tập' };
  if (s.status === 'completed' || s.status === 'evaluated') {
    if (s.outcome?.met === true) return { tone: 'good', label: 'Đạt chỉ tiêu' };
    if (s.outcome?.met === false) return { tone: 'watch', label: 'Chưa đạt' };
    return { tone: 'good', label: 'Đã tập' };
  }
  if (s.status === 'aborted') return { tone: 'bad', label: 'Dừng giữa chừng' };
  if (s.status === 'missed') return { tone: 'neutral', label: 'Lỡ giờ' };
  if (s.status === 'cancelled') return { tone: 'neutral', label: 'Đã hủy' };
  if (s.status === 'blocked') return { tone: 'watch', label: 'Bị chặn' };
  return { tone: 'info', label: 'Sắp tới' };
}

/** A run with its video: it ran, it is over, the sensors followed it. */
export const hasVideo = (s) => canReplay(s);

/** When it starts: when it really did, else when it was booked. */
export const startOf = (s) => s.actualStartAt || s.scheduledAt;

/** Monday of the week of `d`, at midnight. */
export const mondayOf = (d) => {
  const day = dayjs(d).startOf('day');
  return day.subtract((day.day() + 6) % 7, 'day');
};

/** Morning or afternoon, as the timetable's rows split the day. */
export const slotOf = (s) => (dayjs(startOf(s)).hour() < 12 ? 'morning' : 'afternoon');

export const WEEKDAY_FULL = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
