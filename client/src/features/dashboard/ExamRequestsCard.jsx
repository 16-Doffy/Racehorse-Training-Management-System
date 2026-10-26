import { Card, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { healthRecordApi } from '../health/healthApi';
import { HEALTH_LABELS, HEALTH_COLORS } from '../../constants/health';
import { areasText, dueByOf, symptomsText } from '../../constants/examRequest';
import QuietCard from './QuietCard';
import { useFirst } from './useFirst';

const { Text } = Typography;

const STATUS_META = {
  pending: { label: 'Chờ bác sĩ', color: 'gold' },
  done: { label: 'Đã khám', color: 'green' },
  cancelled: { label: 'Đã đóng', color: 'default' },
};
const PRIORITY_META = { high: { label: 'Ưu tiên cao', color: 'orange' }, urgent: { label: 'Khẩn cấp', color: 'red' } };

/**
 * The Head Trainer's own exam requests and what became of them. Before this, a request was a
 * notification that went out and nothing came back — the trainer had no way to tell whether the
 * vet had looked at the horse, or what they found.
 */
export default function ExamRequestsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['exam-requests', 'mine'],
    queryFn: () => healthRecordApi.listExamRequests(),
  });
  const requests = data?.data || [];
  // The three latest; the rest open on demand, so the card stays as short as the column beside it.
  const [shown, more] = useFirst(requests, 3);
  if (!isLoading && !requests.length) return <QuietCard title="Yêu cầu khám đã gửi">Không có yêu cầu nào chờ bác sĩ</QuietCard>;
  const pending = (data?.data || []).filter((r) => r.status === 'pending').length;

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl overflow-hidden"
      styles={{ title: { whiteSpace: 'normal', overflow: 'visible' }, header: { height: 'auto', whiteSpace: 'normal' } }}
      loading={isLoading}
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900 text-[15px]">Yêu cầu khám đã gửi</span>
            {pending > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                {pending} chờ bác sĩ
              </span>
            )}
          </div>
          <Text type="secondary" className="!text-xs font-normal">
            {pending > 0 ? `${pending} yêu cầu mở` : 'Không có yêu cầu chờ'}
          </Text>
        </div>
      }
    >
      <div className="flex flex-col divide-y divide-gray-100">
        {shown.map((r) => {
          // An open request the vet has taken on reads as accepted, with the appointment if there is one.
          const accepted = r.status === 'pending' && r.acceptedAt;
          const status = accepted ? { label: 'Bác sĩ đã nhận', color: 'blue' } : STATUS_META[r.status] || STATUS_META.pending;
          const result = r.healthRecord;
          return (
            <div key={r._id} className="py-2.5 flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/horses/${r.horse?._id}`} className="font-medium">
                  {r.horse?.name || 'Ngựa'}
                </Link>
                <Tag color={status.color} className="!m-0">
                  {status.label}
                </Tag>
                {PRIORITY_META[r.priority] && (
                  <Tag color={PRIORITY_META[r.priority].color} className="!m-0">
                    {PRIORITY_META[r.priority].label}
                  </Tag>
                )}
                {r.status === 'pending' && r.holdTraining && (
                  <Tag color="red" className="!m-0">
                    Đang dừng tập
                  </Tag>
                )}
                <Text type="secondary" className="!text-xs">
                  gửi {dayjs(r.createdAt).format('DD/MM HH:mm')}
                  {r.status === 'pending' ? ` · bác sĩ khám trước ${dayjs(dueByOf(r)).format('HH:mm DD/MM')}` : ''}
                </Text>
              </div>
              {(r.symptoms?.length > 0 || r.bodyAreas?.length > 0) && (
                <Text className="line-clamp-2 !text-sm text-gray-600">
                  Dấu hiệu: {[symptomsText(r.symptoms), areasText(r.bodyAreas)].filter(Boolean).join(' · ')}
                </Text>
              )}
              {r.reason && <Text className="line-clamp-2 !text-sm text-gray-600">Lý do: {r.reason}</Text>}
              {accepted && (
                <Text className="line-clamp-2 !text-sm">
                  {r.acceptedBy?.name ? `Bác sĩ ${r.acceptedBy.name}` : 'Bác sĩ'} đã nhận
                  {r.scheduledFor ? `, hẹn khám ${dayjs(r.scheduledFor).format('HH:mm DD/MM')}` : ''}
                  {r.resolutionNote ? ` — ${r.resolutionNote}` : ''}
                </Text>
              )}
              {r.status === 'done' && result && (
                <Text className="line-clamp-2 !text-sm">
                  {r.resolvedBy?.name ? `Bác sĩ ${r.resolvedBy.name}` : 'Bác sĩ'} kết luận{' '}
                  <Tag color={HEALTH_COLORS[result.resultStatus]} className="!m-0">
                    {HEALTH_LABELS[result.resultStatus] || result.resultStatus}
                  </Tag>{' '}
                  — {result.diagnosis}
                </Text>
              )}
              {r.status !== 'pending' && !result && r.resolutionNote && (
                <Text className="line-clamp-2 !text-sm text-gray-600">Ghi chú của bác sĩ: {r.resolutionNote}</Text>
              )}
            </div>
          );
        })}
      </div>
      {more}
    </Card>
  );
}
