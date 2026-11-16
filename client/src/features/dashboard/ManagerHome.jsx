import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Button } from 'antd';
import {
  AlertOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  CheckSquareOutlined,
  HeartOutlined,
  HomeOutlined,
  InboxOutlined,
  PieChartOutlined,
  PlusOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserAddOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { horsesApi } from '../horses/horsesApi';
import { usersApi } from '../admin/usersApi';
import { inventoryApi } from '../inventory/inventoryApi';
import { financeApi } from '../finance/financeApi';
import { categoryLabel } from '../finance/financeLabels';
import { dailyTaskApi, incidentApi, stallApi } from '../stable/stableApi';
import { TASK_TYPE_LABELS } from '../../constants/care';
import { Card, EmptyNote, HorseAvatar, OwnerPage, Pill } from '../owner/kit';
import { money } from '../owner/ownerFormat';
import { Columns, DashHero, KpiRow, KpiTile, MeterList, RankBars, SplitBar, compactVnd, usePager, greeting, inBucket, lastMonths, todayLong } from './dashKit';

const listOf = (q) => q.data?.data || [];
const ASSIGNMENT_KEYS = ['owner', 'trainer', 'vet', 'stall'];
const HEALTH = [
  { key: 'eligible', label: 'Đủ điều kiện', tone: 'good' },
  { key: 'monitoring', label: 'Cần theo dõi', tone: 'watch' },
  { key: 'injured', label: 'Chấn thương', tone: 'bad' },
  { key: 'quarantined', label: 'Cách ly', tone: 'quar' },
];
// Stock shown when it runs out within a week of use, or goes off within two.
const SHORT_DAYS = 7;
const EXPIRY_DAYS = 14;
const STABLES = '/admin/stables';
const signedVnd = (n) => `${n >= 0 ? '+' : '−'}${compactVnd(Math.abs(n))}`;
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * The Club Manager's home: the month's result in one band, the club in four figures, the money of the
 * last six months and where it went, what is waiting on the manager and the store, then the herd's
 * health, today's care work and the stables, and the incidents the grooms reported.
 */
export default function ManagerHome() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const today = dayjs().format('YYYY-MM-DD');
  const horsesQ = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const checkQ = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });
  const usersQ = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const inventoryQ = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const forecastQ = useQuery({ queryKey: ['inventory-forecast'], queryFn: () => inventoryApi.forecast() });
  const stallsQ = useQuery({ queryKey: ['stalls'], queryFn: () => stallApi.map() });
  const financeQ = useQuery({ queryKey: ['finance'], queryFn: () => financeApi.list() });
  const tasksQ = useQuery({ queryKey: ['daily-tasks', 'day', today], queryFn: () => dailyTaskApi.list({ date: today }), refetchInterval: 60000 });
  const incidentsQ = useQuery({ queryKey: ['incidents', 'unresolved'], queryFn: () => incidentApi.list({ status: 'unresolved' }) });

  const horses = listOf(horsesQ);
  const items = listOf(inventoryQ);
  const stalls = useMemo(() => stallsQ.data?.data?.stalls || [], [stallsQ.data]);
  const records = useMemo(() => financeQ.data?.data || [], [financeQ.data]);
  const tasks = useMemo(() => tasksQ.data?.data || [], [tasksQ.data]);
  const incidents = listOf(incidentsQ);
  const requests = items.flatMap((i) => (i.restockRequests || []).map((r) => ({ ...r, item: i })));
  const usedStalls = stalls.filter((s) => s.occupied).length;
  const ready = horses.filter((h) => h.healthStatus === 'eligible' && !h.trainingClearance?.restricted).length;
  const herd = HEALTH.map((h) => ({ ...h, value: horses.filter((x) => x.healthStatus === h.key).length }));
  const restricted = horses.filter((h) => h.trainingClearance?.restricted);

  const queue = [
    {
      key: 'accounts',
      icon: <UserAddOutlined />,
      tone: 'watch',
      label: 'Tài khoản chờ duyệt',
      short: 'tài khoản',
      desc: 'Nhân viên, bác sĩ hoặc chủ ngựa mới đăng ký',
      count: listOf(usersQ).filter((u) => u.approvalStatus === 'pending').length,
      to: '/admin/users',
      loading: usersQ.isPending,
    },
    {
      key: 'restock',
      icon: <ShoppingCartOutlined />,
      tone: 'bad',
      label: 'Đề xuất vật tư chờ duyệt',
      short: 'đề xuất vật tư',
      desc: 'Từ nhân viên chăm sóc, HLV và bác sĩ',
      count: requests.filter((r) => r.status === 'pending').length,
      to: '/inventory',
      loading: inventoryQ.isPending,
    },
    {
      key: 'delivery',
      icon: <InboxOutlined />,
      tone: 'info',
      label: 'Hàng đã duyệt, chờ nhận',
      short: 'lô hàng chờ nhận',
      desc: 'Kiểm đếm và ghi hạn sử dụng khi hàng về',
      count: requests.filter((r) => r.status === 'approved' && r.awaitingDelivery && !r.receivedAt).length,
      to: '/inventory',
      loading: inventoryQ.isPending,
    },
    {
      key: 'assignment',
      icon: <ApartmentOutlined />,
      tone: 'watch',
      label: 'Ngựa thiếu phân công',
      short: 'ngựa thiếu phân công',
      desc: 'Thiếu chủ, HLV, bác sĩ hoặc chuồng',
      count: listOf(checkQ).filter((r) => r.items.some((i) => ASSIGNMENT_KEYS.includes(i.key) && !i.done)).length,
      to: '/horses',
      loading: checkQ.isPending,
    },
  ];
  const waiting = queue.reduce((n, q) => n + q.count, 0);

  // The store: what runs out by the forecast of daily use, then what goes off, by the item or a batch.
  const short = (forecastQ.data?.data || []).filter((f) => f.isActive !== false && (f.quantity <= 0 || (f.reorderLevel > 0 && f.quantity <= f.reorderLevel) || (f.daysLeft != null && f.daysLeft < SHORT_DAYS)));
  const shortIds = new Set(short.map((f) => String(f._id)));
  const expiryOf = (i) =>
    [i.expiryDate, ...(i.batches || []).filter((b) => b.qty > 0).map((b) => b.expiryDate)]
      .filter(Boolean)
      .map((d) => dayjs(d))
      .sort((x, y) => x - y)[0];
  const stock = [
    ...short.map((f) => {
      const out = f.quantity <= 0;
      const byDays = f.daysLeft != null;
      return {
        key: `low-${f._id}`,
        label: f.name,
        sub: `Còn ${f.quantity} ${f.unit || ''}${f.dailyUsage > 0 ? ` · dùng ${f.dailyUsage}/ngày` : f.reorderLevel ? ` · mức đặt lại ${f.reorderLevel}` : ''}`,
        value: out ? 0 : byDays ? f.daysLeft : f.quantity,
        max: byDays ? SHORT_DAYS * 2 : Math.max(f.reorderLevel * 2, 1),
        tone: out || (byDays && f.daysLeft < 3) ? 'bad' : 'watch',
        display: out ? 'Đã hết' : byDays ? (f.daysLeft < 1 ? '< 1 ngày' : `~${f.daysLeft} ngày`) : 'Dưới mức',
        rank: out ? 0 : 1,
      };
    }),
    ...items
      .filter((i) => i.isActive !== false && !shortIds.has(String(i._id)))
      .map((i) => ({ i, exp: expiryOf(i) }))
      .filter(({ exp }) => exp && exp.startOf('day').diff(dayjs().startOf('day'), 'day') <= EXPIRY_DAYS)
      .map(({ i, exp }) => {
        const days = exp.startOf('day').diff(dayjs().startOf('day'), 'day');
        return {
          key: `exp-${i._id}`,
          label: i.name,
          sub: `Hạn dùng ${exp.format('DD/MM/YYYY')} · còn ${i.quantity} ${i.unit || ''}`,
          value: Math.max(days, 0),
          max: EXPIRY_DAYS,
          tone: days < 3 ? 'bad' : 'watch',
          display: days < 0 ? 'Hết hạn' : `HSD ${days} ngày`,
          rank: days < 0 ? 0 : 2,
        };
      }),
  ]
    .sort((a, b) => a.rank - b.rank || a.value - b.value)
    .map((s) => ({ ...s, to: '/inventory' }));

  // Money: the last six months side by side, this month's result, and the year's costs by category.
  const money6 = useMemo(
    () =>
      lastMonths(6).map((b) => {
        const list = records.filter((r) => inBucket(r.date, b));
        const revenue = list.filter((r) => r.type === 'revenue').reduce((t, r) => t + r.amount, 0);
        const cost = list.filter((r) => r.type === 'cost').reduce((t, r) => t + r.amount, 0);
        return { ...b, revenue, cost, net: revenue - cost };
      }),
    [records],
  );
  const month = money6[money6.length - 1];
  const sixNet = money6.reduce((t, m) => t + m.net, 0);
  const costRows = useMemo(() => {
    const by = new Map();
    records.filter((r) => r.type === 'cost' && dayjs(r.date).isSame(dayjs(), 'year')).forEach((r) => by.set(r.category, (by.get(r.category) || 0) + r.amount));
    return [...by.entries()].map(([k, v]) => ({ key: k, label: capFirst(categoryLabel(k)), value: v, display: compactVnd(v), to: '/finance' })).sort((a, b) => b.value - a.value);
  }, [records]);
  const yearCost = costRows.reduce((t, r) => t + r.value, 0);

  // Today's care work by kind: done against all, missed in red.
  const isMissed = (t) => t.status === 'skipped' || (t.status !== 'completed' && t.timing?.state === 'missed');
  const careRows = useMemo(() => {
    const by = new Map();
    tasks.forEach((t) => {
      const row = by.get(t.taskType) || { done: 0, missed: 0, total: 0 };
      row.total += 1;
      if (t.status === 'completed') row.done += 1;
      else if (isMissed(t)) row.missed += 1;
      by.set(t.taskType, row);
    });
    return [...by.entries()]
      .map(([k, r]) => ({
        key: k,
        label: TASK_TYPE_LABELS[k] || 'Khác',
        sub: r.missed ? `${r.missed} việc bỏ lỡ` : r.total - r.done ? `${r.total - r.done} việc còn lại` : 'Đã xong hết',
        value: r.done,
        max: r.total,
        tone: r.missed ? 'bad' : 'good',
        display: `${r.done}/${r.total}`,
        total: r.total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [tasks]);
  const careDone = tasks.filter((t) => t.status === 'completed').length;
  const careMissed = tasks.filter(isMissed).length;

  const zones = useMemo(() => {
    const by = new Map();
    stalls.forEach((s) => {
      const row = by.get(s.zone) || { name: s.zoneName || `Khu ${s.zone}`, used: 0, total: 0 };
      row.total += 1;
      if (s.occupied) row.used += 1;
      by.set(s.zone, row);
    });
    return [...by.entries()].map(([k, z]) => ({
      key: k,
      label: z.name,
      sub: `${z.total - z.used} chuồng trống`,
      value: z.used,
      max: z.total,
      tone: z.used >= z.total ? 'watch' : 'series',
      display: `${z.used}/${z.total}`,
      to: STABLES,
    }));
  }, [stalls]);

  const costPage = usePager(costRows, 6);
  const stockPage = usePager(stock, 5);
  const carePage = usePager(careRows, 5);
  const zonePage = usePager(zones, 5);
  const heldPage = usePager(restricted, 3);
  const incidentPage = usePager(incidents, 5);

  const summary = horsesQ.isPending
    ? 'Đang tải…'
    : [
        `${horses.length} ngựa, ${ready} sẵn sàng tập`,
        waiting ? `${waiting} việc chờ bạn duyệt` : 'không có việc chờ duyệt',
        stock.length ? `${stock.length} vật tư cần chú ý` : 'kho đủ dùng',
        incidents.length ? `${incidents.length} sự cố chưa xử lý` : null,
      ]
        .filter(Boolean)
        .join(' · ') + '.';

  return (
    <OwnerPage>
      <DashHero
        eyebrow={`Quản lý câu lạc bộ · ${todayLong()}`}
        title={`${greeting()}, ${user?.name || 'Quản lý'}`}
        sub={summary}
        actions={
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/horses?new=1')}>
              Thêm ngựa
            </Button>
            <Button onClick={() => navigate('/admin/reports')}>Báo cáo vận hành</Button>
            <Button onClick={() => navigate('/finance')}>Thu chi</Button>
          </>
        }
        figure={{
          label: `Kết quả tháng ${dayjs().month() + 1}`,
          value: financeQ.isPending ? '—' : signedVnd(month?.net || 0),
          sub: financeQ.isPending ? null : `Thu ${money(month?.revenue || 0)} · chi ${money(month?.cost || 0)}`,
        }}
      />

      <KpiRow>
        <KpiTile
          icon={<TeamOutlined />}
          tone="good"
          label="Đàn ngựa"
          value={horsesQ.isPending ? '—' : horses.length}
          unit="ngựa"
          sub={`${ready} sẵn sàng tập · ${restricted.length} bị hạn chế`}
          split={herd}
          to="/horses"
        />
        <KpiTile
          icon={<HomeOutlined />}
          label="Chuồng đang dùng"
          value={stallsQ.isPending ? '—' : usedStalls}
          unit={stalls.length ? `/ ${stalls.length}` : null}
          sub={stalls.length ? `${stalls.length - usedStalls} chuồng trống · lấp đầy ${Math.round((usedStalls / stalls.length) * 100)}%` : 'Chưa khai báo chuồng'}
          meter={{
            value: usedStalls,
            max: stalls.length || 1,
            tone: 'series',
            caption: stalls.length ? (
              <>
                <span>{usedStalls} có ngựa</span>
                <span>{stalls.length - usedStalls} trống</span>
              </>
            ) : null,
          }}
          to={STABLES}
        />
        <KpiTile
          icon={<CheckSquareOutlined />}
          tone={careMissed ? 'bad' : 'good'}
          label="Chăm sóc hôm nay"
          value={tasksQ.isPending ? '—' : careDone}
          unit={tasks.length ? `/ ${tasks.length} việc` : null}
          sub={careMissed ? `${careMissed} việc bị bỏ lỡ` : tasks.length ? `${tasks.length - careDone} việc còn lại` : 'Hôm nay chưa có việc'}
          split={[
            { key: 'done', label: 'Đã làm', value: careDone, tone: 'good' },
            { key: 'todo', label: 'Còn lại', value: Math.max(0, tasks.length - careDone - careMissed), tone: 'neutral' },
            { key: 'missed', label: 'Bỏ lỡ', value: careMissed, tone: 'bad' },
          ]}
        />
        <KpiTile
          icon={<AlertOutlined />}
          tone={waiting ? 'watch' : 'good'}
          label="Việc chờ bạn duyệt"
          value={waiting}
          unit="việc"
          sub={
            waiting
              ? queue
                  .filter((q) => q.count)
                  .map((q) => `${q.count} ${q.short}`)
                  .join(' · ')
              : 'Đã giải quyết hết'
          }
          chart={{
            data: [
              ['accounts', 'Tài khoản'],
              ['restock', 'Vật tư'],
              ['delivery', 'Nhận hàng'],
              ['assignment', 'Phân công'],
            ].map(([k, l]) => ({ key: k, label: l, full: queue.find((q) => q.key === k).label, value: queue.find((q) => q.key === k).count })),
            label: 'Số việc',
            caption: 'Việc chờ theo loại',
          }}
        />
      </KpiRow>

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
          <div className="dk-chart-head">
            <b>{signedVnd(sixNet)}</b>
            <span>{sixNet >= 0 ? 'còn lại sau 6 tháng' : 'chi vượt thu trong 6 tháng'}</span>
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
            label="Thu và chi của câu lạc bộ trong 6 tháng gần nhất"
          />
        </Card>

        <Card title={`Chi theo hạng mục · ${dayjs().year()}`} icon={<PieChartOutlined />}>
          <div className="dk-chart-head">
            <b>{compactVnd(yearCost)}</b>
            <span>tổng chi năm nay</span>
          </div>
          <RankBars rows={costPage.rows} max={costRows[0]?.value} empty="Chưa có khoản chi nào trong năm." />
          {costPage.pager}
        </Card>
      </div>

      <div className="own-grid-main">
        <Card title="Việc đang chờ bạn" icon={<AlertOutlined />} flush>
          <ul className="own-list">
            {queue.map((q) => (
              <li key={q.key}>
                <Link to={q.to} className="own-row own-mq">
                  <span className={`own-icon is-${q.count ? q.tone : 'good'}`}>{q.icon}</span>
                  <div className="own-row-main">
                    <div className="own-row-title">{q.label}</div>
                    <div className="own-row-sub">{q.desc}</div>
                  </div>
                  <span className={`own-mq-count${q.count ? ` is-${q.tone}` : ''}`}>{q.loading ? '…' : q.count || '✓'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Kho cần chú ý"
          icon={<WarningOutlined />}
          extra={
            <Link to="/inventory" className="text-xs font-semibold">
              Mở kho
            </Link>
          }
        >
          {stock.length === 0 ? <EmptyNote>{forecastQ.isPending ? 'Đang tải…' : 'Không có vật tư sắp hết hay sắp hết hạn.'}</EmptyNote> : <MeterList rows={stockPage.rows} />}
          {stockPage.pager}
        </Card>
      </div>

      <div className="dk-grid-3">
        <Card title="Sức khỏe đàn ngựa" icon={<HeartOutlined />}>
          <div className="flex flex-col gap-3">
            <SplitBar parts={herd} />
            {restricted.length > 0 && (
              <ul className="own-list own-list-inset">
                {heldPage.rows.map((h) => (
                  <li key={h._id}>
                    <Link to={`/horses/${h._id}`} className="own-row">
                      <HorseAvatar horse={h} size={28} />
                      <div className="own-row-main">
                        <div className="own-row-title">{h.name}</div>
                        <div className="own-row-sub own-hs-sub">{h.trainingClearance.reason || h.trainingClearance.label}</div>
                      </div>
                      <Pill tone={h.trainingClearance.level === 'none' ? 'bad' : 'watch'}>{h.trainingClearance.level === 'none' ? 'Khóa tập' : 'Hạn chế'}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {heldPage.pager}
        </Card>

        <Card title="Chăm sóc hôm nay theo việc" icon={<CheckSquareOutlined />}>
          {careRows.length === 0 ? <EmptyNote>{tasksQ.isPending ? 'Đang tải…' : 'Hôm nay chưa có việc chăm sóc nào.'}</EmptyNote> : <MeterList rows={carePage.rows} />}
          {carePage.pager}
        </Card>

        <Card
          title="Chuồng theo khu"
          icon={<HomeOutlined />}
          extra={
            <Link to={STABLES} className="text-xs font-semibold">
              Sơ đồ chuồng
            </Link>
          }
        >
          {zones.length === 0 ? <EmptyNote>{stallsQ.isPending ? 'Đang tải…' : 'Chưa khai báo khu chuồng nào.'}</EmptyNote> : <MeterList rows={zonePage.rows} />}
          {zonePage.pager}
        </Card>
      </div>

      {incidents.length > 0 && (
        <Card title="Sự cố chưa xử lý" icon={<AlertOutlined />} flush extra={<Pill tone="bad">{incidents.length}</Pill>}>
          <ul className="own-list">
            {incidentPage.rows.map((t) => (
              <li key={t._id}>
                <Link to={`/horses/${t.horse?._id || t.horse}`} className="own-row items-center">
                  <HorseAvatar horse={t.horse} size={30} />
                  <div className="own-row-main">
                    <div className="own-row-title">{t.horse?.name || 'Ngựa'}</div>
                    <div className="own-row-sub own-hs-sub">{t.incidentReport?.description || 'Sự cố'}</div>
                  </div>
                  <div className="own-row-side">
                    <Pill tone={t.incidentReport?.status === 'acknowledged' ? 'info' : 'bad'}>{t.incidentReport?.status === 'acknowledged' ? 'Bác sĩ đã tiếp nhận' : 'Chờ bác sĩ'}</Pill>
                    <span className="own-faint text-xs">{dayjs(t.incidentReport?.reportedAt || t.updatedAt).format('DD/MM HH:mm')}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {incidentPage.pager}
        </Card>
      )}
    </OwnerPage>
  );
}
