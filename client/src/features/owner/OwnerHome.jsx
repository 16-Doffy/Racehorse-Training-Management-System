import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Button, Select } from 'antd';
import { BarChartOutlined, BellOutlined, CalendarOutlined, HeartOutlined, LineChartOutlined, PieChartOutlined, TrophyOutlined, WalletOutlined } from '@ant-design/icons';
import { CHART_RANGES, chartRange, trainingChartRows, trainingChartTotals } from '../horses/trainingChart';
import { categoryLabel } from '../finance/financeLabels';
import { Card, EmptyNote, LoadFailed, OwnerPage } from './kit';
import { TrainingBars } from './charts';
import { AgendaList, AttentionList } from './lists';
import HorseList from './HorseList';
import { capFirst, idOf, money } from './ownerFormat';
import { agendaItems, attentionItems } from './ownerInsights';
import { useMyFinance, useMyHorses, useOwnerOverview, useOwnerSummary, useRaces, useSessions, useStallsByHorse, useTrainingChart } from './useOwnerData';
import { Columns, DashHero, KpiRow, KpiTile, RankBars, compactVnd, deltaOf, greeting, inBucket, lastMonths, lastWeeks, todayLong, usePager } from '../dashboard/dashKit';

const DONE = ['completed', 'evaluated'];
const HEALTH = [
  { key: 'eligible', label: 'Đủ điều kiện', tone: 'good' },
  { key: 'monitoring', label: 'Theo dõi', tone: 'watch' },
  { key: 'injured', label: 'Chấn thương', tone: 'bad' },
  { key: 'quarantined', label: 'Cách ly', tone: 'quar' },
];
const signedVnd = (n) => `${n >= 0 ? '+' : '−'}${compactVnd(Math.abs(n))}`;
// Places as the owner reads them, in their own order.
const PLACES = [
  { key: 'p1', label: 'Về nhất', test: (p) => p === 1 },
  { key: 'p2', label: 'Hạng nhì', test: (p) => p === 2 },
  { key: 'p3', label: 'Hạng ba', test: (p) => p === 3 },
  { key: 'p45', label: 'Hạng 4–5', test: (p) => p === 4 || p === 5 },
  { key: 'rest', label: 'Ngoài top 5', test: (p) => p > 5 },
];

/**
 * The Horse Owner's home: what the horses are worth in one band, four figures with their trend, what
 * needs a look and what comes next, every horse at a glance, then training, the race record and the
 * money of the last six months.
 */
