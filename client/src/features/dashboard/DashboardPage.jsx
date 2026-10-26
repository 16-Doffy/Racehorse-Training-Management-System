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
import LiveTrackOval from './LiveTrackOval';
import ExamRequestsCard from './ExamRequestsCard';
import OpenIncidentsCard from './OpenIncidentsCard';
import CareOrdersCard from './CareOrdersCard';
import NextStepsCard from './NextStepsCard';
import ManagerQueueCard from './ManagerQueueCard';
import MissedMealsCard from './MissedMealsCard';
import PageHeroBanner from '../../components/common/PageHeroBanner';

const ROLE_WELCOME = {
  head_trainer: 'Theo dõi tiến độ huấn luyện, kiểm tra sẵn sàng và thể lực ngựa phụ trách.',
  veterinarian: 'Theo dõi sơ đồ sức khỏe và xử lý các trường hợp cần can thiệp y tế.',
  groom: 'Danh sách công việc chăm sóc hàng ngày của bạn nằm ở mục "Công việc Hàng ngày".',
  owner: 'Theo dõi tình trạng và thành tích của những chú ngựa bạn sở hữu.',
  manager: 'Điều phối nhân sự, danh mục ngựa, chuồng trại, kho vật tư và sổ thu chi.',
};

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

  // A new horse is "eligible" by default before any vet has seen it, so the count also needs the
  // exam and no restriction from the vet — the same things the pre-check looks at.
  const eligible = horses.filter((h) => h.healthStatus === 'eligible' && itemDone(h, 'health') && itemDone(h, 'clearance')).length;
  const monitoring = horses.filter((h) => h.healthStatus === 'monitoring').length;
  const injured = horses.filter((h) => h.healthStatus === 'injured').length;

  return (
    <div className="space-y-6">
      <PageHeroBanner
        eyebrow="Tổng quan vận hành"
        roleLabel={ROLE_LABELS[user?.role]}
        title={`Xin chào, ${user?.name}`}
        subtitle={ROLE_WELCOME[user?.role]}
        statusBadge={
          <div className="px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-xs">
            {/* The vet's side only (healthy, examined, no restriction): a session still has its own checks. */}
            <div className="text-[#A7C4B5] text-[11px] font-medium">Bác sĩ cho tập</div>
            <div className="text-[#FAF8F5] font-semibold tabular-nums mt-0.5">
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
          ) : null
        }
      />

      {/* KPI Metric Strip: Unified, dense, tabular, no floating template boxes */}
      <div className="light-surface-box bg-[#FAF7F0] rounded-xl border border-[#E5DEC9] shadow-xs divide-y sm:divide-y-0 sm:divide-x divide-[#EFE8DA] grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        <button
          type="button"
          onClick={() => navigate('/horses')}
          style={{ border: 'none' }}
          className="bg-transparent border-0 font-inherit appearance-none m-0 text-left p-4 sm:p-5 hover:bg-[#F2ECE0] transition-colors cursor-pointer group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:z-10"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-medium group-hover:text-emerald-900 transition-colors">Tổng số ngựa</span>
            <AppstoreOutlined className="text-gray-400 group-hover:text-emerald-700" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 tabular-nums">
            {horses.length}
          </div>
          <div className="text-[11px] text-gray-600 font-medium mt-1">{isHeadTrainer ? 'Ngựa bạn phụ trách' : 'Toàn CLB'}</div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/horses')}
          style={{ border: 'none' }}
          className="bg-transparent border-0 font-inherit appearance-none m-0 text-left p-4 sm:p-5 hover:bg-emerald-50/50 transition-colors cursor-pointer group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:z-10"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <Tooltip title="Ngựa khỏe, đã có hồ sơ khám của bác sĩ và không bị hạn chế tập. Ngựa mới chưa khám không được tính.">
              <span className="font-medium text-emerald-800 flex items-center gap-1">
                Đủ điều kiện tập <InfoCircleOutlined className="text-[10px]" />
              </span>
            </Tooltip>
            <CheckCircleOutlined className="text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-700 tabular-nums">
            {eligible}
          </div>
          <div className="text-[11px] text-emerald-800 font-medium mt-1">Đã khám, không bị hạn chế tập</div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/horses')}
          style={{ border: 'none' }}
          className="bg-transparent border-0 font-inherit appearance-none m-0 text-left p-4 sm:p-5 hover:bg-amber-50/50 transition-colors cursor-pointer group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:z-10"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-medium text-amber-800 group-hover:text-amber-900">Cần theo dõi</span>
            <EyeOutlined className="text-amber-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-700 tabular-nums">
            {monitoring}
          </div>
          <div className="text-[11px] text-amber-900 font-medium mt-1">Có cảnh báo sức khỏe nhẹ</div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/horses')}
          style={{ border: 'none' }}
          className="bg-transparent border-0 font-inherit appearance-none m-0 text-left p-4 sm:p-5 hover:bg-rose-50/40 transition-colors cursor-pointer group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:z-10"
        >
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-medium text-rose-800 group-hover:text-rose-900">Chấn thương</span>
            <MedicineBoxOutlined className="text-rose-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-rose-700 tabular-nums">
            {injured}
          </div>
          <div className="text-[11px] text-rose-900 font-medium mt-1">Đang tạm ngưng luyện tập</div>
        </button>
      </div>

      {/* Main 2-Column Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Core Workstream (65% on desktop) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* Horses out on the track right now, on one oval (only while something runs) */}
          {isHeadTrainer && <LiveTrackOval sessions={sessionsData?.data || []} horses={horses} />}

          {/* Manager Action Queue */}
          {isManager && <ManagerQueueCard />}

          {/* Horse Onboarding / Next steps */}
          <NextStepsCard />

          {/* Trainer Exam Requests */}
          {isHeadTrainer && <ExamRequestsCard />}

          {/* Trainer Fitness Overview */}
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

        {/* Right Column: Health, Alerts & Operational Guardrails (35% on desktop) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-5">
          <div className="light-surface-box flex items-center justify-between pb-1 px-1">
            <span className="guardrail-title text-xs font-semibold text-[#0F5A43]">An toàn tập luyện &amp; y tế</span>
            <span className="text-xs px-2 py-0.5 rounded bg-[#EAE1D2] text-slate-700 font-medium tabular-nums">
              {restrictedHorses.length > 0 ? `${restrictedHorses.length} ngựa hạn chế` : 'Không có khóa tập'}
            </span>
          </div>

          {/* Medical Clearance Alert: compact operational card */}
          {restrictedHorses.length > 0 && (
            <div className="light-surface-box rounded-xl border border-[#E5DEC9] bg-[#FFFDF8] p-4 shadow-xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-amber-200/80">
                <span className="font-semibold text-gray-900 text-[15px]">{restrictedHorses.length} ngựa bị hạn chế tập luyện</span>
                <span className="text-[11px] font-medium text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-200">
                  Bác sĩ chỉ định
                </span>
              </div>
              <div className="divide-y divide-amber-200/50">
                {restrictedHorses.map((h) => {
                  const c = h.trainingClearance;
                  return (
                    <div key={h._id} className="py-2.5 flex items-start justify-between gap-2 text-sm">
                      <div className="min-w-0 pr-2 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Tag color={TRAINING_LEVEL_META[c.level]?.color} className="!m-0 text-xs font-medium">
                            {TRAINING_LEVEL_META[c.level]?.short}
                          </Tag>
                          <Link to={`/horses/${h._id}`} className="font-semibold text-emerald-950 hover:text-emerald-800 break-words underline decoration-emerald-950/20">
                            {h.name}
                          </Link>
                        </div>
                        <p className="text-xs text-gray-600 m-0 mt-1 break-words">
                          {c.reason || 'theo phác đồ điều trị'}
                          {c.prescribedBy ? ` (BS ${c.prescribedBy})` : ''}
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
            </div>
          )}

          {/* Missed Meals (Blocks hard sessions) */}
          <MissedMealsCard />

          {/* Open Incidents (Groom reported) */}
          <OpenIncidentsCard />

          {/* Care Orders (Vet prescribed medication and tasks) */}
          <CareOrdersCard />
        </div>
      </div>
    </div>
  );
}
