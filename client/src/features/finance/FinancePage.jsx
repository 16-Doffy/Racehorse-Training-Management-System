import { useState } from 'react';
import { Table, Tag, Button, Modal, Form, Select, InputNumber, Input, Empty, Alert, Card } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import { downloadFile } from '../../lib/files';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from './financeApi';
import { horsesApi } from '../horses/horsesApi';
import dayjs from 'dayjs';
import { FINANCE_CATEGORIES, categoryLabel } from './financeLabels';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { newestFirst } from '../../utils/newestFirst';

const columns = [
  { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse' },
  {
    title: 'Loại',
    dataIndex: 'type',
    key: 'type',
    render: (t) => <Tag color={t === 'revenue' ? 'green' : 'red'}>{t === 'revenue' ? 'Doanh thu' : 'Chi phí'}</Tag>,
  },
  { title: 'Hạng mục', dataIndex: 'category', key: 'category', render: categoryLabel },
  {
    title: 'Nguồn',
    dataIndex: 'source',
    key: 'source',
    // Written by the system from a race result (corrected there) vs typed in by the Manager.
    render: (s) => (s === 'race_prize' ? <Tag color="gold">Tự động · kết quả giải</Tag> : s === 'system' ? <Tag>Tự động</Tag> : <Tag color="default">Nhập tay</Tag>),
  },
  {
    title: 'Số tiền',
    dataIndex: 'amount',
    key: 'amount',
    align: 'right',
    render: (v, r) => (
      <span className={`font-semibold tabular-nums whitespace-nowrap ${r.type === 'revenue' ? 'text-emerald-800 staff-revenue-text' : 'text-rose-700 staff-cost-text'}`}>
        {r.type === 'revenue' ? '+' : '−'}{v.toLocaleString('vi-VN')} đ
      </span>
    ),
  },
  { title: 'Ngày', dataIndex: 'date', key: 'date', render: (d) => <span className="tabular-nums">{dayjs(d).format('DD/MM/YYYY')}</span> },
  { title: 'Ghi chú', dataIndex: 'note', key: 'note' },
];

// The Manager records cost/revenue entries. The Horse Owner reads their own statement on its own page
// (features/owner/OwnerFinance.jsx).
export default function FinancePage() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['finance', 'all'], queryFn: () => financeApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const entryType = Form.useWatch('type', form);
  const records = data?.data || [];
  const revenue = records.filter((r) => r.type === 'revenue').reduce((acc, r) => acc + (r.amount || 0), 0);
  const cost = records.filter((r) => r.type === 'cost').reduce((acc, r) => acc + (r.amount || 0), 0);
  const net = revenue - cost;

  const createMutation = useMutation({
    mutationFn: (payload) => financeApi.create(payload),
    onSuccess: () => {
      message.success('Đã ghi nhận.');
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      setOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Ghi nhận thất bại.'),
  });

  return (
    <div>
      <PageHeroBanner
        eyebrow="Sổ cái thu chi"
        roleLabel="Quản lý CLB"
        title="Sổ thu chi & tài chính câu lạc bộ"
        stats={[
          { label: 'Giao dịch', value: `${records.length} bản ghi` },
          { label: 'Doanh thu', value: <span className="text-emerald-300">{revenue.toLocaleString('vi-VN')} đ</span> },
          { label: 'Chi phí', value: <span className="text-rose-300">{cost.toLocaleString('vi-VN')} đ</span> },
          { label: 'Lợi nhuận ròng', value: <span className={net >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{net.toLocaleString('vi-VN')} đ</span> },
        ]}
        actionButton={
            <div className="flex flex-wrap gap-2">
              <Button
                icon={<DownloadOutlined />}
                onClick={() => downloadFile('/export/finance', `tai-chinh-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => message.error(e.message || 'Xuất file thất bại.'))}
                className="!h-9 !rounded-lg !bg-white/10 hover:!bg-white/15 !border-white/20 !text-white"
              >
                Xuất CSV
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setOpen(true)}
                className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer"
              >
                Ghi nhận khoản mục
              </Button>
            </div>
        }
      />

      {isError && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title="Chưa tải được sổ thu chi"
          description={error?.message || 'Không thể lấy dữ liệu thu chi lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      <Card className="!rounded-xl !border-[#E2D9C8]" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={newestFirst(data?.data)}
          loading={isLoading && !data}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa có khoản thu chi nào được ghi nhận"
              >
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
                  Ghi nhận khoản mục đầu tiên
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <Modal
        title="Ghi nhận khoản chi phí / doanh thu"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))} />
          </Form.Item>
          <Form.Item name="type" label="Loại" rules={[{ required: true }]}>
            <Select
              onChange={() => form.setFieldValue('category', undefined)}
              options={[
                { value: 'cost', label: 'Chi phí' },
                { value: 'revenue', label: 'Doanh thu' },
              ]}
            />
          </Form.Item>
          <Form.Item name="category" label="Hạng mục" rules={[{ required: true }]}>
            <Select placeholder={entryType ? 'Chọn hạng mục' : 'Chọn loại trước'} disabled={!entryType} options={FINANCE_CATEGORIES[entryType] || []} />
          </Form.Item>
          <Form.Item name="amount" label="Số tiền (VNĐ)" rules={[{ required: true }]}>
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