export default function OwnerHome() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const [range, setRange] = useState('6months');
  const { horses } = useMyHorses();
  const { rows, isLoading: rowsLoading, isError: rowsError, refetch: refetchRows } = useOwnerSummary();
  const { overview, isLoading: overviewLoading, isError: overviewError } = useOwnerOverview();
  const { byHorse: stallOf, isSuccess: stallsLoaded } = useStallsByHorse();
  const { sessions } = useSessions();
  const { races } = useRaces();
  const { entries, isLoading: moneyLoading } = useMyFinance();
  const { chart, isLoading: chartLoading } = useTrainingChart(chartRange(range).params());

  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const attention = useMemo(() => attentionItems(rows, horsesById), [rows, horsesById]);
  const agenda = useMemo(() => agendaItems({ sessions, races, horseIds: new Set(horsesById.keys()) }), [sessions, races, horsesById]);
  const chartRows = useMemo(() => trainingChartRows(chart), [chart]);
  const totals = trainingChartTotals(chartRows);

  const racesDone = overview?.races;
  const training = overview?.training;
  const serious = attention.filter((a) => a.tone === 'bad' || a.tone === 'watch').length;
  const herd = HEALTH.map((h) => ({ ...h, value: rows.filter((r) => r.health.status === h.key).length }));
  const healthy = rows.filter((r) => r.health.status === 'eligible' && !r.health.restricted).length;
  // The horses that need a look first: hurt or held back, then not yet examined, then the rest.
  const need = (r) => (['injured', 'quarantined'].includes(r.health.status) ? 0 : r.health.restricted || r.health.status === 'monitoring' ? 1 : !r.health.lastExam ? 2 : 3);
  const horseRows = [...rows].sort((a, b) => need(a) - need(b) || a.horse.name.localeCompare(b.horse.name, 'vi'));
  const HORSES_SHOWN = 6;

  // Finished sessions per week (eight weeks) for the training tile's trend.
  const weeks = useMemo(() => {
    const done = sessions.filter((s) => DONE.includes(s.status));
    return lastWeeks(8).map((b) => ({ ...b, n: done.filter((s) => inBucket(s.actualStartAt || s.scheduledAt, b)).length }));
  }, [sessions]);
  // The owner's money: six months side by side, and the year's costs by category.
  const money6 = useMemo(
    () =>
      lastMonths(6).map((b) => {
        const list = entries.filter((e) => inBucket(e.date, b));
        const revenue = list.filter((e) => e.type === 'revenue').reduce((t, e) => t + (Number(e.amount) || 0), 0);
        const cost = list.filter((e) => e.type === 'cost').reduce((t, e) => t + (Number(e.amount) || 0), 0);
        return { ...b, revenue, cost, net: revenue - cost };
      }),
    [entries],
  );
  const month = money6[money6.length - 1];
  const sixNet = money6.reduce((t, m) => t + m.net, 0);
  const costRows = useMemo(() => {
    const by = new Map();
    entries.filter((e) => e.type === 'cost' && new Date(e.date).getFullYear() === new Date().getFullYear()).forEach((e) => by.set(e.category, (by.get(e.category) || 0) + (Number(e.amount) || 0)));
    return [...by.entries()].map(([k, v]) => ({ key: k, label: capFirst(categoryLabel(k)), value: v, display: compactVnd(v), to: '/finance' })).sort((a, b) => b.value - a.value);
  }, [entries]);
  // The race record by place.
  const placed = races.filter((r) => r.status === 'completed' && r.position);
  const placeRows = PLACES.map((p) => ({ key: p.key, label: p.label, value: placed.filter((r) => p.test(r.position)).length, display: `${placed.filter((r) => p.test(r.position)).length} lần` }));
  const prize = placed.reduce((t, r) => t + (r.prizeMoney || 0), 0);
  const costPage = usePager(costRows, 6);

  const valuation = overview?.valuation;
  return (
    <OwnerPage>
      <DashHero
        eyebrow={`Chủ sở hữu ngựa · ${todayLong()}`}
        title={`${greeting()}, ${user?.name || 'bạn'}`}
        sub={
          rowsLoading
            ? 'Đang tải tình hình các chiến mã…'
            : `Bạn có ${rows.length} chiến mã · ${serious ? `${serious} việc cần chú ý` : 'không có gì đáng lo'} · ${agenda.length ? `${agenda.length} lịch sắp tới` : 'chưa có lịch sắp tới'}.`
        }
        actions={
          <>
            <Button type="primary" onClick={() => navigate('/horses')}>
              Ngựa của tôi
            </Button>
            <Button onClick={() => navigate('/owner/training')}>Lịch tập</Button>
            <Button onClick={() => navigate('/owner/races')}>Giải đua</Button>
          </>
        }
        figure={{ label: 'Tổng giá trị đàn ngựa', value: overviewLoading ? '—' : `${compactVnd(valuation?.total || 0)}`, sub: valuation ? `${valuation.valued}/${overview.horses} ngựa đã được định giá` : null }}
      />

      {overviewError && <div className="own-note">Chưa tải được số liệu tổng quan — thử tải lại trang.</div>}

      <KpiRow>
        <KpiTile
          icon={<HeartOutlined />}
          tone="good"
          label="Chiến mã khỏe mạnh"
          value={rowsLoading ? '—' : healthy}
          unit={rowsLoading ? null : `/ ${rows.length} ngựa`}
          sub={rows.length - healthy ? `${rows.length - healthy} ngựa đang được bác sĩ theo dõi` : 'Cả đàn tập bình thường'}
          split={herd}
          to="/owner/health"
        />
        <KpiTile
          icon={<LineChartOutlined />}
          label="Buổi tập tháng này"
          value={overviewLoading ? '—' : (training?.thisMonth ?? 0)}
          unit="buổi"
          delta={training ? deltaOf(training.thisMonth, training.lastMonth, 'so với tháng trước') : null}
          sub={`Tháng trước ${training?.lastMonth ?? 0} buổi${training?.metRate == null ? '' : ` · ${training.metRate}% đạt chỉ tiêu`}`}
          chart={{ data: weeks.slice(-6).map((w) => ({ key: w.key, label: w.label, full: w.full, value: w.n })), label: 'Buổi hoàn thành', caption: 'Buổi hoàn thành mỗi tuần (tuần bắt đầu ngày)' }}
          to="/owner/training"
        />
        <KpiTile
          icon={<TrophyOutlined />}
          tone="brass"
          label="Tỷ lệ chiến thắng"
          value={overviewLoading ? '—' : racesDone?.winRate == null ? '—' : Number(racesDone.winRate).toLocaleString('vi-VN')}
          unit={racesDone?.winRate == null ? null : '%'}
          sub={racesDone?.completed ? `${racesDone.wins} lần về nhất / ${racesDone.completed} giải` : 'Chưa có giải nào hoàn tất'}
          split={[
            { key: 'win', label: 'Về nhất', value: racesDone?.wins || 0, tone: 'good' },
            { key: 'podium', label: 'Nhì · ba', value: Math.max(0, (racesDone?.podiums || 0) - (racesDone?.wins || 0)), tone: 'info' },
            { key: 'rest', label: 'Khác', value: Math.max(0, (racesDone?.completed || 0) - (racesDone?.podiums || 0)), tone: 'neutral' },
          ]}
          to="/owner/races"
        />
        <KpiTile
          icon={<WalletOutlined />}
          tone={(month?.net || 0) >= 0 ? 'good' : 'bad'}
          label={`Thu chi tháng ${new Date().getMonth() + 1}`}
          value={moneyLoading ? '—' : signedVnd(month?.net || 0)}
          sub={`Thu ${compactVnd(month?.revenue || 0)} · chi ${compactVnd(month?.cost || 0)}`}
          chart={{ data: money6.map((m) => ({ key: m.key, label: m.label, full: m.full, value: m.net })), fmt: compactVnd, label: 'Thu trừ chi', caption: 'Thu trừ chi mỗi tháng' }}
          to="/finance"
        />
      </KpiRow>

      <div className="own-grid-main">
        <Card title="Cần chú ý" icon={<BellOutlined />} flush extra={attention.length > 0 && <span className="own-faint text-xs">{attention.length} mục</span>}>
          {rowsLoading ? <EmptyNote>Đang tải…</EmptyNote> : <AttentionList items={attention} pageSize={5} />}
        </Card>
        <Card
          title="Sắp tới"
          icon={<CalendarOutlined />}
          flush
          extra={
            <Link to="/owner/training" className="text-xs font-semibold">
              Lịch tập
            </Link>
          }
        >
          <AgendaList items={agenda} horsesById={horsesById} pageSize={5} />
        </Card>
      </div>

      <section className="own-section">
        <div className="own-toolbar">
          <h2 className="own-section-title">Chiến mã của tôi</h2>
          <Link to="/horses" className="text-sm font-semibold">
            {rows.length > HORSES_SHOWN ? `Xem tất cả ${rows.length} con` : 'Xem danh sách'}
          </Link>
        </div>
        {rowsLoading ? (
          <EmptyNote>Đang tải…</EmptyNote>
        ) : rowsError && rows.length === 0 ? (
          <Card>
            <LoadFailed what="danh sách chiến mã" onRetry={refetchRows} />
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyNote>Bạn chưa có chiến mã nào. Khi CLB ghi nhận ngựa của bạn, chúng sẽ hiện ở đây.</EmptyNote>
          </Card>
        ) : (
          <Card flush>
            <HorseList rows={horseRows.slice(0, HORSES_SHOWN)} horsesById={horsesById} stallOf={stallOf} stallsLoaded={stallsLoaded} compact />
          </Card>
        )}
      </section>

      <div className="own-grid-main">
        <Card
          title="Huấn luyện"
          icon={<LineChartOutlined />}
          extra={<Select size="small" value={range} onChange={setRange} options={CHART_RANGES.map(({ value, label }) => ({ value, label }))} style={{ width: 160 }} aria-label="Khoảng thời gian" />}
        >
          {chartLoading ? (
            <EmptyNote>Đang tải…</EmptyNote>
          ) : totals.sessions === 0 ? (
            <EmptyNote>Chưa có buổi tập nào hoàn thành {chartRange(range).period}.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="dk-chart-head">
                <b>{totals.sessions} buổi</b>
                <span>
                  hoàn thành {chartRange(range).period} · {totals.met} buổi đạt chỉ tiêu{totals.rate == null ? '' : ` (${totals.rate}%)`}
                </span>
              </div>
              <TrainingBars rows={chartRows} />
            </div>
          )}
        </Card>

        <Card
          title="Thành tích giải đấu"
          icon={<TrophyOutlined />}
          extra={
            <Link to="/owner/races" className="text-xs font-semibold">
              Giải đua
            </Link>
          }
        >
          {placed.length === 0 ? (
            <EmptyNote>Chưa có giải nào hoàn tất. Kết quả sẽ hiện ở đây sau mỗi giải.</EmptyNote>
          ) : (
            <>
              <div className="dk-chart-head">
                <b>{compactVnd(prize)}</b>
                <span>tiền thưởng từ {placed.length} giải đã đua</span>
              </div>
              <RankBars rows={placeRows} />
            </>
          )}
        </Card>
      </div>

      <div className="own-grid-main">
        <Card
          title="Thu chi 6 tháng"
          icon={<BarChartOutlined />}
          extra={
            <Link to="/finance" className="text-xs font-semibold">
              Sổ thu chi
            </Link>
          }
        >
          {moneyLoading ? (
            <EmptyNote>Đang tải…</EmptyNote>
          ) : (
            <>
              <div className="dk-chart-head">
                <b>{signedVnd(sixNet)}</b>
                <span>{sixNet >= 0 ? 'còn lại sau 6 tháng' : 'chi nhiều hơn thu trong 6 tháng'}</span>
              </div>
              <Columns
                data={money6}
                series={[
                  { key: 'revenue', name: 'Thu', cls: 'is-series-1' },
                  { key: 'cost', name: 'Chi', cls: 'is-series-2' },
                ]}
                fmt={money}
                yFmt={compactVnd}
                table={{ fmt: compactVnd, extra: [{ name: 'Còn lại', value: (d) => signedVnd(d.net), tone: (d) => (d.net >= 0 ? 'own-good' : 'own-bad') }] }}
                more={(d) => [[null, 'Chênh lệch', money(d.net)]]}
                label="Thu và chi của bạn trong 6 tháng gần nhất"
              />
            </>
          )}
        </Card>

        <Card title={`Chi theo hạng mục · ${new Date().getFullYear()}`} icon={<PieChartOutlined />}>
          <RankBars rows={costPage.rows} max={costRows[0]?.value} empty="Chưa có khoản chi nào trong năm." />
          {costPage.pager}
        </Card>
      </div>
    </OwnerPage>
  );
}
