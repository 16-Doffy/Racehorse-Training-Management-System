import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Button } from 'antd';
import { AlertOutlined, BarChartOutlined, CalendarOutlined, CheckCircleOutlined, FlagOutlined, NodeIndexOutlined, PlusOutlined, ScheduleOutlined, StarOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { horsesApi } from '../horses/horsesApi';
import { trainingPlanApi, trainingSessionApi } from '../training/trainingApi';
import { raceApi } from '../race/raceApi';
import { PHASE_LABELS, SESSION_KINDS } from '../training/trainingVocab';
import { SESSION_STATUS_LABELS } from '../training/sessionStatus';
import PlanTimeline from '../training/PlanTimeline';
import { whereNow } from '../training/PlanFocusPanel';
import { Card, EmptyNote, HorseAvatar, OwnerPage, Pill } from '../owner/kit';
import { Columns, DashHero, KpiRow, KpiTile, RankBars, deltaOf, usePager, greeting, inBucket, lastDays, lastWeeks, todayLong } from './dashKit';

const listOf = (q) => q.data?.data || [];
const idOf = (x) => String(x?._id || x || '');
const DONE = ['completed', 'evaluated'];
const SESSION_TONE = { scheduled: 'info', ready: 'info', blocked: 'watch', in_progress: 'bad', completed: 'good', evaluated: 'good', aborted: 'bad', missed: 'neutral', cancelled: 'neutral' };
const FORM_TONE = { ready: 'good', on_track: 'info', not_ready: 'watch', blocked: 'bad', pending: 'neutral' };
const TONE_RANK = { bad: 0, watch: 1, info: 2, neutral: 3 };
const ranAt = (s) => s.actualStartAt || s.scheduledAt;
const km = (list) => Math.round(list.reduce((t, s) => t + (s.metrics?.distance || 0), 0) / 100) / 10;
const daysTo = (d) => dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day');

/** A row of a card: a lead, a title and a line under it, something on the right; the whole row a link. */
function Line({ to, lead, title, sub, side }) {
  return (
    <Link to={to} className="own-row items-center">
      {lead}
      <div className="own-row-main">
        <div className="own-row-title">{title}</div>
        {sub && <div className="own-row-sub own-hs-sub">{sub}</div>}
      </div>
      {side && <div className="own-row-side">{side}</div>}
    </Link>
  );
}

/**
 * The Head Trainer's home: the day in one band (today's sessions done), four figures with their trend,
 * today's sessions on a timeline beside what waits on the trainer, the training load of the last two
 * weeks and how each horse is rated, then each plan's progress and the races ahead.
 */
export default function TrainerHome() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const horsesQ = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const sessionsQ = useQuery({ queryKey: ['training-sessions'], queryFn: () => trainingSessionApi.list() });
  const plansQ = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const racesQ = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  const checkQ = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });
  const horses = listOf(horsesQ);
  const sessions = useMemo(() => sessionsQ.data?.data || [], [sessionsQ.data]);
  const plans = listOf(plansQ);
  const races = listOf(racesQ);
  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const checkOf = useMemo(() => new Map(listOf(checkQ).map((r) => [idOf(r.horse), r])), [checkQ]);
  const checked = (h, key) => Boolean(checkOf.get(idOf(h))?.items.find((i) => i.key === key)?.done);
  const horseOf = (ref) => horsesById.get(idOf(ref)) || ref;

  const ready = horses.filter((h) => h.healthStatus === 'eligible' && !h.examHold && checked(h, 'health') && checked(h, 'clearance'));
  const held = horses.filter((h) => h.trainingClearance?.restricted || ['injured', 'quarantined', 'monitoring'].includes(h.healthStatus));
  const today = sessions.filter((s) => dayjs(s.scheduledAt).isSame(dayjs(), 'day') && s.status !== 'cancelled').sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const todayDone = today.filter((s) => DONE.includes(s.status)).length;
  const live = today.filter((s) => s.status === 'in_progress');
  const next = today.find((s) => ['scheduled', 'ready'].includes(s.status) && dayjs(s.scheduledAt).isAfter(dayjs()));
  const active = plans.filter((p) => p.status === 'active');
  const upcomingRaces = races.filter((r) => ['registered', 'confirmed'].includes(r.status) && !dayjs(r.raceDate).isBefore(dayjs(), 'day')).sort((a, b) => new Date(a.raceDate) - new Date(b.raceDate));

  // The load: finished sessions per day (two weeks) and per week (eight weeks).
  const stats = useMemo(() => {
    const done = sessions.filter((s) => DONE.includes(s.status));
    const days = lastDays(14).map((b) => {
      const list = done.filter((s) => inBucket(ranAt(s), b));
      const met = list.filter((s) => s.outcome?.met).length;
      return { ...b, n: list.length, met, rest: list.length - met, km: km(list) };
    });
    const weeks = lastWeeks(8).map((b) => {
      const list = done.filter((s) => inBucket(ranAt(s), b));
      return { ...b, n: list.length, met: list.filter((s) => s.outcome?.met).length, km: km(list) };
    });
    const since = (n) => done.filter((s) => dayjs(ranAt(s)).isAfter(dayjs().subtract(n, 'day')));
    const last7 = since(7).length;
    const prev7 = done.filter((s) => dayjs(ranAt(s)).isAfter(dayjs().subtract(14, 'day')) && !dayjs(ranAt(s)).isAfter(dayjs().subtract(7, 'day'))).length;
    const month = since(30);
    const metMonth = month.filter((s) => s.outcome?.met).length;
    // Each horse's average rating over the month, best first.
    const byHorse = new Map();
    month
      .filter((s) => s.performanceRating)
      .forEach((s) => {
        const k = idOf(s.horse);
        const row = byHorse.get(k) || { horse: s.horse, sum: 0, n: 0 };
        row.sum += s.performanceRating;
        row.n += 1;
        byHorse.set(k, row);
      });
    const ratings = [...byHorse.entries()].map(([k, r]) => ({ key: k, horse: r.horse, value: Math.round((r.sum / r.n) * 10) / 10, n: r.n })).sort((a, b) => b.value - a.value);
    const sumKm = (list) => Math.round(list.reduce((t, d) => t + d.km, 0) * 10) / 10;
    return { days, weeks, last7, prev7, month: month.length, metMonth, ratings, fortnight: days.reduce((t, d) => t + d.n, 0), fortnightKm: sumKm(days), km7: sumKm(days.slice(-7)), kmPrev7: sumKm(days.slice(0, 7)) };
  }, [sessions]);
  const week = stats.days.slice(-7);
  const notReady = Math.max(0, horses.length - ready.length - held.length);

  // What is waiting on the trainer, most pressing first.
  const todo = [
    ...active
      .filter((p) => p.progress?.checkpoint?.canDecide)
      .map((p) => ({
        key: `cp-${p._id}`,
        tone: p.progress.checkpoint.pass ? 'info' : 'watch',
        title: `Đánh giá cuối giai đoạn ${PHASE_LABELS[p.progress.checkpoint.phaseKey]}`,
        sub: `${p.horse?.name} · ${p.progress.checkpoint.pass ? 'đang đạt' : 'chưa đạt'} · hết giai đoạn ${dayjs(p.progress.checkpoint.endDate).format('DD/MM')}`,
        to: '/training/plans',
      })),
    ...active.filter((p) => p.pause?.since).map((p) => ({ key: `pause-${p._id}`, tone: 'bad', title: `Kế hoạch của ${p.horse?.name} đang tạm dừng`, sub: p.pause.reason, to: '/training/plans' })),
    ...upcomingRaces
      .filter((r) => r.reviewNeeded || (r.status === 'registered' && daysTo(r.raceDate) <= 14))
      .map((r) => ({
        key: `race-${r._id}`,
        tone: r.reviewNeeded ? 'bad' : 'watch',
        title: r.reviewNeeded ? `Xem lại việc dự ${r.raceName}` : `Quyết định dự ${r.raceName}`,
        sub: `${horseOf(r.horse)?.name || ''} · đua ${dayjs(r.raceDate).format('DD/MM')} (còn ${daysTo(r.raceDate)} ngày)`,
        to: '/races',
      })),
    ...today
      .filter((s) => s.status === 'blocked')
      .map((s) => ({
        key: `blocked-${s._id}`,
        tone: 'watch',
        title: `Buổi ${SESSION_KINDS[s.kind]?.label?.toLowerCase() || 'tập'} của ${horseOf(s.horse)?.name} bị chặn`,
        sub: s.blockedReason,
        to: `/training/sessions?session=${s._id}`,
      })),
    ...horses
      .filter((h) => h.trainingClearance?.restricted)
      .map((h) => ({
        key: `held-${h._id}`,
        tone: h.trainingClearance.level === 'none' ? 'bad' : 'info',
        title: `${h.name}: bác sĩ ${h.trainingClearance.level === 'none' ? 'khóa tập' : `chỉ cho ${h.trainingClearance.label}`}`,
        sub: h.trainingClearance.reason,
        to: `/horses/${h._id}`,
      })),
  ].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);

  const loading = horsesQ.isPending;
  const summary = loading
    ? 'Đang tải…'
    : [
        `${ready.length}/${horses.length} ngựa sẵn sàng tập`,
        today.length ? `${today.length} buổi tập hôm nay` : 'hôm nay không có buổi tập',
        todo.length ? `${todo.length} việc chờ bạn quyết định` : 'không có việc tồn đọng',
      ].join(' · ') + '.';
  const rate = stats.month ? Math.round((stats.metMonth / stats.month) * 100) : null;
  const todayPage = usePager(today, 6);
  const todoPage = usePager(todo, 5);
  const ratingPage = usePager(stats.ratings, 5);
  const planPage = usePager(active, 4);
  const racePage = usePager(upcomingRaces, 5);

  return (
    <OwnerPage>
      <DashHero
        eyebrow={`Huấn luyện viên trưởng · ${todayLong()}`}
        title={`${greeting()}, ${user?.name || 'HLV'}`}
        sub={summary}
        actions={
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/training/sessions?new=1')}>
              Lập buổi tập
            </Button>
            <Button onClick={() => navigate('/training/plans')}>Kế hoạch huấn luyện</Button>
            <Button onClick={() => navigate('/races')}>Giải đua</Button>
          </>
        }
        figure={{
          label: 'Buổi tập hôm nay đã xong',
          value: todayDone,
          of: today.length || null,
          meter: today.length ? { value: todayDone, max: today.length } : null,
          sub: live.length
            ? `${live.length} buổi đang chạy trên sân`
            : next
              ? `Kế tiếp ${dayjs(next.scheduledAt).format('HH:mm')} · ${horseOf(next.horse)?.name || 'Ngựa'}`
              : today.length
                ? 'Không còn buổi nào chờ chạy'
                : 'Hôm nay không có buổi tập',
        }}
      />

      <KpiRow>
        <KpiTile
          icon={<ThunderboltOutlined />}
          tone="good"
          label="Sẵn sàng tập hôm nay"
          value={loading ? '—' : ready.length}
          unit={loading ? null : `/ ${horses.length} ngựa`}
          sub="Đã khám, không bị bác sĩ hạn chế"
          split={[
            { key: 'ready', label: 'Sẵn sàng', value: ready.length, tone: 'good' },
            { key: 'held', label: 'Theo dõi · hạn chế', value: held.length, tone: 'watch' },
            { key: 'other', label: 'Chưa đủ hồ sơ', value: notReady, tone: 'neutral' },
          ]}
          to="/horses"
        />
        <KpiTile
          icon={<CalendarOutlined />}
          label="Buổi tập 7 ngày qua"
          value={sessionsQ.isPending ? '—' : stats.last7}
          unit="buổi"
          delta={deltaOf(stats.last7, stats.prev7, 'so với 7 ngày trước')}
          sub={`7 ngày trước đó: ${stats.prev7} buổi`}
          chart={{ data: week.map((d) => ({ key: d.key, label: d.label, full: d.full, value: d.n })), fmt: (v) => `${v}`, label: 'Buổi hoàn thành', caption: 'Số buổi hoàn thành mỗi ngày' }}
        />
        <KpiTile
          icon={<CheckCircleOutlined />}
          tone="good"
          label="Đạt chỉ tiêu · 30 ngày"
          value={rate == null ? '—' : rate}
          unit={rate == null ? null : '%'}
          sub={stats.month ? `${stats.metMonth}/${stats.month} buổi đạt chỉ tiêu bài tập` : 'Chưa có buổi nào trong 30 ngày'}
          chart={{
            data: stats.weeks.slice(-6).map((w) => ({ key: w.key, label: w.label, full: `${w.full} · ${w.met}/${w.n} buổi đạt`, value: w.n ? Math.round((w.met / w.n) * 100) : 0 })),
            fmt: (v) => `${v}%`,
            label: 'Tỉ lệ đạt chỉ tiêu',
            caption: 'Tỉ lệ đạt theo tuần (tuần bắt đầu ngày)',
          }}
        />
        <KpiTile
          icon={<NodeIndexOutlined />}
          tone="brass"
          label="Quãng đường 7 ngày qua"
          value={sessionsQ.isPending ? '—' : stats.km7.toLocaleString('vi-VN')}
          unit="km"
          delta={deltaOf(stats.km7, stats.kmPrev7, 'so với 7 ngày trước', { unit: ' km' })}
          sub={`7 ngày trước đó: ${stats.kmPrev7.toLocaleString('vi-VN')} km`}
          chart={{ data: week.map((d) => ({ key: d.key, label: d.label, full: d.full, value: d.km })), fmt: (v) => v.toLocaleString('vi-VN'), label: 'Quãng đường (km)', caption: 'Số km chạy trên sân mỗi ngày' }}
        />
      </KpiRow>

      <div className="own-grid-main">
        <Card
          title="Lịch tập hôm nay"
          icon={<CalendarOutlined />}
          flush
          extra={
            <Link to="/training/sessions" className="text-xs font-semibold">
              Mở lịch tập
            </Link>
          }
        >
          {today.length === 0 ? (
            <EmptyNote>{sessionsQ.isPending ? 'Đang tải…' : 'Hôm nay không có buổi tập nào.'}</EmptyNote>
          ) : (
            <ul className="dk-timeline">
              {todayPage.rows.map((s) => {
                const horse = horseOf(s.horse);
                const tone = SESSION_TONE[s.status] || 'neutral';
                return (
                  <li key={s._id}>
                    <Link to={`/training/sessions?session=${s._id}`} className="dk-tl-row">
                      <span className="dk-tl-time">{dayjs(s.scheduledAt).format('HH:mm')}</span>
                      <span className={`dk-tl-dot is-${tone}${s.status === 'in_progress' ? ' is-live' : ''}`} aria-hidden="true" />
                      <span className="dk-tl-main">
                        <HorseAvatar horse={horse} size={30} />
                        <div>
                          <div className="own-row-title">{horse?.name || 'Ngựa'}</div>
                          <div className="own-row-sub own-hs-sub">
                            {SESSION_KINDS[s.kind]?.label || 'Buổi tập'}
                            {s.status === 'blocked' && s.blockedReason ? ` · ${s.blockedReason}` : s.outcome?.summary ? ` · ${s.outcome.summary}` : ''}
                          </div>
                        </div>
                      </span>
                      <Pill tone={tone}>{s.status === 'in_progress' ? 'Đang chạy' : SESSION_STATUS_LABELS[s.status] || s.status}</Pill>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {todayPage.pager}
        </Card>

        <Card title="Chờ bạn quyết định" icon={<AlertOutlined />} flush extra={todo.length ? <Pill tone="watch">{todo.length}</Pill> : null}>
          {todo.length === 0 ? (
            <EmptyNote>Không có việc nào chờ bạn.</EmptyNote>
          ) : (
            <ul className="own-list">
              {todoPage.rows.map((t) => (
                <li key={t.key}>
                  <Line to={t.to} lead={<span className={`own-th-dot is-${t.tone}`} aria-hidden="true" />} title={t.title} sub={t.sub} />
                </li>
              ))}
            </ul>
          )}
          {todoPage.pager}
        </Card>
      </div>

      <div className="own-grid-main">
        <Card title="Khối lượng tập · 14 ngày qua" icon={<BarChartOutlined />}>
          <div className="dk-chart-head">
            <b>{stats.fortnight} buổi</b>
            <span>hoàn thành · {stats.fortnightKm.toLocaleString('vi-VN')} km trên sân</span>
          </div>
          <Columns
            data={stats.days}
            stacked
            series={[
              { key: 'met', name: 'Đạt chỉ tiêu', cls: 'is-series-1' },
              { key: 'rest', name: 'Chưa đạt', cls: 'is-series-1-soft' },
            ]}
            fmt={(v) => `${v} buổi`}
            capFmt={(v) => v}
            more={(d) => [[null, 'Quãng đường', `${d.km.toLocaleString('vi-VN')} km`]]}
            label="Số buổi tập hoàn thành mỗi ngày trong 14 ngày qua, chia theo đạt và chưa đạt chỉ tiêu"
          />
        </Card>

        <Card title="Điểm đánh giá theo ngựa · 30 ngày" icon={<StarOutlined />}>
          <RankBars
            max={10}
            rows={ratingPage.rows.map((r) => ({
              key: r.key,
              label: horseOf(r.horse)?.name || 'Ngựa',
              sub: `${r.n} buổi được chấm`,
              value: r.value,
              display: `${r.value.toLocaleString('vi-VN')}/10`,
              to: `/horses/${r.key}`,
            }))}
            empty="Chưa có buổi tập nào được chấm điểm trong 30 ngày."
          />
          {ratingPage.pager}
        </Card>
      </div>

      <div className="own-grid-2">
        <Card
          title="Tiến độ kế hoạch"
          icon={<ScheduleOutlined />}
          flush
          extra={
            <Link to="/training/plans" className="text-xs font-semibold">
              Tất cả kế hoạch
            </Link>
          }
        >
          {active.length === 0 ? (
            <EmptyNote>{plansQ.isPending ? 'Đang tải…' : 'Chưa có kế hoạch nào đang áp dụng.'}</EmptyNote>
          ) : (
            <ul className="own-list">
              {planPage.rows.map((p) => (
                <li key={p._id}>
                  <Link to="/training/plans" className="own-th-plan">
                    <div className="own-th-plan-head">
                      <HorseAvatar horse={horseOf(p.horse)} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="own-row-title">{p.horse?.name}</div>
                        <div className="own-row-sub own-hs-sub">{whereNow(p)}</div>
                      </div>
                      {p.pause?.since ? <Pill tone="bad">Tạm dừng</Pill> : p.progress?.form ? <Pill tone={FORM_TONE[p.progress.form.status] || 'neutral'}>{p.progress.form.label}</Pill> : null}
                    </div>
                    <PlanTimeline phases={p.phases || []} startDate={p.startDate} raceDate={p.targetRace?.status === 'withdrawn' ? null : p.targetRace?.raceDate} mini />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {planPage.pager}
        </Card>

        <Card
          title="Giải sắp tới"
          icon={<FlagOutlined />}
          flush
          extra={
            <Link to="/races" className="text-xs font-semibold">
              Đăng ký giải
            </Link>
          }
        >
          {upcomingRaces.length === 0 ? (
            <EmptyNote>{racesQ.isPending ? 'Đang tải…' : 'Chưa đăng ký giải nào sắp tới.'}</EmptyNote>
          ) : (
            <ul className="own-list">
              {racePage.rows.map((r) => (
                <li key={r._id}>
                  <Line
                    to="/races"
                    lead={
                      <span className="own-date">
                        <b>{dayjs(r.raceDate).format('DD')}</b>
                        <span>Th{dayjs(r.raceDate).month() + 1}</span>
                      </span>
                    }
                    title={r.raceName}
                    sub={`${horseOf(r.horse)?.name || ''}${r.distance ? ` · ${r.distance.toLocaleString('vi-VN')} m` : ''} · còn ${daysTo(r.raceDate)} ngày`}
                    side={<Pill tone={r.reviewNeeded ? 'bad' : r.status === 'confirmed' ? 'good' : 'watch'}>{r.reviewNeeded ? 'Cần xem lại' : r.status === 'confirmed' ? 'Đã xác nhận' : 'Chờ quyết định'}</Pill>}
                  />
                </li>
              ))}
            </ul>
          )}
          {racePage.pager}
        </Card>
      </div>
    </OwnerPage>
  );
}
