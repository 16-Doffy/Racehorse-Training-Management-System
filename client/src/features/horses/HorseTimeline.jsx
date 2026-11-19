import { useState } from 'react';
import { Button, Card, Empty, Pagination, Segmented, Select, Tag, Typography, theme } from 'antd';
import {
  AlertOutlined,
  CalendarOutlined,
  ExperimentOutlined,
  HeartOutlined,
  MedicineBoxOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { horsesApi } from './horsesApi';

const { Text } = Typography;

// One colour per role, so the hand-offs between them read at a glance down the line.
const ROLE_META = {
  head_trainer: { label: 'Huấn luyện viên', color: 'blue' },
  veterinarian: { label: 'Bác sĩ thú y', color: 'magenta' },
  groom: { label: 'NV chăm sóc', color: 'green' },
  manager: { label: 'Quản lý', color: 'purple' },
};
// What happened, as an icon (server: horseTimeline.controller.js kinds).
const KIND_ICON = {
  session: ThunderboltOutlined,
  exam: MedicineBoxOutlined,
  treatment: ExperimentOutlined,
  care: HeartOutlined,
  incident: WarningOutlined,
  routine_care: CalendarOutlined,
  exam_request: AlertOutlined,
  race: TrophyOutlined,
};

const ROLE_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'head_trainer', label: 'HLV' },
  { value: 'veterinarian', label: 'Bác sĩ' },
  { value: 'groom', label: 'Chăm sóc' },
];
const RANGE_OPTIONS = [
  { value: 7, label: '7 ngày' },
  { value: 14, label: '14 ngày' },
  { value: 30, label: '30 ngày' },
];
const PAGE_SIZE = 10;
const LONG_DETAIL = 140;
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** "Hôm nay", "Hôm qua", "Ngày mai", else "Thứ Năm, 19/11". */
function dayLabel(d) {
  const day = dayjs(d).startOf('day');
  const diff = day.diff(dayjs().startOf('day'), 'day');
  if (diff === 0) return 'Hôm nay';
  if (diff === -1) return 'Hôm qua';
  if (diff === 1) return 'Ngày mai';
  return `${WEEKDAYS[day.day()]}, ${day.format('DD/MM')}`;
}

/** Events in days, in the order given. */
function byDay(events) {
  const groups = [];
  for (const e of events) {
    const key = dayjs(e.at).format('YYYY-MM-DD');
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, at: e.at, items: [e] });
  }
  return groups;
}

/** One thing that happened: its time, what kind, who, what — a long detail folded to two lines. */
function EventRow({ e, open, onToggle, token }) {
  const meta = ROLE_META[e.role] || ROLE_META.manager;
  const Icon = KIND_ICON[e.kind] || CalendarOutlined;
  const alert = e.severity === 'critical' ? token.colorError : e.severity === 'warning' ? token.colorWarning : null;
  const long = (e.detail || '').length > LONG_DETAIL;
  return (
    <li className="grid grid-cols-[48px_32px_minmax(0,1fr)] gap-x-2 py-2.5" style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}>
      <Text type="secondary" className="!text-xs tabular-nums pt-1.5">
        {dayjs(e.at).format('HH:mm')}
      </Text>
      <span
        className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px]"
        style={{ background: alert ? `${alert}1f` : token.colorFillTertiary, color: alert || token.colorTextSecondary }}
        aria-hidden="true"
      >
        <Icon />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium" style={{ color: token.colorText }}>
            {e.title}
          </span>
          {e.upcoming && (
            <Tag color="gold" className="!m-0">
              Sắp tới
            </Tag>
          )}
        </div>
        {e.detail && (
          <div className={`mt-0.5 text-[13px] ${open ? '' : 'line-clamp-2'}`} style={{ color: token.colorTextSecondary }}>
            {e.detail}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Tag color={meta.color} className="!m-0 !text-[11px]">
            {meta.label}
          </Tag>
          {e.actor && (
            <Text type="secondary" className="!text-xs">
              {e.actor}
            </Text>
          )}
          {long && (
            <Button type="link" size="small" className="!h-auto !p-0 !text-xs" onClick={onToggle}>
              {open ? 'Thu gọn' : 'Xem thêm'}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Everything each role did to this horse, in order. Each role's own screens show only its slice;
 * here a groom's report, the vet's exam and the trainer's session sit on one line of time, which
 * is what shows how one leads to the next. What is booked ahead comes first; the rest by day, ten
 * at a time, a long detail folded until asked for.
 */
export default function HorseTimeline({ horseId }) {
  const { token } = theme.useToken();
  const [days, setDays] = useState(14);
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(() => new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['horse-timeline', horseId, days],
    queryFn: () => horsesApi.timeline(horseId, { days }),
    enabled: Boolean(horseId),
  });

  const events = (data?.data?.events || []).filter((e) => role === 'all' || e.role === role);
  // Ahead first, soonest first; then what happened, newest first.
  const upcoming = events.filter((e) => e.upcoming).sort((a, b) => new Date(a.at) - new Date(b.at));
  const past = events.filter((e) => !e.upcoming);
  const pages = Math.max(1, Math.ceil(past.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = past.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const keyOf = (e) => `${e.kind}-${e.refId}-${e.at}`;
  const toggle = (e) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(keyOf(e))) next.delete(keyOf(e));
      else next.add(keyOf(e));
      return next;
    });
  const row = (e) => <EventRow key={keyOf(e)} e={e} open={open.has(keyOf(e))} onToggle={() => toggle(e)} token={token} />;

  return (
    <Card
      loading={isLoading}
      title={
        <span className="flex items-center gap-2">
          Dòng thời gian
          {events.length > 0 && <Tag className="!m-0">{events.length} hoạt động</Tag>}
        </span>
      }
      extra={
        <Select
          size="small"
          value={days}
          onChange={(v) => {
            setDays(v);
            setPage(1);
          }}
          options={RANGE_OPTIONS}
          className="w-24"
          aria-label="Khoảng thời gian"
        />
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Text type="secondary" className="!text-xs max-w-xl">
          Buổi tập, khám và điều trị, việc chăm sóc, sự cố và giải đua của ngựa — do cả ba bộ phận ghi lại.
        </Text>
        <Segmented
          size="small"
          options={ROLE_FILTERS}
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
        />
      </div>

      {events.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có hoạt động nào trong khoảng thời gian này." />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="mb-4 rounded-lg px-3 pt-2" style={{ background: token.colorWarningBg, border: `1px solid ${token.colorWarningBorder}` }}>
              <div className="pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: token.colorWarningText }}>
                Sắp tới · {upcoming.length}
              </div>
              <ul className="m-0 list-none p-0 [&>li:first-child]:!border-t-0">{upcoming.map(row)}</ul>
            </div>
          )}

          {byDay(shown).map((g) => (
            <section key={g.key} className="mb-2">
              <div className="flex items-baseline gap-2 py-1.5">
                <span className="text-[13px] font-semibold" style={{ color: token.colorText }}>
                  {dayLabel(g.at)}
                </span>
                <Text type="secondary" className="!text-xs tabular-nums">
                  {dayjs(g.at).format('DD/MM/YYYY')} · {g.items.length} hoạt động
                </Text>
              </div>
              <ul className="m-0 list-none p-0">{g.items.map(row)}</ul>
            </section>
          ))}

          {past.length > PAGE_SIZE && (
            <div className="mt-3 flex justify-end">
              <Pagination
                size="small"
                current={current}
                pageSize={PAGE_SIZE}
                total={past.length}
                onChange={setPage}
                showSizeChanger={false}
                showTotal={(total, [from, to]) => `${from}–${to} / ${total} hoạt động`}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
