import { Card, Empty, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { horsesApi } from '../horses/horsesApi';
import HorseNextStep from '../horses/HorseNextStep';

const { Text } = Typography;

/**
 * Each horse and what comes next on its way from arrival to training — held back first, then those with
 * something to do, then those training on schedule. Click a step to see the whole checklist.
 */
export default function NextStepsCard() {
  const { data, isLoading } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });
  const rows = [...(data?.data || [])].sort((a, b) => Number(b.blocked) - Number(a.blocked) || Number(Boolean(a.nextStep.done)) - Number(Boolean(b.nextStep.done)));
  const open = rows.filter((r) => !r.nextStep.done).length;

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] border-t-2 border-t-[#0F5A43] rounded-xl overflow-hidden"
      styles={{ title: { whiteSpace: 'normal', overflow: 'visible' }, header: { height: 'auto' } }}
      headStyle={{ whiteSpace: 'normal' }}
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900 text-base">Bước tiếp theo của từng ngựa</span>
            {open > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                {open} cần thao tác
              </span>
            )}
          </div>
          <Text type="secondary" className="!text-xs font-normal">
            {open ? `${open} ngựa cần làm tiếp` : 'Mọi ngựa đang tập theo lịch'}
          </Text>
        </div>
      }
    >
      {rows.length ? (
        <Table
          size="small"
          rowKey={(r) => r.horse._id}
          loading={isLoading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          dataSource={rows}
          columns={[
            { title: 'Ngựa', key: 'horse', render: (_, r) => <Link to={`/horses/${r.horse._id}`}>{r.horse.name}</Link> },
            { title: 'Bước tiếp theo', key: 'next', render: (_, r) => <HorseNextStep checklist={r} /> },
            {
              title: 'Đã xong',
              key: 'progress',
              render: (_, r) => {
                const required = r.items.filter((i) => !i.optional);
                return <Text className="tabular-nums">{required.filter((i) => i.done).length}/{required.length}</Text>;
              },
            },
          ]}
        />
      ) : (
        <Empty description={isLoading ? 'Đang tải…' : 'Chưa có ngựa nào trong phạm vi của bạn.'} />
      )}
    </Card>
  );
}
