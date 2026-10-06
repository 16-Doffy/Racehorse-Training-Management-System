import React, { useState } from 'react';
import { Modal, Button, Form, Alert, Badge, Row, Col, Spinner, Image } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import veterinarianApi from '../../api/veterinarianApi';
import { formatDate } from '../../utils/formatDate';
import { INCIDENT_STATUS_META, INCIDENT_SEVERITY_META, incidentStatusOf } from '../../constants/care';

export default function IncidentManagementModal({
  show,
  onHide,
  task,
  onSuccess,
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('resolved');
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!task || !task.incidentReport) return null;

  const incident = task.incidentReport;
  const currentStatus = incidentStatusOf(incident);
  const severityMeta = INCIDENT_SEVERITY_META[incident.severity] || { label: incident.severity || 'Thường', color: 'secondary' };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === 'resolved' && !response.trim()) {
      setError('Vui lòng nhập rõ phương án đã xử lý hoặc chỉ định lâm sàng.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await veterinarianApi.handleIncident(task._id, {
        status,
        response: response.trim(),
      });
      if (onSuccess) onSuccess();
      onHide();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Lỗi khi cập nhật trạng thái sự cố.');
    } finally {
      setSubmitting(false);
    }
  };

  const horseId = task.horse?._id || task.horse;
  const horseName = task.horse?.name || 'Chiến mã';

  return (
    <Modal show={show} onHide={onHide} centered size="lg" backdrop="static">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton={!submitting} className="bg-light">
          <Modal.Title className="fs-5">
            <i className="bi bi-shield-exclamation text-danger me-2"></i>
            Xử Lý Sự Cố Nhân Viên Báo Cáo
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          {/* Info Card */}
          <div className="p-3 bg-light rounded mb-3 border">
            <Row className="g-2">
              <Col xs={12} md={6}>
                <div>
                  <span className="text-muted small">Chiến mã:</span>{' '}
                  <strong className="text-primary">{horseName}</strong>
                </div>
                <div>
                  <span className="text-muted small">Công việc phát sinh:</span>{' '}
                  <span className="fw-semibold">{task.taskType}</span>
                </div>
              </Col>
              <Col xs={12} md={6}>
                <div>
                  <span className="text-muted small">Nhân viên báo cáo (Groom):</span>{' '}
                  <span className="fw-semibold">{task.assignedTo?.name || 'Nhân viên chăm sóc'}</span>
                </div>
                <div>
                  <span className="text-muted small">Thời gian báo:</span>{' '}
                  <span>{formatDate(incident.reportedAt || task.updatedAt)}</span>
                </div>
              </Col>
            </Row>

            <div className="mt-2 pt-2 border-top d-flex gap-2 align-items-center">
              <span className="text-muted small">Mức độ sự cố:</span>
              <Badge bg={severityMeta.color === 'red' ? 'danger' : severityMeta.color === 'orange' ? 'warning' : 'info'}>
                {severityMeta.label}
              </Badge>
              <span className="text-muted small ms-3">Trạng thái hiện tại:</span>
              <Badge bg={currentStatus === 'resolved' ? 'success' : currentStatus === 'acknowledged' ? 'warning' : 'danger'}>
                {INCIDENT_STATUS_META[currentStatus]?.label || currentStatus}
              </Badge>
            </div>
          </div>

          {/* Incident Description */}
          <div className="mb-3">
            <Form.Label className="fw-bold small text-muted text-uppercase mb-1">
              Nội dung sự cố được ghi nhận:
            </Form.Label>
            <div className="p-3 bg-danger-subtle border border-danger-subtle rounded text-danger-emphasis">
              <i className="bi bi-quote fs-4 me-1"></i>
              {incident.description || 'Không có mô tả chi tiết.'}
            </div>
          </div>

          {/* Incident Photos */}
          {incident.photos && incident.photos.length > 0 && (
            <div className="mb-3">
              <Form.Label className="fw-bold small text-muted text-uppercase mb-2">
                Hình ảnh hiện trường do nhân viên đính kèm ({incident.photos.length}):
              </Form.Label>
              <div className="d-flex flex-wrap gap-2">
                {incident.photos.map((photoUrl, idx) => (
                  <a key={idx} href={photoUrl} target="_blank" rel="noopener noreferrer">
                    <Image
                      src={photoUrl}
                      thumbnail
                      style={{ width: '100px', height: '100px', objectFit: 'cover' }}
                      className="shadow-sm hover-opacity"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Previous handling note if any */}
          {incident.response && (
            <div className="mb-3 p-2 bg-warning-subtle rounded small border border-warning-subtle">
              <strong>Phản hồi trước đó của Bác sĩ ({incident.handledBy?.name || 'Bác sĩ'}):</strong>{' '}
              {incident.response}
            </div>
          )}

          <hr className="my-3" />

          {/* Resolution Form */}
          <Row className="g-3">
            <Col xs={12} md={5}>
              <Form.Group>
                <Form.Label className="fw-semibold">Cập nhật trạng thái xử lý <span className="text-danger">*</span></Form.Label>
                <Form.Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={submitting}
                >
                  <option value="resolved">✅ Đã xử lý (Resolved) - Đóng sự cố</option>
                  <option value="acknowledged">👀 Đã tiếp nhận (Acknowledged) - Đang xử lý</option>
                </Form.Select>
              </Form.Group>
            </Col>

            <Col xs={12} md={7} className="d-flex align-items-end">
              {horseId && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  className="w-100"
                  onClick={() => {
                    onHide();
                    navigate(`/veterinarian/examinations/new/${horseId}`);
                  }}
                >
                  <i className="bi bi-clipboard2-pulse me-1"></i> Lập phiếu khám bệnh cho {horseName}
                </Button>
              )}
            </Col>

            <Col xs={12}>
              <Form.Group>
                <Form.Label className="fw-semibold">
                  Kết luận xử lý & Hướng dẫn chuyên môn cho Groom <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="Ví dụ: Đã tiêm hạ sốt lúc 15:30. Cho ngựa nghỉ ngơi, theo dõi nhiệt độ sau mỗi 2 tiếng..."
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  required={status === 'resolved'}
                  disabled={submitting}
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={submitting}>
            Đóng
          </Button>
          <Button variant={status === 'resolved' ? 'success' : 'warning'} type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner size="sm" animation="border" className="me-1" />
                Đang lưu...
              </>
            ) : status === 'resolved' ? (
              <>
                <i className="bi bi-check-circle-fill me-1"></i> Xác Nhận Đã Xử Lý Xong
              </>
            ) : (
              <>
                <i className="bi bi-hand-thumbs-up me-1"></i> Xác Nhận Đã Tiếp Nhận
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
