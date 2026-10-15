import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Input, Select, Table, Tag, Tooltip as AntTooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CalendarOutlined, TrophyOutlined } from '@ant-design/icons';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import dayjs from 'dayjs';

import { horsesApi } from './horsesApi';
import { reportsApi } from '../reports/reportsApi';
import { formatVnd } from '../../constants/horse';
import { CHART_RANGES, chartRange, trainingChartRows, trainingChartTotals } from './trainingChart';
import OwnerHorseSummary from './OwnerHorseSummary';

// One shared empty list, so memoised values below do not recompute on every render while data is loading.
const NO_ROWS = [];

const HEALTH_LABELS = { eligible: 'Đủ điều kiện', monitoring: 'Đang theo dõi', injured: 'Chấn thương', quarantined: 'Cách ly' };
const HEALTH_COLORS = { eligible: 'green', monitoring: 'gold', injured: 'red', quarantined: 'volcano' };
const HEALTH_FILTERS = [
  { value: 'all', label: 'Tất cả sức khỏe' },
  { value: 'eligible', label: 'Đủ điều kiện' },
  { value: 'monitoring', label: 'Đang theo dõi' },
  { value: 'injured', label: 'Chấn thương' },
  { value: 'quarantined', label: 'Cách ly' },
  { value: 'restricted', label: 'Đang bị hạn chế tập' },
];

/** "+12%" against last month, or null when last month has nothing to compare with. */
const percentChange = (now, before) => {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 1000) / 10;
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, up: pct >= 0 };
};
/** "+7" sessions against last month; nothing to show when it is the same. */
const countChange = (now, before) => (now === before ? null : { text: `${now - before > 0 ? '+' : ''}${now - before}`, up: now > before });

function StatCard({ title, value, sub, change, loading }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
      <span className="text-gray-500 text-sm font-medium mb-4">{title}</span>
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <span className="text-xl sm:text-[22px] leading-tight font-bold text-gray-900 whitespace-nowrap">{loading ? '—' : value}</span>
        {!loading && change && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 font-medium ${change.up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
          >
            {change.up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            {change.text}
          </span>
        )}
      </div>
      {sub && <span className="text-xs text-gray-400 font-medium">{loading ? ' ' : sub}</span>}
    </div>
  );
}

