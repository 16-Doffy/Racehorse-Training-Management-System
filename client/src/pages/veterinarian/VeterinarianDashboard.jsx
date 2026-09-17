import React, { useState } from 'react';
import { Container, Row, Col, Card, Button, Table, Badge, ProgressBar } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import useVeterinarianData from '../../hooks/useVeterinarianData';
import useSocket from '../../hooks/useSocket';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import HealthStatusBadge from '../../components/veterinarian/HealthStatusBadge';
import HealthAlert from '../../components/veterinarian/HealthAlert';
import TrainingLockModal from '../../components/veterinarian/TrainingLockModal';
import { formatDate } from '../../utils/formatDate';
import { INJURY_SEVERITY_CONFIG } from '../../utils/healthStatus';

const STATUS_COLORS = {
  eligible: '#198754',
  monitoring: '#ffc107',
  injured: '#dc3545',
  quarantined: '#212529',
};

export default function VeterinarianDashboard() {
  const navigate = useNavigate();
  const {
    loading,
    error,
    horses,
    healthRecords,
    treatments,
    injuryMarkers,
    notifications,
    refreshData,
  } = useVeterinarianData();

  const { alerts, clearAlert, clearAllAlerts } = useSocket();

  // Training Lock Modal State
  const [selectedHorseForLock, setSelectedHorseForLock] = useState(null);
  const [selectedTreatmentForLock, setSelectedTreatmentForLock] = useState(null);
  const [showLockModal, setShowLockModal] = useState(false);

  // Statistics Calculations
  const totalHorses = horses.length;
  const eligibleHorses = horses.filter((h) => h.healthStatus === 'eligible').length;
  const monitoringHorses = horses.filter((h) => h.healthStatus === 'monitoring').length;
  const injuredHorses = horses.filter((h) => h.healthStatus === 'injured').length;
  const quarantinedHorses = horses.filter((h) => h.healthStatus === 'quarantined').length;

  const lockedTreatments = treatments.filter((t) => t.isTrainingLocked);
  const lockedHorseIds = new Set(lockedTreatments.map((t) => (t.horse?._id || t.horse)?.toString()));
  const lockedHorsesCount = lockedHorseIds.size;

  const now = new Date();
  const next7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const upcomingVaccinations = horses.filter((h) => {
    const d = h.careSchedule?.nextVaccinationDue;
    return d && new Date(d) <= next7Days;
  }).length;

  const upcomingDewormings = horses.filter((h) => {
    const d = h.careSchedule?.nextDewormingDue;
    return d && new Date(d) <= next7Days;
  }).length;

  const upcomingFarriers = horses.filter((h) => {
    const d = h.careSchedule?.nextFarrierDue;
    return d && new Date(d) <= next7Days;
  }).length;

  // Pie chart data
  const healthDistributionData = [
    { name: 'Đủ điều kiện', value: eligibleHorses, color: STATUS_COLORS.eligible },
    { name: 'Cần theo dõi', value: monitoringHorses, color: STATUS_COLORS.monitoring },
    { name: 'Chấn thương', value: injuredHorses, color: STATUS_COLORS.injured },
    { name: 'Cách ly', value: quarantinedHorses, color: STATUS_COLORS.quarantined },
  ].filter((d) => d.value > 0);

  // Injury severity data
  const injurySeverityCounts = injuryMarkers.reduce((acc, curr) => {
    const sev = curr.severity || 'mild';
    acc[sev] = (acc[sev] || 0) + 1;
    return acc;
  }, {});

  const injuryBarData = [
    { name: 'Nhẹ (Mild)', count: injurySeverityCounts.mild || 0, fill: '#0dcaf0' },
    { name: 'Trung bình (Moderate)', count: injurySeverityCounts.moderate || 0, fill: '#ffc107' },
    { name: 'Nghiêm trọng (Severe)', count: injurySeverityCounts.severe || 0, fill: '#dc3545' },
  ];

  const handleOpenLockModal = (horse) => {
    const activeTreatment = treatments.find(
      (t) => (t.horse?._id || t.horse)?.toString() === horse._id?.toString() && t.isTrainingLocked
    );
    setSelectedHorseForLock(horse);
    setSelectedTreatmentForLock(activeTreatment || null);
    setShowLockModal(true);
  };

  if (loading) {
    return <LoadingSpinner text="Đang tải dữ liệu Bảng Điều Khiển Bác Sĩ Thú Y..." minHeight="400px" />;
  }

  return (
    <Container fluid className="p-0">
      {/* Realtime Floating Alerts */}
      <HealthAlert alerts={alerts} onDismiss={clearAlert} onDismissAll={clearAllAlerts} />

      {/* Header Banner */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 pb-2 border-bottom gap-2">
        <div>
          <h2 className="fw-bold text-dark mb-1">
            <i className="bi bi-hospital me-2 text-primary"></i>
            Bảng Điều Khiển Bác Sĩ Thú Y (Veterinarian Dashboard)
          </h2>
          <p className="text-muted mb-0 small">
            Theo dõi tình trạng sức khỏe tổng quan, quản lý khám bệnh, phác đồ điều trị và khóa huấn luyện khẩn cấp.
          </p>
        </div>

        <div className="d-flex gap-2">
          <Button variant="outline-primary" size="sm" onClick={refreshData}>
            <i className="bi bi-arrow-clockwise me-1"></i> Làm mới
          </Button>
          <Button variant="danger" size="sm" onClick={() => navigate('/veterinarian/injuries/new')}>
            <i className="bi bi-bandaid me-1"></i> Báo cáo chấn thương
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/veterinarian/horses')}>
            <i className="bi bi-clipboard2-pulse me-1"></i> Khám bệnh / Khóa tập
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={refreshData} />}

      {/* Emergency Lock Alert Bar if any horse is locked */}
      {lockedHorsesCount > 0 && (
        <div className="alert alert-danger d-flex align-items-center justify-content-between shadow-sm mb-4">
          <div className="d-flex align-items-center">
            <i className="bi bi-exclamation-triangle-fill fs-3 me-3 text-danger"></i>
            <div>
              <strong className="fs-6">CẢNH BÁO: Có {lockedHorsesCount} chú ngựa đang bị KHÓA HUẤN LUYỆN KHẨN CẤP!</strong>
              <div className="small text-muted">
                Các chú ngựa này không được tham gia buổi tập cho đến khi Bác sĩ Thú y phê duyệt dỡ bỏ lệnh khóa.
              </div>
            </div>
          </div>
          <Button variant="outline-danger" size="sm" onClick={() => navigate('/veterinarian/horses')}>
            Xem danh sách bị khóa
          </Button>
        </div>
      )}

      {/* 8 Metric Summary Cards */}
      <Row className="g-3 mb-4">
        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100 bg-white border-start border-primary border-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Tổng số ngựa</span>
                  <h3 className="fw-bold mb-0 text-primary mt-1">{totalHorses}</h3>
                </div>
                <div className="bg-primary-subtle text-primary p-3 rounded-circle">
                  <i className="bi bi-ticket-detailed fs-4"></i>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100 bg-white border-start border-success border-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Đủ điều kiện</span>
                  <h3 className="fw-bold mb-0 text-success mt-1">{eligibleHorses}</h3>
                </div>
                <div className="bg-success-subtle text-success p-3 rounded-circle">
                  <i className="bi bi-check-circle-fill fs-4"></i>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100 bg-white border-start border-warning border-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Cần theo dõi</span>
                  <h3 className="fw-bold mb-0 text-warning mt-1">{monitoringHorses}</h3>
                </div>
                <div className="bg-warning-subtle text-warning p-3 rounded-circle">
                  <i className="bi bi-eye-fill fs-4"></i>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100 bg-white border-start border-danger border-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Chấn thương / Cách ly</span>
                  <h3 className="fw-bold mb-0 text-danger mt-1">{injuredHorses + quarantinedHorses}</h3>
                </div>
                <div className="bg-danger-subtle text-danger p-3 rounded-circle">
                  <i className="bi bi-bandaid-fill fs-4"></i>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100 bg-white border-start border-danger border-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Khóa huấn luyện</span>
                  <h3 className="fw-bold mb-0 text-danger mt-1">{lockedHorsesCount}</h3>
                </div>
                <div className="bg-danger-subtle text-danger p-3 rounded-circle">
                  <i className="bi bi-lock-fill fs-4"></i>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100 bg-white border-start border-info border-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Lịch tiêm phòng (7 ngày)</span>
                  <h3 className="fw-bold mb-0 text-info mt-1">{upcomingVaccinations}</h3>
                </div>
                <div className="bg-info-subtle text-info p-3 rounded-circle">
                  <i className="bi bi-eyedropper fs-4"></i>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100 bg-white border-start border-secondary border-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Lịch tẩy giun (7 ngày)</span>
                  <h3 className="fw-bold mb-0 text-secondary mt-1">{upcomingDewormings}</h3>
                </div>
                <div className="bg-secondary-subtle text-secondary p-3 rounded-circle">
                  <i className="bi bi-capsule fs-4"></i>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} sm={6} md={3}>
          <Card className="border-0 shadow-sm h-100 bg-white border-start border-dark border-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted small text-uppercase fw-semibold">Kiểm tra móng (7 ngày)</span>
                  <h3 className="fw-bold mb-0 text-dark mt-1">{upcomingFarriers}</h3>
                </div>
                <div className="bg-dark-subtle text-dark p-3 rounded-circle">
                  <i className="bi bi-hammer fs-4"></i>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Visual Charts Section */}
      <Row className="g-3 mb-4">
        <Col xs={12} lg={6}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white py-3 border-0">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-pie-chart-fill me-2 text-primary"></i>
                Phân Bố Tình Trạng Sức Khỏe (Health Distribution)
              </h5>
            </Card.Header>
            <Card.Body style={{ height: '300px' }}>
              {healthDistributionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={healthDistributionData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={95}
                      innerRadius={45}
                      paddingAngle={3}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {healthDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                  Chưa có dữ liệu phân bố sức khỏe
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} lg={6}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white py-3 border-0">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-bar-chart-fill me-2 text-danger"></i>
                Thống Kê Chấn Thương Theo Mức Độ
              </h5>
            </Card.Header>
            <Card.Body style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={injuryBarData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Số ca" radius={[4, 4, 0, 0]}>
                    {injuryBarData.map((entry, index) => (
                      <Cell key={`cell-bar-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Recent Medical Records and Care Schedules */}
      <Row className="g-3">
        <Col xs={12} lg={7}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-journal-medical me-2 text-primary"></i>
                Hồ Sơ Khám Bệnh Gần Đây
              </h5>
              <Button variant="link" size="sm" onClick={() => navigate('/veterinarian/horses')}>
                Xem tất cả
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive">
                <Table hover className="align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Ngựa</th>
                      <th>Ngày khám</th>
                      <th>Chẩn đoán</th>
                      <th>Kết luận</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthRecords.slice(0, 5).map((rec) => (
                      <tr key={rec._id}>
                        <td className="fw-bold">
                          {rec.horse?.name || 'Ngựa'}
                          <small className="text-muted d-block">
                            #{rec.horse?._id?.slice(-6).toUpperCase() || ''}
                          </small>
                        </td>
                        <td className="small">{formatDate(rec.date || rec.createdAt)}</td>
                        <td className="small">{rec.diagnosis}</td>
                        <td>
                          <HealthStatusBadge status={rec.resultStatus} />
                        </td>
                        <td>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => navigate(`/veterinarian/horses/${rec.horse?._id || rec.horse}`)}
                          >
                            <i className="bi bi-eye"></i>
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {healthRecords.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-muted">
                          Chưa có hồ sơ khám bệnh nào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} lg={5}>
          <Card className="border-0 shadow-sm">
            <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-calendar-event me-2 text-warning"></i>
                Lịch Trình Y Tế Sắp Tới
              </h5>
              <Button variant="link" size="sm" onClick={() => navigate('/veterinarian/schedules')}>
                Xem tất cả
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="table-responsive">
                <Table hover className="align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Ngựa</th>
                      <th>Hạng mục</th>
                      <th>Hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {horses
                      .filter((h) => h.careSchedule?.nextVaccinationDue || h.careSchedule?.nextDewormingDue || h.careSchedule?.nextFarrierDue)
                      .slice(0, 5)
                      .map((h) => {
                        const sched = h.careSchedule;
                        return (
                          <tr key={h._id}>
                            <td className="fw-semibold">
                              {h.name}
                            </td>
                            <td className="small">
                              {sched?.nextVaccinationDue && (
                                <div><i className="bi bi-eyedropper text-primary me-1"></i> Tiêm phòng</div>
                              )}
                              {sched?.nextDewormingDue && (
                                <div><i className="bi bi-capsule text-success me-1"></i> Tẩy giun</div>
                              )}
                              {sched?.nextFarrierDue && (
                                <div><i className="bi bi-hammer text-dark me-1"></i> Móng</div>
                              )}
                            </td>
                            <td className="small fw-semibold text-primary">
                              {formatDate(
                                sched?.nextVaccinationDue || sched?.nextDewormingDue || sched?.nextFarrierDue
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    {horses.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center py-4 text-muted">
                          Chưa có lịch trình y tế nào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Training Lock Modal */}
      <TrainingLockModal
        show={showLockModal}
        onHide={() => setShowLockModal(false)}
        horse={selectedHorseForLock}
        currentTreatment={selectedTreatmentForLock}
        onSuccess={() => {
          refreshData();
        }}
      />
    </Container>
  );
}
