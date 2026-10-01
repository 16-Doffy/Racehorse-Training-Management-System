import { useState } from 'react';
import { Card, Typography, Row, Col, Statistic, DatePicker, Empty, Segmented, Tag, Table } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { reportsApi } from './reportsApi';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// Two single-series magnitude charts, each its own one-hue scale — deliberately not one
// dual-axis chart. Hues are the reference palette's first two categorical slots, validated
// against this app's white card surface (CVD ΔE 24.7, normal-vision ΔE 33.6, both ≥3:1 contrast).
const HUE_COST = '#2a78d6';
const HUE_REVENUE = '#eb6834';
const GRID_COLOR = '#e1e0d9';
const AXIS_COLOR = '#898781';
const INK_SECONDARY = '#52514e';

const SESSION_STATUS_LABELS = {
  scheduled: 'Đã lên lịch',
  in_progress: 'Đang diễn ra',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
};
const SESSION_STATUS_COLORS = {
  scheduled: 'default',
  in_progress: 'processing',
  completed: 'success',
  cancelled: 'error',
};

const RACE_STATUS_LABELS = {
  registered: 'Đã đăng ký',
  confirmed: 'Đã xác nhận',
  completed: 'Đã thi đấu xong',
  withdrawn: 'Đã rút lui',
};
const RACE_STATUS_COLORS = {
  registered: 'default',
  confirmed: 'blue',
  completed: 'green',
  withdrawn: 'red',
};

// Mirrors the gate keys returned by the training readiness service.
const GATE_LABELS = {
  medical: 'Y tế',
  vet_clearance: 'Giấy khám hết hạn',
  nutrition: 'Dinh dưỡng',
  care_assignment: 'Người chăm sóc',
};

const PRESETS = {
  '30d': { label: '30 ngày qua', days: 30 },
  '90d': { label: '90 ngày qua', days: 90 },
  all: { label: 'Toàn bộ', days: null },
};

const formatVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;

/** Short form for bar-end labels, which have limited room — the tooltip still shows the full number. */
const formatVndCompact = (n) => {
  const v = Number(n || 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace('.0', '')} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.0', '')} tr`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(v);
};

/** Money in and out per month of one year — the club's cash flow at a glance. */
function CashFlowChart() {
  const [year, setYear] = useState(dayjs().year());
  const { data, isLoading } = useQuery({
    queryKey: ['reports-finance-chart', year],
    queryFn: () => reportsApi.financeChart({ period: 'month', year }),
  });
  const chart = data?.data;
  const rows = (chart?.periods || []).map((p, i) => ({ month: `T${i + 1}`, revenue: p.revenue, cost: p.cost }));
  const empty = rows.every((r) => !r.revenue && !r.cost);

  return (
    <Card
      title={`Dòng tiền theo tháng — ${year}`}
      className="mb-4"
      loading={isLoading}
      extra={<DatePicker picker="year" allowClear={false} value={dayjs().year(year)} onChange={(d) => d && setYear(d.year())} />}
    >
      {empty ? (
        <Empty description="Chưa có khoản thu/chi nào trong năm này" />
      ) : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3 text-sm">
            <span>Thu: <strong className="text-green-700">{formatVnd(chart.totals.revenue)}</strong></span>
            <span>Chi: <strong className="text-red-700">{formatVnd(chart.totals.cost)}</strong></span>
            <span>Lãi/lỗ: <strong className={chart.totals.net >= 0 ? 'text-green-700' : 'text-red-700'}>{formatVnd(chart.totals.net)}</strong></span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} />
              <YAxis tickFormatter={formatVndCompact} width={56} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value, name) => [formatVnd(value), name]} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend />
              <Bar dataKey="revenue" name="Thu" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="cost" name="Chi" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </Card>
  );
}

