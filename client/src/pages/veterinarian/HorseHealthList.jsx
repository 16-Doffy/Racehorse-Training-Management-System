import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, InputGroup, Button, Table, Badge, ButtonGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import useVeterinarianData from '../../hooks/useVeterinarianData';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import EmptyState from '../../components/common/EmptyState';
import HorseHealthCard from '../../components/veterinarian/HorseHealthCard';
import HealthStatusBadge from '../../components/veterinarian/HealthStatusBadge';
import TrainingLockModal from '../../components/veterinarian/TrainingLockModal';
import HorseStableMapView from '../../components/veterinarian/HorseStableMapView';
import { calculateAge, formatDate } from '../../utils/formatDate';

export default function HorseHealthList() {
  const navigate = useNavigate();
  const {
    loading,
    error,
    horses,
    healthRecords,
    treatments,
    injuryMarkers,
    refreshData,
  } = useVeterinarianData();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lockFilter, setLockFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Training Lock Modal state
  const [selectedHorseForLock, setSelectedHorseForLock] = useState(null);
  const [selectedTreatmentForLock, setSelectedTreatmentForLock] = useState(null);
  const [showLockModal, setShowLockModal] = useState(false);

  // Map latest vitals and lock statuses by horse ID
  const latestRecordsByHorse = {};
  healthRecords.forEach((rec) => {
    const horseId = (rec.horse?._id || rec.horse)?.toString();
    if (!latestRecordsByHorse[horseId]) {
      latestRecordsByHorse[horseId] = rec;
    }
  });

  const activeTreatmentsByHorse = {};
  treatments.forEach((t) => {
    const horseId = (t.horse?._id || t.horse)?.toString();
    if (t.isTrainingLocked || !activeTreatmentsByHorse[horseId]) {
      activeTreatmentsByHorse[horseId] = t;
    }
  });

  const injuryCountsByHorse = {};
  injuryMarkers.forEach((m) => {
    const horseId = (m.horse?._id || m.horse)?.toString();
    if (m.recoveryStatus !== 'recovered') {
      injuryCountsByHorse[horseId] = (injuryCountsByHorse[horseId] || 0) + 1;
    }
  });

  const handleToggleLock = (horse, isCurrentlyLocked) => {
    const activeTreatment = activeTreatmentsByHorse[horse._id?.toString()];
    setSelectedHorseForLock(horse);
    setSelectedTreatmentForLock(activeTreatment || null);
    setShowLockModal(true);
  };

  const filteredHorses = horses.filter((horse) => {
    const q = searchTerm.toLowerCase();
    const matchesQuery =
      horse.name?.toLowerCase().includes(q) ||
      horse.breed?.toLowerCase().includes(q) ||
      horse.owner?.name?.toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'all' ||
      horse.healthStatus === statusFilter ||
      (statusFilter === 'quarantined' && horse.healthStatus === 'isolated');

    const isLocked = activeTreatmentsByHorse[horse._id?.toString()]?.isTrainingLocked;
    const matchesLock =
      lockFilter === 'all' ||
      (lockFilter === 'locked' && isLocked) ||
      (lockFilter === 'unlocked' && !isLocked);

    return matchesQuery && matchesStatus && matchesLock;
  });

  if (loading) {
    return <LoadingSpinner text="Đang tải danh sách theo dõi sức khỏe ngựa..." minHeight="400px" />;
  }

  return (
    <Container fluid className="p-0">
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 pb-2 border-bottom gap-2">
        <div>
          <h2 className="fw-bold text-dark mb-1">
            <i className="bi bi-heart-pulse me-2 text-primary"></i>
            Quản Lý Sức Khỏe Ngựa Đua (Horse Health Roster)
          </h2>
          <p className="text-muted mb-0 small">
            Theo dõi tình trạng thể lực, chẩn đoán bệnh lý, chỉ số sinh tồn và khóa huấn luyện cho từng chiến mã.
          </p>
        </div>

        <div className="d-flex gap-2">
          <Button variant="outline-primary" size="sm" onClick={refreshData}>
            <i className="bi bi-arrow-clockwise me-1"></i> Làm mới
          </Button>
          <Button variant="danger" size="sm" onClick={() => navigate('/veterinarian/injuries/new')}>
            <i className="bi bi-bandaid me-1"></i> Ghi nhận chấn thương
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={refreshData} />}

      {/* Search & Filter Bar */}
      <Card className="border-0 shadow-sm mb-4 bg-white">
        <Card.Body className="p-3">
          <Row className="g-3 align-items-center">
            <Col xs={12} md={5}>
              <InputGroup>
                <InputGroup.Text className="bg-light">
                  <i className="bi bi-search text-muted"></i>
                </InputGroup.Text>
                <Form.Control
                  placeholder="Tìm kiếm theo tên ngựa, giống, chủ sở hữu..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </Col>

            <Col xs={6} md={3}>
              <Form.Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Tất cả trạng thái sức khỏe</option>
                <option value="eligible">🟢 Đủ điều kiện (Eligible)</option>
                <option value="monitoring">🟡 Cần theo dõi (Monitoring)</option>
                <option value="injured">🔴 Chấn thương (Injured)</option>
                <option value="quarantined">⚫ Cách ly y tế (Quarantined)</option>
              </Form.Select>
            </Col>

            <Col xs={6} md={2}>
              <Form.Select
                value={lockFilter}
                onChange={(e) => setLockFilter(e.target.value)}
              >
                <option value="all">Tất cả lệnh khóa</option>
                <option value="locked">🔴 Đang khóa tập</option>
                <option value="unlocked">🟢 Cho phép tập</option>
              </Form.Select>
            </Col>

            <Col xs={12} md={3} className="text-end">
              <ButtonGroup>
                <Button
                  variant={viewMode === 'grid' ? 'primary' : 'outline-primary'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  title="Xem dạng thẻ (Grid)"
                >
                  <i className="bi bi-grid-3x3-gap-fill me-1"></i> Thẻ
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'primary' : 'outline-primary'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  title="Xem dạng bảng (Table)"
                >
                  <i className="bi bi-list-ul me-1"></i> Bảng
                </Button>
                <Button
                  variant={viewMode === 'stable' ? 'primary' : 'outline-primary'}
                  size="sm"
                  onClick={() => setViewMode('stable')}
                  title="Sơ đồ chuồng trại (Barn Layout)"
                >
                  <i className="bi bi-door-closed-fill me-1"></i> Chuồng Trại
                </Button>
              </ButtonGroup>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Horse List rendering */}
      {filteredHorses.length === 0 ? (
        <EmptyState
          icon="bi-heartbreak"
          title="Không tìm thấy ngựa phù hợp"
          message="Không có chú ngựa nào khớp với từ khóa tìm kiếm hoặc bộ lọc trạng thái sức khỏe hiện tại."
          actionLabel="Đặt lại bộ lọc"
          onAction={() => {
            setSearchTerm('');
            setStatusFilter('all');
            setLockFilter('all');
          }}
        />
      ) : viewMode === 'stable' ? (
        <HorseStableMapView
          horses={filteredHorses}
          treatments={treatments}
          injuryMarkers={injuryMarkers}
          onQuickExam={(h) => navigate(`/veterinarian/examinations/new/${h._id}`)}
          onToggleLock={handleToggleLock}
        />
      ) : viewMode === 'grid' ? (
        <Row className="g-3">
          {filteredHorses.map((horse) => {
            const horseId = horse._id?.toString();
            const latestRec = latestRecordsByHorse[horseId];
            const activeTr = activeTreatmentsByHorse[horseId];
            const isLocked = activeTr?.isTrainingLocked;
            const injuriesCount = injuryCountsByHorse[horseId] || 0;

            return (
              <Col key={horse._id} xs={12} sm={6} lg={4} xl={3}>
                <HorseHealthCard
                  horse={horse}
                  isTrainingLocked={isLocked}
                  lockReason={activeTr?.lockReason}
                  latestHeartRate={latestRec?.vitalSigns?.heartRate}
                  latestTemperature={latestRec?.vitalSigns?.temperatureC}
                  activeInjuriesCount={injuriesCount}
                  onQuickExam={(h) => navigate(`/veterinarian/examinations/new/${h._id}`)}
                  onToggleLock={handleToggleLock}
                />
              </Col>
            );
          })}
        </Row>
      ) : (
        <Card className="border-0 shadow-sm">
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Ảnh</th>
                    <th>Chiến mã</th>
                    <th>Tuổi & Giống</th>
                    <th>Trạng thái sức khỏe</th>
                    <th>Chỉ số gần nhất</th>
                    <th>Chấn thương</th>
                    <th>Khóa huấn luyện</th>
                    <th className="text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHorses.map((horse) => {
                    const horseId = horse._id?.toString();
                    const latestRec = latestRecordsByHorse[horseId];
                    const activeTr = activeTreatmentsByHorse[horseId];
                    const isLocked = activeTr?.isTrainingLocked;
                    const injuriesCount = injuryCountsByHorse[horseId] || 0;

                    return (
                      <tr key={horse._id}>
                        <td style={{ width: '60px' }}>
                          <img
                            src={horse.photoUrl || 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=120&q=80'}
                            alt={horse.name}
                            className="rounded object-fit-cover"
                            style={{ width: '48px', height: '48px' }}
                            onError={(e) => {
                              e.target.src = 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=120&q=80';
                            }}
                          />
                        </td>
                        <td>
                          <div className="fw-bold text-primary">{horse.name}</div>
                          <small className="text-muted">#{horse._id?.slice(-6).toUpperCase()}</small>
                        </td>
                        <td>
                          <div>{calculateAge(horse.dob)} tuổi</div>
                          <small className="text-muted">{horse.breed || 'Chưa rõ'}</small>
                        </td>
                        <td>
                          <HealthStatusBadge status={horse.healthStatus} />
                        </td>
                        <td>
                          <small className="d-block">
                            Tim: <strong>{latestRec?.vitalSigns?.heartRate ? `${latestRec.vitalSigns.heartRate} bpm` : '-'}</strong>
                          </small>
                          <small className="d-block">
                            Nhiệt: <strong>{latestRec?.vitalSigns?.temperatureC ? `${latestRec.vitalSigns.temperatureC} °C` : '-'}</strong>
                          </small>
                        </td>
                        <td>
                          {injuriesCount > 0 ? (
                            <Badge bg="danger" pill>
                              {injuriesCount} điểm
                            </Badge>
                          ) : (
                            <Badge bg="success" pill>
                              Không có
                            </Badge>
                          )}
                        </td>
                        <td>
                          {isLocked ? (
                            <Badge bg="danger" className="px-2 py-1">
                              🔴 ĐANG KHÓA
                            </Badge>
                          ) : (
                            <Badge bg="light" text="dark" className="border">
                              Cho phép tập
                            </Badge>
                          )}
                        </td>
                        <td className="text-center">
                          <ButtonGroup size="sm">
                            <Button
                              variant="outline-primary"
                              onClick={() => navigate(`/veterinarian/horses/${horse._id}`)}
                              title="Xem chi tiết hồ sơ sức khỏe"
                            >
                              <i className="bi bi-eye"></i>
                            </Button>
                            <Button
                              variant="outline-success"
                              onClick={() => navigate(`/veterinarian/examinations/new/${horse._id}`)}
                              title="Khám bệnh mới"
                            >
                              <i className="bi bi-clipboard2-pulse"></i>
                            </Button>
                            <Button
                              variant={isLocked ? 'danger' : 'outline-danger'}
                              onClick={() => handleToggleLock(horse, isLocked)}
                              title={isLocked ? 'Mở khóa huấn luyện' : 'Khóa huấn luyện khẩn cấp'}
                            >
                              <i className={`bi ${isLocked ? 'bi-lock-fill' : 'bi-unlock'}`}></i>
                            </Button>
                          </ButtonGroup>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      )}

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
