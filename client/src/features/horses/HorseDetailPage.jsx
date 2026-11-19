import { useState } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { Table, Card, Breadcrumb, Row, Col, Empty, Button, Alert, Tabs, Select, Tooltip, Tag, theme } from 'antd';
import { HORSE_SEX_LABELS, formatVnd } from '../../constants/horse';
import {
  MedicineBoxOutlined,
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  ScheduleOutlined,
  HomeOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { fold } from '../../utils/fold';
import { horsesApi } from './horsesApi';
import HorseTimeline from './HorseTimeline';
import CareHistoryCard from './CareHistoryCard';
import HorseStallCard from '../stable/HorseStallCard';
import { stallApi } from '../stable/stableApi';
import { trainingPlanApi, trainingSessionApi } from '../training/trainingApi';
import { PHASE_LABELS, SURFACE_LABELS, DONE_STATUSES } from '../training/trainingVocab';
import vetApi from '../../api/veterinarianApi';
import MovingHorse3D from './horse3d/MovingHorse3D';
import HorseInjuryViewer from '../../components/veterinarian/HorseInjuryViewer';
import '../../components/veterinarian/vet.css';
import { injuryFrom, restingMotion, surfaceOf } from './horse3d/horseMotion';
import { breedLabel, coatFor, coatLabel } from './horse3d/horseBreeds';
import { HEALTH_LABELS, TRAINING_LEVEL_META } from '../../constants/health';
import RequestExamModal from '../health/RequestExamModal';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import dayjs from 'dayjs';
import { examLine, useLastExam } from '../health/useLastExam';
import './horseProfile.css';

const TABS = ['history', 'care', 'stall', 'races'];

/** Calculate age string from date of birth */
function calcAge(dob) {
  if (!dob) return 'Chưa rõ tuổi';
  const now = dayjs();
  const birth = dayjs(dob);
  if (!birth.isValid()) return 'Chưa rõ';
  const years = now.diff(birth, 'year');
  const months = now.diff(birth, 'month') % 12;
  if (years === 0) return `${months} tháng tuổi`;
  return months > 0 ? `${years} tuổi ${months} tháng` : `${years} tuổi`;
}

function Facts({ items, className = '' }) {
  return (
    <dl className={`m-0 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3 min-[992px]:grid-cols-2 ${className}`}>
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-gray-500">{label}</dt>
          <dd className="m-0 mt-0.5 break-words text-[13px] font-medium text-gray-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const INSPECTION_MODES = [
  { value: 'clinical', label: 'Theo sức khỏe hiện tại' },
  { value: 'walk', label: 'Đi bộ khám dáng (8 km/h)' },
  { value: 'trot', label: 'Chạy kiệu đối xứng (15 km/h)' },
  { value: 'conformation', label: 'Đứng đo thể hình' },
];

const LEG_INSPECT = [
  { value: null, label: 'Bình thường' },
  { value: 'RF', label: 'Chân trước phải' },
  { value: 'LF', label: 'Chân trước trái' },
  { value: 'RH', label: 'Chân sau phải' },
  { value: 'LH', label: 'Chân sau trái' },
];

export default function HorseDetailPage() {
  const { token } = theme.useToken();
  const { id } = useParams();
  const { data: lastExam } = useLastExam(id);
  const { user } = useSelector((state) => state.auth);
  const canRequestExam = user?.role === ROLES.HEAD_TRAINER || user?.role === ROLES.MANAGER;
  const isManager = user?.role === ROLES.MANAGER;
  const isTrainer = user?.role === ROLES.HEAD_TRAINER;
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [stageMode, setStageMode] = useState('studio');
  const [inspectMode, setInspectMode] = useState('walk');
  const [inspectLeg, setInspectLeg] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: listData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const herd = (listData?.data || []).filter((h) => !h.isArchived).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  const tab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'history';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['horses', id],
    queryFn: () => horsesApi.getOne(id),
  });
  const horse = data?.data;
  const { data: stallData } = useQuery({ queryKey: ['stall-of-horse', id], queryFn: () => stallApi.forHorse(id), enabled: Boolean(id) });
  const stallInfo = stallData?.data;
  const groom = stallInfo?.caretaker?.fullName || stallInfo?.caretaker?.name;
  const stallCode = stallInfo?.stall?.code || stallInfo?.stableBlock;

  const { data: plansData } = useQuery({
    queryKey: ['training-plans', 'horse-detail', id],
    queryFn: () => trainingPlanApi.list({ horse: id }),
    enabled: Boolean(id && (isTrainer || isManager)),
  });
  const { data: sessionsData } = useQuery({
    queryKey: ['training-sessions', 'horse-detail', id],
    queryFn: () => trainingSessionApi.list({ horse: id }),
    enabled: Boolean(id && (isTrainer || isManager)),
  });

  const activePlan = (plansData?.data || []).find((p) => p.status === 'active') || (plansData?.data || [])[0] || null;
  const planSurface = activePlan ? surfaceOf(activePlan) : 'turf';
  const horseSessions = sessionsData?.data || [];
  const doneSessions = horseSessions.filter((s) => DONE_STATUSES.includes(s.status));
  const metSessions = doneSessions.filter((s) => s.outcome?.met !== false);

  const offWork = Boolean(horse) && (horse.trainingClearance?.level === 'none' || Boolean(horse.trainingClearance?.restricted) || ['injured', 'quarantined'].includes(horse.healthStatus));
  const { data: injuryBundle } = useQuery({
    queryKey: ['horse-injury', id],
    queryFn: async () => {
      const [markers, records] = await Promise.all([vetApi.getInjuryMarkers({ horse: id }), vetApi.getHealthRecords({ horse: id })]);
      const markerList = markers?.data || [];
      return {
        markers: markerList,
        injury: injuryFrom({ markers: markerList, records: records?.data || [] }),
      };
    },
    enabled: Boolean(id && (offWork || stageMode === 'anatomy')),
  });
  const injury = injuryBundle?.injury || null;
  const injuryMarkers = injuryBundle?.markers || [];

  if (isLoading && !horse) {
    return (
      <div className="space-y-4">
        <Card loading className="!rounded-xl" />
        <Card loading className="!rounded-xl" />
      </div>
    );
  }

  if (isError && !horse) {
    return (
      <Alert
        type="error"
        showIcon
        title="Chưa tải được hồ sơ ngựa"
        description={error?.message || 'Không thể lấy dữ liệu hồ sơ ngựa lúc này.'}
        action={
          <Button size="small" onClick={() => refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  if (!horse) {
    return <Empty description="Không tìm thấy hồ sơ ngựa" />;
  }

  const achievementColumns = [
    { title: 'Giải đua', dataIndex: 'race', key: 'race', render: (v) => <span className="font-medium">{v}</span> },
    { title: 'Kết quả', dataIndex: 'result', key: 'result' },
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      render: (d) => <span className="tabular-nums text-xs">{d ? dayjs(d).format('DD/MM/YYYY') : '—'}</span>,
    },
  ];

  const clearanceLevel = horse.trainingClearance?.level || 'high';
  const at = herd.findIndex((h) => h._id === id);
  const prev = at > 0 ? herd[at - 1] : null;
  const next = at >= 0 && at < herd.length - 1 ? herd[at + 1] : null;
  const goTo = (to) => navigate(`/horses/${to}${tab === 'history' ? '' : `?tab=${tab}`}`);
  const coat = coatFor({ breed: horse.breed, color: horse.color });
  const clearance = horse.trainingClearance;

  const activeLeg = inspectLeg || injury?.leg || null;

  const activeMotion = (() => {
    if (activeLeg) {
      const legNames = { RF: 'chân trước phải', LF: 'chân trước trái', RH: 'chân sau phải', LH: 'chân sau trái' };
      if (inspectMode === 'conformation') {
        return {
          clip: 'Idle',
          kmh: 0,
          hold: true,
          marker: true,
          leg: activeLeg,
          tone: 'alert',
          label: `Đứng bảo vệ ${legNames[activeLeg]}`,
        };
      }
      return {
        clip: 'Walk',
        kmh: 7,
        timeScale: 0.72,
        limp: true,
        marker: true,
        leg: activeLeg,
        tone: 'alert',
        label: `Khám dáng bước · khập khiễng ${legNames[activeLeg]}`,
      };
    }
    if (inspectMode === 'clinical') {
      return restingMotion(horse, injury);
    }
    if (inspectMode === 'conformation') {
      return { clip: 'Idle_Look', kmh: 0, label: 'Đứng đo thể hình & đối xứng tứ chi' };
    }
    if (inspectMode === 'trot') {
      return { clip: 'Trot', kmh: 15, timeScale: 1.05, label: 'Chạy kiệu kiểm tra nhịp bước' };
    }
    return { clip: 'Walk', kmh: 8, timeScale: 0.92, label: 'Đi bộ kiểm tra dáng bước (Trot-up)' };
  })();

  const targetRaceObj = activePlan?.targetRace && activePlan.targetRace.status !== 'withdrawn' ? activePlan.targetRace : null;
  const targetRaceName = targetRaceObj?.race?.name || targetRaceObj?.raceName || null;
  const targetRaceDate = targetRaceObj?.race?.date || targetRaceObj?.raceDate || null;
  const completionPct = horseSessions.length > 0 ? Math.round((doneSessions.length / horseSessions.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Breadcrumb items={[{ title: <Link to="/horses">Danh sách đàn ngựa</Link> }, { title: horse.name }]} />
        {herd.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Tooltip title={prev ? `Ngựa trước: ${prev.name}` : null}>
              <Button size="small" icon={<LeftOutlined />} disabled={!prev} onClick={() => goTo(prev._id)} aria-label="Ngựa trước" />
            </Tooltip>
            <Select
              size="small"
              showSearch
              value={id}
              onChange={goTo}
              options={herd.map((h) => ({ value: h._id, label: h.name }))}
              filterOption={(input, option) => fold(option.label).includes(fold(input))}
              className="!w-56"
              aria-label="Xem ngựa khác"
            />
            <Tooltip title={next ? `Ngựa sau: ${next.name}` : null}>
              <Button size="small" icon={<RightOutlined />} disabled={!next} onClick={() => goTo(next._id)} aria-label="Ngựa sau" />
            </Tooltip>
          </div>
        )}
      </div>

      <PageHeroBanner
        eyebrow="Hồ sơ lý lịch & huấn luyện"
        roleLabel={ROLE_LABELS[user?.role] || 'Nhân sự CLB'}
        title={horse.name}
        subtitle={`${breedLabel(horse.breed)} · ${HORSE_SEX_LABELS[horse.sex] || '—'} · ${calcAge(horse.dob)}${stallCode ? ` · Chuồng ${stallCode}` : ''}`}
        stats={[
          {
            label: 'Sức khỏe',
            value: horse.examHold
              ? 'Chờ bác sĩ khám'
              : HEALTH_LABELS[horse.healthStatus] || (horse.healthStatus === 'fit' ? 'Đủ điều kiện' : horse.healthStatus),
          },
          { label: 'Mức cho phép tập', value: horse.examHold ? 'Tạm dừng tập' : TRAINING_LEVEL_META[clearanceLevel]?.label || clearanceLevel },
          { label: 'Lần khám gần nhất', value: examLine(lastExam) },
        ]}
        actionButton={
          canRequestExam ? (
            <Button
              type="primary"
              icon={<MedicineBoxOutlined />}
              onClick={() => setExamModalOpen(true)}
              className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer"
            >
              Yêu cầu bác sĩ kiểm tra
            </Button>
          ) : null
        }
      />
      {horse.examHold && <Alert className="!mb-4" type="error" showIcon title="Tạm dừng tập, chờ bác sĩ khám" description={horse.examHold.reason} />}

      <Row gutter={[16, 16]}>
        {/* Left column: 3D Equine Studio Showroom & X-Ray Anatomy / Biomechanics Stage */}
        <Col xs={24} lg={14}>
          <div
            className="flex h-full flex-col overflow-hidden rounded-xl border"
            style={{ borderColor: token.colorBorderSecondary, background: token.colorBgContainer }}
          >
            {/* Top Studio Stage Header: switch between 3D Biomechanics Studio Podium and 3D Anatomy/X-Ray Organ Map */}
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2"
              style={{ borderColor: token.colorBorderSecondary, background: token.colorFillQuaternary }}
            >
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-gray-800">
                  {stageMode === 'studio' ? 'Studio 3D Thể hình & Chẩn đoán Dáng bước' : 'Bản đồ Giải phẫu 3D (Ngoài da & X-quang Nội tạng)'}
                </span>
              </div>
              <div className="inline-flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: token.colorBorderSecondary, background: token.colorBgContainer }}>
                <button
                  type="button"
                  onClick={() => setStageMode('studio')}
                  className="cursor-pointer rounded-md border-0 px-2.5 py-1 text-xs font-semibold transition-colors"
                  style={{
                    background: stageMode === 'studio' ? '#06261b' : 'transparent',
                    color: stageMode === 'studio' ? '#facc15' : token.colorTextSecondary,
                  }}
                >
                  Studio Dáng bước 3D
                </button>
                <button
                  type="button"
                  onClick={() => setStageMode('anatomy')}
                  className="cursor-pointer rounded-md border-0 px-2.5 py-1 text-xs font-semibold transition-colors"
                  style={{
                    background: stageMode === 'anatomy' ? '#06261b' : 'transparent',
                    color: stageMode === 'anatomy' ? '#facc15' : token.colorTextSecondary,
                  }}
                >
                  Giải phẫu & Nội tạng 3D
                </button>
              </div>
            </div>

            {stageMode === 'studio' ? (
              <>
                <div className="relative min-h-[340px] flex-1 overflow-hidden">
                  <MovingHorse3D
                    fill
                    view="free"
                    surface="pasture"
                    breed={horse.breed}
                    color={horse.color}
                    motion={activeMotion}
                    height="clamp(340px, 34vw, 430px)"
                  />
                </div>

                {/* Dedicated 3D Veterinary Gait & Limb Assessment Dock below the Studio canvas */}
                <div
                  className="flex flex-col gap-2 border-t px-3.5 py-2.5 text-xs"
                  style={{ borderColor: token.colorBorderSecondary, background: token.colorFillQuaternary }}
                >
                  <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Chế độ kiểm tra dáng bước 3D">
                    <span className="mr-1 font-medium text-gray-600">Bài kiểm tra 3D:</span>
                    {INSPECTION_MODES.map((opt) => {
                      const active = inspectMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setInspectMode(opt.value)}
                          className="cursor-pointer rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors"
                          style={{
                            borderColor: active ? '#d4af37' : token.colorBorderSecondary,
                            background: active ? '#eab308' : token.colorBgContainer,
                            color: active ? '#0f172a' : token.colorText,
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-1 border-t pt-2" style={{ borderColor: token.colorBorderSecondary }}>
                    <span className="mr-1 font-medium text-gray-600">Khám tứ chi 3D:</span>
                    {LEG_INSPECT.map((l) => {
                      const active = activeLeg === l.value;
                      return (
                        <button
                          key={l.value || 'normal'}
                          type="button"
                          onClick={() => setInspectLeg(l.value)}
                          className="cursor-pointer rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors"
                          style={{
                            borderColor: active ? (l.value ? '#ef4444' : '#16a34a') : token.colorBorderSecondary,
                            background: active ? (l.value ? '#fef2f2' : '#f0fdf4') : token.colorBgContainer,
                            color: active ? (l.value ? '#b91c1c' : '#15803d') : token.colorTextSecondary,
                          }}
                        >
                          {l.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 p-2" style={{ background: '#02120d' }}>
                <HorseInjuryViewer horse={horse} injuries={injuryMarkers} height={420} />
              </div>
            )}
          </div>
        </Col>

        {/* Right column: Equine Digital Passport & Training Readiness Dossier */}
        <Col xs={24} lg={10}>
          <Card
            className="hp-card h-full !rounded-xl !border-[#E2D9C8]"
            styles={{ body: { display: 'flex', flexDirection: 'column', height: 'calc(100% - 57px)' } }}
            title="Hồ sơ lý lịch & chỉ số huấn luyện"
            extra={stallCode ? <Tag color="gold" className="!m-0 font-semibold tabular-nums">Chuồng {stallCode}</Tag> : null}
          >
            {/* 4 Conformation & Identity Metric Tiles */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border px-3 py-2" style={{ borderColor: token.colorBorderSecondary, background: token.colorFillQuaternary }}>
                <div className="text-[11px] text-gray-500">Giống & dòng máu</div>
                <div className="mt-0.5 truncate text-[13px] font-semibold text-gray-900">{breedLabel(horse.breed) || '—'}</div>
                <div className="text-[11px] text-gray-500">{HORSE_SEX_LABELS[horse.sex] || '—'}</div>
              </div>

              <div className="rounded-lg border px-3 py-2" style={{ borderColor: token.colorBorderSecondary, background: token.colorFillQuaternary }}>
                <div className="text-[11px] text-gray-500">Màu lông & nhận diện</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: coat.swatch }} />
                  <span>{coatLabel(horse.color) || coat.label}</span>
                </div>
                <div className="text-[11px] tabular-nums text-gray-500">
                  {horse.microchipNumber ? (
                    <span>Vi mạch: <span>{horse.microchipNumber}</span></span>
                  ) : stallCode ? (
                    `Khu chuồng ${stallCode}`
                  ) : (
                    'Đã định danh CLB'
                  )}
                </div>
              </div>

              <div className="rounded-lg border px-3 py-2" style={{ borderColor: token.colorBorderSecondary, background: token.colorFillQuaternary }}>
                <div className="text-[11px] text-gray-500">Độ tuổi & ngày sinh</div>
                <div className="mt-0.5 text-[13px] font-semibold tabular-nums text-gray-900">{calcAge(horse.dob)}</div>
                <div className="text-[11px] tabular-nums text-gray-500">
                  {horse.dob ? `NS: ${dayjs(horse.dob).format('DD/MM/YYYY')}` : 'Chưa ghi nhận NS'}
                </div>
              </div>

              <div className="rounded-lg border px-3 py-2" style={{ borderColor: token.colorBorderSecondary, background: token.colorFillQuaternary }}>
                <div className="text-[11px] text-gray-500">Cân nặng & đăng ký</div>
                <div className="mt-0.5 text-[13px] font-semibold tabular-nums text-gray-900">
                  {horse.weightKg ? `${horse.weightKg} kg` : '—'}
                </div>
                <div className="text-[11px] text-gray-500">
                  {horse.registrationNumber ? (
                    <span>Số ĐK: <span>{horse.registrationNumber}</span></span>
                  ) : 'valuationVnd' in horse && horse.valuationVnd ? (
                    formatVnd(horse.valuationVnd)
                  ) : (
                    'Thể hình tiêu chuẩn đua'
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Active Training Plan Progress & Target Race */}
            <div className="st-sub-panel light-surface-box mt-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-gray-900">Tiến độ giáo án & giải đua mục tiêu</span>
                {activePlan && (
                  <Tag color="green" className="!m-0 text-[11px] tabular-nums">
                    {activePlan.weeksCount || 6} tuần · {SURFACE_LABELS[planSurface] || 'Sân cỏ'}
                  </Tag>
                )}
              </div>

              <Facts
                items={[
                  [
                    'Giáo án hiện tại',
                    activePlan ? (
                      <Link key="plan" to={`/training/plans?plan=${activePlan._id}`} className="font-semibold">
                        {PHASE_LABELS[activePlan.phase] || activePlan.goal || 'Nền tảng sức bền'}
                      </Link>
                    ) : (
                      'Chưa gán giáo án'
                    ),
                  ],
                  [
                    'Giải đua mục tiêu',
                    targetRaceName ? (
                      <Link key="race" to={`/races?horse=${horse._id}`} className="font-semibold tabular-nums">
                        {targetRaceName}{targetRaceDate ? ` (${dayjs(targetRaceDate).format('DD/MM')})` : ''}
                      </Link>
                    ) : (
                      'Chưa đăng ký giải'
                    ),
                  ],
                ]}
              />

              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Khối lượng buổi tập đã hoàn thành</span>
                  <span className="font-semibold tabular-nums text-gray-900">
                    {horseSessions.length > 0
                      ? `${doneSessions.length}/${horseSessions.length} buổi (${metSessions.length} đạt chuẩn)`
                      : 'Chưa có buổi tập'}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(horseSessions.length > 0 ? 12 : 0, completionPct)}%`,
                      background: 'linear-gradient(90deg, #15803d 0%, #eab308 100%)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Section 3: 4-Department Care Team */}
            <div className="st-sub-panel light-surface-box mt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-gray-900">Đội ngũ phụ trách (4 bộ phận)</span>
                {isManager && <Link to={`/admin/stables?horse=${horse._id}`} className="text-xs">Đổi chuồng trên sơ đồ</Link>}
              </div>
              <Facts
                items={[
                  ['Chủ sở hữu', horse.owner?.name || 'CLB sở hữu'],
                  ['HLV trưởng', horse.assignedTrainer?.name || 'Chưa phân công'],
                  ['Bác sĩ thú y', horse.assignedVet?.name || 'Chưa phân công'],
                  ['NV chăm sóc', groom || 'Chưa phân công'],
                ]}
              />
            </div>

            {clearance?.restricted && (
              <Alert
                className="!mt-3"
                type="warning"
                showIcon
                title={`${TRAINING_LEVEL_META[clearanceLevel]?.label || 'Hạn chế tập'}${clearance.reason ? `: ${clearance.reason}` : ''}`}
                description={`Theo phác đồ của bác sĩ ${clearance.prescribedBy || ''}${clearance.since ? ` từ ${dayjs(clearance.since).format('DD/MM')}` : ''}.`}
              />
            )}
            {horse.feedingDiet && (
              <Alert
                className="!mt-3"
                type={horse.feedingDiet.diet === 'sick' ? 'warning' : 'info'}
                showIcon
                title={horse.feedingDiet.diet === 'sick' ? `Chế độ ăn theo y lệnh: ${horse.feedingDiet.label}` : horse.feedingDiet.label}
                description={[horse.feedingDiet.care, horse.feedingDiet.note ? `Lưu ý bác sĩ: ${horse.feedingDiet.note}` : null].filter(Boolean).join(' ')}
              />
            )}

            {/* Quick navigation actions pinned to bottom */}
            {(isTrainer || isManager) && (
              <div className="mt-auto border-t pt-3" style={{ borderColor: token.colorBorderSecondary }}>
                {isTrainer && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                    <Link to={`/training/sessions?horse=${horse._id}`} className="block">
                      <Button size="small" block icon={<CalendarOutlined />}>
                        Lịch tập
                      </Button>
                    </Link>
                    <Link to={`/training/plans?horse=${horse._id}`} className="block">
                      <Button size="small" block icon={<ScheduleOutlined />}>
                        Kế hoạch
                      </Button>
                    </Link>
                    <Link to={`/stable/tasks?horse=${horse._id}`} className="block">
                      <Button size="small" block icon={<HomeOutlined />}>
                        Khẩu phần
                      </Button>
                    </Link>
                    <Link to={`/races?horse=${horse._id}`} className="block">
                      <Button size="small" block icon={<TrophyOutlined />}>
                        Giải đua
                      </Button>
                    </Link>
                  </div>
                )}
                {isManager && (
                  <Link to={`/admin/stables?horse=${horse._id}`} className="block">
                    <Button size="small" block icon={<HomeOutlined />}>
                      Xem trên sơ đồ chuồng
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Tabs
        className="hp-tabs"
        activeKey={tab}
        onChange={(key) => setSearchParams(key === 'history' ? {} : { tab: key }, { replace: true })}
        items={[
          { key: 'history', label: 'Dòng thời gian', children: <HorseTimeline horseId={horse._id} /> },
          { key: 'care', label: 'Chăm sóc định kỳ', children: <CareHistoryCard horseId={horse._id} /> },
          { key: 'stall', label: stallCode ? `Chuồng ${stallCode}` : 'Chuồng', children: <HorseStallCard horseId={horse._id} canManage={isManager} /> },
          {
            key: 'races',
            label: `Thành tích thi đấu${horse.achievements?.length ? ` (${horse.achievements.length})` : ''}`,
            children: (
              <Card className="!rounded-xl">
                <Table
                  rowKey={(r) => `${r.race}-${r.date}`}
                  columns={achievementColumns}
                  dataSource={horse.achievements}
                  pagination={{ pageSize: 8, hideOnSinglePage: true, size: 'small', showTotal: (total) => `${total} giải` }}
                  scroll={{ x: 'max-content' }}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa ghi nhận thành tích thi đấu chính thức" /> }}
                />
              </Card>
            ),
          },
        ]}
      />

      {canRequestExam && examModalOpen && <RequestExamModal horse={horse} onClose={() => setExamModalOpen(false)} />}
    </div>
  );
}
