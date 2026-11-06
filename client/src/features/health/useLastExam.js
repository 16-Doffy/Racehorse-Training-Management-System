import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { healthRecordApi } from './healthApi';

/** The vet's conclusion, in the words the vet's own screens use. */
export const EXAM_CONCLUSIONS = { eligible: 'Đủ điều kiện', monitoring: 'Cần theo dõi', injured: 'Chấn thương', quarantined: 'Cách ly' };

export const when = (exam) => exam.createdAt || exam.date;

/**
 * The horse's newest exam, or null: the list comes newest first. Its key starts with 'health-records', so a
 * notification (an exam just filed) reloads it with the rest of the page, without a refresh.
 */
export function useLastExam(horseId) {
  return useQuery({
    queryKey: ['health-records', 'last', String(horseId || '')],
    enabled: Boolean(horseId),
    queryFn: async () => {
      const res = await healthRecordApi.list({ horse: horseId });
      return (res?.data || [])[0] || null;
    },
  });
}

/** "06/11 · Đủ điều kiện · Không sưng nóng", or "Chưa có". */
export function examLine(exam) {
  if (!exam) return 'Chưa có';
  return [dayjs(when(exam)).format('DD/MM'), EXAM_CONCLUSIONS[exam.resultStatus] || exam.resultStatus, exam.diagnosis].filter(Boolean).join(' · ');
}
