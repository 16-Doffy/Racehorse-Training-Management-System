import { useState } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { Table, Card, Breadcrumb, Empty, Button, Alert, Tabs, Select, Tooltip } from 'antd';
import { HORSE_SEX_LABELS, formatVnd } from '../../constants/horse';
import {
  CalendarOutlined,
  HeartOutlined,
  HomeOutlined,
  LeftOutlined,
  MedicineBoxOutlined,
  RightOutlined,
  ScheduleOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { fold } from '../../utils/fold';
import { horsesApi } from './horsesApi';
import HorseTimeline from './HorseTimeline';
import CareHistoryCard from './CareHistoryCard';
import HorseStallCard from '../stable/HorseStallCard';
import { stallApi } from '../stable/stableApi';
import { trainingPlanApi, trainingSessionApi } from '../training/trainingApi';
import { PHASE_LABELS, DONE_STATUSES } from '../training/trainingVocab';
import vetApi from '../../api/veterinarianApi';
import MovingHorse3D from './horse3d/MovingHorse3D';
import { injuryFrom, restingMotion } from './horse3d/horseMotion';
import { breedLabel, coatFor, coatLabel } from './horse3d/horseBreeds';
import { HEALTH_LABELS, TRAINING_LEVEL_META } from '../../constants/health';
import RequestExamModal from '../health/RequestExamModal';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import dayjs from 'dayjs';
import { EXAM_CONCLUSIONS, useLastExam, when } from '../health/useLastExam';
import './horseProfile.css';

/** Calculate age string from date of birth */
function calcAge(dob) {
  if (!dob) return 'Chưa rõ tuổi';
  const now = dayjs();
  const birth = dayjs(dob);
  if (!birth.isValid()) return 'Chưa rõ tuổi';
  const years = now.diff(birth, 'year');
  const months = now.diff(birth, 'month') % 12;
  if (years === 0) return `${months} tháng tuổi`;
  return months > 0 ? `${years} tuổi ${months} tháng` : `${years} tuổi`;
}

const HEALTH_TONE = { eligible: 'good', monitoring: 'warn', injured: 'danger', quarantined: 'danger' };
const TABS = ['history', 'care', 'stall', 'races'];

/** One figure in the header: what it is, its value in its colour, a line under it. */
function Kpi({ icon, label, value, sub, tone = 'neutral', title }) {
  return (
    <div className={`hp-kpi is-${tone}`} title={title}>
      <span className="hp-kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="hp-kpi-label">{label}</div>
        <div className="hp-kpi-value">{value}</div>
        {sub && <div className="hp-kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}

/** A person who looks after the horse: initial, name, role. */
function Person({ name, role, empty }) {
  return (
    <li className={`hp-person${name ? '' : ' is-empty'}`}>
      <span className="hp-person-initial" aria-hidden="true">
        {name ? name.trim().split(/\s+/).pop()[0] : '?'}
      </span>
      <span className="min-w-0">
        <span className="hp-person-name">{name || empty}</span>
        <span className="hp-person-role">{role}</span>
      </span>
    </li>
  );
}

/**
 * The staff's horse page (the Horse Owner has their own, features/owner/OwnerHorse.jsx): who the horse is and
 * where it stands in four figures, the horse in 3D at rest beside its record and the people in charge, where its
 * training is (plan, race, sessions done) with the trainer's ways on, then the rest of the record in tabs.
 */
export default function HorseDetailPage() {
  const { id } = useParams();
  const { data: lastExam } = useLastExam(id);
  const { user } = useSelector((state) => state.auth);
  const canRequestExam = user?.role === ROLES.HEAD_TRAINER || user?.role === ROLES.MANAGER;
  const isManager = user?.role === ROLES.MANAGER;
  const isTrainer = user?.role === ROLES.HEAD_TRAINER;
  const [examModalOpen, setExamModalOpen] = useState(false);
  // ?tab=care|stall|races opens that part of the page (a link from the stable map, say).
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // The other horses (the same list as the horse list page, cached): the page moves from one to the next.
  const { data: listData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const herd = (listData?.data || []).filter((h) => !h.isArchived).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  const tab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'history';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['horses', id],
    queryFn: () => horsesApi.getOne(id),
  });
  const horse = data?.data;
  // The stall and its groom (the same request as the stall card in its tab, so it is made once).
  const { data: stallData } = useQuery({ queryKey: ['stall-of-horse', id], queryFn: () => stallApi.forHorse(id), enabled: Boolean(id) });
  const stallInfo = stallData?.data;
  const groom = stallInfo?.caretaker?.fullName || stallInfo?.caretaker?.name;
  const stallCode = stallInfo?.stall?.code || stallInfo?.stableBlock;

  // Its training: the plan it follows and its sessions (the trainer's and the Manager's view).
  const showsTraining = isTrainer || isManager;
  const { data: plansData } = useQuery({
    queryKey: ['training-plans', 'horse-detail', id],
    queryFn: () => trainingPlanApi.list({ horse: id }),
    enabled: Boolean(id && showsTraining),
  });
  const { data: sessionsData } = useQuery({
    queryKey: ['training-sessions', 'horse-detail', id],
    queryFn: () => trainingSessionApi.list({ horse: id }),
    enabled: Boolean(id && showsTraining),
  });

  // Off training or back on light work: where it hurts, from the vet's records — the 3D horse holds up that leg.
  const offWork = Boolean(horse) && (horse.trainingClearance?.level === 'none' || Boolean(horse.trainingClearance?.restricted) || ['injured', 'quarantined'].includes(horse.healthStatus));
  const { data: injury } = useQuery({
    queryKey: ['horse-injury', id],
    queryFn: async () => {
      const [markers, records] = await Promise.all([vetApi.getInjuryMarkers({ horse: id }), vetApi.getHealthRecords({ horse: id })]);
      return injuryFrom({ markers: markers?.data || [], records: records?.data || [] });
    },
    enabled: offWork,
  });

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
  const clearance = horse.trainingClearance;
  const at = herd.findIndex((h) => h._id === id);
  const prev = at > 0 ? herd[at - 1] : null;
  const next = at >= 0 && at < herd.length - 1 ? herd[at + 1] : null;
  const goTo = (to) => navigate(`/horses/${to}${tab === 'history' ? '' : `?tab=${tab}`}`);
  const coat = coatFor({ breed: horse.breed, color: horse.color });

  // The four things a trainer looks for first, each in words and a colour.
  const health = horse.examHold ? { value: 'Chờ bác sĩ khám', tone: 'danger' } : { value: HEALTH_LABELS[horse.healthStatus] || horse.healthStatus, tone: HEALTH_TONE[horse.healthStatus] || 'neutral' };
  const sick = ['injured', 'quarantined'].includes(horse.healthStatus);
  const training = horse.examHold
    ? { value: 'Tạm dừng tập', tone: 'danger', sub: 'Chờ kết luận của bác sĩ' }
    : sick || clearanceLevel === 'none'
      ? { value: 'Không được tập', tone: 'danger', sub: clearance?.reason || 'Theo y lệnh của bác sĩ' }
      : clearance?.restricted
        ? { value: TRAINING_LEVEL_META[clearanceLevel]?.label || 'Hạn chế tập', tone: 'warn', sub: clearance.reason || 'Theo phác đồ đang điều trị' }
        : { value: 'Tập bình thường', tone: 'good', sub: 'Không có hạn chế' };
  const exam = lastExam
    ? {
        value: `${dayjs(when(lastExam)).format('DD/MM')} · ${EXAM_CONCLUSIONS[lastExam.resultStatus] || lastExam.resultStatus}`,
        sub: lastExam.diagnosis || `${dayjs().diff(dayjs(when(lastExam)), 'day')} ngày trước`,
        tone: HEALTH_TONE[lastExam.resultStatus] || 'neutral',
      }
    : { value: 'Chưa khám', sub: 'Chưa có phiếu khám nào', tone: 'warn' };

  // Where its training is: the plan, the race it aims at, the sessions done and met.
  const plans = plansData?.data || [];
  const activePlan = plans.find((p) => p.status === 'active') || null;
  const progress = activePlan?.progress || {};
  const race = activePlan?.targetRace && activePlan.targetRace.status !== 'withdrawn' ? activePlan.targetRace : null;
  const raceName = race?.race?.name || race?.raceName || null;
  const raceDate = race?.race?.date || race?.raceDate || null;
  const sessions = sessionsData?.data || [];
  const done = sessions.filter((s) => DONE_STATUSES.includes(s.status));
  const met = done.filter((s) => s.outcome?.met === true);
  const donePct = sessions.length ? Math.round((done.length / sessions.length) * 100) : 0;
  const planWhere = !activePlan
    ? null
    : !progress.started
      ? `Bắt đầu ${dayjs(activePlan.startDate).format('DD/MM')}`
      : progress.ended
        ? 'Đã hết kế hoạch'
        : `tuần ${progress.week}/${progress.totalWeeks}`;

  return (
    <div className="hp space-y-4">
      {/* Where it sits, and the way to the next horse without going back to the list (same tab kept). */}
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

      {/* ---------- Who the horse is, and its state in four figures ---------- */}
      <section className="hp-hero">
        <div className="hp-hero-top">
          <span className="hp-avatar" style={{ background: coat.swatch }} aria-hidden="true">
            {horse.name?.[0]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="hp-eyebrow">Hồ sơ ngựa · {ROLE_LABELS[user?.role] || 'Nhân sự CLB'}</div>
            <h1 className="hp-name">{horse.name}</h1>
            <div className="hp-sub">
              <span>{breedLabel(horse.breed) || 'Chưa rõ giống'}</span>
              <span>{HORSE_SEX_LABELS[horse.sex] || 'Chưa rõ giới tính'}</span>
              <span>{calcAge(horse.dob)}</span>
              {horse.weightKg ? <span>{horse.weightKg} kg</span> : null}
            </div>
          </div>
          {canRequestExam && (
            <Button type="primary" size="large" icon={<MedicineBoxOutlined />} onClick={() => setExamModalOpen(true)} className="hp-cta">
              Yêu cầu bác sĩ kiểm tra
            </Button>
          )}
        </div>
        <div className="hp-kpis">
          <Kpi icon={<HeartOutlined />} label="Sức khỏe" value={health.value} tone={health.tone} sub={horse.examHold?.reason || 'Theo kết luận gần nhất của bác sĩ'} />
          <Kpi icon={<ThunderboltOutlined />} label="Được tập" value={training.value} tone={training.tone} sub={training.sub} />
          <Kpi icon={<MedicineBoxOutlined />} label="Khám gần nhất" value={exam.value} tone={exam.tone} sub={exam.sub} title={lastExam?.diagnosis || undefined} />
          <Kpi icon={<HomeOutlined />} label="Chuồng & chăm sóc" value={stallCode ? `Chuồng ${stallCode}` : 'Chưa xếp chuồng'} sub={groom ? `NV chăm sóc: ${groom}` : 'Chưa có nhân viên chăm sóc'} />
        </div>
      </section>

      {/* What holds the horse back or changes its meals, in a line each. */}
      {horse.examHold && <Alert type="error" showIcon title="Tạm dừng tập, chờ bác sĩ khám" description={horse.examHold.reason} />}
      {clearance?.restricted && (
        <Alert
          type="warning"
          showIcon
          title={`${TRAINING_LEVEL_META[clearanceLevel]?.label || 'Hạn chế tập'}${clearance.reason ? `: ${clearance.reason}` : ''}`}
          description={`Theo phác đồ của bác sĩ ${clearance.prescribedBy || ''}${clearance.since ? ` từ ${dayjs(clearance.since).format('DD/MM')}` : ''}. Hết hạn chế khi bác sĩ nâng mức hoặc kết thúc điều trị.`}
        />
      )}
      {horse.feedingDiet && (
        <Alert
          type={horse.feedingDiet.diet === 'sick' ? 'warning' : 'info'}
          showIcon
          title={horse.feedingDiet.diet === 'sick' ? `Chế độ ăn theo y lệnh: ${horse.feedingDiet.label}` : horse.feedingDiet.label}
          description={[horse.feedingDiet.care, horse.feedingDiet.note ? `Lưu ý bác sĩ: ${horse.feedingDiet.note}` : null].filter(Boolean).join(' ')}
        />
      )}

      {/* ---------- The horse in 3D, beside its record and its people ---------- */}
      <div className="hp-body">
        {/* At rest it is out in the pasture (the sessions page shows it on its training track), in the breed and
            coat the Manager set, doing what its health allows. */}
        <div className="hp-stage">
          <MovingHorse3D fill breed={horse.breed} color={horse.color} motion={restingMotion(horse, injury)} surface="pasture" height="clamp(340px, 38vw, 560px)" rearable />
        </div>

        <aside className="hp-side">
          <section className="hp-card">
            <h2 className="hp-card-title">Hồ sơ lý lịch</h2>
            <dl className="hp-facts">
              <div>
                <dt>Giống</dt>
                <dd>{breedLabel(horse.breed) || '—'}</dd>
              </div>
              <div>
                <dt>Màu lông</dt>
                <dd>
                  <span className="hp-swatch" style={{ background: coat.swatch }} aria-hidden="true" />
                  {coatLabel(horse.color) || coat.label}
                </dd>
              </div>
              <div>
                <dt>Giới tính</dt>
                <dd>{HORSE_SEX_LABELS[horse.sex] || '—'}</dd>
              </div>
              <div>
                <dt>Ngày sinh</dt>
                <dd className="tabular-nums">{horse.dob ? `${dayjs(horse.dob).format('DD/MM/YYYY')} (${calcAge(horse.dob)})` : '—'}</dd>
              </div>
              <div>
                <dt>Cân nặng</dt>
                <dd className="tabular-nums">{horse.weightKg ? `${horse.weightKg} kg` : '—'}</dd>
              </div>
              <div>
                <dt>Số vi mạch</dt>
                <dd className="font-mono text-xs">{horse.microchipNumber || '—'}</dd>
              </div>
              <div>
                <dt>Số đăng ký</dt>
                <dd className="font-mono text-xs">{horse.registrationNumber || '—'}</dd>
              </div>
              {/* Sent only to the Manager and the owner. */}
              {'valuationVnd' in horse && (
                <div>
                  <dt>Định giá</dt>
                  <dd className="tabular-nums font-semibold">{formatVnd(horse.valuationVnd)}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Who looks after the horse: the people the Manager assigns on the horse form, and its stall's groom. */}
          <section className="hp-card">
            <h2 className="hp-card-title">Người phụ trách</h2>
            <ul className="hp-people">
              <Person name={horse.owner?.name} role="Chủ sở hữu" empty="CLB sở hữu" />
              <Person name={horse.assignedTrainer?.name} role="HLV phụ trách" empty="Chưa phân công HLV" />
              <Person name={horse.assignedVet?.name} role="Bác sĩ phụ trách" empty="Chưa phân công bác sĩ" />
              <Person name={groom} role={stallCode ? `Nhân viên chăm sóc · chuồng ${stallCode}` : 'Nhân viên chăm sóc'} empty="Chưa có nhân viên chăm sóc" />
            </ul>
            {isManager && (
              <Link className="hp-link" to={`/admin/stables?horse=${horse._id}`}>
                Đổi chuồng trên sơ đồ →
              </Link>
            )}
          </section>
        </aside>
      </div>

      {/* ---------- Its training: the plan, the race, the sessions done, and the ways on ---------- */}
      {showsTraining && (
        <section className="hp-train">
          <div className="hp-train-item">
            <span className="hp-train-label">
              <ScheduleOutlined /> Kế hoạch huấn luyện
            </span>
            {activePlan ? (
              <Link to={`/training/plans?plan=${activePlan._id}`} className="hp-train-value">
                {PHASE_LABELS[activePlan.phase] || activePlan.goal || 'Đang áp dụng'}
              </Link>
            ) : (
              <span className="hp-train-value is-empty">Chưa có kế hoạch</span>
            )}
            <span className="hp-train-sub">{planWhere || 'Lập kế hoạch để hệ thống tự xếp buổi tập và lịch ăn'}</span>
          </div>
          <div className="hp-train-item">
            <span className="hp-train-label">
              <TrophyOutlined /> Giải mục tiêu
            </span>
            {raceName ? (
              <Link to={`/races?horse=${horse._id}`} className="hp-train-value">
                {raceName}
              </Link>
            ) : (
              <span className="hp-train-value is-empty">Chưa đăng ký giải</span>
            )}
            <span className="hp-train-sub">
              {raceDate ? `${dayjs(raceDate).format('DD/MM/YYYY')}${progress.raceInDays >= 0 ? ` · còn ${progress.raceInDays} ngày` : ''}` : 'Ngựa vẫn tập được khi chưa có giải'}
            </span>
          </div>
          <div className="hp-train-item">
            <span className="hp-train-label">
              <CalendarOutlined /> Buổi tập đã xong
            </span>
            <span className="hp-train-value tabular-nums">{sessions.length ? `${done.length}/${sessions.length} buổi` : 'Chưa có buổi tập'}</span>
            <div className="hp-train-bar" aria-hidden="true">
              <span style={{ width: `${donePct}%` }} />
            </div>
            <span className="hp-train-sub">{done.length ? `${met.length} buổi đạt chỉ tiêu` : 'Chưa có buổi nào chạy xong'}</span>
          </div>
          {isTrainer && (
            <div className="hp-train-actions">
              <Button icon={<CalendarOutlined />} onClick={() => navigate(`/training/sessions?horse=${horse._id}`)}>
                Lịch tập
              </Button>
              <Button icon={<ScheduleOutlined />} onClick={() => navigate(activePlan ? `/training/plans?plan=${activePlan._id}` : '/training/plans')}>
                Kế hoạch
              </Button>
              <Button icon={<HomeOutlined />} onClick={() => navigate(`/stable/tasks?horse=${horse._id}`)}>
                Khẩu phần
              </Button>
              <Button icon={<TrophyOutlined />} onClick={() => navigate(`/races?horse=${horse._id}`)}>
                Giải đua
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ---------- The rest of the record, one part at a time (the stall's 3D barn is drawn only when its tab is open) ---------- */}
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
