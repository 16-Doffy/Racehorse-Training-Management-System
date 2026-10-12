import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert, Spinner, Row, Col, Badge, Card } from 'react-bootstrap';
import veterinarianApi from '../../api/veterinarianApi';
import axiosClient from '../../api/axiosClient';

const TRAINING_LEVEL_OPTIONS = [
  {
    key: 'none',
    label: '🛑 Khóa tập hoàn toàn',
    shortLabel: 'Khóa tập',
    variant: 'danger',
    description: 'Nghỉ ngơi hoàn toàn tại chuồng. Hệ thống chặn mọi buổi tập nặng và giải đua.',
    recommendedStatus: 'injured',
  },
  {
    key: 'light',
    label: '🚶 Mức nhẹ (Đi dạo / Phục hồi)',
    shortLabel: 'Tập nhẹ',
    variant: 'warning',
    description: 'Chỉ cho phép đi bộ thả lỏng, vận động nhẹ, vật lý trị liệu có người dắt.',
    recommendedStatus: 'monitoring',
  },
  {
    key: 'moderate',
    label: '🐎 Mức vừa (Nước kiệu có kiểm soát)',
    shortLabel: 'Tập vừa',
    variant: 'info',
    description: 'Cho phép bài tập cường độ trung bình, chạy nước kiệu, bài tập cơ bản.',
    recommendedStatus: 'monitoring',
  },
  {
    key: 'high',
    label: '🏃 Bình thường (Tập luyện đầy đủ)',
    shortLabel: 'Bình thường',
    variant: 'success',
    description: 'Chiến mã đã bình phục hoàn toàn, được phép luyện tập tự do và thi đấu.',
    recommendedStatus: 'eligible',
  },
];

