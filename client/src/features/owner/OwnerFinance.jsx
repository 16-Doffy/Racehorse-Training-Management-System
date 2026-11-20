import { useMemo, useState } from 'react';
import { Select } from 'antd';
import { BarChartOutlined, BookOutlined, FallOutlined, PieChartOutlined, RiseOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { categoryLabel } from '../finance/financeLabels';
import { Card, EmptyNote, HorseAvatar, OwnerPage, PageHead } from './kit';
import { MoneyBars } from './charts';
import { capFirst, idOf, money } from './ownerFormat';
import { useHorseParam, useMyFinance, useMyHorses } from './useOwnerData';
import { useQuery } from '@tanstack/react-query';
import { financeApi } from '../finance/financeApi';
import CostReport from '../finance/CostReport';
import { costEntries } from '../finance/costEntries';
import LedgerTable from '../finance/LedgerTable';

const label = (c) => capFirst(categoryLabel(c));
const sum = (list) => list.reduce((t, e) => t + (Number(e.amount) || 0), 0);
const signed = (v) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;

/**
 * The owner's statement, read-only: what came in (prizes, sponsorship) and what the horses cost — feed,
 * medical, upkeep, worked out by the system, and anything written in by hand — for the year, one horse
 * or all. The cost report on top; the ledger as a short table beside the charts.
 */
export default function OwnerFinance() {
  const { horses: allHorses } = useMyHorses();
  // Only the horses still kept: one sold, retired or dead (archived) is out of the statement.
  const horses = useMemo(() => allHorses.filter((h) => !h.isArchived), [allHorses]);
  const { entries: written, isLoading } = useMyFinance();
  const [horseId, setHorse] = useHorseParam(horses);
  const [year, setYear] = useState(dayjs().year());
  // What the horses cost, worked out by the system from rations, prescriptions and stalls (view only):
  // its lines join the ledger, so the ledger, the totals and the report add up to the same.
  const costQuery = useQuery({ queryKey: ['finance-costs', year, 'all'], queryFn: () => financeApi.costs({ year }) });
  const costReport = costQuery.data?.data;
  const kept = useMemo(() => new Set(horses.map((h) => idOf(h))), [horses]);
  const entries = useMemo(() => [...written.filter((e) => kept.has(idOf(e.horse))), ...costEntries(costReport)], [written, kept, costReport]);
  const years = useMemo(() => [...new Set([dayjs().year(), ...written.map((e) => dayjs(e.date).year())])].sort((a, b) => b - a), [written]);
  // The report for the horse picked, or for all.
  const shownReport = costReport && horseId ? { ...costReport, horses: costReport.horses.filter((h) => String(h.horse._id) === horseId) } : costReport;

  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  // The year (and the horse, when one is picked): what the summary and the charts add up.
  const inYear = useMemo(() => entries.filter((e) => dayjs(e.date).year() === year && (!horseId || idOf(e.horse) === horseId)), [entries, year, horseId]);
  const revenue = sum(inYear.filter((e) => e.type === 'revenue'));
  const cost = sum(inYear.filter((e) => e.type === 'cost'));
  const costOf = (category) => sum(inYear.filter((e) => e.type === 'cost' && e.category === category));
  const otherCost = cost - costOf('feed') - costOf('medical') - costOf('upkeep');
  const net = revenue - cost;

  const periods = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => {
        const inMonth = inYear.filter((e) => dayjs(e.date).month() === m);
        const r = sum(inMonth.filter((e) => e.type === 'revenue'));
        const c = sum(inMonth.filter((e) => e.type === 'cost'));
        return { key: `${year}-${String(m + 1).padStart(2, '0')}`, label: `Tháng ${m + 1}/${year}`, revenue: r, cost: c, net: r - c };
      }),
    [inYear, year],
  );
  const byCategory = Object.entries(inYear.filter((e) => e.type === 'cost').reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + e.amount }), {})).sort((a, b) => b[1] - a[1]);
  const topCategory = byCategory[0]?.[1] || 1;
  const byHorse = Object.values(
    entries
      .filter((e) => dayjs(e.date).year() === year)
      .reduce((acc, e) => {
        const id = idOf(e.horse);
        const row = acc[id] || { id, horse: horsesById.get(id) || e.horse, net: 0 };
        row.net += e.type === 'revenue' ? e.amount : -e.amount;
        return { ...acc, [id]: row };
      }, {}),
  ).sort((a, b) => b.net - a.net);

  return (
    <OwnerPage>
      <PageHead eyebrow="Chủ sở hữu" title="Thu chi" sub="Báo cáo tổng hợp: chi phí thức ăn, y tế, nuôi dưỡng do hệ thống tính từ dữ liệu của CLB, và doanh thu tiền thưởng giải." />

      <div className="own-fin-pick">
        <Select value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: `Năm ${y}` }))} aria-label="Năm" style={{ width: 130 }} />
        <Select
          value={horseId || 'all'}
          onChange={(v) => setHorse(v === 'all' ? null : v)}
          options={[{ value: 'all', label: 'Tất cả chiến mã' }, ...horses.map((h) => ({ value: idOf(h), label: h.name }))]}
          aria-label="Chiến mã"
          style={{ width: 220 }}
          showSearch
          optionFilterProp="label"
        />
      </div>

      <div className="own-sum" aria-label="Tổng thu chi">
        <div className="own-sum-tile is-in">
          <span className="own-sum-icon">
            <RiseOutlined />
          </span>
          <div>
            <span className="own-sum-label">Tổng thu</span>
            <b className="own-sum-value">{isLoading ? '—' : money(revenue)}</b>
            <span className="own-sum-sub">{inYear.filter((e) => e.type === 'revenue').length} khoản thu</span>
          </div>
        </div>
        <div className="own-sum-tile is-out">
          <span className="own-sum-icon">
            <FallOutlined />
          </span>
          <div>
            <span className="own-sum-label">Tổng chi</span>
            <b className="own-sum-value">{isLoading || costQuery.isLoading ? '—' : money(cost)}</b>
            <span className="own-sum-sub">
              {cost
                ? `Thức ăn ${money(costOf('feed'))} · Y tế ${money(costOf('medical'))} · Nuôi dưỡng ${money(costOf('upkeep'))}${otherCost ? ` · khác ${money(otherCost)}` : ''}`
                : `${inYear.filter((e) => e.type === 'cost').length} khoản chi`}
            </span>
          </div>
        </div>
        <div className={`own-sum-tile is-net${net < 0 ? ' is-loss' : ''}`}>
          <span className="own-sum-icon">
            <WalletOutlined />
          </span>
          <div>
            <span className="own-sum-label">Còn lại năm {year}</span>
            <b className="own-sum-value">{isLoading ? '—' : signed(net)}</b>
            <span className="own-sum-sub">{net >= 0 ? 'Thu nhiều hơn chi' : 'Chi nhiều hơn thu'}</span>
          </div>
        </div>
      </div>

      {/* What keeping the horses costs, in three kinds: feed, medical, upkeep. */}
      <Card title={`Chi phí nuôi dưỡng năm ${year}${horseId ? ` · ${horsesById.get(horseId)?.name || ''}` : ''}`} icon={<FallOutlined />}>
        <CostReport report={shownReport} loading={costQuery.isLoading} year={year} />
      </Card>

      <div className="own-fin-layout">
        {/* The ledger as a short table: a row per horse a month, its money in columns; a row opens on its entries. */}
        <Card title="Sổ thu chi" icon={<BookOutlined />} className="own-ledger">
          <LedgerTable entries={inYear} loading={isLoading || costQuery.isLoading} emptyText={`Năm ${year} chưa có khoản thu chi nào${horseId ? " của chiến mã này" : ""}.`} />
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Theo tháng" icon={<BarChartOutlined />}>
            {inYear.length ? <MoneyBars periods={periods} height={180} /> : <EmptyNote>Chưa có số liệu.</EmptyNote>}
          </Card>
          <Card title="Chi theo hạng mục" icon={<PieChartOutlined />}>
            {byCategory.length === 0 ? (
              <EmptyNote>Chưa có khoản chi nào.</EmptyNote>
            ) : (
              <div className="own-bars">
                {/* Each kind of cost beside the largest; the ledger's columns show them horse by horse. */}
                {byCategory.map(([c, value]) => (
                  <div key={c} className="own-bar-row">
                    <span className="truncate own-muted">{label(c)}</span>
                    <div className="own-bar-track">
                      <span style={{ width: `${Math.max(2, (value / topCategory) * 100)}%` }} />
                    </div>
                    <b className="own-num text-[13px]">{money(value)}</b>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {!horseId && byHorse.length > 1 && (
            <Card title="Theo chiến mã" icon={<TeamOutlined />} flush>
              <ul className="own-list">
                {byHorse.map((b) => (
                  <li key={b.id}>
                    <button type="button" className="own-row" onClick={() => setHorse(b.id)}>
                      <HorseAvatar horse={b.horse} size={28} />
                      <div className="own-row-main">
                        <div className="own-row-title">{b.horse?.name || '—'}</div>
                        <div className="own-hbar">
                          <i className={b.net >= 0 ? 'is-in' : 'is-out'} style={{ width: `${Math.max(3, (Math.abs(b.net) / (Math.abs(byHorse[0]?.net) || 1)) * 100)}%` }} />
                        </div>
                      </div>
                      <b className={`own-num ${b.net >= 0 ? 'own-good' : 'own-bad'}`}>{signed(b.net)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </OwnerPage>
  );
}
