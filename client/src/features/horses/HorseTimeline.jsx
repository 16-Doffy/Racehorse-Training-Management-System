import { useState } from 'react';
import { Card, Empty, Segmented, Select, Tag, Timeline, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { horsesApi } from './horsesApi';

const { Text } = Typography;

// One colour per role, so the hand-offs between them read at a glance down the line.
const ROLE_META = {
  head_trainer: { label: 'Huấn luyện viên', color: 'blue', dot: '#1677ff' },
  veterinarian: { label: 'Bác sĩ thú y', color: 'magenta', dot: '#c41d7f' },
  groom: { label: 'NV chăm sóc', color: 'green', dot: '#389e0d' },
  manager: { label: 'Quản lý', color: 'purple', dot: '#722ed1' },
};

const ROLE_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'head_trainer', label: 'HLV' },
  { value: 'veterinarian', label: 'Bác sĩ' },
  { value: 'groom', label: 'Chăm sóc' },
];

const RANGE_OPTIONS = [
  { value: 7, label: '7 ngày' },
  { value: 14, label: '14 ngày' },
  { value: 30, label: '30 ngày' },
];

const SEVERITY_DOT = { warning: '#d48806', critical: '#cf1322' };

/**
 * Everything each role did to this horse, in order. Each role's own screens show only its slice;
 * here a groom's report, the vet's exam and the trainer's session sit on one line of time, which
 * is what shows how one leads to the next.
 */
export default function HorseTimeline({ horseId }) {
  const [days, setDays] = useState(14);
  const [role, setRole] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['horse-timeline', horseId, days],
    queryFn: () => horsesApi.timeline(horseId, { days }),
    enabled: Boolean(horseId),
  });

  const events = (data?.data?.events || []).filter((e) => role === 'all' || e.role === role);

  return (
    <Card
      className="!mb-4"
      loading={isLoading}
      title="Dòng thời gian"
      extra={<Select size="small" value={days} onChange={setDays} options={RANGE_OPTIONS} className="w-24" />}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <Text type="secondary" className="!text-xs max-w-xl">
          Buổi tập, khám và điều trị, việc chăm sóc, sự cố và giải đua của ngựa này — do cả ba bộ phận ghi lại.
        </Text>
        <Segmented size="small" options={ROLE_FILTERS} value={role} onChange={setRole} />
      </div>

      {events.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có hoạt động nào trong khoảng thời gian này." />
      ) : (
        <Timeline
          items={events.map((e) => {
            const meta = ROLE_META[e.role] || ROLE_META.manager;
            return {
              key: `${e.kind}-${e.refId}`,
              color: SEVERITY_DOT[e.severity] || meta.dot,
              content: (
                <div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Text type="secondary" className="!text-xs tabular-nums">
                      {dayjs(e.at).format('DD/MM HH:mm')}
                    </Text>
                    <Tag color={meta.color} className="!m-0">
                      {meta.label}
                    </Tag>
                    {e.upcoming && <Tag className="!m-0">Sắp tới</Tag>}
                    {e.actor && (
                      <Text type="secondary" className="!text-xs">
                        {e.actor}
                      </Text>
                    )}
                  </div>
                  <div className="font-medium mt-0.5">{e.title}</div>
                  {e.detail && (
                    <Text type="secondary" className="!text-sm">
                      {e.detail}
                    </Text>
                  )}
                </div>
              ),
            };
          })}
        />
      )}
    </Card>
  );
}
