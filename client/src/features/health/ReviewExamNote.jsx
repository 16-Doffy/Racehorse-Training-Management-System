import { Typography } from 'antd';
import dayjs from 'dayjs';
import { EXAM_CONCLUSIONS, useLastExam, when } from './useLastExam';

const { Text } = Typography;

/**
 * Under a race entry marked for review: whether the vet has examined the horse since it was marked, and what
 * was concluded, so the trainer decides again knowing it instead of looking for it.
 */
export default function ReviewExamNote({ horseId, since }) {
  const { data: exam, isLoading } = useLastExam(horseId);
  if (isLoading) return null;
  const after = exam && (!since || new Date(when(exam)) >= new Date(since));
  if (!after) return <Text type="secondary" className="!text-xs">Bác sĩ chưa khám lại từ lúc bị đánh dấu.</Text>;
  return (
    <Text className="!text-xs">
      Bác sĩ đã khám lại {dayjs(when(exam)).format('DD/MM HH:mm')}: <strong>{EXAM_CONCLUSIONS[exam.resultStatus] || exam.resultStatus}</strong>
      {exam.diagnosis ? ` · ${exam.diagnosis}` : ''}. Chọn lại Tham gia hoặc Rút để bỏ dấu xem lại.
    </Text>
  );
}
