import { useRef, useState } from 'react';
import { Button, Empty, Input, Pagination, Segmented, Skeleton, Table, Tooltip } from 'antd';
import { CloseOutlined, CoffeeOutlined, HomeOutlined, InfoCircleOutlined, MedicineBoxOutlined, SearchOutlined, TagsOutlined } from '@ant-design/icons';
import './costReport.css';

const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')} đ`;
const short = (n) => {
  const v = Math.round(Number(n) || 0);
  if (v >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (v >= 1e3) return `${Math.round(v / 1e3).toLocaleString('vi-VN')} k`;
  return v.toLocaleString('vi-VN');
};
const qty = (n) => Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const per = (price, unit) => `${vnd(price)}${unit ? `/${unit}` : ''}`;

// The three kinds of cost: what each counts, and its colour.
const COST_GROUPS = [
  {
    key: 'feed',
    label: 'Thức ăn',
    icon: <CoffeeOutlined />,
    what: 'Theo lịch khẩu phần đã xác nhận của kế hoạch tập (và khẩu phần mẫu), nhân đơn giá từng món trong kho.',
  },
  {
    key: 'medical',
    label: 'Y tế',
    icon: <MedicineBoxOutlined />,
    what: 'Thuốc bác sĩ kê trong mỗi đơn điều trị (liều × số lần/ngày × số ngày) theo đơn giá kho, cộng phí mỗi lần khám.',
  },
  {
    key: 'upkeep',
    label: 'Nuôi dưỡng',
    icon: <HomeOutlined />,
    what: 'Tiền chuồng mỗi ngày theo loại chuồng, công chăm sóc hằng ngày, và các lần đóng móng, tiêm phòng, tẩy giun theo bảng giá CLB.',
  },
];

// The club's rates (clubPolicy.costRates), each with what it is charged for.
const RATE_ROWS = [
  { key: 'stall:standard', label: 'Chuồng thường', sub: 'Mỗi ngày ngựa ở chuồng thường', unit: 'ngày', of: (r) => r.stallDay?.standard },
  { key: 'stall:recovery', label: 'Chuồng hồi phục', sub: 'Mỗi ngày ở chuồng hồi phục (sau chấn thương, điều trị)', unit: 'ngày', of: (r) => r.stallDay?.recovery },
  { key: 'stall:isolation', label: 'Chuồng cách ly', sub: 'Mỗi ngày ở chuồng cách ly', unit: 'ngày', of: (r) => r.stallDay?.isolation },
  { key: 'groom', label: 'Công chăm sóc hằng ngày', sub: 'Mỗi ngày ngựa có người chăm được phân công', unit: 'ngày', of: (r) => r.groomDay },
  { key: 'visit:farrier', label: 'Đóng / chăm sóc móng', sub: 'Mỗi lần thợ móng làm', unit: 'lần', of: (r) => r.visit?.farrier },
  { key: 'visit:vaccination', label: 'Tiêm phòng', sub: 'Mỗi lần tiêm phòng', unit: 'lần', of: (r) => r.visit?.vaccination },
  { key: 'visit:deworming', label: 'Tẩy giun', sub: 'Mỗi lần tẩy giun', unit: 'lần', of: (r) => r.visit?.deworming },
];
const EXAM_ROW = { key: 'exam', label: 'Phí khám của bác sĩ', sub: 'Mỗi lần bác sĩ khám', unit: 'lần', of: (r) => r.exam };

const HORSES_A_PAGE = 6;
// "Sao Mai" is found by "sao mai" and by "Sáo Mãi".
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
const MONTH_FIELDS = ['feed', 'medical', 'upkeep', 'feedAhead', 'medicalAhead', 'total'];
/** The totals of these horses, and month by month (the server's add up every horse it reported). */
function totalsOf(horses) {
  const add = (field) => horses.reduce((n, h) => n + (h[field] || 0), 0);
  const months = (horses[0]?.months || []).map((m, i) => {
    const row = { month: m.month };
    for (const f of MONTH_FIELDS) row[f] = horses.reduce((n, h) => n + (h.months[i]?.[f] || 0), 0);
    return row;
  });
  return { feed: add('feed'), medical: add('medical'), upkeep: add('upkeep'), ahead: add('ahead'), total: add('total'), months };
}

const STALL_LABEL = /^Tiền (chuồng (?:thường|hồi phục|cách ly))\s*(.*)$/;
const STALL_KEYS = { 'chuồng thường': 'standard', 'chuồng hồi phục': 'recovery', 'chuồng cách ly': 'isolation' };
/** A line as the server gives it (a key alike on every horse, the stall's code in a note), or as it gave it before. */
function normalLine(line) {
  if (line.key) return line;
  const stall = line.label.match(STALL_LABEL);
  if (stall) return { ...line, key: `stall:${STALL_KEYS[stall[1]]}`, label: `Tiền ${stall[1]}`, note: stall[2] ? `Chuồng ${stall[2]}` : null };
  if (line.label === 'Phí khám của bác sĩ') return { ...line, key: 'exam' };
  if (line.label === 'Công chăm sóc hằng ngày') return { ...line, key: 'groom' };
  return { ...line, key: `${line.label}|${line.unit}` };
}

/** One kind of cost of these horses, line by line, each line with the horses it comes from. */
function linesOf(horses, kind) {
  const map = new Map();
  for (const h of horses) {
    for (const raw of h.details?.[kind] || []) {
      const l = normalLine(raw);
      if (!map.has(l.key)) map.set(l.key, { key: l.key, label: l.label, unit: l.unit, unitPrice: l.unitPrice, note: l.note, quantity: 0, cost: 0, ahead: 0, horses: [] });
      const row = map.get(l.key);
      row.quantity += Number(l.quantity) || 0;
      row.cost += Number(l.cost) || 0;
      row.ahead += Number(l.ahead) || 0;
      if (row.unitPrice == null) row.unitPrice = l.unitPrice;
      row.horses.push({ key: `${l.key}|${h.horse._id}`, name: h.horse.name, note: l.note, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, cost: l.cost, ahead: l.ahead || 0 });
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, horses: r.horses.sort((a, b) => b.cost - a.cost) }))
    .sort((a, b) => (a.unitPrice == null) - (b.unitPrice == null) || b.cost - a.cost);
}

