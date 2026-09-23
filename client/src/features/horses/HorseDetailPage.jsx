import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Descriptions,
  Tag,
  Typography,
  Table,
  Card,
  Breadcrumb,
  Tabs,
  Row,
  Col,
  Empty,
  Statistic,
  Timeline,
  Badge,
  Avatar,
  Button,
  Modal,
  Form,
  Input,
} from 'antd';
import { message } from '../../lib/antdStatic';
import {
  UserOutlined,
  HeartOutlined,
  TrophyOutlined,
  CalendarOutlined,
  MedicineBoxOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { horsesApi } from './horsesApi';
import { healthRecordApi } from '../health/healthApi';
import { trainingSessionApi } from '../training/trainingApi';
import { ROLES } from '../../constants/roles';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

const STATUS_CONFIG = {
  eligible: { color: 'green', icon: <CheckCircleOutlined />, label: '🟢 Sẵn sàng thi đấu', bg: '#f6ffed' },
  monitoring: { color: 'gold', icon: <ExclamationCircleOutlined />, label: '🟡 Đang theo dõi', bg: '#fffbe6' },
  injured: { color: 'red', icon: <CloseCircleOutlined />, label: '🔴 Chấn thương', bg: '#fff2f0' },
  quarantined: { color: 'volcano', icon: <StopOutlined />, label: '⚫ Cách ly', bg: '#fff7e6' },
};

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

/** Pedigree Tree component — displays 3 levels using existing sire/dam data */
function PedigreeTree({ horse }) {
  const PedigreeNode = ({ data, level = 0, label }) => {
    if (!data) {
      return (
        <div
          className="border border-dashed border-gray-300 rounded px-3 py-2 text-center"
          style={{ minWidth: 140 }}
        >
          <Text type="secondary" className="text-xs">{label}</Text>
          <div className="text-gray-400 text-xs">Chưa cập nhật</div>
        </div>
      );
    }
    return (
      <div
        className="border rounded px-3 py-2 text-center"
        style={{
          minWidth: 140,
          background: level === 0 ? '#e6f7ff' : level === 1 ? '#f0f5ff' : '#fafafa',
          borderColor: level === 0 ? '#91d5ff' : '#d9d9d9',
        }}
      >
        <Text type="secondary" className="text-xs">{label}</Text>
        <div className="font-semibold text-sm">{data.name || 'N/A'}</div>
        {data.breed && <div className="text-xs text-gray-500">{data.breed}</div>}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-2 min-w-fit">
        {/* Level 0: Current horse */}
        <div className="flex flex-col items-center">
          <PedigreeNode data={horse} level={0} label="Bản thân" />
        </div>

        <div className="text-gray-300 text-2xl">→</div>

        {/* Level 1: Sire & Dam */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <PedigreeNode data={horse.sire} level={1} label="🐴 Bố (Sire)" />
            <div className="text-gray-300 text-lg">→</div>
            <div className="flex flex-col gap-2">
              <PedigreeNode data={horse.sire?.sire} level={2} label="Ông nội" />
              <PedigreeNode data={horse.sire?.dam} level={2} label="Bà nội" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PedigreeNode data={horse.dam} level={1} label="🐴 Mẹ (Dam)" />
            <div className="text-gray-300 text-lg">→</div>
            <div className="flex flex-col gap-2">
              <PedigreeNode data={horse.dam?.sire} level={2} label="Ông ngoại" />
              <PedigreeNode data={horse.dam?.dam} level={2} label="Bà ngoại" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HorseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const isOwner = user?.role === ROLES.OWNER;
  const canRequestExam = user?.role === ROLES.HEAD_TRAINER || user?.role === ROLES.MANAGER;
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [examForm] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['horses', id],
    queryFn: () => horsesApi.getOne(id),
  });
  const horse = data?.data;

  const requestExamMutation = useMutation({
    mutationFn: (payload) => healthRecordApi.requestExam(payload),
    onSuccess: () => {
      message.success('Đã gửi yêu cầu khám tới bác sĩ thú y.');
      setExamModalOpen(false);
      examForm.resetFields();
    },
    onError: (err) => message.error(err.message || 'Gửi yêu cầu thất bại.'),
  });

  // Health records for this horse (Owner view)
  const { data: healthData } = useQuery({
    queryKey: ['health-records'],
    queryFn: () => healthRecordApi.list(),
    enabled: isOwner,
  });
  const horseHealthRecords = (healthData?.data || [])
    .filter((r) => (r.horse?._id || r.horse) === id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Training sessions for this horse (Owner view)
  const { data: sessionsData } = useQuery({
    queryKey: ['training-sessions'],
    queryFn: () => trainingSessionApi.list(),
    enabled: isOwner,
  });
  const horseSessions = (sessionsData?.data || [])
    .filter((s) => (s.horse?._id || s.horse) === id)
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

  if (isLoading || !horse) return null;

  const statusCfg = STATUS_CONFIG[horse.healthStatus] || {};

  const achievementColumns = [
    { title: 'Giải đua', dataIndex: 'race', key: 'race' },
    { title: 'Kết quả', dataIndex: 'result', key: 'result' },
    { title: 'Ngày', dataIndex: 'date', key: 'date', render: (d) => dayjs(d).format('DD/MM/YYYY') },
  ];

  const sessionColumns = [
    {
      title: 'Ngày',
      dataIndex: 'scheduledAt',
      key: 'scheduledAt',
      render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Loại',
      dataIndex: 'sessionType',
      key: 'sessionType',
      render: (t) => (
        <Tag color={t === 'trial_run' ? 'orange' : 'blue'}>
          {t === 'trial_run' ? '🏁 Chạy thử' : 'Tập luyện'}
        </Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => {
        const colors = { scheduled: 'default', in_progress: 'processing', completed: 'success', cancelled: 'error' };
        const labels = { scheduled: 'Đã lên lịch', in_progress: 'Đang diễn ra', completed: 'Hoàn thành', cancelled: 'Đã huỷ' };
        return <Badge status={colors[s]} text={labels[s] || s} />;
      },
    },
    {
      title: 'Rating',
      dataIndex: 'performanceRating',
      key: 'performanceRating',
      render: (r) => (r ? <Tag color="gold">⭐ {r}/10</Tag> : '—'),
    },
    {
      title: 'Nhận xét',
      dataIndex: 'trainerComment',
      key: 'trainerComment',
      ellipsis: true,
      render: (c) => c || '—',
    },
  ];

  // Owner view: enhanced layout with hero + tabs
  if (isOwner) {
    const latestHealth = horseHealthRecords[0];

    const tabItems = [
      {
        key: 'profile',
        label: (
          <span>
            <UserOutlined className="mr-1" />
            Hồ sơ
          </span>
        ),
        children: (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="Thông tin cơ bản" size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Tên">{horse.name}</Descriptions.Item>
                  <Descriptions.Item label="Tuổi">{calcAge(horse.dob)}</Descriptions.Item>
                  <Descriptions.Item label="Ngày sinh">
                    {horse.dob ? dayjs(horse.dob).format('DD/MM/YYYY') : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Giống">{horse.breed || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Màu lông">{horse.color || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Cân nặng">
                    {horse.weightKg ? `${horse.weightKg} kg` : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Chủ sở hữu">
                    {horse.owner?.name || '—'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="🌳 Gia phả (Pedigree)" size="small">
                <PedigreeTree horse={horse} />
              </Card>
            </Col>
          </Row>
        ),
      },
      {
        key: 'achievements',
        label: (
          <span>
            <TrophyOutlined className="mr-1" />
            Thành tích
          </span>
        ),
        children: (
          <Card title="Lịch sử Thi đấu">
            <Table
              rowKey={(r) => `${r.race}-${r.date}`}
              columns={achievementColumns}
              dataSource={horse.achievements}
              pagination={false}
              locale={{ emptyText: 'Chưa có thành tích' }}
              size="middle"
            />
          </Card>
        ),
      },
      {
        key: 'health',
        label: (
          <span>
            <MedicineBoxOutlined className="mr-1" />
            Sức khỏe
          </span>
        ),
        children: (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="Chỉ số gần nhất" size="small">
                {latestHealth ? (
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Ngày khám">
                      {dayjs(latestHealth.date).format('DD/MM/YYYY')}
                    </Descriptions.Item>
                    <Descriptions.Item label="Nhịp tim">
                      {latestHealth.vitalSigns?.heartRate ? `${latestHealth.vitalSigns.heartRate} bpm` : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Nhiệt độ">
                      {latestHealth.vitalSigns?.temperatureC ? `${latestHealth.vitalSigns.temperatureC} °C` : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Nhịp thở">
                      {latestHealth.vitalSigns?.respiratoryRate ? `${latestHealth.vitalSigns.respiratoryRate} lần/phút` : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Chẩn đoán">
                      {latestHealth.diagnosis}
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <Empty description="Chưa có hồ sơ khám" />
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="Lịch chăm sóc định kỳ" size="small">
                {horse.careSchedule ? (
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="💉 Tiêm phòng">
                      {horse.careSchedule.nextVaccinationDue
                        ? dayjs(horse.careSchedule.nextVaccinationDue).format('DD/MM/YYYY')
                        : 'Chưa lên lịch'}
                    </Descriptions.Item>
                    <Descriptions.Item label="💊 Tẩy giun">
                      {horse.careSchedule.nextDewormingDue
                        ? dayjs(horse.careSchedule.nextDewormingDue).format('DD/MM/YYYY')
                        : 'Chưa lên lịch'}
                    </Descriptions.Item>
                    <Descriptions.Item label="🔧 Đóng móng">
                      {horse.careSchedule.nextFarrierDue
                        ? dayjs(horse.careSchedule.nextFarrierDue).format('DD/MM/YYYY')
                        : 'Chưa lên lịch'}
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <Empty description="Chưa có lịch chăm sóc" />
                )}
              </Card>
            </Col>
            <Col xs={24}>
              <Card title="Lịch sử Khám bệnh" size="small">
                {horseHealthRecords.length > 0 ? (
                  <Timeline
                    items={horseHealthRecords.slice(0, 8).map((r) => ({
                      color: STATUS_CONFIG[r.resultStatus]?.color || 'gray',
                      children: (
                        <div>
                          <Text strong>{dayjs(r.date).format('DD/MM/YYYY')}</Text>
                          <Tag className="ml-2" color={STATUS_CONFIG[r.resultStatus]?.color}>
                            {STATUS_CONFIG[r.resultStatus]?.label || r.resultStatus}
                          </Tag>
                          <div className="mt-1 text-sm">{r.diagnosis}</div>
                        </div>
                      ),
                    }))}
                  />
                ) : (
                  <Empty description="Chưa có lịch sử khám" />
                )}
              </Card>
            </Col>
          </Row>
        ),
      },
      {
        key: 'training',
        label: (
          <span>
            <CalendarOutlined className="mr-1" />
            Huấn luyện
          </span>
        ),
        children: (
          <Card title="Lịch sử Buổi tập">
            <Table
              rowKey="_id"
              columns={sessionColumns}
              dataSource={horseSessions.slice(0, 20)}
              pagination={false}
              size="middle"
              locale={{ emptyText: 'Chưa có buổi tập nào' }}
            />
          </Card>
        ),
      },
    ];

    return (
      <div>
        <Breadcrumb
          className="mb-4"
          items={[{ title: <Link to="/horses">Ngựa của tôi</Link> }, { title: horse.name }]}
        />

        {/* Hero Section */}
        <div className="premium-card mb-6 overflow-hidden">
          <div
            className="p-8"
            style={{
              background: `linear-gradient(135deg, ${statusCfg.bg || '#f9fafb'} 0%, #ffffff 100%)`,
            }}
          >
            <Row gutter={[24, 16]} align="middle">
              <Col xs={24} sm={6} className="text-center">
                <Avatar
                  size={140}
                  src={horse.photoUrl}
                  icon={!horse.photoUrl && <UserOutlined />}
                  className="shadow-sm"
                  style={{
                    border: `4px solid ${statusCfg.color === 'green' ? '#22c55e' : statusCfg.color === 'gold' ? '#eab308' : statusCfg.color === 'red' ? '#ef4444' : '#e5e7eb'}`,
                  }}
                />
              </Col>
              <Col xs={24} sm={12}>
                <Title level={2} className="!mb-2 !font-bold !text-[#022c22]" style={{ fontFamily: 'Georgia, serif' }}>
                  {horse.name}
                </Title>
                <div className="mb-3">
                  <Tag color={statusCfg.color} className="rounded-full border-0 px-3 py-1 font-medium text-sm">
                    {statusCfg.icon} <span className="ml-1">{statusCfg.label}</span>
                  </Tag>
                </div>
                <div className="text-gray-600 text-base mb-1">
                  <span className="font-medium text-gray-800">{horse.breed || 'Chưa rõ giống'}</span> • {horse.color || 'Chưa rõ màu'} • {calcAge(horse.dob)}
                </div>
                {horse.weightKg && (
                  <div className="text-gray-500">
                    Cân nặng: <span className="font-medium text-gray-700">{horse.weightKg} kg</span>
                  </div>
                )}
              </Col>
              <Col xs={24} sm={6}>
                <div className="text-center p-4 bg-white/60 rounded-xl border border-gray-100">
                  <div className="text-gray-500 text-sm mb-1"><TrophyOutlined className="mr-1" /> Thành tích</div>
                  <div className="text-4xl font-bold text-gray-900">{horse.achievements?.length || 0}</div>
                </div>
              </Col>
            </Row>
          </div>
        </div>

        {/* Tabs */}
        <Tabs items={tabItems} size="large" />
      </div>
    );
  }

  // Non-owner view: original layout
  return (
    <div>
      <Breadcrumb
        className="mb-4"
        items={[{ title: <Link to="/horses">Danh sách Ngựa</Link> }, { title: horse.name }]}
      />
      <div className="flex justify-between items-center mb-2">
        <Title level={3} className="!mb-0">{horse.name}</Title>
        {canRequestExam && (
          <Button icon={<MedicineBoxOutlined />} onClick={() => setExamModalOpen(true)}>
            Yêu cầu bác sĩ kiểm tra
          </Button>
        )}
      </div>

      <Card className="mb-4" title="Hồ sơ lý lịch">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Giống">{horse.breed}</Descriptions.Item>
          <Descriptions.Item label="Màu lông">{horse.color}</Descriptions.Item>
          <Descriptions.Item label="Ngày sinh">
            {horse.dob ? new Date(horse.dob).toLocaleDateString() : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Cân nặng">{horse.weightKg ? `${horse.weightKg} kg` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Chủ sở hữu">{horse.owner?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Trạng thái sức khỏe">
            <Tag color={STATUS_CONFIG[horse.healthStatus]?.color}>
              {STATUS_CONFIG[horse.healthStatus]?.label || horse.healthStatus}
            </Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="mb-4" title="Dòng dõi (Pedigree)">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Ngựa bố (Sire)">{horse.sire?.name || 'Chưa cập nhật'}</Descriptions.Item>
          <Descriptions.Item label="Ngựa mẹ (Dam)">{horse.dam?.name || 'Chưa cập nhật'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Lịch sử thành tích thi đấu">
        <Table
          rowKey={(r) => `${r.race}-${r.date}`}
          columns={achievementColumns}
          dataSource={horse.achievements}
          pagination={false}
          locale={{ emptyText: 'Chưa có thành tích' }}
        />
      </Card>

      {canRequestExam && (
        <Modal
          title={`Yêu cầu bác sĩ kiểm tra — ${horse.name}`}
          open={examModalOpen}
          onCancel={() => setExamModalOpen(false)}
          onOk={() => examForm.submit()}
          confirmLoading={requestExamMutation.isPending}
          destroyOnHidden
        >
          <Form
            form={examForm}
            layout="vertical"
            onFinish={(values) => requestExamMutation.mutate({ horse: horse._id, reason: values.reason })}
          >
            <Form.Item name="reason" label="Lý do">
              <Input.TextArea
                rows={3}
                placeholder="VD: Ngựa có dấu hiệu khập khiễng sau buổi tập sáng nay."
              />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}

