import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Select, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { horsesApi } from './horsesApi';

const CARE_KIND_LABELS = { vaccination: 'Tiêm phòng', deworming: 'Tẩy giun', farrier: 'Đóng móng' };
const CARE_KIND_COLORS = { vaccination: 'blue', deworming: 'purple', farrier: 'orange' };
const KIND_OPTIONS = [{ value: 'all', label: 'Tất cả' }, ...Object.entries(CARE_KIND_LABELS).map(([value, label]) => ({ value, label }))];

/**
 * What routine care was actually done to a horse — vaccine, dewormer, farrier — newest first, with the
 * product, batch and dose and who did it. (GET /horses/:id/care-events; the vet records them.)
 */
export default function CareHistoryCard({ horseId }) {
  const [kind, setKind] = useState('all');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['care-events', horseId, kind],
    queryFn: () => horsesApi.careEvents(horseId, kind === 'all' ? undefined : { kind }),
    enabled: Boolean(horseId),
  });
  const events = Array.isArray(data?.data) ? data.data : [];

  const columns = [
    { title: 'Ngày', dataIndex: 'date', key: 'date', width: 110, render: (d) => <span className="tabular-nums whitespace-nowrap">{dayjs(d).format('DD/MM/YYYY')}</span> },
    { title: 'Loại', dataIndex: 'kind', key: 'kind', width: 110, render: (k) => <Tag color={CARE_KIND_COLORS[k]}>{CARE_KIND_LABELS[k] || k}</Tag> },
    { title: 'Sản phẩm', dataIndex: 'product', key: 'product', render: (v) => v || '—' },
    { title: 'Số lô', dataIndex: 'batchNumber', key: 'batchNumber', render: (v) => <span className="tabular-nums">{v || '—'}</span> },
    { title: 'Liều', dataIndex: 'dose', key: 'dose', render: (v) => <span className="tabular-nums">{v || '—'}</span> },
    { title: 'Hẹn lần sau', dataIndex: 'nextDue', key: 'nextDue', render: (d) => <span className="tabular-nums whitespace-nowrap">{d ? dayjs(d).format('DD/MM/YYYY') : '—'}</span> },
    { title: 'Người thực hiện', dataIndex: ['performedBy', 'name'], key: 'performedBy', render: (v) => v || '—' },
    { title: 'Ghi chú', dataIndex: 'note', key: 'note', render: (v) => v || '—' },
  ];

  return (
    <Card
      title="Lịch sử chăm sóc định kỳ"
      size="small"
      extra={<Select size="small" value={kind} onChange={setKind} options={KIND_OPTIONS} className="w-32" />}
    >
      {isError ? (
        <Alert
          type="warning"
          showIcon
          title="Chưa tải được lịch sử chăm sóc"
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : (
        <Table
          rowKey="_id"
          size="small"
          columns={columns}
          dataSource={events}
          loading={isLoading && !data}
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa ghi nhận lần tiêm phòng, tẩy giun hay đóng móng nào" /> }}
        />
      )}
    </Card>
  );
}
