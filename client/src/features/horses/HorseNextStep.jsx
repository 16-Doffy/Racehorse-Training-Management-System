import { Popover, Tag, Typography } from 'antd';
import { CheckCircleFilled, ClockCircleOutlined, StopOutlined } from '@ant-design/icons';

const { Text } = Typography;

/**
 * A horse's next step on the way from arriving to training (GET /horses/checklist): what, who does it,
 * and why it is held back. The popover lists the whole checklist so the reader sees what is already done.
 */
export default function HorseNextStep({ checklist }) {
  if (!checklist) return <Text type="secondary">—</Text>;
  const { nextStep, items, blocked } = checklist;
  const color = blocked ? 'error' : nextStep.done ? 'success' : 'gold';
  const content = (
    <div className="flex w-[min(340px,calc(100vw-48px))] flex-col gap-1.5 text-sm">
      {blocked && <Text type="danger" className="!text-xs">Bị chặn: {nextStep.blockedReason}</Text>}
      {items.map((i) => (
        <div key={i.key} className="flex items-start gap-2">
          <span className="pt-0.5">
            {i.done ? <CheckCircleFilled style={{ color: '#2E7D4F' }} /> : <ClockCircleOutlined style={{ color: i.optional ? '#8A8578' : '#9A6B00' }} />}
          </span>
          <div className="min-w-0">
            <div className="font-medium">
              {i.label}
              {i.optional ? <Text type="secondary" className="!text-xs"> (không bắt buộc)</Text> : null}
            </div>
            <Text type="secondary" className="!text-xs">
              {i.detail} · {i.who}
            </Text>
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <Popover content={content} title="Tiếp nhận → huấn luyện" trigger="click">
      <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left" onClick={(e) => e.stopPropagation()}>
        <Tag color={color} icon={blocked ? <StopOutlined /> : nextStep.done ? <CheckCircleFilled /> : <ClockCircleOutlined />} className="!m-0 !whitespace-normal">
          {nextStep.label}
        </Tag>
        <div className="text-[11px] text-gray-500">{blocked ? nextStep.blockedReason : nextStep.done ? 'Đủ điều kiện' : `Người làm: ${nextStep.who}`}</div>
      </button>
    </Popover>
  );
}
