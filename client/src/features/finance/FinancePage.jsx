import { useState } from 'react';
import { Table, Tag, Button, Modal, Form, Select, InputNumber, Input, Empty, Alert, Card, Segmented } from 'antd';
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
import CostReport from './CostReport';

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
  const [filterType, setFilterType] = useState('all');
  const [filterHorse, setFilterHorse] = useState(null);
  // The year's costs report (worked out from rations, prescriptions, stalls), or the ledger of entries.
  const [view, setView] = useState('report');
  const [year, setYear] = useState(new Date().getFullYear());
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['finance', 'all'], queryFn: () => financeApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const entryType = Form.useWatch('type', form);
  const records = data?.data || [];
  const filteredRecords = records.filter((r) => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterHorse && (r.horse?._id || r.horse) !== filterHorse) return false;
    return true;
  });
  const inYear = records.filter((r) => new Date(r.date).getFullYear() === year && (!filterHorse || (r.horse?._id || r.horse) === filterHorse));
  const revenue = inYear.filter((r) => r.type === 'revenue').reduce((acc, r) => acc + (r.amount || 0), 0);
  const manualCost = inYear.filter((r) => r.type === 'cost').reduce((acc, r) => acc + (r.amount || 0), 0);
  const costQuery = useQuery({ queryKey: ['finance-costs', year, filterHorse || 'all'], queryFn: () => financeApi.costs({ year, horse: filterHorse || undefined }) });
  const costReport = costQuery.data?.data;
  const cost = (costReport?.totals?.total || 0) + manualCost;
  const net = revenue - cost;
  const years = [...new Set([new Date().getFullYear(), ...records.map((r) => new Date(r.date).getFullYear())])].sort((a, b) => b - a);

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
        subtitle="Báo cáo chi phí vận hành (thức ăn, y tế, nuôi dưỡng chuồng trại) do hệ thống tính từ dữ liệu, và doanh thu tiền thưởng giải. Chỉ để theo dõi — thanh toán thực hiện ngoài hệ thống."
        actionButton={
            <div className="flex flex-wrap gap-2">
              <Button
                icon={<DownloadOutlined />}
                onClick={() => downloadFile('/export/finance', `tai-chinh-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => message.error(e.message || 'Xuất file thất bại.'))}
                className="st-hero-ghost-btn !h-9 !rounded-lg !bg-white/10 hover:!bg-white/15 !border-white/20 !text-white"
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

      <div className="st-kpi-grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="st-kpi-tile">
          <div className="st-kpi-label">Doanh thu năm {year}</div>
          <div className="st-kpi-value text-emerald-700 staff-revenue-text">{revenue ? '+' : ''}{revenue.toLocaleString('vi-VN')} đ</div>
          <div className="st-kpi-sub">{inYear.filter((r) => r.type === 'revenue').length} khoản thu (tiền thưởng giải, tài trợ…)</div>
        </div>
        <div className="st-kpi-tile">
          <div className="st-kpi-label">Chi phí vận hành năm {year}</div>
          <div className="st-kpi-value text-rose-700 staff-cost-text">{cost ? '−' : ''}{cost.toLocaleString('vi-VN')} đ</div>
          <div className="st-kpi-sub">
            {costReport
              ? `Thức ăn ${costReport.totals.feed.toLocaleString('vi-VN')} · Y tế ${costReport.totals.medical.toLocaleString('vi-VN')} · Nuôi dưỡng ${costReport.totals.upkeep.toLocaleString('vi-VN')}${manualCost ? ` · khác ${manualCost.toLocaleString('vi-VN')}` : ''}`
              : `${inYear.filter((r) => r.type === 'cost').length} khoản chi`}
          </div>
        </div>
        <div className={`st-kpi-tile ${net < 0 ? 'is-danger' : ''}`}>
          <div className="st-kpi-label">Lợi nhuận ròng</div>
          <div className={`st-kpi-value ${net >= 0 ? 'text-emerald-700 staff-revenue-text' : 'text-rose-700 staff-cost-text'}`}>
            {net > 0 ? '+' : ''}{net.toLocaleString('vi-VN')} đ
          </div>
          <div className="st-kpi-sub">Doanh thu trừ chi phí vận hành</div>
        </div>
      </div>

      <div className="st-toolbar mb-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'report', label: 'Báo cáo chi phí nuôi dưỡng' },
            { value: 'ledger', label: `Sổ thu chi (${records.length})` },
          ]}
        />
        <Select value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: `Năm ${y}` }))} className="!w-32" aria-label="Năm" />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Tất cả ngựa"
          value={filterHorse}
          onChange={(v) => setFilterHorse(v || null)}
          className="!w-full sm:!w-56"
          options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))}
        />
        {view === 'ledger' && (
          <Segmented
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'revenue', label: 'Doanh thu' },
              { value: 'cost', label: 'Chi phí' },
            ]}
          />
        )}
        {(filterType !== 'all' || filterHorse) && (
          <Button size="small" onClick={() => { setFilterType('all'); setFilterHorse(null); }}>
            Bỏ lọc
          </Button>
        )}
      </div>

      {view === 'report' && (
        <Card className="!rounded-xl" title={`Chi phí vận hành năm ${year} — thức ăn, y tế, nuôi dưỡng`}>
          <CostReport report={costReport} loading={costQuery.isLoading} year={year} />
        </Card>
      )}

      <Card className={`!rounded-xl !border-[#E2D9C8] overflow-hidden${view === 'ledger' ? '' : ' !hidden'}`} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={newestFirst(filteredRecords)}
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
