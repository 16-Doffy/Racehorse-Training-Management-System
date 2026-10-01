import { useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { Typography, Card, Row, Col, Statistic, Alert, Tag, Button } from 'antd';
import { AppstoreOutlined, CheckCircleOutlined, EyeOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../horses/horsesApi';
import { trainingSessionApi } from '../training/trainingApi';
import { ROLE_LABELS, ROLES } from '../../constants/roles';
import { TRAINING_LEVEL_META } from '../../constants/health';
import FitnessOverviewChart from './FitnessOverviewChart';
import ExamRequestsCard from './ExamRequestsCard';
import OpenIncidentsCard from './OpenIncidentsCard';
import CareOrdersCard from './CareOrdersCard';
import { STATUS_TONES } from '../../layouts/forestTheme';

const { Title, Paragraph } = Typography;

/** One counter on the dashboard: a tinted icon and a figure coloured by what it means. */
function StatCard({ title, value, tone, icon, onClick }) {
  const { color, bg } = STATUS_TONES[tone];
  return (
    <Card hoverable onClick={onClick} styles={{ body: { padding: 20 } }}>
      <div className="flex items-center gap-4">
        <span className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: bg, color }}>
          {icon}
        </span>
        <Statistic title={title} value={value} styles={{ content: { color, fontWeight: 600 } }} />
      </div>
    </Card>
  );
}

const ROLE_WELCOME = {
  head_trainer: 'Theo dõi tiến độ huấn luyện và thể lực toàn bộ chiến mã trong CLB.',
  veterinarian: 'Theo dõi sơ đồ sức khỏe và xử lý các trường hợp cần can thiệp y tế.',
  groom: 'Danh sách công việc chăm sóc hàng ngày của bạn nằm ở mục "Công việc Hàng ngày".',
  owner: 'Theo dõi tình trạng và thành tích của những chú ngựa bạn sở hữu.',
  manager: 'Quản lý tổng thể nhân sự, danh mục và vận hành câu lạc bộ.',
};

// Shared fallback dashboard for any role without a dedicated one (see RoleDashboard.jsx) —
// currently Head Trainer and Club Manager. Groom/Veterinarian/Owner each have their own.
export default function DashboardPage() {
  const { user } = useSelector((state) => state.auth);
  const navigate = useNavigate();
  const isHeadTrainer = user?.role === ROLES.HEAD_TRAINER;
  const { data } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const horses = data?.data || [];

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

  const eligible = horses.filter((h) => h.healthStatus === 'eligible').length;
  const monitoring = horses.filter((h) => h.healthStatus === 'monitoring').length;
  const injured = horses.filter((h) => h.healthStatus === 'injured').length;

  return (
    <div>
      <Title level={3}>Xin chào, {user?.name}</Title>
      <Paragraph type="secondary">
        {ROLE_LABELS[user?.role]} — {ROLE_WELCOME[user?.role]}
      </Paragraph>

      {/* xs/sm/lg breakpoints so the 4 stat cards wrap into 2 or 1 per row on narrower windows
          instead of squeezing into fixed 6/24 columns. Clickable + navigate to the horse roster
          so the dashboard isn't a dead-end — part of tying Head Trainer's pages together. */}
      <Row gutter={[16, 16]} className="mt-4">
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Tổng số ngựa" value={horses.length} tone="neutral" icon={<AppstoreOutlined />} onClick={() => navigate('/horses')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Đủ điều kiện" value={eligible} tone="good" icon={<CheckCircleOutlined />} onClick={() => navigate('/horses')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Cần theo dõi" value={monitoring} tone="watch" icon={<EyeOutlined />} onClick={() => navigate('/horses')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="Chấn thương" value={injured} tone="bad" icon={<MedicineBoxOutlined />} onClick={() => navigate('/horses')} />
        </Col>
      </Row>

      {restrictedHorses.length > 0 && (
        <Alert
          className="mt-6"
          type={restrictedHorses.some((h) => h.trainingClearance.level === 'none') ? 'error' : 'warning'}
          showIcon
          title={`${restrictedHorses.length} ngựa đang điều trị — bác sĩ hạn chế tập luyện`}
          description={
            <div className="flex flex-col divide-y divide-black/5 mt-1">
              {restrictedHorses.map((h) => {
                const c = h.trainingClearance;
                return (
                  <div key={h._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link to={`/horses/${h._id}`}>
                        <Tag color={TRAINING_LEVEL_META[c.level]?.color}>{TRAINING_LEVEL_META[c.level]?.short}</Tag>
                        {h.name}
                      </Link>
                      <span className="ml-2 text-gray-500 text-sm">
                        — {c.reason || 'theo phác đồ điều trị'}
                        {c.prescribedBy ? ` (bác sĩ ${c.prescribedBy})` : ''}
                      </span>
                    </div>
                    {isHeadTrainer && (
                      <Button size="small" onClick={() => navigate(`/training/sessions?horse=${h._id}`)}>
                        Xem buổi tập
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          }
        />
      )}

      {isHeadTrainer && <ExamRequestsCard />}

      {/* Both roles this dashboard serves (Head Trainer, Manager) need to see what the grooms
          reported and whether a vet has answered. */}
      <OpenIncidentsCard />

      {/* After the vet prescribes: whether each dose has been taken on and given. */}
      <CareOrdersCard />

      {isHeadTrainer && (
        <div className="mt-6">
          <Title level={4}>Biểu đồ thể lực tổng quan</Title>
          <FitnessOverviewChart sessions={sessionsData?.data || []} />
        </div>
      )}
    </div>
  );
}
