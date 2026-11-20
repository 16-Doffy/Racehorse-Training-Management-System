import { useMemo, useState } from 'react';
import { Empty, Input, Table, Tag } from 'antd';
import { DownOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { categoryLabel } from './financeLabels';
import './costReport.css';

const KINDS = ['feed', 'medical', 'upkeep'];
const num = (n) => (n ? Math.round(n).toLocaleString('vi-VN') : '—');
const qty = (n) => Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const per = (price, unit) => `${Math.round(price).toLocaleString('vi-VN')} đ${unit ? `/${unit}` : ''}`;
const SOURCE_TAGS = {
  system: <Tag color="blue">Hệ thống tính</Tag>,
  race_prize: <Tag color="gold">Kết quả giải</Tag>,
  manual: <Tag>Nhập tay</Tag>,
};
// "Sao Mai" is found by "sao mai" and by "Sáo Mãi".
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');

/**
 * What a worked-out cost of a month is made of: each item, how much at what price, and what it comes to,
 * adding up to the entry. From a server without month lines, the horse's year instead (said so).
 */
function EntryLines({ entry }) {
  const lines = entry.lines || entry.yearLines || [];
  return (
    <div className="cr-el">
      {!entry.lines && <p className="cr-el-hint">Đang hiện chi tiết cả năm của ngựa này — chi tiết từng tháng có sau khi máy chủ được cập nhật.</p>}
      <div className="cr-el-row is-head">
        <span>Khoản</span>
        <span>Số lượng × đơn giá</span>
        <span>Thành tiền</span>
      </div>
      {lines.map((l) => (
        <div key={l.key || l.label} className="cr-el-row">
          <span className="min-w-0">
            <b>{l.label}</b>
            {l.note && <small> · {l.note}</small>}
          </span>
          <span className="cr-el-calc">
            {qty(l.quantity)} {l.unit || ''}
            {l.unitPrice != null ? ` × ${per(l.unitPrice, l.unit)}` : ' · chưa có đơn giá'}
          </span>
          <b>{l.unitPrice != null ? num(l.cost) : '—'}</b>
        </div>
      ))}
      {!lines.length && <p className="cr-el-hint">Không có khoản nào.</p>}
      {entry.lines && lines.length > 0 && (
        <div className="cr-el-row is-foot">
          <span>Cộng</span>
          <span />
          <b>{num(entry.amount)}</b>
        </div>
      )}
    </div>
  );
}

/**
 * The ledger as a short table: a row for each horse in each month, its money in columns — what came in,
 * feed, medical, upkeep, anything else written by hand, and what is left — so a glance says which horse
 * cost what. A row opens on the entries behind it (written by hand, a race result, or worked out by the
 * system); one worked out by the system opens in turn on its items (quantity × unit price). A page at a
 * time, found by horse, with the totals at the foot.
 * `entries`: ledger entries (manual records and the system's cost lines, costEntries.js).
 */
export default function LedgerTable({ entries = [], loading = false, pageSize = 8, emptyText = 'Chưa có khoản thu chi nào.' }) {
  const [search, setSearch] = useState('');
  const [openEntries, setOpenEntries] = useState(() => new Set());
  const toggleEntry = (id) =>
    setOpenEntries((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const rows = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const month = dayjs(e.date).format('YYYY-MM');
      const horseId = String(e.horse?._id || e.horse || '');
      const key = `${month}|${horseId}`;
      if (!map.has(key)) map.set(key, { key, month, horse: e.horse, revenue: 0, feed: 0, medical: 0, upkeep: 0, other: 0, entries: [] });
      const row = map.get(key);
      row.entries.push(e);
      const amount = Number(e.amount) || 0;
      if (e.type === 'revenue') row.revenue += amount;
      else if (KINDS.includes(e.category)) row[e.category] += amount;
      else row.other += amount;
    }
    return [...map.values()]
      .map((r) => {
        const cost = r.feed + r.medical + r.upkeep + r.other;
        return { ...r, cost, net: r.revenue - cost, entries: r.entries.sort((a, b) => new Date(b.date) - new Date(a.date)) };
      })
      .sort((a, b) => b.month.localeCompare(a.month) || b.cost - a.cost);
  }, [entries]);
  const term = fold(search.trim());
  const shown = term ? rows.filter((r) => fold(r.horse?.name).includes(term)) : rows;
  const total = (field) => shown.reduce((n, r) => n + r[field], 0);

  const columns = [
    { title: 'Tháng', dataIndex: 'month', key: 'month', width: 92, render: (m) => <span className="tabular-nums">{dayjs(`${m}-01`).format('MM/YYYY')}</span> },
    { title: 'Chiến mã', key: 'horse', render: (_, r) => <span className="font-semibold">{r.horse?.name || '—'}</span> },
    { title: 'Thu', dataIndex: 'revenue', key: 'revenue', align: 'right', render: (v) => <span className={v ? 'cr-in' : 'cr-zero'}>{v ? `+${num(v)}` : '—'}</span> },
    { title: 'Thức ăn', dataIndex: 'feed', key: 'feed', align: 'right', render: (v) => <span className={v ? '' : 'cr-zero'}>{num(v)}</span> },
    { title: 'Y tế', dataIndex: 'medical', key: 'medical', align: 'right', render: (v) => <span className={v ? '' : 'cr-zero'}>{num(v)}</span> },
    { title: 'Nuôi dưỡng', dataIndex: 'upkeep', key: 'upkeep', align: 'right', render: (v) => <span className={v ? '' : 'cr-zero'}>{num(v)}</span> },
    { title: 'Khác', dataIndex: 'other', key: 'other', align: 'right', render: (v) => <span className={v ? '' : 'cr-zero'}>{num(v)}</span> },
    {
      title: 'Còn lại',
      dataIndex: 'net',
      key: 'net',
      align: 'right',
      render: (v) => <b className={v >= 0 ? 'cr-in' : 'cr-out'}>{`${v >= 0 ? '+' : '−'}${num(Math.abs(v)) === '—' ? '0' : num(Math.abs(v))}`}</b>,
    },
  ];

  return (
    <div className="cr-ledger">
      <div className="cr-ledger-bar">
        <span className="cr-muted">Số tiền tính bằng đồng · bấm một dòng để xem từng khoản, bấm khoản để xem chi tiết</span>
        <Input size="small" allowClear prefix={<SearchOutlined />} placeholder="Tìm ngựa" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-48" aria-label="Tìm ngựa trong sổ" />
      </div>
      <Table
        size="small"
        rowKey="key"
        columns={columns}
        dataSource={shown}
        loading={loading}
        scroll={{ x: 760 }}
        pagination={{ pageSize, size: 'small', hideOnSinglePage: true, showSizeChanger: false, showTotal: (n, [from, to]) => `${from}–${to} / ${n} dòng` }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={term ? 'Không có ngựa nào khớp.' : emptyText} /> }}
        expandable={{
          expandRowByClick: true,
          expandedRowRender: (r) => (
            <ul className="cr-entries">
              {r.entries.map((e) => {
                const detailed = Boolean(e.lines?.length || e.yearLines?.length);
                const open = detailed && openEntries.has(e._id);
                const body = (
                  <>
                    <span className="tabular-nums cr-muted">{dayjs(e.date).format('DD/MM')}</span>
                    <span className="min-w-0">
                      <b>{categoryLabel(e.category)}</b> {SOURCE_TAGS[e.source] || SOURCE_TAGS.manual}
                      <small>{e.note || (e.type === 'revenue' ? 'Khoản thu' : 'Khoản chi')}</small>
                    </span>
                    <b className={e.type === 'revenue' ? 'cr-in' : 'cr-out'}>
                      {e.type === 'revenue' ? '+' : '−'}
                      {num(e.amount)}
                    </b>
                    <span className="cr-entry-more">
                      {detailed && (
                        <>
                          {open ? 'Thu gọn' : 'Chi tiết'} <DownOutlined className={open ? 'is-open' : ''} />
                        </>
                      )}
                    </span>
                  </>
                );
                return (
                  <li key={e._id} className={open ? 'is-open' : ''}>
                    {detailed ? (
                      <button type="button" className="cr-entry-row is-button" onClick={() => toggleEntry(e._id)} aria-expanded={open}>
                        {body}
                      </button>
                    ) : (
                      <div className="cr-entry-row">{body}</div>
                    )}
                    {open && <EntryLines entry={e} />}
                  </li>
                );
              })}
            </ul>
          ),
        }}
        summary={() =>
          shown.length > 0 ? (
            <Table.Summary.Row className="cr-ledger-total">
              <Table.Summary.Cell index={0} colSpan={3}>
                <b>Tổng{term ? ' (đang lọc)' : ''}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <b className="cr-in">{total('revenue') ? `+${num(total('revenue'))}` : '—'}</b>
              </Table.Summary.Cell>
              {['feed', 'medical', 'upkeep', 'other'].map((f, i) => (
                <Table.Summary.Cell key={f} index={4 + i} align="right">
                  <b>{num(total(f))}</b>
                </Table.Summary.Cell>
              ))}
              <Table.Summary.Cell index={8} align="right">
                <b className={total('net') >= 0 ? 'cr-in' : 'cr-out'}>{`${total('net') >= 0 ? '+' : '−'}${Math.abs(Math.round(total('net'))).toLocaleString('vi-VN')}`}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />
    </div>
  );
}
