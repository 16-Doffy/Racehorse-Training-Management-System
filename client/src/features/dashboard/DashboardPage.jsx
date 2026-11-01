import { useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Tag, Button, Tooltip } from 'antd';
import { AppstoreOutlined, CheckCircleOutlined, EyeOutlined, MedicineBoxOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../horses/horsesApi';
import { trainingSessionApi } from '../training/trainingApi';
import { ROLE_LABELS, ROLES } from '../../constants/roles';
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
  const { data } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const horses = data?.data || [];
  // Same query as NextStepsCard: whether each horse has a vet's exam and no restriction in force.
  const { data: checklistData } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });
  const checklistByHorse = new Map((checklistData?.data || []).map((r) => [String(r.horse._id), r]));
  const itemDone = (horse, key) => Boolean(checklistByHorse.get(String(horse._id))?.items.find((i) => i.key === key)?.done);

  // Only fetched for the Head Trainer, who's the one this chart is for (§ Head Trainer
  // requirement: "bảng tiến độ và biểu đồ thể lực tổng quan").
  const { data: sessionsData } = useQuery({
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
    <div className="st-section-header light-surface-box px-1">
      <span className="st-section-header__title guardrail-title">
        <span className="st-section-header__bar" />
        An toàn tập luyện &amp; y tế
      </span>
      <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#EAE1D2] text-slate-700 font-semibold tabular-nums">
        {restrictedHorses.length > 0 ? `${restrictedHorses.length} ngựa hạn chế` : 'Không có khóa tập'}
      </span>
    </div>
  );
  const restrictedCard = restrictedHorses.length > 0 && (
    <div className="light-surface-box rounded-xl border border-[#E5DEC9] bg-[#FFFDF8] p-4 shadow-xs">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-200/80">
        <span className="font-semibold text-gray-900 text-[15px]">{restrictedHorses.length} ngựa bị hạn chế tập luyện</span>
        <span className="text-[11px] font-medium text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-200">
          Bác sĩ chỉ định
        </span>
      </div>
      <div className="divide-y divide-amber-200/50">
        {restrictedShown.map((h) => {
          const c = h.trainingClearance;
          const why = `${c.reason || 'theo phác đồ điều trị'}${c.prescribedBy ? ` (BS ${c.prescribedBy})` : ''}`;
          return (
            <div key={h._id} className="py-2 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0 pr-2 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Tag color={TRAINING_LEVEL_META[c.level]?.color} className="!m-0 shrink-0 text-xs font-medium">
                    {TRAINING_LEVEL_META[c.level]?.short}
                  </Tag>
                  <Link to={`/horses/${h._id}`} className="truncate font-semibold text-emerald-950 hover:text-emerald-800 underline decoration-emerald-950/20" title={h.name}>
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
                  className="shrink-0 text-xs !text-amber-950 font-semibold !bg-white hover:!bg-amber-50 border-amber-300 shadow-xs"
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
    </div>
  );

  return (
    <div className="st-page">
      <PageHeroBanner
        eyebrow="Tổng quan vận hành"
        roleLabel={ROLE_LABELS[user?.role]}
        title={`Xin chào, ${user?.name}`}
        kicker={isHeadTrainer ? 'Điều hành sân tập' : 'Trung tâm điều hành'}
        kickerNote={`Hôm nay: ${new Date().toLocaleDateString('vi-VN')}`}
        subtitle={isHeadTrainer ? 'Giám sát sân tập, số đo trực tiếp và bảng việc hôm nay của từng ngựa.' : `Theo dõi ${horses.length} ngựa, duyệt đề xuất vật tư và công suất chuồng trại.`}
        statusBadge={
          <div
            className="px-3 py-1.5 rounded-lg border text-xs"
            style={{ background: 'var(--st-sunk)', borderColor: 'var(--st-border)' }}
          >
            {/* The vet's side only (healthy, examined, no restriction): a session still has its own checks. */}
            <div className="text-[11px] font-medium" style={{ color: 'var(--st-ink-secondary)' }}>Bác sĩ cho tập</div>
            <div className="font-semibold tabular-nums mt-0.5" style={{ color: 'var(--st-ink)' }}>
              {eligible}/{horses.length} ngựa
            </div>
          </div>
        }
        actionButton={
          isHeadTrainer ? (
            <Button
              type="primary"
              onClick={() => navigate('/training/sessions?new=1')}
              className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold flex items-center gap-2 cursor-pointer"
            >
              + Lập buổi tập mới
            </Button>
          ) : isManager ? (
            <Button type="primary" onClick={() => navigate('/horses?new=1')} className="!h-9 !px-4 !rounded-lg font-semibold">
              + Thêm ngựa mới
            </Button>
          ) : null
        }
      />

      {/* KPI Metric Strip: Unified, dense, tabular */}
      <div className="st-kpi-grid light-surface-box">
        <button
          type="button"
          onClick={() => navigate('/horses')}
          className="st-kpi-tile group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-semibold text-gray-700 group-hover:text-emerald-900 transition-colors">Tổng số ngựa</span>
            <span className="w-8 h-8 rounded-lg bg-[#EAE3D5] flex items-center justify-center text-gray-700">
              <AppstoreOutlined />
            </span>
          </div>
          <div className="text-2xl font-bold tracking-tight text-gray-900 tabular-nums">
            {horses.length}
          </div>
          <div className="text-[11px] text-gray-600 font-medium mt-1">{isHeadTrainer ? 'Ngựa bạn phụ trách' : 'Toàn CLB'}</div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/horses')}
          className="st-kpi-tile group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <Tooltip title="Ngựa khỏe, đã có hồ sơ khám của bác sĩ và không bị hạn chế tập. Ngựa mới chưa khám không được tính.">
              <span className="font-semibold text-emerald-800 flex items-center gap-1">
                Đủ điều kiện tập <InfoCircleOutlined className="text-[10px]" />
              </span>
            </Tooltip>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-700">
              <CheckCircleOutlined />
            </span>
          </div>
          <div className="text-2xl font-bold tracking-tight text-emerald-700 tabular-nums">
            {eligible}
          </div>
          <div className="text-[11px] text-emerald-800 font-medium mt-1">Đã khám, không bị hạn chế tập</div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/horses')}
          className="st-kpi-tile group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-700"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-semibold text-amber-800 group-hover:text-amber-900">Cần theo dõi</span>
            <span className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-700">
              <EyeOutlined />
            </span>
          </div>
          <div className="text-2xl font-bold tracking-tight text-amber-700 tabular-nums">
            {monitoring}
          </div>
          <div className="text-[11px] text-amber-900 font-medium mt-1">Có cảnh báo sức khỏe nhẹ</div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/horses')}
          className="st-kpi-tile group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-700"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-semibold text-rose-800 group-hover:text-rose-900">Chấn thương</span>
            <span className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200/70 flex items-center justify-center text-rose-700">
              <MedicineBoxOutlined />
            </span>
          </div>
          <div className="text-2xl font-bold tracking-tight text-rose-700 tabular-nums">
            {injured}
          </div>
          <div className="text-[11px] text-rose-900 font-medium mt-1">Đang tạm ngưng luyện tập</div>
        </button>
      </div>

      {isHeadTrainer ? (
        <>
          {/* The Head Trainer's day: the track today in 3D (the horses out running, today's others by the
              finish post), the board of the day, then the safety and medical cards in a structured grid. */}
          <div className="st-trainer-overview">
            <TrainingTrackCard compact sessions={sessionsData?.data || []} horses={horses} />
            <TodayBoard compact horses={horses} sessions={sessionsData?.data || []} />
          </div>
          <section className="space-y-3">
            {safetyHeader}
            <div className="st-bento-grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
          <div className="st-bento-grid grid-cols-1 lg:grid-cols-2 gap-5">
            <StaffTodayCard />
            <StockWatchCard />
          </div>
          <section className="space-y-3">
            {safetyHeader}
            <div className="st-bento-grid grid-cols-1 md:grid-cols-2 gap-5">
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