/** The year's costs month by month: a column per month, its three kinds stacked, the planned part paler. */
function MonthBars({ months }) {
  const top = Math.max(1, ...months.map((m) => m.total));
  return (
    <div className="cr-bars" role="img" aria-label="Chi phí theo tháng">
      {months.map((m) => {
        const ahead = m.feedAhead + m.medicalAhead;
        return (
          <Tooltip
            key={m.month}
            title={
              <div>
                <b>Tháng {Number(m.month.slice(5))}</b>
                {COST_GROUPS.map((g) => (
                  <div key={g.key}>
                    {g.label}: {vnd(m[g.key])}
                  </div>
                ))}
                <div>Tổng: {vnd(m.total)}</div>
                {ahead > 0 && <div>Trong đó dự kiến: {vnd(ahead)}</div>}
              </div>
            }
          >
            <div className="cr-bar">
              <span className="cr-bar-value">{m.total ? short(m.total) : ''}</span>
              <div className="cr-bar-stack" style={{ height: `${(m.total / top) * 100}%` }}>
                {COST_GROUPS.map((g) => (m[g.key] > 0 ? <span key={g.key} className={`cr-seg is-${g.key}${ahead >= m.total ? ' is-ahead' : ''}`} style={{ flexGrow: m[g.key] }} /> : null))}
              </div>
              <span className="cr-bar-label">T{Number(m.month.slice(5))}</span>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * One kind of cost, a line for each thing it counts: how much, at what price, what it comes to and its
 * share. With several horses a line opens on the horse it comes from; the total at the foot is the tile's.
 */
function CostLines({ group, horses, total, many }) {
  const lines = linesOf(horses, group.key);
  const columns = [
    {
      title: 'Khoản',
      key: 'label',
      render: (_, l) => (
        <div className="cr-line-name">
          <b>{l.label}</b>
          <small>{many ? `${l.horses.length} ngựa` : l.note || ''}</small>
        </div>
      ),
    },
    { title: 'Số lượng', key: 'quantity', align: 'right', render: (_, l) => <span className="whitespace-nowrap">{`${qty(l.quantity)} ${l.unit || ''}`}</span> },
    {
      title: 'Đơn giá',
      key: 'unitPrice',
      align: 'right',
      render: (_, l) => (l.unitPrice != null ? <span className="whitespace-nowrap">{per(l.unitPrice, l.unit)}</span> : <span className="cr-warn">Chưa có đơn giá</span>),
    },
    {
      title: 'Thành tiền',
      key: 'cost',
      align: 'right',
      render: (_, l) => (
        <div className="cr-line-cost">
          <b>{l.unitPrice != null ? vnd(l.cost) : '—'}</b>
          {l.ahead > 0 && <small>gồm {vnd(l.ahead)} dự kiến</small>}
        </div>
      ),
    },
    {
      title: 'Tỷ lệ',
      key: 'share',
      width: 120,
      render: (_, l) => {
        const share = total ? (l.cost / total) * 100 : 0;
        return (
          <div className="cr-share">
            <span className="cr-share-track">
              <i className={`is-${group.key}`} style={{ width: `${Math.min(100, Math.max(share ? 3 : 0, share))}%` }} />
            </span>
            <small>{Math.round(share)}%</small>
          </div>
        );
      },
    },
  ];

  return (
    <div className="cr-lines">
      <Table
        size="small"
        rowKey="key"
        columns={columns}
        dataSource={lines}
        pagination={false}
        scroll={{ x: 620 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Chưa có khoản ${group.label.toLowerCase()} nào.`} /> }}
        expandable={
          many
            ? {
                rowExpandable: (l) => l.horses.length > 0,
                expandedRowRender: (l) => (
                  <ul className="cr-line-horses">
                    {l.horses.map((h) => (
                      <li key={h.key}>
                        <span className="min-w-0">
                          <b>{h.name}</b>
                          {h.note && <small> · {h.note}</small>}
                        </span>
                        <span className="cr-muted-num">
                          {qty(h.quantity)} {h.unit || ''}
                          {h.unitPrice != null ? ` × ${per(h.unitPrice, h.unit)}` : ''}
                        </span>
                        <b>{h.unitPrice != null ? vnd(h.cost) : '—'}</b>
                      </li>
                    ))}
                  </ul>
                ),
              }
            : undefined
        }
        summary={() =>
          lines.length ? (
            <Table.Summary.Row className="cr-lines-total">
              <Table.Summary.Cell index={0} colSpan={many ? 4 : 3}>
                <b>Cộng {group.label.toLowerCase()}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={many ? 4 : 3} align="right">
                <b>{vnd(total)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={many ? 5 : 4}>
                <small className="cr-muted-num">100%</small>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />
    </div>
  );
}

/** One price in the list: what it is, what it is charged for (or the pack it is bought in), and the price. */
function PriceRow({ label, sub, price, used }) {
  return (
    <li className={used ? 'is-used' : ''}>
      <span className="min-w-0">
        <b>
          {label}
          {used && <em>Đang dùng</em>}
        </b>
        {sub && <small>{sub}</small>}
      </span>
      {price}
    </li>
  );
}

/**
 * The prices every cost is worked out at, for the Manager and the owners to read: the club's rates (stall
 * day, the groom's day, care visits, the exam fee) and the stock's prices of feed and medicine — the pack
 * bought and what one unit comes to. "Đang dùng": counted in the costs shown.
 */
function PriceList({ report, used }) {
  const rates = report.rates || {};
  // Each stock item with its price; from the lines when the server gives no list.
  const stock =
    report.prices ||
    ['feed', 'medical'].flatMap((kind) =>
      linesOf(report.horses || [], kind)
        .filter((l) => l.key !== 'exam')
        .map((l) => ({ _id: l.key, name: l.label, unit: l.unit, unitPrice: l.unitPrice, price: l.unitPrice, category: kind === 'feed' ? 'feed' : 'medicine' })),
    );
  const rate = (r) => {
    const value = r.of(rates);
    return <PriceRow key={r.key} label={r.label} sub={r.sub} used={used.has(r.key)} price={<b className="cr-price">{value != null ? per(value, r.unit) : '—'}</b>} />;
  };
  const item = (p) => (
    <PriceRow
      key={p._id}
      label={p.name}
      used={used.has(String(p._id))}
      sub={p.price == null ? 'Quản lý chưa nhập giá trong Kho vật tư' : p.packUnit ? `Giá mua ${vnd(p.price)}/${p.packUnit} ${qty(p.packSize)} ${p.unit}` : `Giá mua theo ${p.unit}`}
      price={p.unitPrice != null ? <b className="cr-price">{per(p.unitPrice, p.unit)}</b> : <span className="cr-warn">Chưa có giá</span>}
    />
  );
  const feed = stock.filter((p) => p.category === 'feed');
  const medicine = stock.filter((p) => p.category === 'medicine');

  return (
    <div className="cr-prices-wrap">
      <p className="cr-prices-lead">
        <InfoCircleOutlined /> Giá nuôi dưỡng và phí khám theo <b>bảng giá CLB</b>; giá thức ăn, thuốc theo <b>đơn giá trong Kho vật tư</b> (giá mua ÷ quy cách ra đơn giá tính). “Đang dùng”: có trong chi phí đang xem.
      </p>
      <div className="cr-prices">
        <section className="is-upkeep">
          <h4>
            <HomeOutlined /> Nuôi dưỡng <span>Bảng giá CLB</span>
          </h4>
          <ul>{RATE_ROWS.map(rate)}</ul>
        </section>
        <section className="is-feed">
          <h4>
            <CoffeeOutlined /> Thức ăn <span>{feed.length} món · đơn giá kho</span>
          </h4>
          <ul>{feed.length ? feed.map(item) : <li className="cr-empty">Chưa có món nào.</li>}</ul>
        </section>
        <section className="is-medical">
          <h4>
            <MedicineBoxOutlined /> Y tế <span>Phí khám · {medicine.length} thuốc, vật tư</span>
          </h4>
          <ul>
            {rate(EXAM_ROW)}
            {medicine.map(item)}
          </ul>
        </section>
      </div>
    </div>
  );
}

/**
 * What the horses cost (GET /finance/costs, server finance/costReport.service.js), to read only: the three
 * kinds — feed, medical, upkeep — as tiles; under them each kind line by line (quantity × unit price, a line
 * opening on its horses) and the price list it was all worked out at; the year month by month; a row per
 * horse, a click narrowing the lines to it. `report`: the server's answer; `loading`.
 */
export default function CostReport({ report, loading = false, year }) {
  const [picked, setPicked] = useState(null);
  const [tab, setTab] = useState('upkeep');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showMissing, setShowMissing] = useState(false);
  const detailsRef = useRef(null);
  if (loading && !report) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!report) return null;
  // Only the horses still kept (one sold, retired or dead is archived), and the totals of those.
  const horses = (report.horses || []).filter((h) => !h.horse?.isArchived);
  if (!horses.length) return <Empty description="Chưa có ngựa nào để tính chi phí." />;
  const totals = totalsOf(horses);
  const one = horses.length === 1 ? horses[0] : horses.find((h) => String(h.horse._id) === picked) || null;
  // The lines are of the horse picked, else of every horse.
  const scope = one ? [one] : horses;
  const scopeTotals = one || totals;
  const used = new Set(COST_GROUPS.flatMap((g) => linesOf(scope, g.key).map((l) => l.key)));
  const group = COST_GROUPS.find((g) => g.key === tab);
  // The table a page at a time, the costliest first, found by name.
  const term = fold(search.trim());
  const listed = horses.filter((h) => !term || fold(h.horse.name).includes(term)).sort((a, b) => b.total - a.total);
  const lastPage = Math.max(1, Math.ceil(listed.length / HORSES_A_PAGE));
  const shownPage = Math.min(page, lastPage);
  const pageRows = listed.slice((shownPage - 1) * HORSES_A_PAGE, shownPage * HORSES_A_PAGE);
  const missing = [...new Set(horses.flatMap((h) => h.missingPrices || []))];
  const pick = (id) => {
    const next = picked === id ? null : id;
    setPicked(next);
    if (next) detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="cr">
      {/* The three kinds and the total; a kind opens its lines just below. */}
      <div className="cr-groups">
        {COST_GROUPS.map((g) => {
          const ahead = g.key === 'feed' ? totals.months.reduce((n, m) => n + m.feedAhead, 0) : g.key === 'medical' ? totals.months.reduce((n, m) => n + m.medicalAhead, 0) : 0;
          return (
            <button key={g.key} type="button" className={`cr-group is-${g.key}${tab === g.key ? ' is-on' : ''}`} onClick={() => setTab(g.key)} aria-pressed={tab === g.key}>
              <div className="cr-group-head">
                <span className="cr-group-icon">{g.icon}</span>
                <span className="cr-group-label">{g.label}</span>
                <Tooltip title={g.what}>
                  <InfoCircleOutlined className="cr-help" aria-label={g.what} />
                </Tooltip>
              </div>
              <b className="cr-group-value">{vnd(totals[g.key])}</b>
              <span className="cr-group-sub">
                {totals.total ? `${Math.round((totals[g.key] / totals.total) * 100)}% tổng chi phí` : '—'}
                {ahead > 0 ? ` · gồm ${vnd(ahead)} dự kiến` : ''}
              </span>
              <span className="cr-group-more">{tab === g.key ? 'Đang xem chi tiết' : 'Xem chi tiết'}</span>
            </button>
          );
        })}
        <div className="cr-group is-total">
          <div className="cr-group-head">
            <span className="cr-group-label">Tổng chi phí năm {year}</span>
          </div>
          <b className="cr-group-value">{vnd(totals.total)}</b>
          <span className="cr-group-sub">{totals.ahead > 0 ? `${vnd(totals.total - totals.ahead)} đã phát sinh · ${vnd(totals.ahead)} dự kiến` : 'Đã phát sinh đến hôm nay'}</span>
        </div>
      </div>

      {/* Each kind line by line, and the prices it is worked out at. */}
      <div className="cr-card cr-details-card" ref={detailsRef}>
        <div className="cr-card-title">
          <span>
            Chi tiết chi phí{' '}
            <span className="cr-muted">
              · {one ? one.horse.name : `${horses.length} ngựa`}
              {report.today ? ` · tính đến ${report.today.split('-').reverse().join('/')}` : ''}
            </span>
          </span>
          {one && horses.length > 1 && (
            <Button size="small" icon={<CloseOutlined />} onClick={() => setPicked(null)}>
              Xem tất cả ngựa
            </Button>
          )}
        </div>
        <div className="cr-tabs">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              ...COST_GROUPS.map((g) => ({
                value: g.key,
                label: (
                  <span className="cr-tab">
                    {g.icon} {g.label} <small>{short(scopeTotals[g.key])}</small>
                  </span>
                ),
              })),
              {
                value: 'prices',
                label: (
                  <span className="cr-tab">
                    <TagsOutlined /> Bảng đơn giá
                  </span>
                ),
              },
            ]}
          />
        </div>
        {group ? <CostLines key={`${group.key}-${one ? one.horse._id : 'all'}`} group={group} horses={scope} total={scopeTotals[group.key]} many={!one} /> : <PriceList report={report} used={used} />}
      </div>

      <div className="cr-card">
        <div className="cr-card-title">
          Chi phí theo tháng
          <span className="cr-legend">
            {COST_GROUPS.map((g) => (
              <span key={g.key}>
                <i className={`is-${g.key}`} /> {g.label}
              </span>
            ))}
          </span>
        </div>
        <MonthBars months={totals.months} />
      </div>

      {horses.length > 1 && (
        <div className="cr-card">
          <div className="cr-card-title">
            <span>
              Theo chiến mã <span className="cr-muted">· {horses.length} ngựa · bấm một ngựa để xem chi tiết của ngựa đó</span>
            </span>
            {horses.length > HORSES_A_PAGE && (
              <Input
                size="small"
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Tìm ngựa"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="!w-48"
                aria-label="Tìm ngựa"
              />
            )}
          </div>
          <div className="cr-table" role="table">
            <div className="cr-tr is-head" role="row">
              <span>Ngựa</span>
              {COST_GROUPS.map((g) => (
                <span key={g.key}>{g.label}</span>
              ))}
              <span>Tổng</span>
            </div>
            {pageRows.map((h) => (
              <button key={h.horse._id} type="button" role="row" className={`cr-tr${picked === String(h.horse._id) ? ' is-on' : ''}`} onClick={() => pick(String(h.horse._id))}>
                <span className="cr-td-name">{h.horse.name}</span>
                {COST_GROUPS.map((g) => (
                  <span key={g.key} className={h[g.key] ? '' : 'cr-zero'}>
                    {h[g.key] ? vnd(h[g.key]) : '—'}
                  </span>
                ))}
                <span className="cr-td-total">{vnd(h.total)}</span>
              </button>
            ))}
            {!pageRows.length && <p className="cr-empty">Không có ngựa nào khớp.</p>}
          </div>
          {listed.length > HORSES_A_PAGE && (
            <div className="cr-pager">
              <Pagination size="small" current={shownPage} pageSize={HORSES_A_PAGE} total={listed.length} onChange={setPage} showSizeChanger={false} showTotal={(total, [from, to]) => `${from}–${to} / ${total} ngựa`} />
            </div>
          )}
        </div>
      )}

      {/* Only when some item has no stock price: one short line, the items open on a click. */}
      {missing.length > 0 && (
        <div className="cr-note">
          <button type="button" className="cr-note-toggle" onClick={() => setShowMissing(!showMissing)} aria-expanded={showMissing}>
            {missing.length} món chưa có đơn giá (tính 0 đ) · {showMissing ? 'thu gọn' : 'xem'}
          </button>
          {showMissing && (
            <div className="cr-missing">
              {missing.map((name) => (
                <span key={name}>{name}</span>
              ))}
              <small>Quản lý nhập đơn giá cho các món này trong Kho vật tư để chi phí tính đúng.</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
