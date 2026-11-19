import { useMemo, useState } from 'react';
import { Button, Card, Empty, Input, Segmented, Tag, Typography, theme } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  HeartOutlined,
  MedicineBoxOutlined,
  RightOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { horsesApi } from './horsesApi';
import { fold } from '../../utils/fold';

const { Text } = Typography;

// One colour & icon per role so cross-department hand-offs read clearly down the timeline.
const ROLE_META = {
  head_trainer: { label: 'Huấn luyện viên', short: 'HLV', color: 'blue', dot: '#2563eb', icon: <ThunderboltOutlined /> },
  veterinarian: { label: 'Bác sĩ thú y', short: 'Bác sĩ', color: 'magenta', dot: '#db2777', icon: <MedicineBoxOutlined /> },
  groom: { label: 'NV chăm sóc', short: 'Chăm sóc', color: 'green', dot: '#16a34a', icon: <HeartOutlined /> },
  manager: { label: 'Quản lý CLB', short: 'Quản lý', color: 'purple', dot: '#7c3aed', icon: <TrophyOutlined /> },
};

const ROLE_FILTERS = [
  { value: 'all', label: 'Tất cả bộ phận' },
  { value: 'head_trainer', label: 'HLV' },
  { value: 'veterinarian', label: 'Bác sĩ' },
  { value: 'groom', label: 'Chăm sóc' },
];
const RANGE_OPTIONS = [
  { value: 7, label: '7 ngày' },
  { value: 14, label: '14 ngày' },
  { value: 30, label: '30 ngày' },
  { value: 90, label: '90 ngày' },
];
const PAGE_SIZE = 10;
const LONG_DETAIL = 140;
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const SEVERITY_META = {
  critical: { label: 'Khẩn cấp', color: 'error', border: '#ef4444' },
  warning: { label: 'Cần lưu ý', color: 'warning', border: '#f59e0b' },
};

function formatDayGroupHeader(d) {
  const date = dayjs(d);
  const today = dayjs();
  if (date.isSame(today, 'day')) return `Hôm nay · ${date.format('DD/MM/YYYY')}`;
  if (date.isSame(today.subtract(1, 'day'), 'day')) return `Hôm qua · ${date.format('DD/MM/YYYY')}`;
  if (date.isSame(today.add(1, 'day'), 'day')) return `Ngày mai · ${date.format('DD/MM/YYYY')}`;
  const weekdays = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return `${weekdays[date.day()]} · ${date.format('DD/MM/YYYY')}`;
}

/** Deep-link target from a timeline event so staff can jump straight to the underlying session/race/task. */
function actionForEvent(event, horseId) {
  const kind = String(event.kind || '').toLowerCase();
  if (kind.includes('session') || kind.includes('train') || event.role === 'head_trainer') {
    const query = event.refId ? `?horse=${horseId}&session=${event.refId}` : `?horse=${horseId}`;
    return { to: `/training/sessions${query}`, label: 'Xem buổi tập' };
  }
  if (kind.includes('race')) {
    return { to: `/races?horse=${horseId}`, label: 'Xem giải đua' };
  }
  if (kind.includes('feed') || kind.includes('task') || kind.includes('care') || event.role === 'groom') {
    return { to: `/stable/tasks?horse=${horseId}`, label: 'Khẩu phần & chăm sóc' };
  }
  return null;
}

/**
 * Interactive cross-department timeline for a horse:
 * - Clickable KPI summary strip (Tổng hoạt động | Huấn luyện | Y tế | Chăm sóc | Sắp tới / Cảnh báo)
 * - Fast text search + 7/14/30/90-day range selector + role filter
 * - Day-grouped event cards with status badges, actor attribution, and direct deep-links
 */
