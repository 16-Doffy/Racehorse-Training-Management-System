import { useState } from 'react';
import { Card, Typography, Row, Col, Statistic, DatePicker, Empty, Segmented, Tag, Table } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
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
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Tổng buổi tập" value={training?.totalSessions ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic
              title={`Điểm phong độ TB (${training?.ratedSessionCount ?? 0} buổi đã chấm)`}
              value={training?.avgPerformanceRating ?? '—'}
              suffix={training?.avgPerformanceRating != null ? '/ 10' : ''}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic title="Tổng chi phí vận hành" value={formatVnd(cost?.total)} styles={{ content: { fontSize: 22 } }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={isLoading}>
            <Statistic
              title="Lợi nhuận (doanh thu − chi phí)"
              value={formatVnd(profit)}
              styles={{ content: { fontSize: 22, color: profit >= 0 ? '#006300' : '#d03b3b' } }}
            />
          </Card>
        </Col>
      </Row>

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
