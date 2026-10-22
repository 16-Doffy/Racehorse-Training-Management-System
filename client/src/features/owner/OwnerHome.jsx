import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Select } from 'antd';
import { BellOutlined, CalendarOutlined, DollarOutlined, FundOutlined, LineChartOutlined, TrophyOutlined } from '@ant-design/icons';
import { CHART_RANGES, chartRange, trainingChartRows, trainingChartTotals } from '../horses/trainingChart';
import { Card, EmptyNote, LoadFailed, OwnerPage, PageHead, Stats, Tiles } from './kit';
import { TrainingBars } from './charts';
import { AgendaList, AttentionList } from './lists';
import HorseTile from './HorseTile';
import { countChange, idOf, longDate, money, percentChange } from './ownerFormat';
import { agendaItems, attentionItems } from './ownerInsights';
import { useMyHorses, useOwnerOverview, useOwnerSummary, useRaces, useSessions, useStallsByHorse, useTrainingChart } from './useOwnerData';

/**
 * The Horse Owner's home: the figures that matter, what needs a look, what comes next, every horse at
 * a glance, training over time and the race record.
 */
export default function OwnerHome() {
  const { user } = useSelector((state) => state.auth);
  const [range, setRange] = useState('6months');
  const { horses } = useMyHorses();
  const { rows, isLoading: rowsLoading, isError: rowsError, refetch: refetchRows } = useOwnerSummary();
  const { overview, isLoading: overviewLoading, isError: overviewError } = useOwnerOverview();
  const { byHorse: stallOf, isSuccess: stallsLoaded } = useStallsByHorse();
  const { sessions } = useSessions();
  const { races } = useRaces();
  const { chart, isLoading: chartLoading } = useTrainingChart(chartRange(range).params());

  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const attention = useMemo(() => attentionItems(rows, horsesById), [rows, horsesById]);
  const agenda = useMemo(() => agendaItems({ sessions, races, horseIds: new Set(horsesById.keys()) }), [sessions, races, horsesById]);
  const chartRows = useMemo(() => trainingChartRows(chart), [chart]);
  const totals = trainingChartTotals(chartRows);

  const racesDone = overview?.races;
  const training = overview?.training;
  const cash = overview?.money;
  const dash = overviewLoading ? '—' : null;
  const serious = attention.filter((a) => a.tone === 'bad' || a.tone === 'watch').length;

  return (
    <OwnerPage>
      <PageHead
        eyebrow={`Chủ sở hữu · ${longDate()}`}
        title={`Xin chào, ${user?.name || 'bạn'}`}
        sub={
          rowsLoading
            ? 'Đang tải tình hình các chiến mã…'
            : `Bạn có ${rows.length} chiến mã · ${serious ? `${serious} việc cần chú ý` : 'không có gì đáng lo'} · ${agenda.length ? `${agenda.length} lịch sắp tới` : 'chưa có lịch sắp tới'}.`
        }
      />

      {overviewError && <div className="own-note">Chưa tải được số liệu tổng quan — thử tải lại trang.</div>}

      <Stats
        items={[
          {
            label: 'Tổng giá trị tài sản',
            icon: <FundOutlined />,
            value: dash ?? money(overview?.valuation.total ?? 0),
            sub: overview ? `${overview.valuation.valued}/${overview.horses} ngựa đã được định giá` : null,
          },
          {
            label: 'Tỷ lệ chiến thắng',
            icon: <TrophyOutlined />,
            value: dash ?? (racesDone?.winRate == null ? '—' : `${racesDone.winRate}%`),
            sub: racesDone?.completed
              ? `${racesDone.wins} thắng · ${racesDone.podiums} top 3 / ${racesDone.completed} giải · tiền thưởng ${money(racesDone.prize)}`
              : 'Chưa có giải nào hoàn tất',
          },
          {
            label: 'Buổi tập tháng này',
            icon: <LineChartOutlined />,
            value: dash ?? training?.thisMonth ?? 0,
            change: training ? countChange(training.thisMonth, training.lastMonth) : null,
            sub: training ? `Tháng trước ${training.lastMonth} buổi${training.metRate == null ? '' : ` · ${training.metRate}% đạt chỉ tiêu`}` : null,
          },
          {
            label: 'Thu tháng này',
            icon: <DollarOutlined />,
            value: dash ?? money(cash?.thisMonth.revenue ?? 0),
            change: cash ? percentChange(cash.thisMonth.revenue, cash.lastMonth.revenue) : null,
            sub: cash ? `Chi ${money(cash.thisMonth.cost)} · tháng trước thu ${money(cash.lastMonth.revenue)}` : null,
          },
        ]}
      />

      <div className="own-grid-main">
        <Card title="Cần chú ý" icon={<BellOutlined />} flush extra={attention.length > 0 && <span className="own-faint text-xs">{attention.length} mục</span>}>
          {rowsLoading ? <EmptyNote>Đang tải…</EmptyNote> : <AttentionList items={attention} />}
        </Card>
        <Card title="Sắp tới" icon={<CalendarOutlined />} flush extra={<Link to="/owner/training" className="text-xs font-semibold">Lịch tập</Link>}>
          <AgendaList items={agenda} horsesById={horsesById} />
        </Card>
      </div>

      <section className="own-section">
        <div className="own-toolbar">
          <h2 className="own-section-title">Chiến mã của tôi</h2>
          <Link to="/horses" className="text-sm font-semibold">
            Xem danh sách
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
          <div className="own-horses">
            {rows.map((r) => (
              <HorseTile key={r.horse._id} row={r} horse={horsesById.get(idOf(r.horse))} stall={stallOf.get(idOf(r.horse))} stallsLoaded={stallsLoaded} />
            ))}
          </div>
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
              <div className="own-muted">
                <b className="own-num own-ink text-lg">{totals.sessions}</b> buổi hoàn thành {chartRange(range).period} · <b className="own-ink">{totals.met}</b> buổi đạt chỉ tiêu
                {totals.rate == null ? '' : ` (${totals.rate}%)`}
              </div>
              <TrainingBars rows={chartRows} />
            </div>
          )}
        </Card>

        <Card title="Thành tích giải đấu" icon={<TrophyOutlined />} extra={<Link to="/owner/races" className="text-xs font-semibold">Giải đua</Link>}>
          {overviewLoading ? (
            <EmptyNote>Đang tải…</EmptyNote>
          ) : !racesDone?.completed ? (
            <EmptyNote>Chưa có giải nào hoàn tất. Kết quả sẽ hiện ở đây sau mỗi giải.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              <Tiles
                cols={2}
                items={[
                  { label: 'Về nhất', value: `${racesDone.wins} lần` },
                  { label: 'Vào top 3', value: `${racesDone.podiums} lần` },
                  { label: 'Đã thi đấu', value: `${racesDone.completed} giải` },
                  { label: 'Tiền thưởng', value: money(racesDone.prize) },
                ]}
              />
              <div>
                <div className="own-progress" aria-hidden="true">
                  <span style={{ width: `${racesDone.winRate || 0}%` }} />
                </div>
                <div className="own-faint text-xs mt-1.5">{racesDone.winRate}% số giải về nhất</div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </OwnerPage>
  );
}
