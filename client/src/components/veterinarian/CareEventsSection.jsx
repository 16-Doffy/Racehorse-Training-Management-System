import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Badge, Button, Form, Modal, Spinner, Alert, Row, Col, ButtonGroup } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { formatDate, formatDateForInput } from '../../utils/formatDate';
import veterinarianApi from '../../api/veterinarianApi';
import { CARE_EVENT_META } from '../../constants/care';

const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function CareEventsSection({ horse, onUpdated }) {
  const { user } = useSelector((state) => state.auth);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterKind, setFilterKind] = useState('all');

  // Modal create care event
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  const [formData, setFormData] = useState({
    kind: 'vaccination',
    date: formatDateForInput(new Date()),
    product: '',
    batchNumber: '',
    dose: '',
    nextDue: '',
    note: '',
  });

  // Delete event state
  const [deletingId, setDeletingId] = useState(null);

  const fetchEvents = useCallback(async () => {
    if (!horse?._id) return;
    setLoading(true);
    setError(null);
    try {
      const params = filterKind !== 'all' ? { kind: filterKind } : {};
      const res = await veterinarianApi.getCareEvents(horse._id, params);
      setEvents(res.data || []);
    } catch (err) {
      setError(err?.message || 'Không thể tải lịch sử chăm sóc y tế.');
    } finally {
      setLoading(false);
    }
  }, [horse?._id, filterKind]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleOpenCreateModal = (defaultKind = 'vaccination') => {
    setFormData({
      kind: defaultKind,
      date: formatDateForInput(new Date()),
      product: '',
      batchNumber: '',
      dose: '',
      nextDue: '',
      note: '',
    });
    setModalError(null);
    setShowCreateModal(true);
  };

  const handleSetQuickNextDue = (months) => {
    const baseDate = formData.date ? new Date(formData.date) : new Date();
    baseDate.setMonth(baseDate.getMonth() + months);
    setFormData((prev) => ({
      ...prev,
      nextDue: formatDateForInput(baseDate),
    }));
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    // Client validations
    if ((formData.kind === 'vaccination' || formData.kind === 'deworming') && !formData.product.trim()) {
      setModalError(`Vui lòng nhập tên ${formData.kind === 'vaccination' ? 'vắc-xin' : 'thuốc tẩy giun'}.`);
      setSubmitting(false);
      return;
    }

    const execDate = new Date(formData.date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (execDate > today) {
      setModalError('Ngày thực hiện không được ở tương lai.');
      setSubmitting(false);
      return;
    }

    if (formData.nextDue) {
      const dueDate = new Date(formData.nextDue);
      if (dueDate <= execDate) {
        setModalError('Ngày hẹn lần sau phải sau ngày thực hiện.');
        setSubmitting(false);
        return;
      }
    }

    try {
      const payload = {
        kind: formData.kind,
        date: formData.date,
        product: formData.product.trim(),
        batchNumber: formData.batchNumber.trim(),
        dose: formData.dose.trim(),
        note: formData.note.trim(),
        nextDue: formData.nextDue || null,
      };

      await veterinarianApi.createCareEvent(horse._id, payload);
      setShowCreateModal(false);
      fetchEvents();
      if (onUpdated) onUpdated(); // Refreshes horse careSchedule since nextDue moves it!
    } catch (err) {
      setModalError(err?.message || 'Không thể ghi nhận chăm sóc.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId, createdAt, performedById) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    if (diff > DELETE_WINDOW_MS) {
      alert('Chỉ có thể xóa mục này trong vòng 24 giờ sau khi ghi nhận.');
      return;
    }
    if (performedById && user?._id && String(performedById) !== String(user._id)) {
      alert('Chỉ chính người đã ghi nhận mới có quyền xóa mục này.');
      return;
    }

    if (!window.confirm('Bạn có chắc chắn muốn xóa lượt ghi nhận chăm sóc này?')) {
      return;
    }

    setDeletingId(eventId);
    try {
      await veterinarianApi.deleteCareEvent(horse._id, eventId);
      fetchEvents();
      if (onUpdated) onUpdated();
    } catch (err) {
      alert(err?.message || 'Không thể xóa lượt ghi nhận.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-clock-history text-primary me-2"></i>
            Lịch Sử Chăm Sóc Thực Tế (Tiêm phòng / Tẩy giun / Đóng móng)
          </h6>
          <small className="text-muted">
            Nhật ký các lần tiêm vắc-xin, tẩy giun và gọt/đóng móng sắt thực tế cho chiến mã
          </small>
        </div>

        <div className="d-flex gap-2 align-items-center">
          <ButtonGroup size="sm">
            <Button
              variant={filterKind === 'all' ? 'primary' : 'outline-secondary'}
              onClick={() => setFilterKind('all')}
            >
              Tất cả
            </Button>
            <Button
              variant={filterKind === 'vaccination' ? 'primary' : 'outline-secondary'}
              onClick={() => setFilterKind('vaccination')}
            >
              Tiêm phòng
            </Button>
            <Button
              variant={filterKind === 'deworming' ? 'primary' : 'outline-secondary'}
              onClick={() => setFilterKind('deworming')}
            >
              Tẩy giun
            </Button>
            <Button
              variant={filterKind === 'farrier' ? 'primary' : 'outline-secondary'}
              onClick={() => setFilterKind('farrier')}
            >
              Đóng móng
            </Button>
          </ButtonGroup>

          <Button
            variant="success"
            size="sm"
            onClick={() => handleOpenCreateModal(filterKind !== 'all' ? filterKind : 'vaccination')}
          >
            <i className="bi bi-plus-circle me-1"></i> Ghi nhận chăm sóc
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-4 text-muted">
          <Spinner animation="border" size="sm" className="me-2" />
          Đang tải lịch sử chăm sóc...
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-4 bg-light rounded text-muted">
          <i className="bi bi-clipboard2-check fs-3 d-block mb-2 text-secondary"></i>
          Chưa có lượt ghi nhận chăm sóc nào cho chiến mã này.
        </div>
      ) : (
        <div className="table-responsive">
          <Table hover bordered className="align-middle bg-white mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: '120px' }}>Ngày làm</th>
                <th style={{ width: '140px' }}>Phân loại</th>
                <th>Sản phẩm / Vật tư</th>
                <th style={{ width: '130px' }}>Lô & Liều</th>
                <th style={{ width: '140px' }}>Hẹn lần sau</th>
                <th>Người thực hiện</th>
                <th>Ghi chú</th>
                <th style={{ width: '70px' }} className="text-center">Xóa</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const meta = CARE_EVENT_META[ev.kind] || { label: ev.kind, icon: 'bi-check', bg: 'secondary' };
                const isWithin24h = Date.now() - new Date(ev.createdAt).getTime() <= DELETE_WINDOW_MS;
                const isAuthor = !user?._id || !ev.performedBy?._id || String(ev.performedBy._id) === String(user._id);
                const canDelete = isWithin24h && isAuthor;

                return (
                  <tr key={ev._id}>
                    <td className="fw-semibold text-primary">{formatDate(ev.date)}</td>
                    <td>
                      <Badge bg={meta.bg} className="d-inline-flex align-items-center gap-1">
                        <i className={`bi ${meta.icon}`}></i>
                        {meta.label}
                      </Badge>
                    </td>
                    <td>
                      <div className="fw-semibold text-dark">{ev.product || '—'}</div>
                    </td>
                    <td className="small">
                      {ev.batchNumber && <div>Lô: <span className="font-monospace text-secondary">{ev.batchNumber}</span></div>}
                      {ev.dose && <div>Liều: <span className="fw-semibold">{ev.dose}</span></div>}
                      {!ev.batchNumber && !ev.dose && <span className="text-muted">—</span>}
                    </td>
                    <td className="small">
                      {ev.nextDue ? (
                        <div className="text-success fw-semibold">
                          <i className="bi bi-calendar-check me-1"></i>
                          {formatDate(ev.nextDue)}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="small">
                      <i className="bi bi-person-check me-1 text-muted"></i>
                      {ev.performedBy?.name || 'Bác sĩ thú y'}
                    </td>
                    <td className="small text-muted">{ev.note || '—'}</td>
                    <td className="text-center">
                      <Button
                        variant="outline-danger"
                        size="sm"
                        disabled={!canDelete || deletingId === ev._id}
                        onClick={() => handleDeleteEvent(ev._id, ev.createdAt, ev.performedBy?._id)}
                        title={
                          !isWithin24h
                            ? 'Đã quá 24 giờ kể từ khi ghi nhận, không thể xóa'
                            : !isAuthor
                            ? 'Chỉ người ghi nhận mới có quyền xóa'
                            : 'Xóa lượt ghi này (trong vòng 24h)'
                        }
                      >
                        {deletingId === ev._id ? (
                          <Spinner animation="border" size="sm" />
                        ) : (
                          <i className="bi bi-trash"></i>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/* Modal Record Care Event */}
      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)} backdrop="static" centered>
        <Form onSubmit={handleCreateEvent}>
          <Modal.Header closeButton>
            <Modal.Title className="fs-6 fw-bold">
              <i className="bi bi-file-earmark-medical me-2 text-success"></i>
              Ghi Nhận Chăm Sóc Y Tế Cho {horse?.name}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {modalError && <Alert variant="danger" className="py-2 small">{modalError}</Alert>}

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Loại chăm sóc <span className="text-danger">*</span></Form.Label>
              <Form.Select
                value={formData.kind}
                onChange={(e) => setFormData({ ...formData, kind: e.target.value })}
                required
              >
                <option value="vaccination">💉 Tiêm phòng (Vaccination)</option>
                <option value="deworming">💊 Tẩy giun định kỳ (Deworming)</option>
                <option value="farrier">🔨 Đóng móng / Gọt móng (Farrier)</option>
              </Form.Select>
            </Form.Group>

            <Row className="g-2 mb-3">
              <Col xs={12} sm={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Ngày thực hiện <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="date"
                    max={formatDateForInput(new Date())}
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                  <Form.Text className="text-muted" style={{ fontSize: '11px' }}>
                    Không được ở tương lai.
                  </Form.Text>
                </Form.Group>
              </Col>

              <Col xs={12} sm={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    {formData.kind === 'vaccination'
                      ? 'Tên vắc-xin *'
                      : formData.kind === 'deworming'
                      ? 'Tên thuốc tẩy giun *'
                      : 'Vật tư / Loại móng'}
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder={
                      formData.kind === 'vaccination'
                        ? 'VD: Equilis Prequenza Te'
                        : formData.kind === 'deworming'
                        ? 'VD: Ivermectin Paste 1.87%'
                        : 'VD: Móng nhôm thi đấu'
                    }
                    value={formData.product}
                    onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                    required={formData.kind === 'vaccination' || formData.kind === 'deworming'}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row className="g-2 mb-3">
              <Col xs={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Số lô sản xuất (Batch)</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="VD: LOT-2026-X1"
                    value={formData.batchNumber}
                    onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Liều lượng</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="VD: 1.5 ml / 1 tuýp"
                    value={formData.dose}
                    onChange={(e) => setFormData({ ...formData, dose: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <Form.Label className="fw-semibold mb-0">Hẹn lần chăm sóc tiếp theo (nextDue)</Form.Label>
                <div className="d-flex gap-1">
                  <Button variant="outline-primary" size="sm" className="py-0 px-1 text-xs" style={{ fontSize: '11px' }} onClick={() => handleSetQuickNextDue(1)}>+1T</Button>
                  <Button variant="outline-primary" size="sm" className="py-0 px-1 text-xs" style={{ fontSize: '11px' }} onClick={() => handleSetQuickNextDue(3)}>+3T</Button>
                  <Button variant="outline-primary" size="sm" className="py-0 px-1 text-xs" style={{ fontSize: '11px' }} onClick={() => handleSetQuickNextDue(6)}>+6T</Button>
                  <Button variant="outline-primary" size="sm" className="py-0 px-1 text-xs" style={{ fontSize: '11px' }} onClick={() => handleSetQuickNextDue(12)}>+1N</Button>
                </div>
              </div>
              <Form.Control
                type="date"
                value={formData.nextDue}
                onChange={(e) => setFormData({ ...formData, nextDue: e.target.value })}
              />
              <Form.Text className="text-muted" style={{ fontSize: '11px' }}>
                Hệ thống sẽ tự động dời lịch nhắc định kỳ và thông báo cho bạn khi đến hạn.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Ghi chú lâm sàng / dặn dò</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                placeholder="Ghi chú thêm về phản ứng sau tiêm, tình trạng móng..."
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)} disabled={submitting}>
              Hủy
            </Button>
            <Button variant="success" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-1" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <i className="bi bi-check2-circle me-1"></i> Lưu ghi nhận
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
