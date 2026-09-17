import { useSelector } from 'react-redux';
import { Typography, Card, Row, Col, Statistic } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../horses/horsesApi';
import { trainingSessionApi } from '../training/trainingApi';
import { ROLE_LABELS, ROLES } from '../../constants/roles';
import FitnessOverviewChart from './FitnessOverviewChart';
import VeterinarianDashboard from '../../pages/veterinarian/VeterinarianDashboard';

const { Title, Paragraph } = Typography;

const ROLE_WELCOME = {
  head_trainer: 'Theo dõi tiến độ huấn luyện và thể lực toàn bộ chiến mã trong CLB.',
  veterinarian: 'Theo dõi sơ đồ sức khỏe và xử lý các trường hợp cần can thiệp y tế.',
  groom: 'Danh sách công việc chăm sóc hàng ngày của bạn nằm ở mục "Công việc Hàng ngày".',
  owner: 'Theo dõi tình trạng và thành tích của những chú ngựa bạn sở hữu.',
  manager: 'Quản lý tổng thể nhân sự, danh mục và vận hành câu lạc bộ.',
};

export default function DashboardPage() {
  const { user } = useSelector((state) => state.auth);

  if (user?.role === ROLES.VETERINARIAN) {
    return <VeterinarianDashboard />;
  }
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
          instead of squeezing into fixed 6/24 columns. */}
      <Row gutter={[16, 16]} className="mt-4">
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Tổng số ngựa" value={horses.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Đủ điều kiện" value={eligible} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Cần theo dõi" value={monitoring} valueStyle={{ color: '#d4b106' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Chấn thương" value={injured} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      {isHeadTrainer && (
        <div className="mt-6">
          <Title level={4}>Biểu đồ thể lực tổng quan</Title>
          <FitnessOverviewChart sessions={sessionsData?.data || []} />
        </div>
      )}
    </div>
  );
}
