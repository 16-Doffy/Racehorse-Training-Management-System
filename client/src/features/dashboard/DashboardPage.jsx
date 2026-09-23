import { useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { Typography, Card, Row, Col, Statistic, Alert, List, Tag, Button } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../horses/horsesApi';
import { trainingSessionApi } from '../training/trainingApi';
import { treatmentApi } from '../health/healthApi';
import { ROLE_LABELS, ROLES } from '../../constants/roles';
import FitnessOverviewChart from './FitnessOverviewChart';

const { Title, Paragraph } = Typography;

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
  const { data: lockedTreatmentsData } = useQuery({
    queryKey: ['treatments', 'locked'],
    queryFn: () => treatmentApi.list({ isTrainingLocked: true, status: 'ongoing' }),
    enabled: isHeadTrainer,
  });
  const lockedTreatments = lockedTreatmentsData?.data || [];

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
          <Card hoverable onClick={() => navigate('/horses')}>
            <Statistic title="Tổng số ngựa" value={horses.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/horses')}>
            <Statistic title="Đủ điều kiện" value={eligible} styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/horses')}>
            <Statistic title="Cần theo dõi" value={monitoring} styles={{ content: { color: '#d4b106' } }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/horses')}>
            <Statistic title="Chấn thương" value={injured} styles={{ content: { color: '#cf1322' } }} />
          </Card>
        </Col>
      </Row>

      {isHeadTrainer && lockedTreatments.length > 0 && (
        <Alert
          className="mt-6"
          type="error"
          showIcon
          title={`${lockedTreatments.length} ngựa đang bị bác sĩ thú y khóa huấn luyện`}
          description={
            <List
              size="small"
              dataSource={lockedTreatments}
              renderItem={(t) => (
                <List.Item
                  actions={[
                    <Button
                      key="sessions"
                      size="small"
                      onClick={() => navigate(`/training/sessions?horse=${t.horse?._id}`)}
                    >
                      Xem buổi tập
                    </Button>,
                  ]}
                >
                  <Link to={`/horses/${t.horse?._id}`}>
                    <Tag color="red">🔒</Tag>
                    {t.horse?.name}
                  </Link>
                  <span className="ml-2 text-gray-500 text-sm">— {t.lockReason || 'chỉ định y tế'}</span>
                </List.Item>
              )}
            />
          }
        />
      )}

      {isHeadTrainer && (
        <div className="mt-6">
          <Title level={4}>Biểu đồ thể lực tổng quan</Title>
          <FitnessOverviewChart sessions={sessionsData?.data || []} />
        </div>
      )}
    </div>
  );
}