// Wins out of the races a horse has finished, as ticks.
const BarcodeProgress = ({ current, target }) => {
  const totalTicks = 40;
  const activeTicks = target ? Math.round((current / target) * totalTicks) : 0;
  return (
    <div className="flex gap-[2px] h-8 w-full">
      {Array.from({ length: totalTicks }).map((_, i) => (
        <div key={i} className={`flex-1 rounded-sm ${i < activeTicks ? 'bg-emerald-500' : 'bg-gray-200'}`} />
      ))}
    </div>
  );
};

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState('12months');
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState('all');

  const overviewQuery = useQuery({ queryKey: ['owner-overview'], queryFn: () => horsesApi.ownerOverview() });
  const summaryQuery = useQuery({ queryKey: ['owner-summary'], queryFn: () => horsesApi.ownerSummary() });
  const chartQuery = useQuery({
    queryKey: ['training-chart', 'owner', range],
    queryFn: () => reportsApi.trainingChart(chartRange(range).params()),
  });

  const overview = overviewQuery.data?.data;
  const rows = summaryQuery.data?.data ?? NO_ROWS;
  const chartRows = useMemo(() => trainingChartRows(chartQuery.data?.data), [chartQuery.data]);
  const chartTotals = trainingChartTotals(chartRows);
  const periodText = chartRange(range).period;

  const money = overview?.money;
  const training = overview?.training;
  const races = overview?.races;

  // What is coming up for any of the horses: the next session and the next race of each, soonest first.
  const upcoming = useMemo(() => {
    const events = [];
    rows.forEach((r) => {
      if (r.next) events.push({ key: `s-${r.horse._id}`, at: r.next.at, horse: r.horse, title: r.next.kind, icon: '🐎' });
      if (r.upcomingRace) {
        events.push({
          key: `r-${r.horse._id}`,
          at: r.upcomingRace.date,
          horse: r.horse,
          title: r.upcomingRace.name,
          sub: r.upcomingRace.status === 'confirmed' ? 'Đã xác nhận tham gia' : 'Chờ HLV quyết định',
          icon: '🏁',
        });
      }
    });
    return events.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 5);
  }, [rows]);

  const tableRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => (term ? r.horse.name.toLowerCase().includes(term) : true))
      .filter((r) => {
        if (healthFilter === 'all') return true;
        if (healthFilter === 'restricted') return r.health.restricted;
        return r.health.status === healthFilter;
      });
  }, [rows, search, healthFilter]);

  const columns = [
    {
      title: 'Tên Chiến Mã',
      key: 'name',
      render: (_, r) => (
        <Link to={`/horses/${r.horse._id}`} className="font-semibold text-gray-800">
          {r.horse.name}
        </Link>
      ),
    },
    {
      title: 'Sức khỏe',
      key: 'health',
      render: (_, r) => (
        <AntTooltip title={r.health.restricted ? r.health.reason : undefined}>
          <span>
            {/* The default status is not an assessment: say so until a vet has examined the horse. */}
            {r.health.lastExam ? (
              <Tag color={HEALTH_COLORS[r.health.status]}>{HEALTH_LABELS[r.health.status] || r.health.status}</Tag>
            ) : (
              <Tag>Chưa có hồ sơ khám</Tag>
            )}
            <span className="text-xs text-gray-500">{r.health.clearance}</span>
          </span>
        </AntTooltip>
      ),
    },
    {
      title: 'Buổi tập tiếp theo',
      key: 'next',
      render: (_, r) => (r.next ? `${r.next.kind} · ${dayjs(r.next.at).format('DD/MM HH:mm')}` : <span className="text-gray-400">Chưa xếp</span>),
    },
    {
      title: 'Giải sắp tới',
      key: 'race',
      render: (_, r) =>
        r.upcomingRace ? `${r.upcomingRace.name} · ${dayjs(r.upcomingRace.date).format('DD/MM')}` : <span className="text-gray-400">Chưa đăng ký</span>,
    },
    {
      title: 'Thành tích',
      key: 'raceStats',
      render: (_, r) =>
        r.raceStats?.completed ? (
          <span>
            {r.raceStats.wins} thắng / {r.raceStats.completed} giải
            {r.raceStats.podiums ? <span className="text-xs text-gray-500"> · {r.raceStats.podiums} top 3</span> : null}
          </span>
        ) : (
          <span className="text-gray-400">Chưa có</span>
        ),
    },
    {
      title: 'Định giá',
      key: 'valuation',
      align: 'right',
      render: (_, r) => (
        <span className="font-semibold text-gray-800">{r.horse.valuationVnd == null ? <span className="text-gray-400 font-normal">Chưa định giá</span> : formatVnd(r.horse.valuationVnd)}</span>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-800 p-4 md:px-8 md:pb-8 md:pt-4 font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 m-0 mb-1 tracking-tight">Tổng quan Hoạt động</h1>
        <p className="text-sm text-gray-500 m-0">Theo dõi chất lượng huấn luyện, cơ hội thi đấu và tỷ lệ thành công qua các chu kỳ.</p>
      </div>

      {overviewQuery.isError && (
        <Alert className="!mb-4" type="warning" showIcon message="Chưa tải được số liệu tổng quan" description="Các thẻ bên dưới có thể trống. Thử tải lại trang." />
      )}

      {/* Each horse at a glance: health, next session, last result, races, money */}
      <OwnerHorseSummary />

      {/* Numbers for the owner, each with last month beside it where there is one */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Tổng Giá trị Tài sản"
          loading={overviewQuery.isLoading}
          value={formatVnd(overview?.valuation.total ?? 0)}
          sub={overview ? `${overview.valuation.valued}/${overview.horses} ngựa đã được định giá` : undefined}
        />
        <StatCard
          title="Tỷ lệ Chiến thắng"
          loading={overviewQuery.isLoading}
          value={races?.winRate == null ? '—' : `${races.winRate}%`}
          sub={races?.completed ? `${races.wins} thắng · ${races.podiums} top 3 / ${races.completed} giải` : 'Chưa có giải nào hoàn tất'}
        />
        <StatCard
          title="Buổi tập Tháng này"
          loading={overviewQuery.isLoading}
          value={training?.thisMonth ?? 0}
          change={training ? countChange(training.thisMonth, training.lastMonth) : null}
          sub={training ? `Tháng trước ${training.lastMonth} buổi${training.metRate == null ? '' : ` · ${training.metRate}% đạt chỉ tiêu`}` : undefined}
        />
        <StatCard
          title="Thu Tháng này"
          loading={overviewQuery.isLoading}
          value={formatVnd(money?.thisMonth.revenue ?? 0)}
          change={money ? percentChange(money.thisMonth.revenue, money.lastMonth.revenue) : null}
          sub={money ? `Chi ${formatVnd(money.thisMonth.cost)} · tháng trước thu ${formatVnd(money.lastMonth.revenue)}, chi ${formatVnd(money.lastMonth.cost)}` : undefined}
        />
      </div>

      {/* Training done over the chosen range */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-base font-semibold text-gray-900 m-0">Lưu lượng Huấn luyện Định kỳ</h2>
          <Select value={range} onChange={setRange} options={CHART_RANGES.map(({ value, label }) => ({ value, label }))} className="w-44" size="small" />
        </div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 h-64">
          <div className="flex-1 h-full">
            {chartQuery.isLoading ? (
              <div className="h-full flex items-center justify-center text-gray-400">Đang tải…</div>
            ) : chartTotals.sessions === 0 ? (
              <div className="h-full flex items-center justify-center">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Chưa có buổi tập hoàn thành ${periodText}`} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} barSize={range === '30days' ? 10 : 32}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af', dy: 10 }} interval="preserveStartEnd" />
                  <Tooltip
                    cursor={{ fill: '#f3f4f6' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(v, name) => [v, name]}
                  />
                  <Bar dataKey="sessions" name="Buổi tập hoàn thành" fill="#bae6fd" radius={[4, 4, 4, 4]} />
                  <Bar dataKey="metGoals" name="Đạt chỉ tiêu" fill="#38bdf8" radius={[4, 4, 4, 4]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="w-full lg:w-72 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-gray-100 pt-6 lg:pt-0 lg:pl-8">
            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-gray-900">{chartTotals.sessions}</span>
                <span className="text-gray-500 font-medium text-sm">buổi tập</span>
              </div>
              <p className="text-xs text-gray-400 m-0 leading-relaxed">Số buổi tập đã hoàn thành {periodText}.</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="text-xs text-gray-400 font-bold mb-2">Đạt chỉ tiêu</div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xl font-bold text-gray-900">{chartTotals.met}</span>
                <span className="text-gray-500 font-medium text-xs">buổi đạt</span>
              </div>
              <p className="text-xs text-gray-400 m-0 mb-3">
                {chartTotals.rate == null ? 'Chưa có buổi nào để so sánh' : `${chartTotals.rate}% số buổi tập đạt chỉ tiêu của bài`}
              </p>
              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden mb-1">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${chartTotals.rate || 0}%` }} />
              </div>
              <div className="flex justify-between text-[10px] font-medium text-gray-400">
                <span>{chartTotals.met} đạt</span>
                <span>{chartTotals.sessions} tổng cộng</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* The next sessions and races of the owner's horses */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-semibold text-gray-900 m-0">Lịch trình Sắp tới</h2>
            <Button size="small" icon={<CalendarOutlined />} className="text-xs font-medium text-gray-600 border-gray-200" onClick={() => navigate('/owner/training')}>
              Xem Lịch
            </Button>
          </div>
          {summaryQuery.isLoading ? (
            <div className="text-gray-400 text-sm">Đang tải…</div>
          ) : upcoming.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có buổi tập hay giải nào sắp tới" />
          ) : (
            <ul className="list-none m-0 p-0 flex flex-col gap-4">
              {upcoming.map((e) => (
                <li key={e.key} className="flex gap-3 items-start">
                  <div className="w-16 shrink-0 text-xs text-gray-500 font-medium pt-0.5">
                    <div className="text-gray-900 font-semibold">{dayjs(e.at).format('DD/MM')}</div>
                    {e.sub === undefined && <div>{dayjs(e.at).format('HH:mm')}</div>}
                  </div>
                  <div className="pl-3 border-l-2 border-emerald-100 min-w-0">
                    <div className="text-gray-900 text-sm font-semibold truncate">{e.title}</div>
                    <div className="text-gray-500 text-xs flex items-center gap-1">
                      <span>{e.icon}</span> {e.horse.name}
                      {e.sub ? ` · ${e.sub}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The race record of all horses together */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 m-0 mb-4">Thành tích Giải đấu</h2>
          {overviewQuery.isLoading ? (
            <div className="text-gray-400 text-sm">Đang tải…</div>
          ) : !races?.completed ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có giải nào hoàn tất" />
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-bold text-gray-900">{races.wins}</span>
                <span className="text-gray-500 font-medium text-sm">chiến thắng</span>
                <span className="text-xs text-gray-400 font-medium ml-auto">{races.completed} giải đã hoàn tất</span>
              </div>
              <BarcodeProgress current={races.wins} target={races.completed} />
              <p className="text-xs text-gray-500 font-medium mt-3">
                <TrophyOutlined /> {races.winRate}% số giải về nhất · {races.podiums} lần vào top 3 · tiền thưởng {formatVnd(races.prize)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Every horse, searchable */}
      <div className="bg-white border border-gray-200 rounded-xl p-0 overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 m-0 mb-1">Chiến mã của Tôi</h2>
            <p className="text-xs text-gray-400 m-0">Sức khỏe, buổi tập và giải sắp tới, thành tích và định giá của từng chiến mã.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Input allowClear placeholder="Tìm theo tên…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-[200px]" />
            <Select value={healthFilter} onChange={setHealthFilter} options={HEALTH_FILTERS} className="min-w-[170px]" />
          </div>
        </div>

        <Table
          rowKey={(r) => r.horse._id}
          columns={columns}
          dataSource={tableRows}
          loading={summaryQuery.isLoading}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={rows.length ? 'Không có chiến mã nào khớp bộ lọc' : 'Bạn chưa có chiến mã nào'} /> }}
        />
      </div>
    </div>
  );
}
