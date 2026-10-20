import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Table, Tag, Button, Modal, Form, Select, InputNumber, Input, Empty, Alert, Card } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import { downloadFile } from '../../lib/files';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from './financeApi';
import { horsesApi } from '../horses/horsesApi';
import { ROLES } from '../../constants/roles';
import dayjs from 'dayjs';
import { FINANCE_CATEGORIES, categoryLabel } from './financeLabels';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { OwnerCard, Pill, StatStrip } from '../horses/ownerUi';

const money = (v) => `${(v || 0).toLocaleString('vi-VN')} đ`;

// The Owner's read-only statement: one compact line per entry, money coloured by direction.
const ownerColumns = [
  { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse', render: (n) => <span className="font-semibold text-gray-900">{n || '—'}</span> },
  { title: 'Loại', dataIndex: 'type', key: 'type', render: (t) => <Pill tone={t === 'revenue' ? 'good' : 'bad'}>{t === 'revenue' ? 'Doanh thu' : 'Chi phí'}</Pill> },
  { title: 'Hạng mục', dataIndex: 'category', key: 'category', render: categoryLabel },
  {
    title: 'Nguồn',
    dataIndex: 'source',
    key: 'source',
    render: (s) => <span className="text-gray-500">{s === 'race_prize' ? 'Tự động · kết quả giải' : s === 'system' ? 'Tự động' : 'Nhập tay'}</span>,
  },
  {
    title: 'Số tiền',
    dataIndex: 'amount',
    key: 'amount',
    align: 'right',
    render: (v, r) => (
      <span className={`font-semibold tabular-nums ${r.type === 'revenue' ? 'text-emerald-700' : 'text-red-600'}`}>
        {r.type === 'revenue' ? '+' : '−'}{money(v)}
      </span>
    ),
  },
  { title: 'Ngày', dataIndex: 'date', key: 'date', render: (d) => <span className="text-gray-600 tabular-nums">{dayjs(d).format('DD/MM/YYYY')}</span> },
];

const columns = (isOwner) => isOwner ? ownerColumns : [
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
  ...(isOwner ? [] : [{ title: 'Ghi chú', dataIndex: 'note', key: 'note' }]),
];

// Owner sees a read-only report for their own horses; Manager records cost/revenue entries.
export default function FinancePage() {
  const { user } = useSelector((state) => state.auth);
  const isOwner = user?.role === ROLES.OWNER;
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['finance', isOwner ? 'mine' : 'all'],
    queryFn: () => (isOwner ? financeApi.listMine() : financeApi.list()),
  });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list(), enabled: !isOwner });

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['finance', 'mine', 'summary'],
    queryFn: () => financeApi.getMineSummary(),
    enabled: isOwner,
  });
  // The statement for this year: GET /finance/mine/summary answers { totals: { revenue, cost, net } }.
  const totals = summaryData?.data?.totals || {};
  const summary = { totalRevenue: totals.revenue || 0, totalCost: totals.cost || 0, netBalance: totals.net || 0 };
  const entryType = Form.useWatch('type', form);

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
    // The Owner's page is built from light boxes, like the other Owner pages (MainLayout keeps them light on a dark canvas).
    <div className={isOwner ? 'light-surface-box owner-ui' : undefined}>
      {isOwner ? (
        <PageHeroBanner
          eyebrow="TEAM 8 • TÀI CHÍNH CHIẾN MÃ"
          roleLabel="Horse Owner"
          title="Chi Phí & Doanh Thu"
          subtitle="Sổ thu chi của các chiến mã bạn sở hữu: tiền thưởng giải đấu, chi phí chăm sóc, thức ăn và y tế."
        />
      ) : (
      <PageHeroBanner
        eyebrow="Sổ cái thu chi"
        roleLabel="Quản lý CLB"
        title="Sổ thu chi & tài chính câu lạc bộ"
        subtitle="Tổng hợp thu chi toàn câu lạc bộ: tiền thưởng giải đấu, dịch vụ nội trú, chi phí thức ăn, thuốc thú y và vận hành."
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
      )}

      {!isOwner && (
        <div className="light-surface-box grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD3] mb-5 rounded-xl bg-[#FAF7F0] border border-[#E5DEC9] shadow-xs">
          <div className="p-3.5 sm:p-4 min-w-0">
            <div className="text-xs font-medium text-slate-600">Tổng giao dịch</div>
            <div className="text-base sm:text-lg xl:text-xl font-bold text-slate-800 tabular-nums mt-1 break-words leading-snug">{(data?.data || []).length} <span className="text-xs font-normal text-slate-500">bản ghi</span></div>
          </div>
          <div className="p-3.5 sm:p-4 min-w-0">
            <div className="text-xs font-medium text-slate-600">Tổng doanh thu</div>
            <div className="text-base sm:text-lg xl:text-xl font-bold text-[#0F5A43] tabular-nums mt-1 break-words leading-snug">{(data?.data || []).filter((r) => r.type === 'revenue').reduce((acc, r) => acc + (r.amount || 0), 0).toLocaleString('vi-VN')} đ</div>
          </div>
          <div className="p-3.5 sm:p-4 min-w-0">
            <div className="text-xs font-medium text-slate-600">Tổng chi phí</div>
            <div className="text-base sm:text-lg xl:text-xl font-bold text-rose-600 tabular-nums mt-1 break-words leading-snug">{(data?.data || []).filter((r) => r.type === 'cost').reduce((acc, r) => acc + (r.amount || 0), 0).toLocaleString('vi-VN')} đ</div>
          </div>
          <div className="p-3.5 sm:p-4 min-w-0">
            <div className="text-xs font-medium text-slate-600">Lợi nhuận ròng</div>
            {(() => {
              const rev = (data?.data || []).filter((r) => r.type === 'revenue').reduce((acc, r) => acc + (r.amount || 0), 0);
              const cost = (data?.data || []).filter((r) => r.type === 'cost').reduce((acc, r) => acc + (r.amount || 0), 0);
              const net = rev - cost;
              return <div className={`text-base sm:text-lg xl:text-xl font-bold tabular-nums mt-1 break-words leading-snug ${net >= 0 ? 'text-[#0F5A43]' : 'text-rose-600'}`}>{net.toLocaleString('vi-VN')} đ</div>;
            })()}
          </div>
        </div>
      )}

      {isOwner && (
        <StatStrip
          className="mb-4"
          cols={3}
          items={[
            { label: 'Tổng doanh thu', value: summaryLoading ? '—' : money(summary.totalRevenue), hint: 'Năm nay', tone: 'good' },
            { label: 'Tổng chi phí', value: summaryLoading ? '—' : money(summary.totalCost), hint: 'Năm nay', tone: summary.totalCost ? 'bad' : undefined },
            { label: 'Lợi nhuận ròng', value: summaryLoading ? '—' : money(summary.netBalance), hint: summary.netBalance >= 0 ? 'Đang có lãi' : 'Đang lỗ', tone: summary.netBalance >= 0 ? 'good' : 'bad' },
          ]}
        />
      )}

      {!isOwner && isError && (
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

      {isOwner ? (
        <OwnerCard title="Sổ thu chi" flush>
          <Table
            rowKey="_id"
            columns={columns(true)}
            dataSource={data?.data}
            loading={isLoading}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có khoản thu chi nào" /> }}
          />
        </OwnerCard>
      ) : (
        <Card className="!rounded-xl !border-[#E2D9C8]" styles={{ body: { padding: 0 } }}>
          <Table
            rowKey="_id"
            columns={columns(false)}
            dataSource={data?.data}
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
      )}

      {!isOwner && (
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
      )}
    </div>
  );
}
