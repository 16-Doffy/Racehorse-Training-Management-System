import { useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Tag, Button } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../horses/horsesApi';
import { trainingSessionApi } from '../training/trainingApi';
import { ROLES } from '../../constants/roles';
import { TRAINING_LEVEL_META } from '../../constants/health';
import FitnessOverviewChart from './FitnessOverviewChart';
import TrainingTrackCard from './TrainingTrackCard';
import TodayBoard from './TodayBoard';
import ExamRequestsCard from './ExamRequestsCard';
import OpenIncidentsCard from './OpenIncidentsCard';
import CareOrdersCard from './CareOrdersCard';
import NextStepsCard from './NextStepsCard';
import ManagerQueueCard from './ManagerQueueCard';
import MissedMealsCard from './MissedMealsCard';
import StableOverviewCard from './StableOverviewCard';
import StaffTodayCard from './StaffTodayCard';
import StockWatchCard from './StockWatchCard';
import { useFirst } from './useFirst';
import PageHeroBanner from '../../components/common/PageHeroBanner';

// Shared fallback dashboard for any role without a dedicated one (see RoleDashboard.jsx) —
// currently Head Trainer and Club Manager. Groom/Veterinarian/Owner each have their own.
export default function DashboardPage() {
  const { user } = useSelector((state) => state.auth);
  const navigate = useNavigate();
  const isHeadTrainer = user?.role === ROLES.HEAD_TRAINER;
  const isManager = user?.role === ROLES.MANAGER;
  const { data, isPending: horsesPending } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const horses = data?.data || [];
  // Same query as NextStepsCard: whether each horse has a vet's exam and no restriction in force.
  const { data: checklistData } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });
  const checklistByHorse = new Map((checklistData?.data || []).map((r) => [String(r.horse._id), r]));
  const itemDone = (horse, key) => Boolean(checklistByHorse.get(String(horse._id))?.items.find((i) => i.key === key)?.done);

  // Only fetched for the Head Trainer, who's the one this chart is for (§ Head Trainer
  // requirement: "bảng tiến độ và biểu đồ thể lực tổng quan").
  const { data: sessionsData, isPending: sessionsPending } = useQuery({
    queryKey: ['training-sessions'],
    queryFn: () => trainingSessionApi.list(),
    enabled: isHeadTrainer,
  });

  // Surfaces Vet training locks right on the Head Trainer's landing page, instead of them only
  // finding out via a 409 while trying to schedule a session for an already-locked horse.
  // Horses the vet has restricted — locked, or recovering at a reduced level — from the clearance
  // the server attaches to every horse.
  const restrictedHorses = horses.filter((h) => h.trainingClearance?.restricted);
  const [restrictedShown, restrictedMore] = useFirst(restrictedHorses, 3);

  // A new horse is "eligible" by default before any vet has seen it, so the count also needs the
  // exam and no restriction from the vet — the same things the pre-check looks at.
  const eligible = horses.filter((h) => h.healthStatus === 'eligible' && !h.examHold && itemDone(h, 'health') && itemDone(h, 'clearance')).length;
  const monitoring = horses.filter((h) => h.healthStatus === 'monitoring' || (h.examHold && h.healthStatus === 'eligible')).length;
  const injured = horses.filter((h) => h.healthStatus === 'injured').length;

  // The safety and medical side of the day: its heading, and the horses the vet has restricted.
  const safetyHeader = (
    <div className="st-section-header light-surface-box">
      <span className="st-section-header__title guardrail-title">
        <span className="st-section-header__bar" />
        An toàn tập luyện &amp; y tế
      </span>
      <span
        className="text-xs px-2.5 py-0.5 rounded-full font-bold tabular-nums border"
        style={{ background: 'var(--st-sunk)', color: 'var(--st-ink)', borderColor: 'var(--st-border)' }}
      >
        {restrictedHorses.length > 0 ? `${restrictedHorses.length} ngựa hạn chế` : 'Không có khóa tập'}
      </span>
    </div>
  );
  const restrictedCard = restrictedHorses.length > 0 && (
    <Card
      className="shadow-xs rounded-xl overflow-hidden h-full"
      styles={{
        title: { whiteSpace: 'normal', overflow: 'visible', padding: '12px 16px' },
        header: { height: 'auto', whiteSpace: 'normal' },
        body: { padding: '4px 16px 12px 16px' },
      }}
      title={
        <div className="flex flex-wrap items-center justify-between gap-2 py-0.5">
          <span className="font-bold text-gray-900 text-[15px]">{restrictedHorses.length} ngựa bị hạn chế tập luyện</span>
          <span className="text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
            Bác sĩ chỉ định
          </span>
        </div>
      }
    >
      <div className="divide-y divide-gray-100">
        {restrictedShown.map((h) => {
          const c = h.trainingClearance;
          const why = `${c.reason || 'theo phác đồ điều trị'}${c.prescribedBy ? ` (BS ${c.prescribedBy})` : ''}`;
          return (
            <div key={h._id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0 pr-2 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Tag color={TRAINING_LEVEL_META[c.level]?.color} className="!m-0 shrink-0 text-xs font-semibold">
                    {TRAINING_LEVEL_META[c.level]?.short}
                  </Tag>
                  <Link to={`/horses/${h._id}`} className="truncate font-bold text-gray-900 hover:underline" title={h.name}>
                    {h.name}
                  </Link>
                </div>
                {/* The doctor's reason on one line; all of it on hover and on the horse's page. */}
                <p className="text-xs text-gray-600 m-0 mt-0.5 truncate" title={why}>
                  {why}
                </p>
              </div>
              {isHeadTrainer && (
                <Button
                  size="small"
                  className="shrink-0 text-xs font-semibold"
                  onClick={() => navigate(`/training/sessions?horse=${h._id}`)}
                >
                  Xem buổi tập
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {restrictedMore}
    </Card>
  );

  // What is true today, said first; the counts follow.
  const injuredNames = horses.filter((h) => h.healthStatus === 'injured').map((h) => h.name);
  const held = horses.filter((h) => h.examHold).map((h) => h.name);
  const finding = horsesPending ? 'Đang tải số liệu…' : [
    `${eligible}/${horses.length} ngựa đủ điều kiện tập`,
    held.length ? `${held.join(', ')} đang chờ bác sĩ khám` : null,
    injuredNames.length ? `${injuredNames.join(', ')} chấn thương` : null,
  ].filter(Boolean).join(', ');
  const counts = [
    { label: 'Tổng số ngựa', value: horses.length, hint: isHeadTrainer ? 'Ngựa bạn phụ trách' : 'Toàn CLB', tone: 'text-gray-900', dataTone: 'default' },
    { label: 'Đủ điều kiện tập', value: eligible, hint: 'Đã khám, không bị hạn chế', tone: 'text-emerald-700', dataTone: 'good' },
    { label: 'Cần theo dõi', value: monitoring, hint: 'Có cảnh báo sức khỏe', tone: 'text-amber-700', dataTone: 'warn' },
    { label: 'Chấn thương', value: injured, hint: 'Tạm ngưng luyện tập', tone: 'text-rose-700', dataTone: 'danger' },
  ];

  return (
    <div className="st-page">
      <PageHeroBanner
        title={isHeadTrainer ? 'Tổng quan huấn luyện' : 'Tổng quan câu lạc bộ'}
        subtitle={`${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}. ${finding}`}
        actionButton={
          <Button type="primary" onClick={() => navigate(isHeadTrainer ? '/training/sessions?new=1' : '/horses?new=1')}>
            {isHeadTrainer ? '+ Lập buổi tập mới' : '+ Thêm ngựa mới'}
          </Button>
        }
      />

      <div className="st-kpi-grid light-surface-box">
        {counts.map((c) => (
          <button key={c.label} type="button" data-tone={c.dataTone} onClick={() => navigate('/horses')} className="st-kpi-tile text-left">
            <div className="min-w-0">
              <span className="st-kpi-tile__label block">{c.label}</span>
              <span className="st-kpi-tile__hint block mt-0.5">{c.hint}</span>
            </div>
            <span className={`st-kpi-tile__value text-2xl tabular-nums shrink-0 ${c.value ? c.tone : 'text-gray-500'}`}>{horsesPending ? '–' : c.value}</span>
          </button>
        ))}
      </div>

      {isHeadTrainer ? (
        <>
          {/* The Head Trainer's day: the track today in 3D (the horses out running, today's others by the
              finish post), the board of the day, then the safety and medical cards in a structured grid. */}
          <div className="st-trainer-overview">
            <TrainingTrackCard compact onTrack loading={sessionsPending} sessions={sessionsData?.data || []} horses={horses} />
            <TodayBoard compact loading={horsesPending} horses={horses} sessions={sessionsData?.data || []} />
          </div>
          <section className="space-y-3">
            {safetyHeader}
            <div className="st-bento-grid st-safety-grid">
              {restrictedCard}
              <MissedMealsCard />
              <ExamRequestsCard />
              <OpenIncidentsCard />
              <CareOrdersCard />
            </div>
          </section>
        </>
      ) : (
        <>
          {/* Stable and decision queue share the first row; daily staff and stock follow together.
              On narrow screens they retain the same reading order in a single column. */}
          <div className="st-manager-overview">
            <StableOverviewCard />
            {isManager && <ManagerQueueCard />}
          </div>
          <div className="st-bento-grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StaffTodayCard />
            <StockWatchCard />
          </div>
          <section className="space-y-3">
            {safetyHeader}
            <div className="st-bento-grid st-safety-grid">
              {restrictedCard}
              <MissedMealsCard />
              <OpenIncidentsCard />
              <CareOrdersCard />
            </div>
          </section>
          <NextStepsCard />
        </>
      )}

      {/* Trainer Fitness Overview: under both columns, the width of the page, so its charts have room
          and neither column runs on alone beside an empty one. */}
      {isHeadTrainer && (
        <Card
          className="shadow-xs border-[#E5DEC9] rounded-xl"
          title={
            <div>
              <span className="font-semibold text-gray-900 text-[15px]">Biểu đồ thể lực tổng quan</span>
              <p className="text-xs text-gray-600 font-normal m-0 mt-0.5">Chọn ngày và ngựa để xem kết quả từng buổi tập</p>
            </div>
          }
        >
          <FitnessOverviewChart sessions={sessionsData?.data || []} />
        </Card>
      )}
    </div>
  );
}
