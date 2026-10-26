import { useState } from 'react';
import { Card, Empty, Table, Segmented, Progress } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { horsesApi } from '../horses/horsesApi';
import HorseNextStep from '../horses/HorseNextStep';

/**
 * Each horse and what comes next on its way from arrival to training — held back first, then those with
 * something to do, then those training on schedule. Click a step to see the whole checklist.
 */
export default function NextStepsCard() {
  const [filter, setFilter] = useState('all');
  const { data, isLoading } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });

  const allRows = [...(data?.data || [])].sort(
    (a, b) =>
      Number(b.blocked) - Number(a.blocked) ||
      Number(Boolean(a.nextStep.done)) - Number(Boolean(b.nextStep.done))
  );

  const openCount = allRows.filter((r) => !r.nextStep.done).length;
  const doneCount = allRows.length - openCount;

  const rows = allRows.filter((r) => {
    if (filter === 'pending') return !r.nextStep.done;
    if (filter === 'done') return r.nextStep.done;
    return true;
  });

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl overflow-hidden bg-[#FFFDF8]"
      styles={{
        title: { whiteSpace: 'normal', overflow: 'visible', padding: '14px 16px' },
        body: { padding: '12px 16px 16px 16px' },
      }}
      title={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-[15px]">Bước tiếp theo của từng ngựa</span>
            {openCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                {openCount} cần xử lý
              </span>
            )}
          </div>
          <Segmented
            size="small"
            value={filter}
            onChange={setFilter}
            options={[
              { label: `Tất cả (${allRows.length})`, value: 'all' },
              { label: `Cần làm (${openCount})`, value: 'pending' },
              { label: `Đạt (${doneCount})`, value: 'done' },
            ]}
            className="self-start sm:self-auto bg-[#F2EDE2]"
          />
        </div>
      }
    >
      {rows.length ? (
        <Table
          size="middle"
          rowKey={(r) => r.horse._id}
          loading={isLoading}
          pagination={{
            pageSize: 5,
            size: 'small',
            hideOnSinglePage: true,
            showTotal: (total) => <span className="text-xs text-gray-500 tabular-nums">{total} ngựa</span>,
          }}
          dataSource={rows}
          columns={[
            {
              title: 'Ngựa',
              key: 'horse',
              width: '32%',
              render: (_, r) => (
                <div className="flex flex-col py-0.5">
                  <Link
                    to={`/horses/${r.horse._id}`}
                    className="font-semibold text-emerald-950 hover:text-emerald-700 transition-colors text-sm"
                  >
                    {r.horse.name}
                  </Link>
                  {r.horse.breed && (
                    <span className="text-[11px] text-gray-600 truncate">{r.horse.breed}</span>
                  )}
                </div>
              ),
            },
            {
              title: 'Bước tiếp theo',
              key: 'next',
              width: '46%',
              render: (_, r) => <HorseNextStep checklist={r} />,
            },
            {
              title: 'Tiến độ',
              key: 'progress',
              width: '22%',
              align: 'right',
              render: (_, r) => {
                const required = r.items.filter((i) => !i.optional);
                const done = required.filter((i) => i.done).length;
                const total = required.length;
                const percent = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <div className="flex flex-col items-end gap-1">
                    <span className="tabular-nums font-semibold text-xs text-gray-800">
                      {done}/{total} mục
                    </span>
                    <Progress
                      percent={percent}
                      size={['100%', 4]}
                      showInfo={false}
                      strokeColor={percent === 100 ? '#2E7D4F' : '#0F5A43'}
                      railColor="#EBE5D8"
                      className="!m-0 w-16"
                    />
                  </div>
                );
              },
            },
          ]}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            isLoading
              ? 'Đang tải dữ liệu…'
              : filter === 'pending'
              ? 'Tuyệt vời! Không có ngựa nào bị tắc bước tiếp nhận.'
              : 'Chưa có ngựa nào trong phạm vi.'
          }
          className="py-6"
        />
      )}
    </Card>
  );
}
