import { Alert, Card, Typography, Spin, Button, Empty } from 'antd';
import {
  CheckCircleFilled,
  WarningFilled,
  StopFilled,
  SafetyCertificateOutlined,
  CoffeeOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { trainingSessionApi } from './trainingApi';
import { dailyTaskApi } from '../stable/stableApi';
import { message } from '../../lib/antdStatic';

const { Text } = Typography;

// One row per gate, each owned by a different role — so the trainer can see at a glance which
// colleague's work is missing, rather than only finding out when the API refuses the session.
const GATE_OWNERS = {
  medical: 'Bác sĩ thú y',
  vet_clearance: 'Bác sĩ thú y',
  nutrition: 'Nhân viên chăm sóc',
  care_assignment: 'Quản lý CLB',
  temperature: 'HLV đo khi kiểm tra',
};

const STATUS_META = {
  ok: { color: '#389e0d', icon: <CheckCircleFilled />, bg: 'bg-green-50' },
  caution: { color: '#d48806', icon: <WarningFilled />, bg: 'bg-amber-50' },
  blocked: { color: '#cf1322', icon: <StopFilled />, bg: 'bg-red-50' },
};

const OVERALL_TEXT = {
  ready: { label: 'Sẵn sàng tập', color: '#389e0d' },
  caution: { label: 'Có cảnh báo — cần bạn xác nhận', color: '#d48806' },
  blocked: { label: 'Không được tập', color: '#cf1322' },
};

function GateRow({ gate, onRequestExam }) {
  const meta = STATUS_META[gate.status] || STATUS_META.ok;
  // The meal right before the session was missed: ask the groom to feed the horse now.
  const makeUp = useMutation({
    mutationFn: () => dailyTaskApi.makeUpMeal(gate.taskId),
    onSuccess: () => message.success('Đã báo nhân viên cho ăn bù. Khi họ ghi nhận, kiểm tra lại (nhớ chờ đủ thời gian tiêu hóa).'),
    onError: (err) => message.error(err.message || 'Không báo được.'),
  });
  return (
    <div className={`flex gap-3 items-start px-3 py-2.5 rounded ${meta.bg}`}>
      <span style={{ color: meta.color, fontSize: 16, marginTop: 1 }}>{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Text strong className="!text-sm">
            {gate.label}
          </Text>
          <Text type="secondary" className="!text-xs">
            {GATE_OWNERS[gate.key]}
          </Text>
        </div>
        <Text className="block !text-xs text-gray-700 mt-0.5">{gate.detail}</Text>
        {gate.action === 'request_exam' && onRequestExam && (
          <Button
            size="small"
            type="link"
            className="!px-0 !h-auto !text-xs"
            icon={<SafetyCertificateOutlined />}
            onClick={onRequestExam}
          >
            Yêu cầu bác sĩ kiểm tra
          </Button>
        )}
        {gate.action === 'make_up_meal' && gate.taskId && (
          <Button
            size="small"
            type="link"
            className="!px-0 !h-auto !text-xs"
            icon={<CoffeeOutlined />}
            loading={makeUp.isPending}
            disabled={makeUp.isSuccess}
            onClick={() => makeUp.mutate()}
          >
            {makeUp.isSuccess ? 'Đã báo nhân viên cho ăn bù' : 'Báo nhân viên cho ăn bù'}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Live readiness board for a proposed session. Re-queries as the trainer changes the horse, the
 * time or the intensity, so the answer shown is the answer for the session actually being booked.
 */
export default function ReadinessPanel({ horse, scheduledAt, intensity, sessionType, objective, onRequestExam }) {
  const enabled = Boolean(horse);

  const { data, isFetching, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['session-readiness', horse, scheduledAt, intensity, sessionType, objective],
    queryFn: () =>
      trainingSessionApi.readiness({
        horse,
        ...(scheduledAt ? { scheduledAt } : {}),
        ...(intensity ? { intensity } : {}),
        ...(sessionType ? { sessionType } : {}),
        ...(objective ? { objective } : {}),
      }),
    enabled,
  });

  const readiness = data?.data;
  // The last check failed: with nothing to show the answer is unknown (never "ready"); with an
  // earlier answer, it is shown as of the time it was loaded. The server checks again at start.
  const failed = enabled && isError && !readiness;
  const stale = enabled && isError && Boolean(readiness);
  const overall = readiness ? OVERALL_TEXT[readiness.overall] : null;

  return (
    <Card
      size="small"
      className="!mb-2"
      title={<span className="text-sm">Kiểm tra sẵn sàng</span>}
    >
      {(failed || stale) && (
        <Alert
          type="warning"
          showIcon
          className="!mb-2"
          title={failed ? 'Chưa kiểm tra được tình trạng sẵn sàng' : `Chưa cập nhật được, đang hiện kết quả lúc ${dayjs(dataUpdatedAt).format('HH:mm')}`}
          description={
            <span className="text-xs">
              {failed ? 'Chưa biết ngựa có được tập hay không.' : 'Tình trạng có thể đã đổi.'} Khi bấm Bắt đầu, hệ thống vẫn kiểm tra lại.
            </span>
          }
          action={
            <Button size="small" loading={isFetching} onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}
      {/* In the body rather than the card title, which AntD truncates on narrow screens. An old
          answer keeps its words but loses its colour: green must not stand for a check that failed. */}
      {overall && stale && (
        <Text type="secondary" className="!text-xs font-semibold block mb-2">
          {overall.label}
        </Text>
      )}
      {overall && !stale && (
        <div className="text-xs font-semibold mb-2" style={{ color: overall.color }}>
          {overall.label}
        </div>
      )}
      {!enabled && (
        <Empty
          className="!my-2"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="text-xs">Chọn ngựa để kiểm tra tình trạng sẵn sàng</span>}
        />
      )}

      {enabled && isFetching && !readiness && !failed && (
        <div className="py-4 text-center">
          <Spin size="small" />
        </div>
      )}

      {enabled && readiness && (
        <div className="flex flex-col gap-1.5">
          {readiness.gates.map((gate) => (
            <GateRow key={gate.key} gate={gate} onRequestExam={onRequestExam} />
          ))}
        </div>
      )}
    </Card>
  );
}
