import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Card, Tabs, Tab, Button, Badge, Alert, Table, Dropdown } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import HealthStatusBadge from '../../components/veterinarian/HealthStatusBadge';
import MedicalHistory from '../../components/veterinarian/MedicalHistory';
import InjuryList from '../../components/veterinarian/InjuryList';
import MedicalScheduleList from '../../components/veterinarian/MedicalScheduleList';
import TrainingLockModal from '../../components/veterinarian/TrainingLockModal';
import Horse3DAnatomyViewer from '../../components/veterinarian/Horse3DAnatomyViewer';
import { formatDate, calculateAge } from '../../utils/formatDate';
import { TREATMENT_STATUS_CONFIG } from '../../utils/healthStatus';

export default function HorseHealthDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [horse, setHorse] = useState(null);
  const [records, setRecords] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [injuries, setInjuries] = useState([]);

  // Training lock modal state
  const [showLockModal, setShowLockModal] = useState(false);

  const fetchHorseDetails = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [horseRes, recordsRes, treatmentsRes, injuriesRes] = await Promise.all([
        veterinarianApi.getHorseById(id),
        veterinarianApi.getHealthRecords({ horse: id }),
        veterinarianApi.getTreatments({ horse: id }),
        veterinarianApi.getInjuryMarkers({ horse: id }),
      ]);

      const horseData = horseRes.data;
      const recordsData = recordsRes.data || [];
      const treatmentsData = treatmentsRes.data || [];
      const injuriesData = injuriesRes.data || [];

      setHorse(horseData);
      setRecords(recordsData);
      setTreatments(treatmentsData);
      setInjuries(injuriesData);
    } catch (err) {
      setError(err?.message || 'Không thể tải thông tin chi tiết sức khỏe ngựa.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchHorseDetails();
  }, [fetchHorseDetails]);

  if (loading) {
    return <LoadingSpinner text="Đang tải hồ sơ sức khỏe chiến mã..." minHeight="450px" />;
  }

  if (error || !horse) {
    return (
      <Container fluid className="p-0">
        <ErrorAlert
          message={error || 'Không tìm thấy thông tin chiến mã.'}
          onRetry={fetchHorseDetails}
        />
        <Button variant="outline-primary" onClick={() => navigate('/veterinarian/horses')}>
          <i className="bi bi-arrow-left me-1"></i> Quay lại danh sách
        </Button>
      </Container>
    );
  }

  const latestRecord = records[0];
  const activeTreatment = treatments.find((t) => t.isTrainingLocked || t.status === 'ongoing');
  const isTrainingLocked = activeTreatment?.isTrainingLocked || false;
  const activeInjuries = injuries.filter((i) => i.recoveryStatus !== 'recovered');

  const defaultPhoto = 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=800&q=80';

  return (
    <Container fluid className="p-0">
      {/* Top Breadcrumb & Navigation */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <Button
          variant="link"
          className="p-0 text-decoration-none text-muted"
          onClick={() => navigate('/veterinarian/horses')}
        >
          <i className="bi bi-arrow-left me-1"></i> Danh mục sức khỏe ngựa
        </Button>

        <div className="d-flex gap-2">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={fetchHorseDetails}
            title="Tải lại dữ liệu"
          >
            <i className="bi bi-arrow-clockwise"></i>
          </Button>

          <Button
            variant="success"
            size="sm"
            onClick={() => navigate(`/veterinarian/examinations/new/${horse._id}`)}
          >
            <i className="bi bi-clipboard2-pulse me-1"></i> Khám bệnh mới
          </Button>

          <Button
            variant="danger"
            size="sm"
            onClick={() => navigate(`/veterinarian/injuries/new?horseId=${horse._id}`)}
          >
            <i className="bi bi-bandaid me-1"></i> Ghi nhận chấn thương
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(`/veterinarian/treatments?horseId=${horse._id}`)}
          >
            <i className="bi bi-capsule me-1"></i> Lập phác đồ điều trị
          </Button>

          <Button
            variant={isTrainingLocked ? 'danger' : 'outline-danger'}
            size="sm"
            onClick={() => setShowLockModal(true)}
          >
            <i className={`bi ${isTrainingLocked ? 'bi-lock-fill' : 'bi-unlock'} me-1`}></i>
            {isTrainingLocked ? 'Mở Khóa Tập' : 'Khóa Huấn Luyện'}
          </Button>
        </div>
      </div>

      {/* Hero Card with Horse Overview */}
      <Card className="border-0 shadow-sm mb-4 overflow-hidden bg-white">
        <Card.Body className="p-4">
          <Row className="g-4 align-items-center">
            <Col xs={12} md={3} className="text-center text-md-start">
              <img
                src={horse.photoUrl || defaultPhoto}
                alt={horse.name}
                className="img-fluid rounded shadow-sm object-fit-cover w-100"
                style={{ maxHeight: '200px' }}
                onError={(e) => {
                  e.target.src = defaultPhoto;
                }}
              />
            </Col>

            <Col xs={12} md={9}>
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <h2 className="fw-bold text-dark mb-0">{horse.name}</h2>
                  <div className="text-muted small">
                    Mã định danh: <strong>#{horse._id}</strong>
                  </div>
                </div>

                <div className="d-flex gap-2">
                  <HealthStatusBadge status={horse.healthStatus} className="fs-6 px-3 py-2" />

                  {isTrainingLocked && (
                    <Badge bg="danger" className="fs-6 px-3 py-2 d-flex align-items-center">
                      <i className="bi bi-lock-fill me-1"></i> 🔴 KHÓA HUẤN LUYỆN
                    </Badge>
                  )}
                </div>
              </div>

              {isTrainingLocked && activeTreatment?.lockReason && (
                <Alert variant="danger" className="py-2 mb-3 small">
                  <strong><i className="bi bi-shield-exclamation me-1"></i> Lý do khóa tập y tế:</strong> {activeTreatment.lockReason}
                </Alert>
              )}

              <Row className="g-3 pt-2 border-top">
                <Col xs={6} sm={3}>
                  <div className="text-muted small">Tuổi / Giới tính</div>
                  <div className="fw-semibold text-dark">
                    {calculateAge(horse.dob)} tuổi ({horse.color || 'Ngựa'})
                  </div>
                </Col>

                <Col xs={6} sm={3}>
                  <div className="text-muted small">Giống ngựa</div>
                  <div className="fw-semibold text-dark">{horse.breed || 'Chưa cập nhật'}</div>
                </Col>

                <Col xs={6} sm={3}>
                  <div className="text-muted small">Cân nặng hiện tại</div>
                  <div className="fw-semibold text-primary">
                    {horse.weightKg ? `${horse.weightKg} kg` : '-'}
                  </div>
                </Col>

                <Col xs={6} sm={3}>
                  <div className="text-muted small">Chủ sở hữu</div>
                  <div className="fw-semibold text-dark">{horse.owner?.name || 'Thuộc CLB'}</div>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* 5 Tabs Section */}
      <Card className="border-0 shadow-sm bg-white">
        <Card.Body className="p-3 p-md-4">
          <Tabs
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k)}
            className="mb-4 custom-nav-tabs"
          >
            {/* Tab 1: Overview */}
            <Tab
              eventKey="overview"
              title={
                <span>
                  <i className="bi bi-info-circle me-1"></i> Tổng quan
                </span>
              }
            >
              <Row className="g-4">
                <Col xs={12} md={6}>
                  <Card className="h-100 border bg-light">
                    <Card.Header className="bg-white fw-bold">
                      <i className="bi bi-activity me-2 text-primary"></i>
                      Chỉ Số Sinh Tồn Gần Nhất
                    </Card.Header>
                    <Card.Body>
                      {latestRecord ? (
                        <div>
                          <Row className="g-3 text-center mb-3">
                            <Col xs={4}>
                              <div className="p-3 bg-white rounded shadow-sm">
                                <div className="text-muted small">Thân nhiệt</div>
                                <h4 className={`fw-bold mb-0 ${latestRecord.vitalSigns?.temperatureC > 38.5 ? 'text-danger' : 'text-primary'}`}>
                                  {latestRecord.vitalSigns?.temperatureC ? `${latestRecord.vitalSigns.temperatureC} °C` : '-'}
                                </h4>
                                <small className="text-muted">Chuẩn: 37.5 - 38.5°C</small>
                              </div>
                            </Col>

                            <Col xs={4}>
                              <div className="p-3 bg-white rounded shadow-sm">
                                <div className="text-muted small">Nhịp tim</div>
                                <h4 className={`fw-bold mb-0 ${latestRecord.vitalSigns?.heartRate > 180 ? 'text-danger' : 'text-success'}`}>
                                  {latestRecord.vitalSigns?.heartRate ? `${latestRecord.vitalSigns.heartRate} bpm` : '-'}
                                </h4>
                                <small className="text-muted">Nghỉ: 28-44 bpm</small>
                              </div>
                            </Col>

                            <Col xs={4}>
                              <div className="p-3 bg-white rounded shadow-sm">
                                <div className="text-muted small">Nhịp thở</div>
                                <h4 className="fw-bold mb-0 text-info">
                                  {latestRecord.vitalSigns?.respiratoryRate ? `${latestRecord.vitalSigns.respiratoryRate} bpm` : '-'}
                                </h4>
                                <small className="text-muted">Nghỉ: 8-16 bpm</small>
                              </div>
                            </Col>
                          </Row>

                          <div className="p-3 bg-white rounded shadow-sm">
                            <div className="d-flex justify-content-between">
                              <span className="fw-semibold">Chẩn đoán lần khám gần nhất:</span>
                              <span className="text-muted small">{formatDate(latestRecord.date || latestRecord.createdAt)}</span>
                            </div>
                            <div className="text-dark mt-1">{latestRecord.diagnosis}</div>
                            {latestRecord.notes && (
                              <div className="small text-muted mt-1">
                                <em>Ghi chú: {latestRecord.notes}</em>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted">
                          <i className="bi bi-clipboard2-pulse fs-3 d-block mb-2"></i>
                          Chưa có dữ liệu khám bệnh nào được ghi nhận.
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>

                <Col xs={12} md={6}>
                  <Card className="h-100 border bg-light">
                    <Card.Header className="bg-white fw-bold">
                      <i className="bi bi-bandaid me-2 text-danger"></i>
                      Tình Trạng Chấn Thương & Lệnh Huấn Luyện
                    </Card.Header>
                    <Card.Body>
                      <div className="mb-3 p-3 bg-white rounded shadow-sm">
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="fw-semibold">Trạng thái khóa tập luyện:</span>
                          {isTrainingLocked ? (
                            <Badge bg="danger">🔴 ĐANG KHÓA TẬP</Badge>
                          ) : (
                            <Badge bg="success">🟢 BÌNH THƯỜNG</Badge>
                          )}
                        </div>
                        {isTrainingLocked && (
                          <div className="mt-2 small text-danger">
                            <strong>Lý do:</strong> {activeTreatment?.lockReason}
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-white rounded shadow-sm">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="fw-semibold">Chấn thương đang theo dõi:</span>
                          <Badge bg={activeInjuries.length > 0 ? 'danger' : 'success'} pill>
                            {activeInjuries.length} điểm
                          </Badge>
                        </div>

                        {activeInjuries.length > 0 ? (
                          <ul className="list-unstyled mb-0 small">
                            {activeInjuries.map((inj) => (
                              <li key={inj._id} className="py-1 border-bottom d-flex justify-content-between">
                                <span>
                                  <strong>{inj.bodyPart}</strong> ({inj.severity})
                                </span>
                                <Badge bg="warning" text="dark">
                                  {inj.recoveryStatus}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-success small">
                            <i className="bi bi-check-circle me-1"></i> Không có chấn thương nào đang điều trị.
                          </div>
                        )}
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Tab>

            {/* Tab 2: Medical History */}
            <Tab
              eventKey="history"
              title={
                <span>
                  <i className="bi bi-clock-history me-1"></i> Lịch sử Khám bệnh ({records.length})
                </span>
              }
            >
              <MedicalHistory
                records={records}
                horseId={horse._id}
                onNewExam={() => navigate(`/veterinarian/examinations/new/${horse._id}`)}
              />
            </Tab>

            {/* Tab 3: Injuries & 3D Anatomy Model */}
            <Tab
              eventKey="injuries"
              title={
                <span>
                  <i className="bi bi-bandaid me-1"></i> Chấn thương & Mô hình 3D ({injuries.length})
                </span>
              }
            >
              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-bold mb-0 text-dark">
                    <i className="bi bi-box me-1 text-danger"></i> Sơ Đồ Cơ/Xương 3D Trực Quan
                  </h6>
                  <span className="text-muted small">
                    Nhấp vào điểm chấm đỏ/vàng trên mô hình để xem chi tiết tổn thương
                  </span>
                </div>
                <Horse3DAnatomyViewer injuries={injuries} isInteractive={false} height="320px" />
              </div>

              <InjuryList
                injuries={injuries}
                horseId={horse._id}
                onNewInjury={() => navigate(`/veterinarian/injuries/new?horseId=${horse._id}`)}
              />
            </Tab>

            {/* Tab 4: Treatment & Prescriptions */}
            <Tab
              eventKey="treatment"
              title={
                <span>
                  <i className="bi bi-capsule me-1"></i> Phác đồ & Đơn thuốc ({treatments.length})
                </span>
              }
            >
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold mb-0">
                  <i className="bi bi-prescription2 me-2 text-primary"></i>
                  Danh Sách Phác Đồ Điều Trị & Đơn Thuốc
                </h6>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/veterinarian/treatments?horseId=${horse._id}`)}
                >
                  <i className="bi bi-plus-circle me-1"></i> Lập Phác Đồ Mới
                </Button>
              </div>

              {treatments.length === 0 ? (
                <div className="text-center py-4 bg-light rounded text-muted">
                  <i className="bi bi-capsule fs-3 text-secondary d-block mb-2"></i>
                  Chưa có phác đồ điều trị nào cho ngựa này.
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover bordered className="align-middle bg-white">
                    <thead className="table-light">
                      <tr>
                        <th>Ngày bắt đầu</th>
                        <th>Bác sĩ chỉ định</th>
                        <th>Thuốc & Liều lượng</th>
                        <th>Khóa tập</th>
                        <th>Trạng thái</th>
                        <th>Thời hạn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {treatments.map((tr) => {
                        const st = TREATMENT_STATUS_CONFIG[tr.status] || { label: tr.status, bg: 'secondary' };
                        return (
                          <tr key={tr._id}>
                            <td className="fw-semibold">{formatDate(tr.startDate || tr.createdAt)}</td>
                            <td>{tr.prescribedBy?.name || 'Bác sĩ Thú y'}</td>
                            <td>
                              {tr.medications?.length > 0 ? (
                                <ul className="list-unstyled mb-0 small">
                                  {tr.medications.map((m, idx) => (
                                    <li key={idx}>
                                      💊 <strong>{m.name}</strong>: {m.dosage} ({m.frequency || 'theo chỉ dẫn'})
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-muted small">Không kê thuốc</span>
                              )}
                            </td>
                            <td>
                              {tr.isTrainingLocked ? (
                                <Badge bg="danger">🔴 KHÓA TẬP</Badge>
                              ) : (
                                <Badge bg="light" text="dark" className="border">
                                  Bình thường
                                </Badge>
                              )}
                            </td>
                            <td>
                              <Badge bg={st.bg} pill>
                                {st.label}
                              </Badge>
                            </td>
                            <td className="small text-muted">
                              {tr.endDate ? `Đến ${formatDate(tr.endDate)}` : 'Đang tiến hành'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              )}
            </Tab>

            {/* Tab 5: Medical Schedule */}
            <Tab
              eventKey="schedule"
              title={
                <span>
                  <i className="bi bi-calendar-check me-1"></i> Lịch Y tế Định kỳ
                </span>
              }
            >
              <MedicalScheduleList horse={horse} onUpdated={fetchHorseDetails} />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>

      {/* Training Lock Modal */}
      <TrainingLockModal
        show={showLockModal}
        onHide={() => setShowLockModal(false)}
        horse={horse}
        currentTreatment={activeTreatment}
        onSuccess={() => {
          fetchHorseDetails();
        }}
      />
    </Container>
  );
}
