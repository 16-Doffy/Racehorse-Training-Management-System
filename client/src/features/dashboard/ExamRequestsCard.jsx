import { Card, Tag, Typography, Empty } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { healthRecordApi } from '../health/healthApi';
import { HEALTH_LABELS, HEALTH_COLORS } from '../../constants/health';

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
  const requests = (data?.data || []).slice(0, 6);
  const pending = (data?.data || []).filter((r) => r.status === 'pending').length;

  return (
    <Card
      className="!mt-6"
      loading={isLoading}
      title={
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span>Yêu cầu khám đã gửi</span>
          {pending > 0 && <Text type="secondary" className="!text-xs">{pending} đang chờ bác sĩ</Text>}
        </div>
      }
    >
      {requests.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa gửi yêu cầu khám nào. Gửi từ hồ sơ ngựa hoặc từ bảng kiểm tra sẵn sàng khi xếp lịch tập."
        />
      ) : (
        <div className="flex flex-col divide-y divide-gray-100">
          {requests.map((r) => {
            const status = STATUS_META[r.status] || STATUS_META.pending;
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
                  <Text type="secondary" className="!text-xs">
                    gửi {dayjs(r.createdAt).format('DD/MM HH:mm')}
                  </Text>
                </div>
                {r.reason && <Text className="!text-sm text-gray-600">Lý do: {r.reason}</Text>}
                {r.status === 'done' && result && (
                  <Text className="!text-sm">
                    {r.resolvedBy?.name ? `Bác sĩ ${r.resolvedBy.name}` : 'Bác sĩ'} kết luận{' '}
                    <Tag color={HEALTH_COLORS[result.resultStatus]} className="!m-0">
                      {HEALTH_LABELS[result.resultStatus] || result.resultStatus}
                    </Tag>{' '}
                    — {result.diagnosis}
                  </Text>
                )}
                {r.status !== 'pending' && !result && r.resolutionNote && (
                  <Text className="!text-sm text-gray-600">Ghi chú của bác sĩ: {r.resolutionNote}</Text>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