export default function TrainingLockModal({
  show,
  onHide,
  horse,
  currentTreatment,
  onSuccess,
}) {
  const currentLevel =
    currentTreatment?.trainingLevel ||
    (currentTreatment?.isTrainingLocked ? 'none' : horse?.healthStatus === 'eligible' ? 'high' : 'none');

  const [trainingLevel, setTrainingLevel] = useState(currentLevel);
  const [lockReason, setLockReason] = useState('');
  const [targetHealthStatus, setTargetHealthStatus] = useState('eligible');
  const [markInjuriesRecovered, setMarkInjuriesRecovered] = useState(true);
  const [recoveryNotes, setRecoveryNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [trainingSessions, setTrainingSessions] = useState([]);
  const [trainingPlans, setTrainingPlans] = useState([]);
  const [loadingTrainingInfo, setLoadingTrainingInfo] = useState(false);

  useEffect(() => {
    if (show && horse?._id) {
      const initLevel =
        currentTreatment?.trainingLevel ||
        (currentTreatment?.isTrainingLocked ? 'none' : horse?.healthStatus === 'eligible' ? 'high' : 'none');
      setTrainingLevel(initLevel);
      setLockReason(currentTreatment?.lockReason || '');
      setTargetHealthStatus(
        initLevel === 'high' ? 'eligible' : initLevel === 'none' ? 'injured' : 'monitoring'
      );
      setRecoveryNotes(
        initLevel === 'high'
          ? 'Chiến mã đã hồi phục thể lực, đủ điều kiện an toàn để trở lại luyện tập bình thường.'
          : ''
      );
      setError(null);

      setLoadingTrainingInfo(true);
      Promise.all([
        axiosClient.get('/training/sessions', { params: { horse: horse._id } }),
        axiosClient.get('/training/plans', { params: { horse: horse._id } }),
      ])
        .then(([sessionsRes, plansRes]) => {
          setTrainingSessions(sessionsRes.data || []);
          setTrainingPlans(plansRes.data || []);
        })
        .catch(() => {})
        .finally(() => setLoadingTrainingInfo(false));
    }
  }, [show, horse, currentTreatment]);

  const handleSelectLevel = (levelKey) => {
    setTrainingLevel(levelKey);
    const opt = TRAINING_LEVEL_OPTIONS.find((o) => o.key === levelKey);
    if (opt) {
      setTargetHealthStatus(opt.recommendedStatus);
    }
    if (levelKey === 'high' && !recoveryNotes) {
      setRecoveryNotes('Chiến mã đã hồi phục thể lực, đủ điều kiện an toàn để trở lại luyện tập bình thường.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!horse) return;

    if (trainingLevel === 'none' && !lockReason.trim()) {
      setError('Vui lòng nhập lý do khóa huấn luyện y tế.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isLocked = trainingLevel === 'none';

      // 1. Cập nhật hoặc đồng bộ Training Lock / Level lên Treatment
      if (currentTreatment?._id) {
        await veterinarianApi.setTrainingLock(currentTreatment._id, {
          trainingLevel,
          lockReason: isLocked ? lockReason.trim() : recoveryNotes.trim() || undefined,
        });

        if (trainingLevel === 'high') {
          await veterinarianApi.updateTreatment(currentTreatment._id, {
            status: 'completed',
            isTrainingLocked: false,
            trainingLevel: 'high',
            endDate: new Date(),
          });
        }
      } else if (isLocked || trainingLevel !== 'high') {
        // Tạo phiếu khám & phác đồ mang trainingLevel nếu chưa có treatment
        const rec = await veterinarianApi.createHealthRecord({
          horse: horse._id,
          diagnosis: `Y lệnh chỉ định mức tập y tế: ${
            TRAINING_LEVEL_OPTIONS.find((o) => o.key === trainingLevel)?.label || trainingLevel
          }`,
          resultStatus: targetHealthStatus,
          notes: lockReason.trim() || recoveryNotes.trim(),
          date: new Date(),
        });

        await veterinarianApi.createTreatment({
          healthRecord: rec.data?._id,
          horse: horse._id,
          isTrainingLocked: isLocked,
          trainingLevel,
          lockReason: isLocked ? lockReason.trim() : undefined,
          status: 'ongoing',
          startDate: new Date(),
        });
      }

      // 2. Nếu chuyển sang HIGH (Hồi phục hoàn toàn / Mở khóa)
      if (trainingLevel === 'high') {
        // Giải phóng các treatment đang khóa của ngựa này
        try {
          const treatmentsRes = await veterinarianApi.getTreatments({ horse: horse._id });
          const horseTreatments = (treatmentsRes?.data || []).filter(
            (t) => t.isTrainingLocked || t.status === 'ongoing'
          );
          for (const tr of horseTreatments) {
            await veterinarianApi.setTrainingLock(tr._id, {
              trainingLevel: 'high',
              isTrainingLocked: false,
              lockReason: '',
            });
            await veterinarianApi.updateTreatment(tr._id, {
              status: 'completed',
              isTrainingLocked: false,
              trainingLevel: 'high',
              endDate: new Date(),
            });
          }
        } catch (tErr) {
          console.warn('Error releasing locks on other treatments:', tErr);
        }

        // Tạo phiếu xác nhận hồi phục
        await veterinarianApi.createHealthRecord({
          horse: horse._id,
          diagnosis: 'Đánh giá phục hồi & Cho phép luyện tập mức bình thường',
          resultStatus: targetHealthStatus || 'eligible',
          // The return-to-training assessment itself: the horse may work normally from now on.
          clearedLevel: 'high',
          notes: recoveryNotes.trim() || 'Mở khóa huấn luyện sau điều trị.',
          date: new Date(),
        });

        // Đánh dấu các điểm chấn thương là đã bình phục nếu tích chọn
        if (markInjuriesRecovered) {
          const markersRes = await veterinarianApi.getInjuryMarkers({ horse: horse._id });
          const activeMarkers = (markersRes.data || []).filter((m) => m.recoveryStatus !== 'recovered');
          for (const marker of activeMarkers) {
            await veterinarianApi.updateInjuryMarker(marker._id, {
              recoveryStatus: 'recovered',
              notes: `${marker.notes || ''} [Đã bình phục ngày ${new Date().toLocaleDateString('vi-VN')}]`.trim(),
            });
          }
        }
      } else {
        // Mức tập none, light, moderate -> ghi nhận HealthRecord cập nhật
        await veterinarianApi.createHealthRecord({
          horse: horse._id,
          diagnosis: `Y lệnh điều chỉnh mức tập: ${
            TRAINING_LEVEL_OPTIONS.find((o) => o.key === trainingLevel)?.label || trainingLevel
          }`,
          resultStatus: targetHealthStatus,
          notes: (trainingLevel === 'none' ? lockReason : recoveryNotes).trim(),
          date: new Date(),
        });
      }

      if (onSuccess) onSuccess(trainingLevel);
      onHide();
    } catch (err) {
      setError(err?.message || 'Không thể cập nhật mức huấn luyện.');
    } finally {
      setLoading(false);
    }
  };

  if (!horse) return null;

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static" size="lg">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton={!loading} className="bg-dark text-white">
          <Modal.Title className="fs-5">
            <i className="bi bi-shield-shaded me-2 text-warning"></i>
            Chỉ Định Mức Huấn Luyện Y Tế & Hồi Phục
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          {/* Horse Header Info */}
          <div className="mb-3 p-3 bg-light rounded d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-bold fs-6">
                Chiến mã: <span className="text-primary">{horse.name}</span> (#{horse._id?.slice(-6).toUpperCase()})
              </div>
              <div className="small text-muted">Giống: {horse.breed || 'Chưa rõ'}</div>
            </div>
            <div className="text-end">
              <span className="small text-muted d-block">Trạng thái sức khỏe:</span>
              <span
                className={`badge ${
                  horse.healthStatus === 'injured'
                    ? 'bg-danger'
                    : horse.healthStatus === 'monitoring'
                    ? 'bg-warning text-dark'
                    : 'bg-success'
                }`}
              >
                {horse.healthStatus}
              </span>
            </div>
          </div>

          {/* Training Level Options (4 Levels) */}
          <div className="mb-3">
            <Form.Label className="fw-bold text-dark d-block mb-2">
              <i className="bi bi-speedometer2 me-1 text-primary"></i>
              Chọn Mức Tập Khi Điều Trị / Hồi Phục (trainingLevel):
            </Form.Label>
            <Row className="g-2">
              {TRAINING_LEVEL_OPTIONS.map((opt) => {
                const isSelected = trainingLevel === opt.key;
                return (
                  <Col xs={12} sm={6} key={opt.key}>
                    <Card
                      className={`h-100 cursor-pointer border-2 transition-all ${
                        isSelected ? `border-${opt.variant} bg-${opt.variant}-subtle shadow-sm` : 'border-light-subtle'
                      }`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleSelectLevel(opt.key)}
                    >
                      <Card.Body className="p-3">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className={`fw-bold text-${opt.variant}`}>{opt.label}</span>
                          {isSelected && (
                            <Badge bg={opt.variant}>
                              <i className="bi bi-check-lg me-1"></i>Đang chọn
                            </Badge>
                          )}
                        </div>
                        <div className="small text-muted">{opt.description}</div>
                      </Card.Body>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </div>

          {/* Active Training Info */}
          <div className="mb-3 p-3 bg-light border rounded">
            <div className="fw-bold text-dark mb-2 d-flex align-items-center justify-content-between">
              <span>
                <i className="bi bi-calendar-event me-2 text-primary"></i>
                Lịch tập hiện tại ({trainingSessions.length} buổi tập, {trainingPlans.length} giáo án)
              </span>
              {loadingTrainingInfo && <Spinner animation="border" size="sm" />}
            </div>

            {trainingSessions.length === 0 && trainingPlans.length === 0 ? (
              <div className="small text-muted italic">Hiện tại chiến mã chưa có buổi tập hoặc giáo án nào đăng ký.</div>
            ) : (
              <div className="small">
                {trainingPlans.length > 0 && (
                  <div className="mb-2">
                    <strong>📋 Giáo án đang hoạt động:</strong>
                    <ul className="mb-1 ps-3">
                      {trainingPlans.map((p) => (
                        <li key={p._id}>
                          Giai đoạn: <strong>{p.phase}</strong> ({p.distanceTarget}m, {p.weeklyVolumeKm}km/tuần) -{' '}
                          <Badge bg="info">{p.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {trainingSessions.length > 0 && (
                  <div>
                    <strong>🏃 Buổi tập sắp tới:</strong>
                    <ul className="mb-0 ps-3">
                      {trainingSessions.slice(0, 3).map((s) => (
                        <li key={s._id}>
                          {new Date(s.scheduledAt).toLocaleString('vi-VN')} ({s.sessionType === 'trial_run' ? 'Chạy thử' : 'Buổi tập'}) -{' '}
                          <Badge bg={s.status === 'in_progress' ? 'danger' : 'secondary'}>{s.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Form details based on chosen training level */}
          {trainingLevel === 'none' ? (
            <>
              <Alert variant="danger" className="d-flex align-items-center mb-3">
                <i className="bi bi-slash-circle-fill fs-3 me-2 text-danger"></i>
                <div className="small">
                  Khi chọn <strong>Khóa tập hoàn toàn</strong>, Huấn Luyện Viên Trưởng sẽ bị chặn không thể gán ngựa này vào các buổi tập. Một thông báo y tế khẩn cấp sẽ được phát tới toàn bộ đội ngũ.
                </div>
              </Alert>

              <Row className="g-3 mb-2">
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label className="fw-semibold">Trạng thái sức khỏe y tế</Form.Label>
                    <Form.Select
                      value={targetHealthStatus}
                      onChange={(e) => setTargetHealthStatus(e.target.value)}
                      disabled={loading}
                    >
                      <option value="injured">🔴 Chấn thương (Injured)</option>
                      <option value="quarantined">⚫ Cách ly y tế (Quarantined)</option>
                      <option value="monitoring">🟡 Cần theo dõi (Monitoring)</option>
                    </Form.Select>
                  </Form.Group>
                </Col>

                <Col xs={12}>
                  <Form.Group>
                    <Form.Label className="fw-semibold text-danger">
                      Lý do y tế yêu cầu khóa tập <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      placeholder="Ví dụ: Kháng viêm khớp gối cấp tính, cấm vận động nặng trong 7 ngày..."
                      value={lockReason}
                      onChange={(e) => setLockReason(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </>
          ) : trainingLevel === 'high' ? (
            <>
              <Alert variant="success" className="mb-3">
                <div className="fw-bold mb-1">
                  <i className="bi bi-check-circle-fill me-1"></i> Phục hồi hoàn toàn & Cấp phép tập luyện bình thường
                </div>
                <div className="small">
                  Mở khóa toàn bộ hạn chế. Huấn Luyện Viên Trưởng có thể lên lịch huấn luyện và đăng ký giải đua bình thường.
                </div>
              </Alert>

              <Row className="g-3 mb-2">
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label className="fw-semibold">Cập nhật trạng thái sức khỏe</Form.Label>
                    <Form.Select
                      value={targetHealthStatus}
                      onChange={(e) => setTargetHealthStatus(e.target.value)}
                      disabled={loading}
                    >
                      <option value="eligible">🟢 Đủ điều kiện (Eligible) - Bình phục hoàn toàn</option>
                      <option value="monitoring">🟡 Cần theo dõi (Monitoring)</option>
                    </Form.Select>
                  </Form.Group>
                </Col>

                <Col xs={12} md={6} className="d-flex align-items-end">
                  <Form.Check
                    type="checkbox"
                    id="mark-recovered"
                    label="Đánh dấu các vết chấn thương hiện tại là 'Đã bình phục'"
                    checked={markInjuriesRecovered}
                    onChange={(e) => setMarkInjuriesRecovered(e.target.checked)}
                    disabled={loading}
                    className="mb-2 fw-semibold text-success"
                  />
                </Col>

                <Col xs={12}>
                  <Form.Group>
                    <Form.Label className="fw-semibold">Kết luận lâm sàng & Ghi chú hồi phục</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={recoveryNotes}
                      onChange={(e) => setRecoveryNotes(e.target.value)}
                      placeholder="Ghi chú về tình trạng thể lực phục hồi..."
                      disabled={loading}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Alert variant={trainingLevel === 'light' ? 'warning' : 'info'} className="mb-3">
                <div className="fw-bold mb-1">
                  <i className="bi bi-info-circle-fill me-1"></i> Cho phép tập ở mức{' '}
                  {trainingLevel === 'light' ? 'Nhẹ (Phục hồi)' : 'Vừa (Có kiểm soát)'}
                </div>
                <div className="small">
                  Huấn luyện viên chỉ được giao các bài tập phù hợp với mức thể lực này, tránh tái phát chấn thương.
                </div>
              </Alert>

              <Row className="g-3 mb-2">
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label className="fw-semibold">Cập nhật trạng thái sức khỏe</Form.Label>
                    <Form.Select
                      value={targetHealthStatus}
                      onChange={(e) => setTargetHealthStatus(e.target.value)}
                      disabled={loading}
                    >
                      <option value="monitoring">🟡 Cần theo dõi (Monitoring) - Phục hồi có giới hạn</option>
                      <option value="eligible">🟢 Đủ điều kiện (Eligible)</option>
                    </Form.Select>
                  </Form.Group>
                </Col>

                <Col xs={12}>
                  <Form.Group>
                    <Form.Label className="fw-semibold">Chỉ dẫn y tế cho HLV khi huấn luyện</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={recoveryNotes}
                      onChange={(e) => setRecoveryNotes(e.target.value)}
                      placeholder={
                        trainingLevel === 'light'
                          ? 'Ví dụ: Đi bộ thả lỏng 20-30 phút/ngày, không cho chạy nước kiệu...'
                          : 'Ví dụ: Bài tập nước kiệu nhẹ, giới hạn cự ly dưới 2000m...'
                      }
                      disabled={loading}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={loading}>
            Hủy bỏ
          </Button>
          <Button
            variant={TRAINING_LEVEL_OPTIONS.find((o) => o.key === trainingLevel)?.variant || 'primary'}
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" />
                Đang lưu...
              </>
            ) : (
              <>
                <i className="bi bi-check2-circle me-1"></i>
                Xác Nhận Thiết Lập Mức:{' '}
                {TRAINING_LEVEL_OPTIONS.find((o) => o.key === trainingLevel)?.shortLabel || trainingLevel}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
