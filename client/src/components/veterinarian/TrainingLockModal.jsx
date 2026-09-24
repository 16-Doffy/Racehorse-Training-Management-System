import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert, Spinner, Row, Col, Badge } from 'react-bootstrap';
import veterinarianApi from '../../api/veterinarianApi';
import axiosClient from '../../api/axiosClient';

export default function TrainingLockModal({
  show,
  onHide,
  horse,
  currentTreatment,
  onSuccess,
}) {
  const isLocked = currentTreatment?.isTrainingLocked;
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
      setLockReason(currentTreatment?.lockReason || '');
      setTargetHealthStatus(isLocked ? 'eligible' : 'injured');
      setRecoveryNotes(isLocked ? 'Chiến mã đã hồi phục thể lực, đủ điều kiện an toàn để trở lại luyện tập.' : '');
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
  }, [show, horse, currentTreatment, isLocked]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!horse) return;

    if (!isLocked && !lockReason.trim()) {
      setError('Vui lòng nhập lý do khóa huấn luyện y tế.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isLocked) {
        // UNLOCK FLOW:
        // 1. Lift the training lock order
        if (currentTreatment?._id) {
          await veterinarianApi.setTrainingLock(currentTreatment._id, {
            isTrainingLocked: false,
            lockReason: '',
          });
          // Update treatment status to completed
          await veterinarianApi.updateTreatment(currentTreatment._id, {
            status: 'completed',
            endDate: new Date(),
          });
        }

        // 2. Create recovery health record to update horse.healthStatus in MongoDB
        await veterinarianApi.createHealthRecord({
          horse: horse._id,
          diagnosis: 'Đánh giá phục hồi & Mở khóa huấn luyện y tế',
          resultStatus: targetHealthStatus, // 'eligible' or 'monitoring'
          notes: recoveryNotes.trim() || 'Mở khóa huấn luyện sau điều trị.',
          date: new Date(),
        });

        // 3. Mark active injuries as recovered if checked
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
        // LOCK FLOW:
        // 1. Create health record setting horse status to injured/quarantined
        const rec = await veterinarianApi.createHealthRecord({
          horse: horse._id,
          diagnosis: 'Y lệnh khóa huấn luyện khẩn cấp',
          resultStatus: targetHealthStatus, // 'injured' or 'quarantined'
          notes: lockReason.trim(),
          date: new Date(),
        });

        // 2. Set/create treatment with training lock
        if (currentTreatment?._id) {
          await veterinarianApi.setTrainingLock(currentTreatment._id, {
            isTrainingLocked: true,
            lockReason: lockReason.trim(),
          });
        } else {
          await veterinarianApi.createTreatment({
            healthRecord: rec.data?._id,
            horse: horse._id,
            isTrainingLocked: true,
            lockReason: lockReason.trim(),
            status: 'ongoing',
            startDate: new Date(),
          });
        }
      }

      if (onSuccess) onSuccess(!isLocked);
      onHide();
    } catch (err) {
      setError(err?.message || 'Không thể cập nhật trạng thái khóa huấn luyện.');
    } finally {
      setLoading(false);
    }
  };

  if (!horse) return null;

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static" size="lg">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton={!loading} className={isLocked ? 'bg-success text-white' : 'bg-danger text-white'}>
          <Modal.Title className="fs-5">
            <i className={`bi ${isLocked ? 'bi-unlock-fill' : 'bi-lock-fill'} me-2`}></i>
            {isLocked ? 'Mở Khóa Huấn Luyện & Cập Nhật Phục Hồi' : 'Kích Hoạt Khóa Huấn Luyện Khẩn Cấp'}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          <div className="mb-3 p-2 bg-light rounded d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-bold">
                Chiến mã: <span className="text-primary">{horse.name}</span> (#{horse._id?.slice(-6).toUpperCase()})
              </div>
              <div className="small text-muted">Giống: {horse.breed || 'Chưa rõ'}</div>
            </div>
            <div className="text-end">
              <span className="small text-muted d-block">Trạng thái sức khỏe hiện tại:</span>
              <span className={`badge ${horse.healthStatus === 'injured' ? 'bg-danger' : horse.healthStatus === 'monitoring' ? 'bg-warning text-dark' : 'bg-success'}`}>
                {horse.healthStatus}
              </span>
            </div>
          </div>

          {/* Active Training Plans & Sessions Inspection */}
          <div className="mb-3 p-3 bg-light border rounded">
            <div className="fw-bold text-dark mb-2 d-flex align-items-center justify-content-between">
              <span>
                <i className="bi bi-calendar-event me-2 text-primary"></i>
                Lịch Tập & Giáo Án Hiện Tại Của Chiến Mã ({trainingSessions.length} buổi tập, {trainingPlans.length} giáo án)
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
                          Giai đoạn: <strong>{p.phase}</strong> ({p.distanceTarget}m, {p.weeklyVolumeKm}km/tuần) - <Badge bg="info">{p.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {trainingSessions.length > 0 && (
                  <div>
                    <strong>🏃 Buổi tập sắp tới / đang diễn ra:</strong>
                    <ul className="mb-0 ps-3">
                      {trainingSessions.slice(0, 3).map((s) => (
                        <li key={s._id}>
                          {new Date(s.scheduledAt).toLocaleString('vi-VN')} ({s.sessionType === 'trial_run' ? 'Chạy thử' : 'Buổi tập'}) - <Badge bg={s.status === 'in_progress' ? 'danger' : 'secondary'}>{s.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {!isLocked ? (
            <>
              <Alert variant="warning" className="d-flex align-items-center mb-3">
                <i className="bi bi-exclamation-triangle-fill fs-3 me-2 text-danger"></i>
                <div className="small">
                  Khi kích hoạt <strong>Khóa Huấn Luyện (Training Lock)</strong>, Huấn Luyện Viên Trưởng sẽ bị chặn không thể gán ngựa này vào các buổi tập nặng. Một cảnh báo khẩn cấp sẽ được phát tức thời qua Socket.io.
                </div>
              </Alert>

              <Row className="g-3 mb-3">
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label className="fw-semibold">Cập nhật trạng thái sức khỏe của ngựa</Form.Label>
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
                    <Form.Label className="fw-semibold">
                      Lý do y tế yêu cầu dừng tập <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      placeholder="Ví dụ: Nghi ngờ viêm gân cổ chân sau buổi chạy; Sốt cao 39.2°C cần cách ly..."
                      value={lockReason}
                      onChange={(e) => setLockReason(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Alert variant="success" className="mb-3">
                <div className="fw-bold mb-1"><i className="bi bi-check-circle-fill me-1"></i> Xác nhận mở khóa huấn luyện</div>
                <div className="small">
                  Ngựa hiện đang bị khóa với lý do: <em>"{currentTreatment?.lockReason || 'Chỉ định y tế'}"</em>. Mở khóa sẽ cho phép Huấn Luyện Viên Trưởng lên lịch bài tập trở lại.
                </div>
              </Alert>

              <Row className="g-3 mb-3">
                <Col xs={12} md={6}>
                  <Form.Group>
                    <Form.Label className="fw-semibold">
                      Chuyển trạng thái sức khỏe của ngựa thành <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Select
                      value={targetHealthStatus}
                      onChange={(e) => setTargetHealthStatus(e.target.value)}
                      disabled={loading}
                    >
                      <option value="eligible">🟢 Đủ điều kiện (Eligible) - Bình phục hoàn toàn</option>
                      <option value="monitoring">🟡 Cần theo dõi (Monitoring) - Cho phép tập nhẹ</option>
                    </Form.Select>
                  </Form.Group>
                </Col>

                <Col xs={12} md={6} className="d-flex align-items-end">
                  <Form.Check
                    type="checkbox"
                    id="mark-recovered"
                    label="Đánh dấu các điểm chấn thương hiện tại là 'Đã bình phục'"
                    checked={markInjuriesRecovered}
                    onChange={(e) => setMarkInjuriesRecovered(e.target.checked)}
                    disabled={loading}
                    className="mb-2 fw-semibold text-success"
                  />
                </Col>

                <Col xs={12}>
                  <Form.Group>
                    <Form.Label className="fw-semibold">Kết luận lâm sàng & Ghi chú mở khóa</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={recoveryNotes}
                      onChange={(e) => setRecoveryNotes(e.target.value)}
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
          <Button variant={isLocked ? 'success' : 'danger'} type="submit" disabled={loading}>
            {loading ? (
              <>
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" />
                Đang xử lý...
              </>
            ) : isLocked ? (
              <>
                <i className="bi bi-unlock-fill me-1"></i> Xác Nhận Mở Khóa & Chuyển Trạng Thái Khỏe Mạnh
              </>
            ) : (
              <>
                <i className="bi bi-lock-fill me-1"></i> Xác Nhận Khóa Tập & Đặt Trạng Thái Chấn Thương
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
