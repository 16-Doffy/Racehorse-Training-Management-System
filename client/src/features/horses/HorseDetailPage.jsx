import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { Table, Card, Breadcrumb, Row, Col, Empty, Button, Alert, Tabs } from 'antd';
import { HORSE_SEX_LABELS, formatVnd } from '../../constants/horse';
import { MedicineBoxOutlined } from '@ant-design/icons';
import { horsesApi } from './horsesApi';
import HorseTimeline from './HorseTimeline';
import CareHistoryCard from './CareHistoryCard';
import HorseStallCard from '../stable/HorseStallCard';
import { stallApi } from '../stable/stableApi';
import vetApi from '../../api/veterinarianApi';
import MovingHorse3D from './horse3d/MovingHorse3D';
import { injuryFrom, restingMotion } from './horse3d/horseMotion';
import { breedLabel, coatFor, coatLabel } from './horse3d/horseBreeds';
import { HEALTH_LABELS, TRAINING_LEVEL_META } from '../../constants/health';
import RequestExamModal from '../health/RequestExamModal';
import { ROLES, ROLE_LABELS } from '../../constants/roles';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import dayjs from 'dayjs';

/** Calculate age string from date of birth */
function calcAge(dob) {
  if (!dob) return 'Chưa rõ';
  const now = dayjs();
  const birth = dayjs(dob);
  const years = now.diff(birth, 'year');
  const months = now.diff(birth, 'month') % 12;
  if (years === 0) return `${months} tháng tuổi`;
  return months > 0 ? `${years} tuổi ${months} tháng` : `${years} tuổi`;
}

