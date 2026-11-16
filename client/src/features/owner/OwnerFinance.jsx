import { Fragment, useMemo, useState } from 'react';
import { Input, Segmented, Select } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, BarChartOutlined, BookOutlined, FallOutlined, PieChartOutlined, RiseOutlined, SearchOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { categoryLabel } from '../finance/financeLabels';
import { Card, EmptyNote, HorseAvatar, MoreButton, OwnerPage, PageHead } from './kit';
import { MoneyBars } from './charts';
import { capFirst, idOf, money } from './ownerFormat';
import { useHorseParam, useMyFinance, useMyHorses } from './useOwnerData';

const AUTO = ['race_prize', 'system'];
const label = (c) => capFirst(categoryLabel(c));
const sum = (list) => list.reduce((t, e) => t + (Number(e.amount) || 0), 0);
const signed = (v) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;
// "Sao Mai" is found by "sao mai" and by "Sáo Mãi".
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
// Months of entries shown before "show more".
const MONTHS_SHOWN = 4;

/**
 * The owner's ledger, read-only (the Manager keeps it): every entry of the year for their horses, month
 * by month with each month's totals and the year's, narrowed by type, horse, category or a word. What
 * it adds up to is on top; the charts (by month, by category, by horse) sit beside it.
 */
export default function OwnerFinance() {
  const { horses } = useMyHorses();
  const { entries, isLoading } = useMyFinance();
  const [horseId, setHorse] = useHorseParam(horses);
  const years = useMemo(() => [...new Set([dayjs().year(), ...entries.map((e) => dayjs(e.date).year())])].sort((a, b) => b - a), [entries]);
  const [year, setYear] = useState(dayjs().year());
  const [type, setType] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [monthsShown, setMonthsShown] = useState(MONTHS_SHOWN);

  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  // The year (and the horse, when one is picked): what the summary and the charts add up.
  const inYear = useMemo(() => entries.filter((e) => dayjs(e.date).year() === year && (!horseId || idOf(e.horse) === horseId)), [entries, year, horseId]);
  const revenue = sum(inYear.filter((e) => e.type === 'revenue'));
  const cost = sum(inYear.filter((e) => e.type === 'cost'));
  const net = revenue - cost;
  const categories = [...new Set(inYear.map((e) => e.category))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'vi'));
  const term = fold(search.trim());
  // The ledger as filtered, newest first, month by month.
  const ledger = inYear
    .filter((e) => (type === 'all' || e.type === type) && (category === 'all' || e.category === category))
    .filter((e) => !term || fold(`${label(e.category)} ${e.note || ''} ${e.horse?.name || ''}`).includes(term))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const months = Object.values(
    ledger.reduce((acc, e) => {
      const key = dayjs(e.date).format('YYYY-MM');
      acc[key] = acc[key] || { key, label: `Tháng ${dayjs(e.date).month() + 1}/${dayjs(e.date).year()}`, entries: [] };
      acc[key].entries.push(e);
      return acc;
    }, {}),
  ).sort((a, b) => b.key.localeCompare(a.key));
  const shownIn = sum(ledger.filter((e) => e.type === 'revenue'));
  const shownOut = sum(ledger.filter((e) => e.type === 'cost'));

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
  const filtered = type !== 'all' || category !== 'all' || term;

  return (
    <OwnerPage>
      <PageHead eyebrow="Chủ sở hữu" title="Thu chi" sub="Sổ thu chi của các chiến mã do CLB ghi nhận: tiền thưởng giải, tài trợ, chi phí thức ăn, y tế, huấn luyện…" />

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
            <b className="own-sum-value">{isLoading ? '—' : money(cost)}</b>
            <span className="own-sum-sub">{inYear.filter((e) => e.type === 'cost').length} khoản chi</span>
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

      <div className="own-fin-layout">
        <Card title="Sổ thu chi" icon={<BookOutlined />} flush className="own-ledger">
          <div className="own-ledger-bar">
            <Segmented
              value={type}
              onChange={setType}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'revenue', label: 'Thu' },
                { value: 'cost', label: 'Chi' },
              ]}
            />
            <Select value={category} onChange={setCategory} options={[{ value: 'all', label: 'Mọi hạng mục' }, ...categories.map((c) => ({ value: c, label: label(c) }))]} style={{ width: 170 }} aria-label="Hạng mục" />
            <Input allowClear prefix={<SearchOutlined />} placeholder="Tìm khoản, ghi chú, ngựa…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 240 }} aria-label="Tìm trong sổ" />
          </div>

          {ledger.length === 0 ? (
            <EmptyNote>{isLoading ? 'Đang tải…' : filtered ? 'Không có khoản nào khớp bộ lọc.' : `Năm ${year} chưa có khoản thu chi nào${horseId ? ' của chiến mã này' : ''}.`}</EmptyNote>
          ) : (
            <div className={`own-lg${horseId ? ' is-one' : ''}`} role="table" aria-label="Sổ thu chi">
              <div className="own-lg-head" role="row">
                <span>Ngày</span>
                <span>Nội dung</span>
                {!horseId && <span>Chiến mã</span>}
                <span className="text-right">Số tiền</span>
              </div>
              {months.slice(0, monthsShown).map((m) => {
                const mIn = sum(m.entries.filter((e) => e.type === 'revenue'));
                const mOut = sum(m.entries.filter((e) => e.type === 'cost'));
                return (
                  <Fragment key={m.key}>
                    <div className="own-lg-month" role="row">
                      <span className="own-lg-month-chip">{m.label}</span>
                      <span className="own-faint">{m.entries.length} khoản</span>
                      <span className="own-lg-month-sum">
                        {mIn > 0 && (
                          <span>
                            Thu <b className="own-good">+{money(mIn)}</b>
                          </span>
                        )}
                        {mOut > 0 && (
                          <span>
                            Chi <b className="own-bad">−{money(mOut)}</b>
                          </span>
                        )}
                      </span>
                    </div>
                    {m.entries.map((e) => {
                      const inflow = e.type === 'revenue';
                      return (
                        <div key={e._id} className="own-lg-row" role="row">
                          <span className="own-num own-muted">{dayjs(e.date).format('DD/MM')}</span>
                          <span className="own-lg-what">
                            <span className={`own-lg-icon ${inflow ? 'is-in' : 'is-out'}`} aria-label={inflow ? 'Thu' : 'Chi'}>
                              {inflow ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                            </span>
                            <span className="min-w-0">
                              <b>
                                {label(e.category)}
                                {AUTO.includes(e.source) && <span className="own-lg-auto">Tự động</span>}
                              </b>
                              <span>{e.note || (inflow ? 'Khoản thu' : 'Khoản chi')}</span>
                            </span>
                          </span>
                          {!horseId && (
                            <span className="own-lg-horse">
                              <HorseAvatar horse={horsesById.get(idOf(e.horse)) || e.horse} size={22} />
                              <span className="truncate">{e.horse?.name || '—'}</span>
                            </span>
                          )}
                          <b className={`own-num text-right ${inflow ? 'own-good' : 'own-bad'}`}>{inflow ? '+' : '−'}{money(e.amount)}</b>
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
              <div className="own-lg-total" role="row">
                <b>{filtered ? 'Tổng các khoản đang lọc' : `Tổng năm ${year}`}</b>
                <span>
                  Thu <b className="own-good">+{money(shownIn)}</b>
                </span>
                <span>
                  Chi <b className="own-bad">−{money(shownOut)}</b>
                </span>
                <span>
                  Còn <b className={shownIn - shownOut >= 0 ? 'own-good' : 'own-bad'}>{signed(shownIn - shownOut)}</b>
                </span>
              </div>
            </div>
          )}
          {months.length > monthsShown && <MoreButton shown={monthsShown} total={months.length} onMore={() => setMonthsShown((n) => n + MONTHS_SHOWN)} />}
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
                {byCategory.map(([c, value]) => (
                  <button key={c} type="button" className="own-bar-row own-bar-btn" onClick={() => setCategory(c === category ? 'all' : c)} title="Lọc sổ theo hạng mục này">
                    <span className={`truncate ${c === category ? 'own-ink font-semibold' : 'own-muted'}`}>{label(c)}</span>
                    <div className="own-bar-track">
                      <span style={{ width: `${Math.max(2, (value / topCategory) * 100)}%` }} />
                    </div>
                    <b className="own-num text-[13px]">{money(value)}</b>
                  </button>
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