export default function HorseTimeline({ horseId }) {
  const { token } = theme.useToken();
  const [days, setDays] = useState(14);
  const [role, setRole] = useState('all');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['horse-timeline', horseId, days],
    queryFn: () => horsesApi.timeline(horseId, { days }),
    enabled: Boolean(horseId),
  });

  const allEvents = useMemo(() => data?.data?.events || [], [data]);

  const counts = useMemo(() => {
    const c = { all: allEvents.length, head_trainer: 0, veterinarian: 0, groom: 0, flagged: 0 };
    for (const e of allEvents) {
      if (c[e.role] !== undefined) c[e.role] += 1;
      if (e.upcoming || e.severity === 'warning' || e.severity === 'critical') c.flagged += 1;
    }
    return c;
  }, [allEvents]);

  const q = fold(search.trim());
  const filtered = useMemo(
    () =>
      allEvents.filter((e) => {
        if (role !== 'all' && e.role !== role) return false;
        if (onlyFlagged && !(e.upcoming || e.severity === 'warning' || e.severity === 'critical')) return false;
        if (q) {
          const hay = fold(`${e.title || ''} ${e.detail || ''} ${e.actor || ''} ${ROLE_META[e.role]?.label || ''}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [allEvents, role, onlyFlagged, q],
  );

  // Group events by calendar day (YYYY-MM-DD) while preserving server order within each day.
  const groupedDays = useMemo(() => {
    const map = new Map();
    for (const e of filtered) {
      const key = dayjs(e.at).format('YYYY-MM-DD');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return [...map.entries()];
  }, [filtered]);

  const kpiCards = [
    { key: 'all', label: 'Tổng hoạt động', count: counts.all, dot: '#eab308', active: role === 'all' && !onlyFlagged, onClick: () => { setRole('all'); setOnlyFlagged(false); } },
    { key: 'head_trainer', label: 'Huấn luyện (HLV)', count: counts.head_trainer, dot: ROLE_META.head_trainer.dot, active: role === 'head_trainer' && !onlyFlagged, onClick: () => { setRole('head_trainer'); setOnlyFlagged(false); } },
    { key: 'veterinarian', label: 'Khám & điều trị', count: counts.veterinarian, dot: ROLE_META.veterinarian.dot, active: role === 'veterinarian' && !onlyFlagged, onClick: () => { setRole('veterinarian'); setOnlyFlagged(false); } },
    { key: 'groom', label: 'Chăm sóc & khẩu phần', count: counts.groom, dot: ROLE_META.groom.dot, active: role === 'groom' && !onlyFlagged, onClick: () => { setRole('groom'); setOnlyFlagged(false); } },
    { key: 'flagged', label: 'Sắp tới & lưu ý', count: counts.flagged, dot: '#f59e0b', active: onlyFlagged, onClick: () => setOnlyFlagged((v) => !v) },
  ];

  return (
    <Card
      className="!mb-4 !rounded-xl !border-[#E2D9C8]"
      loading={isLoading}
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span>Dòng thời gian</span>
          <Tag className="!m-0 font-normal tabular-nums">{filtered.length} sự kiện</Tag>
        </div>
      }
      extra={
        <Segmented
          size="small"
          options={RANGE_OPTIONS}
          value={days}
          onChange={setDays}
          aria-label="Khoảng thời gian dòng sự kiện"
        />
      }
    >
      {/* Clickable summary KPI filter pills */}
      <div className="mb-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left transition-all"
            style={{
              borderRadius: 10,
              borderColor: item.active ? '#eab308' : token.colorBorderSecondary,
              background: item.active ? 'rgba(234, 179, 8, 0.12)' : token.colorFillQuaternary,
              color: token.colorText,
            }}
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color: token.colorTextSecondary }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.dot }} />
                <span className="truncate">{item.label}</span>
              </div>
              <div className="mt-0.5 text-base font-bold tabular-nums leading-tight">{item.count}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Toolbar: context note, instant search, and department filter */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 border-b pb-3" style={{ borderColor: token.colorBorderSecondary }}>
        <Text type="secondary" className="!text-xs">
          Buổi tập, khám và điều trị, việc chăm sóc, sự cố và giải đua của ngựa này — do cả ba bộ phận ghi lại.
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            size="small"
            allowClear
            prefix={<SearchOutlined className="opacity-50" />}
            placeholder="Tìm buổi tập, bác sĩ, ghi chú…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!w-52"
            aria-label="Tìm trong dòng thời gian"
          />
          <Segmented size="small" options={ROLE_FILTERS} value={role} onChange={(v) => { setRole(v); setOnlyFlagged(false); }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-6 text-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              allEvents.length > 0
                ? 'Không có sự kiện nào khớp bộ lọc đang chọn.'
                : `Chưa có hoạt động nào được ghi nhận trong ${days} ngày qua.`
            }
          />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {(role !== 'all' || onlyFlagged || search) && (
              <Button size="small" onClick={() => { setRole('all'); setOnlyFlagged(false); setSearch(''); }}>
                Xóa bộ lọc ({allEvents.length} sự kiện)
              </Button>
            )}
            {days < 90 && (
              <Button size="small" icon={<ClockCircleOutlined />} onClick={() => setDays(days < 30 ? 30 : 90)}>
                Mở rộng lên {days < 30 ? '30 ngày' : '90 ngày'}
              </Button>
            )}
            <Link to={`/training/sessions?horse=${horseId}`}>
              <Button size="small" type="primary" icon={<CalendarOutlined />}>
                Xem & xếp lịch tập
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedDays.map(([dayKey, dayEvents]) => (
            <div key={dayKey}>
              {/* Sticky-style day header */}
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums"
                  style={{ borderColor: token.colorBorderSecondary, background: token.colorFillQuaternary }}
                >
                  <CalendarOutlined className="text-[11px] opacity-70" />
                  {formatDayGroupHeader(dayKey)}
                </span>
                <span className="text-[11px] tabular-nums" style={{ color: token.colorTextTertiary }}>
                  {dayEvents.length} hoạt động
                </span>
              </div>

              {/* Structured event cards along a clean left guide rail */}
              <div className="ml-3 space-y-2 border-l-2 pl-3.5" style={{ borderColor: token.colorBorderSecondary }}>
                {dayEvents.map((e) => {
                  const meta = ROLE_META[e.role] || ROLE_META.manager;
                  const sev = SEVERITY_META[e.severity];
                  const link = actionForEvent(e, horseId);
                  return (
                    <div
                      key={`${e.kind}-${e.refId}-${e.at}`}
                      className="relative rounded-lg border px-3.5 py-2.5 transition-colors"
                      style={{
                        borderColor: sev ? sev.border : token.colorBorderSecondary,
                        background: token.colorBgContainer,
                      }}
                    >
                      {/* Colored timeline dot on the guide rail */}
                      <span
                        className="absolute -left-[20px] top-3.5 h-2.5 w-2.5 rounded-full ring-2"
                        style={{ background: sev ? sev.border : meta.dot, ringColor: token.colorBgContainer }}
                        aria-hidden="true"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: token.colorTextSecondary }}>
                            {dayjs(e.at).format('HH:mm')}
                          </span>
                          <Tag color={meta.color} className="!m-0 inline-flex items-center gap-1 text-xs">
                            {meta.icon}
                            <span>{meta.label}</span>
                          </Tag>
                          {e.upcoming && (
                            <Tag color="gold" className="!m-0 inline-flex items-center gap-1 text-xs">
                              <ClockCircleOutlined />
                              Sắp tới
                            </Tag>
                          )}
                          {sev && (
                            <Tag color={sev.color} className="!m-0 inline-flex items-center gap-1 text-xs">
                              <WarningOutlined />
                              {sev.label}
                            </Tag>
                          )}
                          {e.actor && (
                            <span className="text-xs" style={{ color: token.colorTextTertiary }}>
                              · {e.actor}
                            </span>
                          )}
                        </div>

                        {link && (
                          <Link
                            to={link.to}
                            className="inline-flex items-center gap-1 text-xs font-medium no-underline hover:underline"
                            style={{ color: token.colorPrimary }}
                          >
                            {link.label}
                            <RightOutlined className="text-[10px]" />
                          </Link>
                        )}
                      </div>

                      <div className="mt-1 flex items-start gap-1.5 text-sm font-semibold">
                        {!e.upcoming && !sev && <CheckCircleOutlined className="mt-0.5 shrink-0 text-xs text-emerald-500" />}
                        <span>{e.title}</span>
                      </div>

                      {e.detail && (
                        <div className="mt-0.5 text-xs leading-relaxed" style={{ color: token.colorTextSecondary }}>
                          {e.detail}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
