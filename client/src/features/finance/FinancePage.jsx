import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Table, Typography, Tag, Button, Modal, Form, Select, InputNumber, Input, Row, Col, Statistic, Card } from 'antd';
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

const { Title } = Typography;

const columns = (isOwner) => [
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
  { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (v) => v.toLocaleString('vi-VN') + ' đ' },
  { title: 'Ngày', dataIndex: 'date', key: 'date', render: (d) => dayjs(d).format('DD/MM/YYYY') },
  ...(isOwner ? [] : [{ title: 'Ghi chú', dataIndex: 'note', key: 'note' }]),
];

// Owner sees a read-only report for their own horses; Manager records cost/revenue entries.
export default function FinancePage() {
  const { user } = useSelector((state) => state.auth);
  const isOwner = user?.role === ROLES.OWNER;
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
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
    <div>
      {isOwner ? (
        <Title level={3} className="!mb-4">
          Chi phí & Doanh thu
        </Title>
      ) : (
      <PageHeroBanner
        eyebrow="TEAM 8 • QUẢN TRỊ TÀI CHÍNH CLB"
        roleLabel="Club Manager"
        title="Báo Cáo & Quản Trị Tài Chính"
        subtitle="Tổng hợp thu chi toàn câu lạc bộ: Doanh thu giải đấu, dịch vụ chuồng trại, chi phí thức ăn, thuốc thú y và lương nhân sự."
        actionButton={
            <div className="flex gap-2">
              <Button
                icon={<DownloadOutlined />}
                onClick={() => downloadFile('/export/finance', `tai-chinh-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => message.error(e.message || 'Xuất file thất bại.'))}
                className="!bg-white/10 hover:!bg-white/20 !border-white/20 !text-white"
              >
                Xuất CSV
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setOpen(true)}
                className="!h-10 !px-4 !rounded-xl !bg-gradient-to-r !from-amber-600 !to-amber-700 hover:!from-amber-500 hover:!to-amber-600 !border-amber-400/40 !text-white font-semibold cursor-pointer shadow-md"
              >
                Ghi nhận khoản mục
              </Button>
            </div>
        }
      />
      )}

      {!isOwner && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5 p-3 rounded-xl bg-white border border-[#E4DFD3] shadow-xs">
          <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng Bản Ghi</div>
            <div className="text-xl font-bold text-slate-800 tabular-nums mt-0.5">{(data?.data || []).length} <span className="text-xs font-normal text-slate-500">giao dịch</span></div>
          </div>
          <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng Doanh Thu</div>
            <div className="text-xl font-bold text-[#0F5A43] tabular-nums mt-0.5">{(data?.data || []).filter((r) => r.type === 'revenue').reduce((acc, r) => acc + (r.amount || 0), 0).toLocaleString('vi-VN')} đ</div>
          </div>
          <div className="px-3 py-1.5 border-r border-[#E4DFD3] last:border-r-0">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng Chi Phí</div>
            <div className="text-xl font-bold text-rose-600 tabular-nums mt-0.5">{(data?.data || []).filter((r) => r.type === 'cost').reduce((acc, r) => acc + (r.amount || 0), 0).toLocaleString('vi-VN')} đ</div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lợi Nhuận Ròng</div>
            {(() => {
              const rev = (data?.data || []).filter((r) => r.type === 'revenue').reduce((acc, r) => acc + (r.amount || 0), 0);
              const cost = (data?.data || []).filter((r) => r.type === 'cost').reduce((acc, r) => acc + (r.amount || 0), 0);
              const net = rev - cost;
              return <div className={`text-xl font-bold tabular-nums mt-0.5 ${net >= 0 ? 'text-[#0F5A43]' : 'text-rose-600'}`}>{net.toLocaleString('vi-VN')} đ</div>;
            })()}
          </div>
        </div>
      )}

      {isOwner && (
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm border border-gray-100" loading={summaryLoading}>
              <Statistic
                title="Tổng Doanh Thu"
                value={summary.totalRevenue}
                suffix="đ"
                valueStyle={{ color: '#3f8600', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm border border-gray-100" loading={summaryLoading}>
              <Statistic
                title="Tổng Chi Phí"
                value={summary.totalCost}
                suffix="đ"
                valueStyle={{ color: '#cf1322', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card
              bordered={false}
              className={`shadow-sm border border-gray-100 ${summary.netBalance >= 0 ? 'bg-green-50' : 'bg-red-50'}`}
              loading={summaryLoading}
            >
              <Statistic
                title="Lợi Nhuận Ròng"
                value={summary.netBalance}
                suffix="đ"
                valueStyle={{ color: summary.netBalance >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Table rowKey="_id" columns={columns(isOwner)} dataSource={data?.data} loading={isLoading} />

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
