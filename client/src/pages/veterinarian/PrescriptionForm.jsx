import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Table, Badge, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import EmptyState from '../../components/common/EmptyState';
import { formatDate, formatDateForInput } from '../../utils/formatDate';

const createEmptyMedication = () => ({
  name: '',
  dosage: '',
  timeSlots: {
    morning: true,
    noon: false,
    afternoon: true,
    evening: false,
  },
  specificTimes: '08:00, 16:00',
  startDate: formatDateForInput(new Date()),
  endDate: '',
  instructions: '',
});

export default function PrescriptionForm() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [horses, setHorses] = useState([]);
  const [treatments, setTreatments] = useState([]);

  // Form states
  const [selectedHorse, setSelectedHorse] = useState('');
  const [careInstructions, setCareInstructions] = useState('');
  const [medications, setMedications] = useState([createEmptyMedication()]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [horsesRes, treatmentsRes] = await Promise.all([
        veterinarianApi.getHorses(),
        veterinarianApi.getTreatments(),
      ]);
      setHorses(horsesRes.data || []);
      setTreatments(treatmentsRes.data || []);
    } catch (err) {
      setError(err?.message || 'Không thể tải dữ liệu đơn thuốc.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddMedication = () => {
    setMedications((prev) => [...prev, createEmptyMedication()]);
  };

  const handleRemoveMedication = (index) => {
    setMedications((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMedChange = (index, field, value) => {
    setMedications((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleTimeSlotToggle = (index, slot) => {
    setMedications((prev) => {
      const updated = [...prev];
      const currentSlots = { ...updated[index].timeSlots };
      currentSlots[slot] = !currentSlots[slot];
      updated[index] = { ...updated[index], timeSlots: currentSlots };
      return updated;
    });
  };

  const handleCreatePrescription = async (e) => {
    e.preventDefault();
    if (!selectedHorse) {
      setError('Vui lòng chọn chiến mã.');
      return;
    }

    const validMeds = medications.filter((m) => m.name.trim() && m.dosage.trim());
    if (validMeds.length === 0) {
      setError('Vui lòng nhập tên thuốc và liều lượng cho ít nhất 1 loại thuốc.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const medicationsPayload = validMeds.map((m) => {
        const slots = [];
        if (m.timeSlots.morning) slots.push('morning');
        if (m.timeSlots.noon) slots.push('noon');
        if (m.timeSlots.afternoon) slots.push('afternoon');
        if (m.timeSlots.evening) slots.push('evening');

        const slotLabels = [];
        if (m.timeSlots.morning) slotLabels.push('Sáng');
        if (m.timeSlots.noon) slotLabels.push('Trưa');
        if (m.timeSlots.afternoon) slotLabels.push('Chiều');
        if (m.timeSlots.evening) slotLabels.push('Tối');

        const freqParts = [];
        if (slotLabels.length) freqParts.push(`Buổi: ${slotLabels.join(', ')}`);
        if (m.specificTimes?.trim()) freqParts.push(`Giờ: ${m.specificTimes.trim()}`);

        return {
          name: m.name.trim(),
          dosage: m.dosage.trim(),
          timeSlots: slots,
          specificTimes: m.specificTimes?.trim() || '',
          frequency: freqParts.join(' - ') || 'Theo chỉ dẫn',
          startDate: m.startDate ? new Date(m.startDate) : new Date(),
          endDate: m.endDate ? new Date(m.endDate) : undefined,
          instructions: m.instructions?.trim() || '',
        };
      });

      // Calculate max endDate across all medications
      let maxEndDate = null;
      medicationsPayload.forEach((m) => {
        if (m.endDate) {
          if (!maxEndDate || m.endDate > maxEndDate) {
            maxEndDate = m.endDate;
          }
        }
      });

      const existingOngoing = treatments.find(
        (t) => (t.horse?._id || t.horse) === selectedHorse && t.status === 'ongoing'
      );

      if (existingOngoing) {
        const updatedMeds = [...(existingOngoing.medications || []), ...medicationsPayload];
        const newCareInstructions = [existingOngoing.careInstructions, careInstructions.trim()]
          .filter(Boolean)
          .join('\n');

        const existingEndDate = existingOngoing.endDate ? new Date(existingOngoing.endDate) : null;
        const finalEndDate = maxEndDate || existingEndDate;

        await veterinarianApi.updateTreatment(existingOngoing._id, {
          medications: updatedMeds,
          careInstructions: newCareInstructions || undefined,
          endDate: finalEndDate || undefined,
        });
      } else {
        const firstMedName = medicationsPayload[0]?.name || 'Thuốc';
        const rec = await veterinarianApi.createHealthRecord({
          horse: selectedHorse,
          diagnosis: `Kê đơn thuốc (${medicationsPayload.length} loại): ${firstMedName}`,
          resultStatus: 'monitoring',
        });

        await veterinarianApi.createTreatment({
          horse: selectedHorse,
          healthRecord: rec.data?._id,
          startDate: medicationsPayload[0]?.startDate || new Date(),
          endDate: maxEndDate || undefined,
          status: 'ongoing',
          medications: medicationsPayload,
          careInstructions: careInstructions.trim() || undefined,
        });
      }

      setSuccess(true);
      setSelectedHorse('');
      setCareInstructions('');
      setMedications([createEmptyMedication()]);
      fetchData();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err?.message || 'Lỗi khi lưu đơn thuốc.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Đang tải danh mục thuốc & đơn thuốc..." minHeight="400px" />;
  }

  // Flatten active prescriptions list for right panel table
  const activePrescriptions = [];
  treatments.forEach((t) => {
    const horse = t.horse;
    (t.medications || []).forEach((m, idx) => {
      activePrescriptions.push({
        id: `${t._id}-${idx}`,
        treatmentId: t._id,
        horseName: horse?.name || 'Ngựa',
        horseId: horse?._id || horse,
        medicine: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        timeSlots: m.timeSlots || [],
        specificTimes: m.specificTimes || '',
        instructions: m.instructions || '',
        startDate: m.startDate || t.startDate,
        endDate: m.endDate || t.endDate,
        status: t.status,
      });
    });
  });

  return (
    <Container fluid className="p-0">
      <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
        <div>
          <h2 className="fw-bold text-dark mb-1">
            <i className="bi bi-prescription2 me-2 text-primary"></i>
            Quản Lý Kê Đơn Thuốc & Dược Phẩm Thú Y
          </h2>
          <p className="text-muted mb-0 small">
            Kê đơn dược phẩm điều trị đa chủng loại, thiết lập lịch uống thuốc sáng/chiều và chỉ định chi tiết cho chiến mã.
          </p>
        </div>

        <Button variant="outline-primary" size="sm" onClick={fetchData}>
          <i className="bi bi-arrow-clockwise me-1"></i> Làm mới
        </Button>
      </div>

      {error && <ErrorAlert message={error} onRetry={() => setError(null)} />}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess(false)}>
          <i className="bi bi-check-circle-fill me-2"></i> Kê đơn thuốc thành công cho chiến mã! Lịch uống thuốc đã được tự động đồng bộ sang lịch chăm sóc hàng ngày của Groom.
        </Alert>
      )}

      <Row className="g-4">
        {/* Left Col: Prescription Form */}
        <Col xs={12} lg={6}>
          <Card className="border-0 shadow-sm bg-white h-100">
            <Card.Header className="bg-white py-3 border-0 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-plus-circle-fill me-2 text-primary"></i>
                Kê Đơn Thuốc Mới
              </h5>
              <Badge bg="primary-subtle" text="primary" className="fw-normal px-2 py-1">
                Kê được nhiều loại thuốc
              </Badge>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleCreatePrescription}>
                {/* Horse Selection */}
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">
                    Chiến mã <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={selectedHorse}
                    onChange={(e) => setSelectedHorse(e.target.value)}
                    required
                    disabled={submitting}
                  >
                    <option value="">-- Chọn chiến mã kê đơn --</option>
                    {horses.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name} (#{h._id.slice(-6).toUpperCase()})
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>

                {/* Care Instructions / General Note */}
                <Form.Group className="mb-4">
                  <Form.Label className="fw-semibold">Ghi chú & Chỉ dẫn chăm sóc chung cho Groom</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    placeholder="Ví dụ: Theo dõi nhiệt độ sau khi cho uống thuốc, nghỉ ngơi nhẹ tại chuồng..."
                    value={careInstructions}
                    onChange={(e) => setCareInstructions(e.target.value)}
                    disabled={submitting}
                  />
                </Form.Group>

                {/* Medications List */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="fw-bold text-dark mb-0">
                    <i className="bi bi-capsule me-1 text-primary"></i>
                    Danh Sách Thuốc Kê Đơn ({medications.length})
                  </h6>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleAddMedication}
                    disabled={submitting}
                  >
                    <i className="bi bi-plus-circle me-1"></i> Thêm loại thuốc
                  </Button>
                </div>

                {medications.map((med, index) => (
                  <Card key={index} className="mb-3 border bg-light-subtle">
                    <Card.Body className="p-3">
                      <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                        <span className="badge bg-primary">Thuốc #{index + 1}</span>
                        {medications.length > 1 && (
                          <Button
                            variant="link"
                            className="text-danger p-0 border-0 text-decoration-none"
                            size="sm"
                            onClick={() => handleRemoveMedication(index)}
                            disabled={submitting}
                          >
                            <i className="bi bi-trash me-1"></i> Xóa thuốc này
                          </Button>
                        )}
                      </div>

                      {/* Medicine Name & Dosage */}
                      <Row className="g-2 mb-2">
                        <Col xs={12} md={7}>
                          <Form.Group>
                            <Form.Label className="small fw-semibold mb-1">
                              Tên thuốc / Dược phẩm <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              size="sm"
                              placeholder="Ví dụ: Phenylbutazone 20%, Banamine..."
                              value={med.name}
                              onChange={(e) => handleMedChange(index, 'name', e.target.value)}
                              required
                              disabled={submitting}
                            />
                          </Form.Group>
                        </Col>
                        <Col xs={12} md={5}>
                          <Form.Group>
                            <Form.Label className="small fw-semibold mb-1">
                              Liều lượng <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              size="sm"
                              placeholder="Ví dụ: 10ml, 2g, 1 viên..."
                              value={med.dosage}
                              onChange={(e) => handleMedChange(index, 'dosage', e.target.value)}
                              required
                              disabled={submitting}
                            />
                          </Form.Group>
                        </Col>
                      </Row>

                      {/* Time Slots: Morning, Noon, Afternoon, Evening */}
                      <Form.Group className="mb-2">
                        <Form.Label className="small fw-semibold mb-1 d-block">
                          Lịch uống thuốc trong ngày (Sáng / Chiều):
                        </Form.Label>
                        <div className="d-flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={med.timeSlots.morning ? 'warning' : 'outline-secondary'}
                            className={med.timeSlots.morning ? 'fw-bold' : ''}
                            onClick={() => handleTimeSlotToggle(index, 'morning')}
                            type="button"
                            disabled={submitting}
                          >
                            🌅 Sáng (08:00)
                          </Button>
                          <Button
                            size="sm"
                            variant={med.timeSlots.noon ? 'info' : 'outline-secondary'}
                            className={med.timeSlots.noon ? 'fw-bold text-white' : ''}
                            onClick={() => handleTimeSlotToggle(index, 'noon')}
                            type="button"
                            disabled={submitting}
                          >
                            ☀️ Trưa (12:00)
                          </Button>
                          <Button
                            size="sm"
                            variant={med.timeSlots.afternoon ? 'primary' : 'outline-secondary'}
                            className={med.timeSlots.afternoon ? 'fw-bold' : ''}
                            onClick={() => handleTimeSlotToggle(index, 'afternoon')}
                            type="button"
                            disabled={submitting}
                          >
                            🌇 Chiều (16:00)
                          </Button>
                          <Button
                            size="sm"
                            variant={med.timeSlots.evening ? 'dark' : 'outline-secondary'}
                            className={med.timeSlots.evening ? 'fw-bold' : ''}
                            onClick={() => handleTimeSlotToggle(index, 'evening')}
                            type="button"
                            disabled={submitting}
                          >
                            🌙 Tối (20:00)
                          </Button>
                        </div>
                      </Form.Group>

                      {/* Specific Time & Dates */}
                      <Row className="g-2 mb-2">
                        <Col xs={12} md={6}>
                          <Form.Group>
                            <Form.Label className="small fw-semibold mb-1">Khung giờ uống cụ thể</Form.Label>
                            <Form.Control
                              type="text"
                              size="sm"
                              placeholder="Ví dụ: 08:00, 16:00"
                              value={med.specificTimes}
                              onChange={(e) => handleMedChange(index, 'specificTimes', e.target.value)}
                              disabled={submitting}
                            />
                          </Form.Group>
                        </Col>
                        <Col xs={6} md={3}>
                          <Form.Group>
                            <Form.Label className="small fw-semibold mb-1">Từ ngày</Form.Label>
                            <Form.Control
                              type="date"
                              size="sm"
                              value={med.startDate}
                              onChange={(e) => handleMedChange(index, 'startDate', e.target.value)}
                              disabled={submitting}
                            />
                          </Form.Group>
                        </Col>
                        <Col xs={6} md={3}>
                          <Form.Group>
                            <Form.Label className="small fw-semibold mb-1">Đến ngày</Form.Label>
                            <Form.Control
                              type="date"
                              size="sm"
                              value={med.endDate}
                              onChange={(e) => handleMedChange(index, 'endDate', e.target.value)}
                              disabled={submitting}
                            />
                          </Form.Group>
                        </Col>
                      </Row>

                      {/* Individual Instructions */}
                      <Form.Group>
                        <Form.Label className="small fw-semibold mb-1">Hướng dẫn dùng thuốc riêng loại này</Form.Label>
                        <Form.Control
                          type="text"
                          size="sm"
                          placeholder="Ví dụ: Trộn vào khẩu phần ăn, uống sau khi tập..."
                          value={med.instructions}
                          onChange={(e) => handleMedChange(index, 'instructions', e.target.value)}
                          disabled={submitting}
                        />
                      </Form.Group>
                    </Card.Body>
                  </Card>
                ))}

                <Button variant="primary" type="submit" className="w-100 mt-2 py-2 fw-semibold" disabled={submitting}>
                  {submitting ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <>
                      <i className="bi bi-capsule me-1"></i> Xác Nhận Kê Đơn ({medications.length} Loại Thuốc)
                    </>
                  )}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        {/* Right Col: Active Prescriptions List (Table View) */}
        <Col xs={12} lg={6}>
          <Card className="border-0 shadow-sm bg-white h-100">
            <Card.Header className="bg-white py-3 border-0 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-list-check me-2 text-success"></i>
                Danh Sách Thuốc Đang Cấp Phát ({activePrescriptions.length})
              </h5>
            </Card.Header>
            <Card.Body className="p-0">
              {activePrescriptions.length === 0 ? (
                <EmptyState
                  icon="bi-capsule"
                  title="Chưa có đơn thuốc nào"
                  message="Hiện không có chiến mã nào đang được cấp phát đơn thuốc điều trị."
                />
              ) : (
                <div className="table-responsive">
                  <Table hover className="align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Chiến mã</th>
                        <th>Thuốc & Liều lượng</th>
                        <th>Lịch uống (Sáng/Chiều)</th>
                        <th>Thời gian dùng thuốc</th>
                        <th>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePrescriptions.map((p) => (
                        <tr key={p.id}>
                          <td className="fw-bold">
                            <span
                              className="text-primary cursor-pointer"
                              style={{ cursor: 'pointer' }}
                              onClick={() => navigate(`/veterinarian/horses/${p.horseId}`)}
                            >
                              {p.horseName}
                            </span>
                          </td>
                          <td>
                            <div className="fw-semibold text-dark">💊 {p.medicine}</div>
                            <div className="small text-muted">Liều: <strong>{p.dosage}</strong></div>
                            {p.instructions && (
                              <div className="small text-secondary fst-italic">📝 {p.instructions}</div>
                            )}
                          </td>
                          <td>
                            <div className="mb-1">
                              {p.timeSlots?.includes('morning') && (
                                <Badge bg="warning" text="dark" className="me-1">🌅 Sáng</Badge>
                              )}
                              {p.timeSlots?.includes('noon') && (
                                <Badge bg="info" className="me-1">☀️ Trưa</Badge>
                              )}
                              {p.timeSlots?.includes('afternoon') && (
                                <Badge bg="primary" className="me-1">🌇 Chiều</Badge>
                              )}
                              {p.timeSlots?.includes('evening') && (
                                <Badge bg="dark" className="me-1">🌙 Tối</Badge>
                              )}
                              {(!p.timeSlots || p.timeSlots.length === 0) && (
                                <span className="small text-muted">{p.frequency || 'Theo chỉ dẫn'}</span>
                              )}
                            </div>
                            {p.specificTimes && (
                              <div className="small text-muted">⏰ {p.specificTimes}</div>
                            )}
                          </td>
                          <td>
                            <div className="small fw-semibold text-dark">
                              📅 Từ: {formatDate(p.startDate)}
                            </div>
                            {p.endDate ? (
                              <div className="small text-danger fw-semibold">
                                🏁 Đến: {formatDate(p.endDate)}
                              </div>
                            ) : (
                              <div className="small text-muted fst-italic">
                                (Dùng liên tục)
                              </div>
                            )}
                          </td>
                          <td>
                            <Badge bg={p.status === 'ongoing' ? 'primary' : 'success'} pill>
                              {p.status === 'ongoing' ? 'Đang dùng' : 'Đã dừng'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
