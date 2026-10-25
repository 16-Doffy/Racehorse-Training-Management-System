import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { Descriptions, Tag, Table, Card, Breadcrumb, Row, Col, Empty, Button, Alert } from 'antd';
import { HORSE_SEX_LABELS, formatVnd } from '../../constants/horse';
import { MedicineBoxOutlined } from '@ant-design/icons';
import { horsesApi } from './horsesApi';
import HorseTimeline from './HorseTimeline';
import CareHistoryCard from './CareHistoryCard';
import HorseStallCard from '../stable/HorseStallCard';
import { stallApi } from '../stable/stableApi';
import MovingHorse3D from './horse3d/MovingHorse3D';
import { restingMotion } from './horse3d/horseMotion';
import { breedLabel, coatLabel } from './horse3d/horseBreeds';
import { HEALTH_LABELS, HEALTH_COLORS, TRAINING_LEVEL_META } from '../../constants/health';
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

// The Horse Owner has their own horse page (features/owner/OwnerHorse.jsx); this one is the staff's.
export default function HorseDetailPage() {
  const { id } = useParams();
  const { user } = useSelector((state) => state.auth);
  const canRequestExam = user?.role === ROLES.HEAD_TRAINER || user?.role === ROLES.MANAGER;
  const [examModalOpen, setExamModalOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['horses', id],
    queryFn: () => horsesApi.getOne(id),
  });
  const horse = data?.data;
  // The groom of the horse's stall (the same request as the stall card below, so it is made once).
  const { data: stallData } = useQuery({ queryKey: ['stall-of-horse', id], queryFn: () => stallApi.forHorse(id), enabled: Boolean(id) });
  const groom = stallData?.data?.caretaker?.name;

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
  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[{ title: <Link to="/horses">Danh sách đàn ngựa</Link> }, { title: horse.name }]}
      />

      <PageHeroBanner
        eyebrow="Hồ sơ lý lịch"
        roleLabel={ROLE_LABELS[user?.role] || 'Nhân sự CLB'}
        title={horse.name}
        subtitle={`${breedLabel(horse.breed)} · ${HORSE_SEX_LABELS[horse.sex] || '—'} · ${calcAge(horse.dob) || 'Chưa rõ tuổi'}`}
        stats={[
          {
            label: 'Sức khỏe',
            value: HEALTH_LABELS[horse.healthStatus] || horse.healthStatus,
          },
          {
            label: 'Mức cho phép tập',
            value: TRAINING_LEVEL_META[clearanceLevel]?.label || clearanceLevel,
          },
          {
            label: 'Chủ sở hữu',
            value: horse.owner?.name || 'CLB sở hữu',
          },
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
        <Col xs={24} lg={9}>
          {/* At rest it is out in the pasture (the sessions page shows it on its training track). */}
          <MovingHorse3D breed={horse.breed} color={horse.color} motion={restingMotion(horse)} surface="pasture" height={310} />
        </Col>
        <Col xs={24} lg={15}>
          <Card className="h-full !rounded-xl !border-[#E2D9C8]" title="Hồ sơ lý lịch">
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="Giống">{breedLabel(horse.breed)}</Descriptions.Item>
              <Descriptions.Item label="Màu lông">{coatLabel(horse.color)}</Descriptions.Item>
              <Descriptions.Item label="Giới tính">{HORSE_SEX_LABELS[horse.sex] || '—'}</Descriptions.Item>
              <Descriptions.Item label="Số vi mạch">
                <span className="font-mono tabular-nums text-xs">{horse.microchipNumber || '—'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Số đăng ký">
                <span className="font-mono tabular-nums text-xs">{horse.registrationNumber || '—'}</span>
              </Descriptions.Item>
              {/* Sent only to the Manager and the owner. */}
              {'valuationVnd' in horse && (
                <Descriptions.Item label="Định giá">
                  <span className="tabular-nums font-semibold">{formatVnd(horse.valuationVnd)}</span>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Ngày sinh">
                <span className="tabular-nums">
                  {horse.dob ? `${dayjs(horse.dob).format('DD/MM/YYYY')} (${calcAge(horse.dob)})` : '—'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Cân nặng">
                <span className="tabular-nums">{horse.weightKg ? `${horse.weightKg} kg` : '—'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Chủ sở hữu">{horse.owner?.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái sức khỏe">
                <Tag color={HEALTH_COLORS[horse.healthStatus]}>
                  {HEALTH_LABELS[horse.healthStatus] || horse.healthStatus}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tập luyện" span={2}>
                <Tag color={TRAINING_LEVEL_META[clearanceLevel]?.color}>
                  {TRAINING_LEVEL_META[clearanceLevel]?.label}
                </Tag>
                {horse.trainingClearance?.restricted && (
                  <span className="text-slate-600 text-xs ml-1">
                    {horse.trainingClearance.reason ? `${horse.trainingClearance.reason} — ` : ''}
                    theo phác đồ của bác sĩ {horse.trainingClearance.prescribedBy || ''}
                    {horse.trainingClearance.since ? ` từ ${dayjs(horse.trainingClearance.since).format('DD/MM')}` : ''}. Hết hạn chế khi bác sĩ
                    nâng mức hoặc kết thúc điều trị.
                  </span>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* Its stall: the zone's barn in 3D looking into it, the code and the groom. */}
      <HorseStallCard horseId={horse._id} canManage={user?.role === ROLES.MANAGER} />

      {/* Who looks after the horse: the people the Manager assigns on the horse form, and its stall's groom. */}
      <Card className="!rounded-xl !border-[#E2D9C8]" title="Người phụ trách">
        <Descriptions column={{ xs: 1, sm: 2, lg: 4 }} size="small">
          <Descriptions.Item label="Chủ sở hữu">{horse.owner?.name || 'CLB sở hữu'}</Descriptions.Item>
          <Descriptions.Item label="HLV phụ trách">{horse.assignedTrainer?.name || 'Chưa phân công'}</Descriptions.Item>
          <Descriptions.Item label="Bác sĩ phụ trách">{horse.assignedVet?.name || 'Chưa phân công'}</Descriptions.Item>
          <Descriptions.Item label="Nhân viên chăm sóc">{groom || 'Chưa có'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <HorseTimeline horseId={horse._id} />

      <Card title="Lịch sử thành tích thi đấu" className="!rounded-xl !border-[#E2D9C8]">
        <Table
          rowKey={(r) => `${r.race}-${r.date}`}
          columns={achievementColumns}
          dataSource={horse.achievements}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa ghi nhận thành tích thi đấu chính thức"
              />
            ),
          }}
        />
      </Card>

      <div>
        <CareHistoryCard horseId={horse._id} />
      </div>

      {canRequestExam && examModalOpen && <RequestExamModal horse={horse} onClose={() => setExamModalOpen(false)} />}
    </div>
  );
}