/** Facts in a grid, the label small above its value; `items` are [label, value] or null. */
function Facts({ items, className = '' }) {
  return (
    <dl className={`m-0 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 min-[992px]:grid-cols-2 2xl:grid-cols-3 ${className}`}>
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-gray-500">{label}</dt>
          <dd className="m-0 mt-0.5 break-words text-[13px] text-gray-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const TABS = ['history', 'stall', 'races'];

// The Horse Owner has their own horse page (features/owner/OwnerHorse.jsx); this one is the staff's.
export default function HorseDetailPage() {
  const { id } = useParams();
  const { user } = useSelector((state) => state.auth);
  const canRequestExam = user?.role === ROLES.HEAD_TRAINER || user?.role === ROLES.MANAGER;
  const isManager = user?.role === ROLES.MANAGER;
  const [examModalOpen, setExamModalOpen] = useState(false);
  // ?tab=stall|races opens that part of the page (a link from the stable map, say).
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'history';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['horses', id],
    queryFn: () => horsesApi.getOne(id),
  });
  const horse = data?.data;
  // The stall and its groom (the same request as the stall card in its tab, so it is made once).
  const { data: stallData } = useQuery({ queryKey: ['stall-of-horse', id], queryFn: () => stallApi.forHorse(id), enabled: Boolean(id) });
  const stallInfo = stallData?.data;
  const groom = stallInfo?.caretaker?.name;
  const stallCode = stallInfo?.stall?.code || stallInfo?.stableBlock;
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
        <Card loading className="!rounded-xl !border-[#E2D9C8]" />
        <Card loading className="!rounded-xl !border-[#E2D9C8]" />
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
      render: (d) => <span className="tabular-nums text-xs text-slate-600">{d ? dayjs(d).format('DD/MM/YYYY') : '—'}</span>,
    },
  ];

  const clearanceLevel = horse.trainingClearance?.level || 'high';
  const coat = coatFor({ breed: horse.breed, color: horse.color });
  const clearance = horse.trainingClearance;
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ title: <Link to="/horses">Danh sách đàn ngựa</Link> }, { title: horse.name }]} />

      <PageHeroBanner
        eyebrow="Hồ sơ lý lịch"
        roleLabel={ROLE_LABELS[user?.role] || 'Nhân sự CLB'}
        title={horse.name}
        subtitle={`${breedLabel(horse.breed)} · ${HORSE_SEX_LABELS[horse.sex] || '—'} · ${calcAge(horse.dob) || 'Chưa rõ tuổi'}`}
        stats={[
          { label: 'Sức khỏe', value: HEALTH_LABELS[horse.healthStatus] || horse.healthStatus },
          { label: 'Mức cho phép tập', value: TRAINING_LEVEL_META[clearanceLevel]?.label || clearanceLevel },
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

      <Row gutter={[16, 16]}>
        {/* The horse in 3D, in the breed and coat the Manager set, doing what its health allows. */}
        <Col xs={24} lg={13}>
          {/* At rest it is out in the pasture (the sessions page shows it on its training track). */}
          <MovingHorse3D creditInFrame breed={horse.breed} color={horse.color} motion={restingMotion(horse, injury)} surface="pasture" height="clamp(300px, 34vw, 470px)" />
        </Col>
        <Col xs={24} lg={11}>
          <Card className="h-full !rounded-xl !border-[#E2D9C8]" title="Hồ sơ lý lịch">
            <Facts
              items={[
                ['Giống', breedLabel(horse.breed) || '—'],
                [
                  'Màu lông',
                  <span key="coat" className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/15" style={{ background: coat.swatch }} />
                    {coatLabel(horse.color) || coat.label}
                  </span>,
                ],
                ['Giới tính', HORSE_SEX_LABELS[horse.sex] || '—'],
                ['Ngày sinh', <span key="dob" className="tabular-nums">{horse.dob ? `${dayjs(horse.dob).format('DD/MM/YYYY')} (${calcAge(horse.dob)})` : '—'}</span>],
                ['Cân nặng', <span key="kg" className="tabular-nums">{horse.weightKg ? `${horse.weightKg} kg` : '—'}</span>],
                ['Số vi mạch', <span key="chip" className="font-mono tabular-nums text-xs">{horse.microchipNumber || '—'}</span>],
                ['Số đăng ký', <span key="reg" className="font-mono tabular-nums text-xs">{horse.registrationNumber || '—'}</span>],
                // Sent only to the Manager and the owner.
                'valuationVnd' in horse ? ['Định giá', <span key="vnd" className="tabular-nums font-semibold">{formatVnd(horse.valuationVnd)}</span>] : null,
              ]}
            />

            {/* Who looks after the horse: the people the Manager assigns on the horse form, and its stall and groom. */}
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="mb-2 text-[13px] font-semibold text-gray-900">Người phụ trách</div>
              <Facts
                items={[
                  ['Chủ sở hữu', horse.owner?.name || 'CLB sở hữu'],
                  ['HLV phụ trách', horse.assignedTrainer?.name || 'Chưa phân công'],
                  ['Bác sĩ phụ trách', horse.assignedVet?.name || 'Chưa phân công'],
                  ['Nhân viên chăm sóc', groom || 'Chưa có'],
                  [
                    'Chuồng',
                    <span key="stall" className="flex flex-wrap items-baseline gap-x-2">
                      <span className="tabular-nums">{stallCode || 'Chưa xếp'}</span>
                      {isManager && <Link to={`/admin/stables?horse=${horse._id}`}>Đổi chuồng trên sơ đồ</Link>}
                    </span>,
                  ],
                ]}
              />
            </div>

            {clearance?.restricted && (
              <Alert
                className="!mt-4"
                type="warning"
                showIcon
                title={`${TRAINING_LEVEL_META[clearanceLevel]?.label || 'Hạn chế tập'}${clearance.reason ? `: ${clearance.reason}` : ''}`}
                description={`Theo phác đồ của bác sĩ ${clearance.prescribedBy || ''}${clearance.since ? ` từ ${dayjs(clearance.since).format('DD/MM')}` : ''}. Hết hạn chế khi bác sĩ nâng mức hoặc kết thúc điều trị.`}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* The rest of the record, one part at a time: the stall's 3D barn is drawn only when its tab is open. */}
      <Tabs
        activeKey={tab}
        onChange={(key) => setSearchParams(key === 'history' ? {} : { tab: key }, { replace: true })}
        items={[
          {
            key: 'history',
            label: 'Hành trình & chăm sóc',
            children: (
              <div className="space-y-4">
                <HorseTimeline horseId={horse._id} />
                <CareHistoryCard horseId={horse._id} />
              </div>
            ),
          },
          {
            key: 'stall',
            label: stallCode ? `Chuồng ${stallCode}` : 'Chuồng',
            children: <HorseStallCard horseId={horse._id} canManage={isManager} />,
          },
          {
            key: 'races',
            label: `Thành tích thi đấu${horse.achievements?.length ? ` (${horse.achievements.length})` : ''}`,
            children: (
              <Card className="!rounded-xl !border-[#E2D9C8]">
                <Table
                  rowKey={(r) => `${r.race}-${r.date}`}
                  columns={achievementColumns}
                  dataSource={horse.achievements}
                  pagination={false}
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
