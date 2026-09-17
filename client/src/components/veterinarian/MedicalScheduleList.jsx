import React, { useState } from 'react';
import { Card, Table, Badge, Button, Form, Modal, Spinner, Alert } from 'react-bootstrap';
import { formatDate, formatDateForInput } from '../../utils/formatDate';
import veterinarianApi from '../../api/veterinarianApi';

export default function MedicalScheduleList({ horse, onUpdated }) {
  const careSchedule = horse?.careSchedule || {};
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    nextVaccinationDue: formatDateForInput(careSchedule.nextVaccinationDue),
    nextDewormingDue: formatDateForInput(careSchedule.nextDewormingDue),
    nextFarrierDue: formatDateForInput(careSchedule.nextFarrierDue),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getDueStatus = (dueDateString) => {
    if (!dueDateString) return { label: 'Chưa lên lịch', bg: 'secondary', isOverdue: false };
    const due = new Date(dueDateString);
    const now = new Date();
    // Normalize to date comparison
    now.setHours(0, 0, 0, 0);
    const dueNormalized = new Date(due);
    dueNormalized.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((dueNormalized - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Quá hạn (${Math.abs(diffDays)} ngày)`, bg: 'danger', isOverdue: true };
    }
    if (diffDays === 0) {
      return { label: 'Đến hạn hôm nay', bg: 'warning', text: 'dark', isDueSoon: true };
    }
    if (diffDays <= 7) {
      return { label: `Đến hạn trong ${diffDays} ngày`, bg: 'info', text: 'dark', isDueSoon: true };
    }
    return { label: `Sắp tới (${diffDays} ngày)`, bg: 'success', isUpcoming: true };
  };

  const handleOpenModal = () => {
    setFormData({
      nextVaccinationDue: formatDateForInput(careSchedule.nextVaccinationDue),
      nextDewormingDue: formatDateForInput(careSchedule.nextDewormingDue),
      nextFarrierDue: formatDateForInput(careSchedule.nextFarrierDue),
    });
    setError(null);
    setShowEditModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        nextVaccinationDue: formData.nextVaccinationDue || null,
        nextDewormingDue: formData.nextDewormingDue || null,
        nextFarrierDue: formData.nextFarrierDue || null,
      };
      await veterinarianApi.updateCareSchedule(horse._id, payload);
      setShowEditModal(false);
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err?.message || 'Không thể cập nhật lịch y tế.');
    } finally {
      setLoading(false);
    }
  };

  const scheduleItems = [
    {
      key: 'vaccination',
      title: 'Tiêm phòng (Vaccination)',
      icon: 'bi-eyedropper',
      date: careSchedule.nextVaccinationDue,
      notifiedAt: careSchedule.vaccinationNotifiedAt,
      desc: 'Tiêm vắc xin phòng ngừa bệnh truyền nhiễm (cúm ngựa, uốn ván, dại...).',
    },
    {
      key: 'deworming',
      title: 'Tẩy giun định kỳ (Deworming)',
      icon: 'bi-capsule',
      date: careSchedule.nextDewormingDue,
      notifiedAt: careSchedule.dewormingNotifiedAt,
      desc: 'Sử dụng thuốc diệt ký sinh trùng đường ruột theo chu kỳ 3-6 tháng.',
    },
    {
      key: 'farrier',
      title: 'Kiểm tra móng & Đóng móng (Farrier Check)',
      icon: 'bi-hammer',
      date: careSchedule.nextFarrierDue,
      notifiedAt: careSchedule.farrierNotifiedAt,
      desc: 'Gọt móng, kiểm tra gót móng và thay móng sắt định kỳ cho ngựa đua.',
    },
  ];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-bold mb-0 text-dark">
          <i className="bi bi-calendar-check me-2 text-primary"></i>
          Lịch Chăm Sóc Y Tế & Kiểm Tra Định Kỳ
        </h6>

        <Button variant="primary" size="sm" onClick={handleOpenModal}>
          <i className="bi bi-calendar-plus me-1"></i> Cập nhật Lịch Trình
        </Button>
      </div>

      <div className="table-responsive">
        <Table hover bordered className="align-middle bg-white">
          <thead className="table-light">
            <tr>
              <th style={{ width: '220px' }}>Hạng mục chăm sóc</th>
              <th>Mô tả chuyên môn</th>
              <th style={{ width: '150px' }}>Hạn tiếp theo</th>
              <th style={{ width: '160px' }}>Trạng thái</th>
              <th style={{ width: '160px' }}>Nhắc nhở gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {scheduleItems.map((item) => {
              const status = getDueStatus(item.date);
              return (
                <tr key={item.key}>
                  <td className="fw-bold">
                    <i className={`bi ${item.icon} me-2 text-primary`}></i>
                    {item.title}
                  </td>
                  <td className="small text-muted">{item.desc}</td>
                  <td className="fw-semibold text-primary">{formatDate(item.date)}</td>
                  <td>
                    <Badge bg={status.bg} text={status.text} pill className="px-2 py-1">
                      {status.label}
                    </Badge>
                  </td>
                  <td className="small text-muted">{formatDate(item.notifiedAt, 'Chưa gửi nhắc')}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      {/* Edit Schedule Modal */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
        <Form onSubmit={handleSave}>
          <Modal.Header closeButton={!loading}>
            <Modal.Title className="fs-5">Cập nhật Lịch Y tế - {horse?.name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && <Alert variant="danger">{error}</Alert>}

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">
                <i className="bi bi-eyedropper me-1 text-primary"></i> Hạn Tiêm Phòng Kế Tiếp
              </Form.Label>
              <Form.Control
                type="date"
                value={formData.nextVaccinationDue}
                onChange={(e) => setFormData({ ...formData, nextVaccinationDue: e.target.value })}
                disabled={loading}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">
                <i className="bi bi-capsule me-1 text-success"></i> Hạn Tẩy Giun Kế Tiếp
              </Form.Label>
              <Form.Control
                type="date"
                value={formData.nextDewormingDue}
                onChange={(e) => setFormData({ ...formData, nextDewormingDue: e.target.value })}
                disabled={loading}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">
                <i className="bi bi-hammer me-1 text-warning"></i> Hạn Kiểm Tra Móng (Farrier) Kế Tiếp
              </Form.Label>
              <Form.Control
                type="date"
                value={formData.nextFarrierDue}
                onChange={(e) => setFormData({ ...formData, nextFarrierDue: e.target.value })}
                disabled={loading}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowEditModal(false)} disabled={loading}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" /> : 'Lưu thay đổi'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