/** Horizontal magnitude bars for one money breakdown. One series → the card title names it, no legend. */
function CategoryBreakdownChart({ title, rows, hue, total }) {
  if (!rows || rows.length === 0) {
    return (
      <Card title={title} className="h-full">
        <Empty description="Chưa có dữ liệu trong kỳ này" />
      </Card>
    );
  }

  const sorted = [...rows].sort((a, b) => b.total - a.total);

  return (
    <Card title={title} className="h-full">
      <div className="mb-3">
        <Text type="secondary" className="text-xs">
          Tổng cộng
        </Text>
        <div className="text-2xl font-semibold" style={{ color: INK_SECONDARY }}>
          {formatVnd(total)}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(sorted.length * 44, 120)}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
          <XAxis
            type="number"
            stroke={AXIS_COLOR}
            tick={{ fontSize: 12 }}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={false}
            tickFormatter={formatVndCompact}
          />
          <YAxis
            type="category"
            dataKey="category"
            stroke={AXIS_COLOR}
            tick={{ fontSize: 12 }}
            axisLine={{ stroke: GRID_COLOR }}
            tickLine={false}
            width={110}
          />
          <Tooltip formatter={(value) => [formatVnd(value), title]} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
          <Bar dataKey="total" fill={hue} radius={[0, 4, 4, 0]} maxBarSize={24}>
            <LabelList
              dataKey="total"
              position="right"
              formatter={formatVndCompact}
              style={{ fontSize: 12, fill: INK_SECONDARY }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

/** Small state breakdowns read better as labelled counts than as a pie. */
function StatusBreakdown({ title, counts, labels, colors, emptyText }) {
  const entries = Object.entries(counts || {});
  return (
    <Card title={title} className="h-full">
      {entries.length === 0 ? (
        <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="space-y-2">
          {entries.map(([status, count]) => (
            <div key={status} className="flex items-center justify-between">
              <Tag color={colors[status]}>{labels[status] || status}</Tag>
              <span className="font-semibold tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ReportsOverviewPage() {
  const [preset, setPreset] = useState('30d');
  const [customRange, setCustomRange] = useState(null);

  // A custom range wins over the preset; presets are just shortcuts for the same two params.
  const params = (() => {
    if (customRange?.[0] && customRange?.[1]) {
      return { from: customRange[0].startOf('day').toISOString(), to: customRange[1].endOf('day').toISOString() };
    }
    const days = PRESETS[preset].days;
    if (!days) return {};
    return { from: dayjs().subtract(days, 'day').startOf('day').toISOString(), to: dayjs().endOf('day').toISOString() };
  })();

  const { data, isLoading } = useQuery({
    queryKey: ['reports-overview', params.from, params.to],
    queryFn: () => reportsApi.overview(params),
  });

  const report = data?.data;
  const training = report?.trainingPerformance;
  const overrides = report?.readinessOverrides;
  const care = report?.careCoordination;
  const cost = report?.operatingCost;
  const revenue = report?.raceRevenue;
  const races = report?.raceParticipation;
  const profit = (revenue?.total || 0) - (cost?.total || 0);

  return (
    <div>
      <div className="mb-4">
        <Title level={3} className="!mb-0">
          Báo cáo Tổng quan
        </Title>
        <Text type="secondary" className="text-sm">
          Số liệu tổng hợp toàn câu lạc bộ: hiệu quả huấn luyện, chi phí vận hành, doanh thu và
          mức độ tham gia thi đấu. Số liệu được tính trực tiếp từ dữ liệu thật theo kỳ bạn chọn.
        </Text>
      </div>

      {/* Filters in one row above the charts. */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Segmented
          value={preset}
          onChange={(v) => {
            setPreset(v);
            setCustomRange(null);
          }}
          options={Object.entries(PRESETS).map(([value, { label }]) => ({ value, label }))}
        />
        <RangePicker
          value={customRange}
          onChange={setCustomRange}
          format="DD/MM/YYYY"
          placeholder={['Từ ngày', 'Đến ngày']}
        />
      </div>

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} sm={12} flex="1 1 220px">
          <Card loading={isLoading} className="h-full">
            <Statistic title="Tổng buổi tập" value={training?.totalSessions ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} flex="1 1 220px">
          <Card loading={isLoading} className="h-full">
            <Statistic
              title={`Điểm phong độ TB (${training?.ratedSessionCount ?? 0} buổi đã chấm)`}
              value={training?.avgPerformanceRating ?? '—'}
              suffix={training?.avgPerformanceRating != null ? '/ 10' : ''}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} flex="1 1 220px">
          <Card loading={isLoading} className="h-full">
            <Statistic
              title="Buổi tập đạt mục tiêu (trên số buổi có đặt mục tiêu)"
              value={training?.targetsMet ?? 0}
              suffix={`/ ${(training?.targetsMet ?? 0) + (training?.targetsMissed ?? 0)}`}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} flex="1 1 220px">
          <Card loading={isLoading} className="h-full">
            <Statistic title="Tổng chi phí vận hành" value={formatVnd(cost?.total)} styles={{ content: { fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} flex="1 1 220px">
          <Card loading={isLoading} className="h-full">
            <Statistic
              title="Lợi nhuận (doanh thu − chi phí)"
              value={formatVnd(profit)}
              styles={{ content: { fontSize: 22, color: profit >= 0 ? '#006300' : '#d03b3b' } }}
            />
          </Card>
        </Col>
      </Row>

      <CashFlowChart />

      <Row gutter={[16, 16]} className="mb-4">
        <Col xs={24} lg={12}>
          <CategoryBreakdownChart
            title="Chi phí vận hành theo hạng mục"
            rows={cost?.byCategory}
            total={cost?.total}
            hue={HUE_COST}
          />
        </Col>
        <Col xs={24} lg={12}>
          <CategoryBreakdownChart
            title="Doanh thu theo hạng mục"
            rows={revenue?.byCategory}
            total={revenue?.total}
            hue={HUE_REVENUE}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <StatusBreakdown
            title="Buổi tập theo trạng thái"
            counts={training?.sessionsByStatus}
            labels={SESSION_STATUS_LABELS}
            colors={SESSION_STATUS_COLORS}
            emptyText="Chưa có buổi tập nào trong kỳ"
          />
        </Col>
        <Col xs={24} lg={12}>
          <StatusBreakdown
            title={`Đăng ký thi đấu (${races?.totalEntries ?? 0} lượt)`}
            counts={races?.byStatus}
            labels={RACE_STATUS_LABELS}
            colors={RACE_STATUS_COLORS}
            emptyText="Chưa có đăng ký thi đấu nào trong kỳ"
          />
        </Col>
      </Row>

      {/* Whether the hand-offs between the three operational roles actually complete. */}
      <Card title="Phối hợp HLV – Bác sĩ – Nhân viên chăm sóc" className="mt-4" loading={isLoading}>
        <Typography.Paragraph type="secondary" className="!text-xs !mb-3">
          Sự cố do nhân viên chăm sóc báo phải được bác sĩ kết luận; y lệnh của bác sĩ phải được chuồng trại
          thực hiện. Sự cố tồn đọng hoặc y lệnh bị bỏ dở là chỗ quy trình đang đứt.
        </Typography.Paragraph>
        <Row gutter={[16, 16]}>
          <Col xs={12} lg={6}>
            <Statistic title="Sự cố được báo" value={care?.incidents?.reported ?? 0} />
          </Col>
          <Col xs={12} lg={6}>
            <Statistic
              title="Sự cố chưa được kết luận"
              value={(care?.incidents?.byStatus?.open ?? 0) + (care?.incidents?.byStatus?.acknowledged ?? 0)}
              styles={{
                content: {
                  color: (care?.incidents?.byStatus?.open ?? 0) + (care?.incidents?.byStatus?.acknowledged ?? 0) > 0 ? '#d4380d' : undefined,
                },
              }}
            />
          </Col>
          <Col xs={12} lg={6}>
            <Statistic
              title="Thời gian xử lý sự cố (TB)"
              value={care?.incidents?.avgHoursToResolve ?? '—'}
              suffix={care?.incidents?.avgHoursToResolve != null ? 'giờ' : null}
            />
          </Col>
          <Col xs={12} lg={6}>
            <Statistic
              title="Y lệnh bác sĩ đã thực hiện"
              value={care?.vetCareTasks?.completed ?? 0}
              suffix={`/ ${care?.vetCareTasks?.assigned ?? 0}`}
            />
          </Col>
        </Row>
        <Typography.Text type="secondary" className="!text-xs block mt-3">
          Yêu cầu khám do hệ thống tự tạo vì buổi tập vượt ngưỡng nhịp tim: {care?.autoExamRequests ?? 0}
        </Typography.Text>
      </Card>

      {/* Oversight: sessions run despite a readiness warning. The point of the readiness gates is
          lost if nobody ever looks at how often they get waved through. */}
      <Card
        title={`Buổi tập vẫn chạy dù có cảnh báo (${overrides?.count ?? 0})`}
        className="mt-4"
        loading={isLoading}
      >
        <Typography.Paragraph type="secondary" className="!text-xs !mb-3">
          Huấn luyện viên có quyền quyết định cuối cùng, nhưng phải nêu lý do. Nếu con số này cao
          bất thường, hoặc cùng một cảnh báo bị bỏ qua liên tục, đó là dấu hiệu quy trình chăm sóc
          hoặc khám sức khỏe đang có vấn đề.
        </Typography.Paragraph>
        <Table
          size="small"
          rowKey="_id"
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Không có buổi tập nào bị ghi đè cảnh báo trong kỳ — tốt.' }}
          columns={[
            { title: 'Ngựa', dataIndex: 'horse', key: 'horse' },
            {
              title: 'Thời gian',
              dataIndex: 'scheduledAt',
              key: 'scheduledAt',
              render: (d) => new Date(d).toLocaleString('vi-VN'),
            },
            {
              title: 'Cảnh báo bị bỏ qua',
              dataIndex: 'gates',
              key: 'gates',
              render: (gates) => (gates || []).map((g) => <Tag key={g}>{GATE_LABELS[g] || g}</Tag>),
            },
            { title: 'Người quyết định', dataIndex: 'by', key: 'by' },
            { title: 'Lý do', dataIndex: 'reason', key: 'reason' },
          ]}
          dataSource={overrides?.recent || []}
        />
      </Card>

      {/* Table view of the same numbers, so nothing depends on reading the bars. */}
      <Card title="Bảng số liệu chi tiết" className="mt-4">
        <Table
          size="small"
          rowKey={(r) => `${r.group}-${r.label}`}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Nhóm', dataIndex: 'group', key: 'group' },
            { title: 'Hạng mục', dataIndex: 'label', key: 'label' },
            { title: 'Giá trị', dataIndex: 'value', key: 'value', align: 'right' },
          ]}
          dataSource={[
            ...(cost?.byCategory || []).map((c) => ({
              group: 'Chi phí',
              label: c.category,
              value: formatVnd(c.total),
            })),
            ...(revenue?.byCategory || []).map((c) => ({
              group: 'Doanh thu',
              label: c.category,
              value: formatVnd(c.total),
            })),
            ...Object.entries(training?.sessionsByStatus || {}).map(([s, count]) => ({
              group: 'Buổi tập',
              label: SESSION_STATUS_LABELS[s] || s,
              value: String(count),
            })),
            ...Object.entries(races?.byStatus || {}).map(([s, count]) => ({
              group: 'Thi đấu',
              label: RACE_STATUS_LABELS[s] || s,
              value: String(count),
            })),
          ]}
          locale={{ emptyText: 'Chưa có số liệu trong kỳ này' }}
        />
      </Card>
    </div>
  );
}
