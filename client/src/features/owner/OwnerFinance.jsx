import { useMemo, useState } from 'react';
import { Segmented } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, BarChartOutlined, DollarOutlined, FallOutlined, MedicineBoxOutlined, PieChartOutlined, RiseOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { financeApi } from '../finance/financeApi';
import { categoryLabel } from '../finance/financeLabels';
import { Card, EmptyNote, HorseAvatar, HorsePicker, MoreButton, OwnerPage, PageHead, Row, Stats } from './kit';
import { MoneyBars } from './charts';
import { fmtDate, idOf, money } from './ownerFormat';
import { useHorseParam, useMyFinance, useMyHorses } from './useOwnerData';

const SOURCE = { race_prize: 'Tự động · kết quả giải', system: 'Tự động' };

/**
 * The owner's money for their horses: this year in figures and month by month, where the cost goes,
 * each horse's balance, and every entry (read-only — the Manager keeps the ledger).
 */
export default function OwnerFinance() {
  const { horses } = useMyHorses();
  const { entries, isLoading } = useMyFinance();
  const { data: summaryData, isLoading: summaryLoading } = useQuery({ queryKey: ['finance', 'mine', 'summary'], queryFn: () => financeApi.getMineSummary() });
  const [horseId, setHorse] = useHorseParam(horses);
  const [type, setType] = useState('all');
  const [shown, setShown] = useState(12);

  const summary = summaryData?.data;
  const totals = summary?.totals || { revenue: 0, cost: 0, net: 0, medicalCost: 0 };
  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const costByCategory = Object.entries(summary?.byCategory || {})
    .filter(([, v]) => v.cost > 0)
    .map(([category, v]) => ({ category, cost: v.cost }))
    .sort((a, b) => b.cost - a.cost);
  const topCost = costByCategory[0]?.cost || 1;
  const prize = summary?.byCategory?.prize?.revenue || 0;
  const ledger = entries
    .filter((e) => (!horseId || idOf(e.horse) === horseId) && (type === 'all' || e.type === type))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const d = (v) => (summaryLoading ? '—' : money(v));

  return (
    <OwnerPage>
      <PageHead eyebrow="Chủ sở hữu" title="Thu chi" sub={`Sổ thu chi năm ${summary?.year || dayjs().year()} của các chiến mã: tiền thưởng giải, chi phí thức ăn, y tế, huấn luyện… do CLB ghi nhận.`} />

      <Stats
        items={[
          { label: 'Thu năm nay', icon: <RiseOutlined />, value: d(totals.revenue), tone: totals.revenue ? 'good' : undefined, sub: prize ? `Trong đó tiền thưởng giải ${money(prize)}` : 'Chưa có tiền thưởng giải' },
          { label: 'Chi năm nay', icon: <FallOutlined />, value: d(totals.cost), sub: summary ? `${summary.byHorse?.length || 0} chiến mã` : null },
          { label: 'Chênh lệch', icon: <WalletOutlined />, value: d(totals.net), tone: totals.net >= 0 ? 'good' : 'bad', sub: totals.net >= 0 ? 'Thu nhiều hơn chi' : 'Chi nhiều hơn thu' },
          { label: 'Chi y tế', icon: <MedicineBoxOutlined />, value: d(totals.medicalCost || 0), sub: `${totals.exams || 0} lần khám · ${totals.treatments || 0} phác đồ` },
        ]}
      />

      <div className="own-grid-main">
        <Card title="Thu chi theo tháng" icon={<BarChartOutlined />}>
          {!summary || (totals.revenue === 0 && totals.cost === 0) ? <EmptyNote>{summaryLoading ? 'Đang tải…' : 'Năm nay chưa có khoản thu chi nào.'}</EmptyNote> : <MoneyBars periods={summary.periods || []} />}
        </Card>
        <Card title="Chi theo hạng mục" icon={<PieChartOutlined />}>
          {costByCategory.length === 0 ? (
            <EmptyNote>Chưa có khoản chi nào.</EmptyNote>
          ) : (
            <div className="own-bars">
              {costByCategory.map((c) => (
                <div className="own-bar-row" key={c.category}>
                  <span className="own-muted truncate">{categoryLabel(c.category)}</span>
                  <div className="own-bar-track" title={money(c.cost)}>
                    <span style={{ width: `${Math.max(2, (c.cost / topCost) * 100)}%` }} />
                  </div>
                  <b className="own-num text-[13px]">{money(c.cost)}</b>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {(summary?.byHorse?.length || 0) > 1 && (
        <Card title="Theo từng chiến mã" icon={<TeamOutlined />} flush>
          <ul className="own-list">
            {summary.byHorse.map((b) => (
              <li key={idOf(b.horse)}>
                <Row
                  to={`/finance?horse=${idOf(b.horse)}`}
                  lead={<HorseAvatar horse={horsesById.get(idOf(b.horse)) || b.horse} size={34} />}
                  title={b.horse.name}
                  sub={`Thu ${money(b.revenue)} · chi ${money(b.cost)}${b.medicalCost ? ` (y tế ${money(b.medicalCost)})` : ''}`}
                  side={<b className={`own-num ${b.net >= 0 ? 'own-good' : 'own-bad'}`}>{b.net >= 0 ? '+' : '−'}{money(Math.abs(b.net))}</b>}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Sổ thu chi"
        icon={<DollarOutlined />}
        flush
        extra={
          <Segmented
            size="small"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'Tất cả' },
              { value: 'revenue', label: 'Thu' },
              { value: 'cost', label: 'Chi' },
            ]}
          />
        }
      >
        <div style={{ padding: '12px 18px 4px' }}>
          <HorsePicker horses={horses} value={horseId} onChange={setHorse} />
        </div>
        {ledger.length === 0 ? (
          <EmptyNote>{isLoading ? 'Đang tải…' : 'Chưa có khoản thu chi nào.'}</EmptyNote>
        ) : (
          <>
            <ul className="own-list">
              {ledger.slice(0, shown).map((e) => {
                const inflow = e.type === 'revenue';
                return (
                  <li key={e._id}>
                    <Row
                      lead={<span className={`own-icon is-${inflow ? 'good' : 'bad'}`}>{inflow ? <ArrowUpOutlined /> : <ArrowDownOutlined />}</span>}
                      title={categoryLabel(e.category)}
                      sub={[e.horse?.name, fmtDate(e.date), SOURCE[e.source] || 'Nhập tay'].filter(Boolean).join(' · ')}
                      side={<b className={`own-num ${inflow ? 'own-good' : 'own-bad'}`}>{inflow ? '+' : '−'}{money(e.amount)}</b>}
                    />
                  </li>
                );
              })}
            </ul>
            <MoreButton shown={shown} total={ledger.length} onMore={() => setShown((n) => n + 20)} />
          </>
        )}
      </Card>
    </OwnerPage>
  );
}
