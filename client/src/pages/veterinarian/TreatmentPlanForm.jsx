import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import { formatDateForInput } from '../../utils/formatDate';

export default function TreatmentPlanForm() {
  const [searchParams] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();

  const preselectedHorseId = searchParams.get('horseId');
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [horses, setHorses] = useState([]);
  const [healthRecords, setHealthRecords] = useState([]);

  const [formData, setFormData] = useState({
    horse: preselectedHorseId || '',
    healthRecord: '',
    startDate: formatDateForInput(new Date()),
    endDate: '',
    status: 'ongoing',
    isTrainingLocked: false,
    lockReason: '',
    medications: [
      {
        name: '',
        dosage: '',
        frequency: '',
        timeSlots: { morning: true, noon: false, afternoon: true, evening: false },
        specificTimes: '08:00, 16:00',
        instructions: '',
      },
    ],
  });

  const [validated, setValidated] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [horsesRes, recordsRes] = await Promise.all([
          veterinarianApi.getHorses(),
          veterinarianApi.getHealthRecords(preselectedHorseId ? { horse: preselectedHorseId } : {}),
        ]);

        setHorses(horsesRes.data || []);
        setHealthRecords(recordsRes.data || []);

        if (isEditMode) {
          const trRes = await veterinarianApi.getTreatmentById(id);
          const tr = trRes.data;
          setFormData({
            horse: tr.horse?._id || tr.horse || '',
            healthRecord: tr.healthRecord?._id || tr.healthRecord || '',
            startDate: formatDateForInput(tr.startDate || tr.createdAt),
            endDate: formatDateForInput(tr.endDate),
            status: tr.status || 'ongoing',
            isTrainingLocked: tr.isTrainingLocked || false,
            lockReason: tr.lockReason || '',
            medications: tr.medications?.length
              ? tr.medications.map((m) => ({
                  name: m.name,
                  dosage: m.dosage,
                  frequency: m.frequency || '',
                  timeSlots: {
                    morning: (m.timeSlots || []).includes('morning'),
                    noon: (m.timeSlots || []).includes('noon'),
                    afternoon: (m.timeSlots || []).includes('afternoon'),
                    evening: (m.timeSlots || []).includes('evening'),
                  },
                  specificTimes: m.specificTimes || '',
                  instructions: m.instructions || '',
                }))
              : [
                  {
                    name: '',
                    dosage: '',
                    frequency: '',
                    timeSlots: { morning: true, noon: false, afternoon: true, evening: false },
                    specificTimes: '08:00, 16:00',
                    instructions: '',
                  },
                ],
          });
        } else if (recordsRes.data?.length > 0 && !formData.healthRecord) {
          setFormData((prev) => ({ ...prev, healthRecord: recordsRes.data[0]._id }));
        }
      } catch (err) {
        setError(err?.message || 'Không thể tải dữ liệu phác đồ điều trị.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, isEditMode, preselectedHorseId]);

  // Medication item handling
  const handleAddMedication = () => {
    setFormData((prev) => ({
      ...prev,
      medications: [
        ...prev.medications,
        {
          name: '',
          dosage: '',
          frequency: '',
          timeSlots: { morning: true, noon: false, afternoon: true, evening: false },
          specificTimes: '08:00, 16:00',
          instructions: '',
        },
      ],
    }));
  };

  const handleRemoveMedication = (index) => {
    setFormData((prev) => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
  };

  const handleMedChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.medications];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, medications: updated };
    });
  };

  const handleTimeSlotToggle = (index, slot) => {
    setFormData((prev) => {
      const updated = [...prev.medications];
      const currentSlots = { ...(updated[index].timeSlots || {}) };
      currentSlots[slot] = !currentSlots[slot];
      updated[index] = { ...updated[index], timeSlots: currentSlots };
      return { ...prev, medications: updated };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;

    if (form.checkValidity() === false) {
      e.stopPropagation();
      setValidated(true);
      return;
    }

    if (!formData.horse) {
      setError('Vui lòng chọn chiến mã.');
      return;
    }

    setSubmitting(true);
    setError(null);

    // Filter valid medications
    const validMedications = formData.medications
      .filter((m) => m.name.trim() && m.dosage.trim())
      .map((m) => {
        const slots = [];
        if (m.timeSlots?.morning) slots.push('morning');
        if (m.timeSlots?.noon) slots.push('noon');
        if (m.timeSlots?.afternoon) slots.push('afternoon');
        if (m.timeSlots?.evening) slots.push('evening');

        const slotLabels = [];
        if (m.timeSlots?.morning) slotLabels.push('Sáng');
        if (m.timeSlots?.noon) slotLabels.push('Trưa');
        if (m.timeSlots?.afternoon) slotLabels.push('Chiều');
        if (m.timeSlots?.evening) slotLabels.push('Tối');

        const freqParts = [];
        if (slotLabels.length) freqParts.push(`Buổi: ${slotLabels.join(', ')}`);
        if (m.specificTimes?.trim()) freqParts.push(`Giờ: ${m.specificTimes.trim()}`);
        if (!freqParts.length && m.frequency) freqParts.push(m.frequency);

        return {
          name: m.name.trim(),
          dosage: m.dosage.trim(),
          timeSlots: slots,
          specificTimes: m.specificTimes?.trim() || '',
          frequency: freqParts.join(' - ') || 'Theo chỉ dẫn',
          instructions: m.instructions?.trim() || '',
        };
      });

    const payload = {
      horse: formData.horse,
      healthRecord: formData.healthRecord || undefined,
      startDate: formData.startDate ? new Date(formData.startDate) : new Date(),
      endDate: formData.endDate ? new Date(formData.endDate) : undefined,
      status: formData.status,
      isTrainingLocked: formData.isTrainingLocked,
      lockReason: formData.isTrainingLocked ? formData.lockReason.trim() : undefined,
      medications: validMedications,
    };

    try {
      if (isEditMode) {
        await veterinarianApi.updateTreatment(id, payload);
      } else {
        // If no health record selected, find or create one
        if (!payload.healthRecord) {
          const rec = await veterinarianApi.createHealthRecord({
            horse: formData.horse,
            diagnosis: 'Phác đồ điều trị chuyên khoa',
            resultStatus: formData.isTrainingLocked ? 'injured' : 'monitoring',
          });
          payload.healthRecord = rec.data?._id;
        }
        await veterinarianApi.createTreatment(payload);
      }

      setSuccess(true);
      setTimeout(() => {
        navigate(`/veterinarian/horses/${formData.horse}`);
      }, 1000);
    } catch (err) {
      setError(err?.message || 'Lỗi khi lưu phác đồ điều trị.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Đang tải dữ liệu phác đồ điều trị..." minHeight="400px" />;
  }

  return (
    <Container fluid className="p-0" style={{ maxWidth: '950px' }}>
      <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
        <div>
          <h3 className="fw-bold text-dark mb-1">
            <i className="bi bi-capsule me-2 text-primary"></i>
            {isEditMode ? 'Chỉnh Sửa Phác Đồ Điều Trị' : 'Thiết Lập Phác Đồ Điều Trị & Đơn Thuốc'}
          </h3>
          <p className="text-muted mb-0 small">
            Lập kế hoạch điều trị y khoa, kê đơn thuốc và quản lý lệnh khóa huấn luyện cho chiến mã.
          </p>
        </div>

        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() => navigate(formData.horse ? `/veterinarian/horses/${formData.horse}` : '/veterinarian/horses')}
        >
          <i className="bi bi-x-circle me-1"></i> Hủy
        </Button>
      </div>

      {error && <ErrorAlert message={error} onRetry={() => setError(null)} />}
      {success && (
        <Alert variant="success">
          <i className="bi bi-check-circle-fill me-2"></i> Lưu phác đồ điều trị thành công! Đang chuyển hướng...
        </Alert>
      )}

      <Card className="border-0 shadow-sm bg-white">
        <Card.Body className="p-4">
          <Form noValidate validated={validated} onSubmit={handleSubmit}>
            <Row className="g-3 mb-4">
              <Col xs={12} md={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Chiến mã <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={formData.horse}
                    onChange={(e) => setFormData({ ...formData, horse: e.target.value })}
                    required
                    disabled={isEditMode || submitting}
                  >
                    <option value="">-- Chọn chiến mã điều trị --</option>
                    {horses.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name} (#{h._id.slice(-6).toUpperCase()})
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col xs={12} md={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Liên kết Hồ sơ Khám bệnh</Form.Label>
                  <Form.Select
                    value={formData.healthRecord}
                    onChange={(e) => setFormData({ ...formData, healthRecord: e.target.value })}
                    disabled={submitting}
                  >
                    <option value="">-- Tự động liên kết / Tạo mới theo lượt khám --</option>
                    {healthRecords
                      .filter((r) => !formData.horse || (r.horse?._id || r.horse) === formData.horse)
                      .map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.diagnosis} ({r.date ? new Date(r.date).toLocaleDateString('vi-VN') : 'Gần đây'})
                        </option>
                      ))}
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col xs={12} md={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Ngày bắt đầu</Form.Label>
                  <Form.Control
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    disabled={submitting}
                  />
                </Form.Group>
              </Col>

              <Col xs={12} md={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Dự kiến kết thúc</Form.Label>
                  <Form.Control
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    disabled={submitting}
                  />
                </Form.Group>
              </Col>

              <Col xs={12} md={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Trạng thái phác đồ</Form.Label>
                  <Form.Select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    disabled={submitting}
                  >
                    <option value="ongoing">Đang điều trị (Ongoing)</option>
                    <option value="completed">Đã hoàn thành (Completed)</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {/* Emergency Training Lock Section */}
            <Card className={`mb-4 border-2 ${formData.isTrainingLocked ? 'border-danger bg-danger-subtle' : 'border-light bg-light'}`}>
              <Card.Body>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="d-flex align-items-center">
                    <i className={`bi ${formData.isTrainingLocked ? 'bi-lock-fill text-danger' : 'bi-unlock text-success'} fs-4 me-2`}></i>
                    <div>
                      <h6 className="fw-bold mb-0">Y lệnh Khóa Huấn Luyện Khẩn Cấp (Emergency Training Lock)</h6>
                      <small className="text-muted">Chặn lên lịch tập nặng trong thời gian chiến mã đang điều trị</small>
                    </div>
                  </div>

                  <Form.Check
                    type="switch"
                    id="lock-switch"
                    checked={formData.isTrainingLocked}
                    onChange={(e) => setFormData({ ...formData, isTrainingLocked: e.target.checked })}
                    disabled={submitting}
                  />
                </div>

                {formData.isTrainingLocked && (
                  <Form.Group className="mt-3">
                    <Form.Label className="fw-semibold text-danger">
                      Lý do y tế yêu cầu khóa huấn luyện <span className="text-danger">*</span>
                    </Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Ví dụ: Kháng viêm khớp gối, bắt buộc nghỉ ngơi tuyệt đối trong 7 ngày"
                      value={formData.lockReason}
                      onChange={(e) => setFormData({ ...formData, lockReason: e.target.value })}
                      required={formData.isTrainingLocked}
                      disabled={submitting}
                    />
                  </Form.Group>
                )}
              </Card.Body>
            </Card>

            {/* Medications & Prescription Section */}
            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="fw-bold text-primary mb-0">
                  <i className="bi bi-prescription2 me-2"></i> Danh Sách Thuốc Kê Đơn (Medications)
                </h5>
                <Button variant="outline-primary" size="sm" onClick={handleAddMedication} disabled={submitting}>
                  <i className="bi bi-plus-circle me-1"></i> Thêm loại thuốc
                </Button>
              </div>

              {formData.medications.map((med, index) => (
                <Card key={index} className="mb-3 border bg-light-subtle">
                  <Card.Body className="p-3">
                    <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                      <span className="badge bg-primary">Thuốc #{index + 1}</span>
                      {formData.medications.length > 1 && (
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

                    <Row className="g-2 mb-2">
                      <Col xs={12} md={7}>
                        <Form.Label className="small fw-semibold mb-1">Tên thuốc / Dược phẩm *</Form.Label>
                        <Form.Control
                          placeholder="Tên thuốc (Ví dụ: Phenylbutazone, Banamine...)"
                          value={med.name}
                          onChange={(e) => handleMedChange(index, 'name', e.target.value)}
                          disabled={submitting}
                        />
                      </Col>
                      <Col xs={12} md={5}>
                        <Form.Label className="small fw-semibold mb-1">Liều lượng *</Form.Label>
                        <Form.Control
                          placeholder="Liều lượng (Ví dụ: 2g, 10ml, 1 viên...)"
                          value={med.dosage}
                          onChange={(e) => handleMedChange(index, 'dosage', e.target.value)}
                          disabled={submitting}
                        />
                      </Col>
                    </Row>

                    {/* Morning / Noon / Afternoon / Evening slots */}
                    <Form.Group className="mb-2">
                      <Form.Label className="small fw-semibold mb-1 d-block">Lịch uống thuốc trong ngày (Sáng / Chiều):</Form.Label>
                      <div className="d-flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          type="button"
                          variant={med.timeSlots?.morning ? 'warning' : 'outline-secondary'}
                          className={med.timeSlots?.morning ? 'fw-bold' : ''}
                          onClick={() => handleTimeSlotToggle(index, 'morning')}
                          disabled={submitting}
                        >
                          🌅 Sáng (08:00)
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant={med.timeSlots?.noon ? 'info' : 'outline-secondary'}
                          className={med.timeSlots?.noon ? 'fw-bold text-white' : ''}
                          onClick={() => handleTimeSlotToggle(index, 'noon')}
                          disabled={submitting}
                        >
                          ☀️ Trưa (12:00)
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant={med.timeSlots?.afternoon ? 'primary' : 'outline-secondary'}
                          className={med.timeSlots?.afternoon ? 'fw-bold' : ''}
                          onClick={() => handleTimeSlotToggle(index, 'afternoon')}
                          disabled={submitting}
                        >
                          🌇 Chiều (16:00)
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant={med.timeSlots?.evening ? 'dark' : 'outline-secondary'}
                          className={med.timeSlots?.evening ? 'fw-bold' : ''}
                          onClick={() => handleTimeSlotToggle(index, 'evening')}
                          disabled={submitting}
                        >
                          🌙 Tối (20:00)
                        </Button>
                      </div>
                    </Form.Group>

                    <Row className="g-2 mb-2">
                      <Col xs={12} md={6}>
                        <Form.Label className="small fw-semibold mb-1">Khung giờ cụ thể</Form.Label>
                        <Form.Control
                          size="sm"
                          placeholder="Ví dụ: 08:00, 16:00"
                          value={med.specificTimes}
                          onChange={(e) => handleMedChange(index, 'specificTimes', e.target.value)}
                          disabled={submitting}
                        />
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Label className="small fw-semibold mb-1">Hướng dẫn dùng riêng loại thuốc này</Form.Label>
                        <Form.Control
                          size="sm"
                          placeholder="Ví dụ: Trộn vào khẩu phần ăn..."
                          value={med.instructions}
                          onChange={(e) => handleMedChange(index, 'instructions', e.target.value)}
                          disabled={submitting}
                        />
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              ))}
            </div>

            <div className="d-flex justify-content-end gap-2 pt-3 border-top">
              <Button
                variant="outline-secondary"
                onClick={() => navigate(formData.horse ? `/veterinarian/horses/${formData.horse}` : '/veterinarian/horses')}
                disabled={submitting}
              >
                Hủy bỏ
              </Button>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle me-1"></i> Lưu phác đồ điều trị
                  </>
                )}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}
