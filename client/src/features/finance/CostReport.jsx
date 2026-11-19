import { useState } from 'react';
import { Empty, Skeleton, Tooltip } from 'antd';
import { CoffeeOutlined, HomeOutlined, InfoCircleOutlined, MedicineBoxOutlined } from '@ant-design/icons';
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

// The three kinds of cost, what each counts and its colour.
const COST_GROUPS = [
  { key: 'feed', label: 'Thức ăn', icon: <CoffeeOutlined />, what: 'Theo lịch khẩu phần đã xác nhận của kế hoạch tập (và khẩu phần mẫu), nhân đơn giá từng món trong kho.' },
  { key: 'medical', label: 'Y tế', icon: <MedicineBoxOutlined />, what: 'Thuốc bác sĩ kê trong mỗi đơn điều trị (liều × số lần/ngày × số ngày) theo đơn giá kho, cộng phí mỗi lần khám.' },
  { key: 'upkeep', label: 'Nuôi dưỡng', icon: <HomeOutlined />, what: 'Tiền chuồng mỗi ngày theo loại chuồng, công chăm sóc hằng ngày, và các lần đóng móng, tiêm phòng, tẩy giun theo bảng giá CLB.' },
];

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

/** One kind of cost of one horse, line by line: what, how much at what price, and what it comes to. */
function DetailList({ title, icon, lines }) {
  return (
    <div className="cr-detail">
      <div className="cr-detail-title">
        {icon} {title}
      </div>
      {lines.length ? (
        <ul>
          {lines.map((l) => (
            <li key={l.label}>
              <span className="min-w-0">
                <b>{l.label}</b>
                <small>
                  {qty(l.quantity)} {l.unit}
                  {l.unitPrice != null ? ` × ${vnd(l.unitPrice)}` : ' · chưa có đơn giá'}
                  {l.ahead > 0 ? ` · dự kiến ${vnd(l.ahead)}` : ''}
                </small>
              </span>
              <span className="cr-detail-cost">{l.unitPrice != null ? vnd(l.cost) : '—'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cr-empty">Không có khoản nào.</p>
      )}
    </div>
  );
}

/**
 * What the horses cost (GET /finance/costs, server finance/costReport.service.js), to read only: the three
 * kinds — feed, medical, upkeep — with what each counts, the year month by month, a row per horse (a click
 * opens its lines), and each line's quantity × price. `report`: the server's answer; `loading`.
 */
export default function CostReport({ report, loading = false, year }) {
  const [picked, setPicked] = useState(null);
  if (loading && !report) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!report) return null;
  const horses = report.horses || [];
  if (!horses.length) return <Empty description="Chưa có ngựa nào để tính chi phí." />;
  const totals = report.totals;
  const one = horses.length === 1 ? horses[0] : horses.find((h) => String(h.horse._id) === picked) || null;
  const missing = [...new Set(horses.flatMap((h) => h.missingPrices || []))];

  return (
    <div className="cr">
      <div className="cr-groups">
        {COST_GROUPS.map((g) => {
          const ahead = g.key === 'feed' ? totals.months.reduce((n, m) => n + m.feedAhead, 0) : g.key === 'medical' ? totals.months.reduce((n, m) => n + m.medicalAhead, 0) : 0;
          return (
            <div key={g.key} className={`cr-group is-${g.key}`}>
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
            </div>
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
          <div className="cr-card-title">Theo chiến mã · bấm một ngựa để xem chi tiết</div>
          <div className="cr-table" role="table">
            <div className="cr-tr is-head" role="row">
              <span>Ngựa</span>
              {COST_GROUPS.map((g) => (
                <span key={g.key}>{g.label}</span>
              ))}
              <span>Tổng</span>
            </div>
            {horses
              .slice()
              .sort((a, b) => b.total - a.total)
              .map((h) => (
                <button key={h.horse._id} type="button" role="row" className={`cr-tr${picked === String(h.horse._id) ? ' is-on' : ''}`} onClick={() => setPicked(picked === String(h.horse._id) ? null : String(h.horse._id))}>
                  <span className="cr-td-name">{h.horse.name}</span>
                  {COST_GROUPS.map((g) => (
                    <span key={g.key}>{vnd(h[g.key])}</span>
                  ))}
                  <span className="cr-td-total">{vnd(h.total)}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {one && (
        <div className="cr-card">
          <div className="cr-card-title">
            Chi tiết · {one.horse.name}
            <span className="cr-muted">{vnd(one.total)}</span>
          </div>
          <div className="cr-details">
            <DetailList title="Thức ăn" icon={<CoffeeOutlined />} lines={one.details.feed} />
            <DetailList title="Y tế" icon={<MedicineBoxOutlined />} lines={one.details.medical} />
            <DetailList title="Nuôi dưỡng" icon={<HomeOutlined />} lines={one.details.upkeep} />
          </div>
        </div>
      )}

      <p className="cr-note">
        <InfoCircleOutlined /> Chi phí được hệ thống tự tính từ khẩu phần ăn, đơn thuốc, chuồng trại và lịch chăm sóc theo đơn giá kho và bảng giá CLB — chỉ để theo dõi; việc thanh toán thực hiện ngoài hệ thống.
        {missing.length > 0 && ` Chưa có đơn giá trong kho: ${missing.join(', ')} (tính 0 đ).`}
      </p>
    </div>
  );
}
