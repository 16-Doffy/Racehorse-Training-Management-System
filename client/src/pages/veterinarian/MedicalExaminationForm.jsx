import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import { formatDateForInput } from '../../utils/formatDate';

export default function MedicalExaminationForm() {
  const { horseId, id } = useParams(); // id is record id if editing
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [horses, setHorses] = useState([]);
  const [formData, setFormData] = useState({
    horse: horseId || '',
    date: formatDateForInput(new Date()),
    temperatureC: '',
    heartRate: '',
    respiratoryRate: '',
    weightKg: '',
    diagnosis: '',
    resultStatus: 'eligible',
    symptoms: '',
    notes: '',
  });

  const [validated, setValidated] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const horsesRes = await veterinarianApi.getHorses();
        setHorses(horsesRes.data || []);

        if (isEditMode) {
          const recRes = await veterinarianApi.getHealthRecordById(id);
          const rec = recRes.data;
          setFormData({
            horse: rec.horse?._id || rec.horse || '',
            date: formatDateForInput(rec.date || rec.createdAt),
            temperatureC: rec.vitalSigns?.temperatureC || '',
            heartRate: rec.vitalSigns?.heartRate || '',
            respiratoryRate: rec.vitalSigns?.respiratoryRate || '',
            weightKg: rec.horse?.weightKg || '',
            diagnosis: rec.diagnosis || '',
            resultStatus: rec.resultStatus || 'eligible',
            symptoms: '',
            notes: rec.notes || '',
          });
        } else if (horseId) {
          const targetHorse = horsesRes.data?.find((h) => h._id === horseId);
          if (targetHorse) {
            setFormData((prev) => ({
              ...prev,
              horse: horseId,
              weightKg: targetHorse.weightKg || '',
              resultStatus: targetHorse.healthStatus || 'eligible',
            }));
          }
        }
      } catch (err) {
        setError(err?.message || 'Không thể tải thông tin hồ sơ khám.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [horseId, id, isEditMode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;

    if (form.checkValidity() === false) {
      e.stopPropagation();
      setValidated(true);
      return;
    }

    if (!formData.horse) {
      setError('Vui lòng chọn chiến mã cần khám bệnh.');
      return;
    }

    if (!formData.diagnosis.trim()) {
      setError('Vui lòng nhập chẩn đoán lâm sàng.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      horse: formData.horse,
      date: formData.date ? new Date(formData.date) : new Date(),
      diagnosis: formData.diagnosis.trim(),
      resultStatus: formData.resultStatus,
      vitalSigns: {
        temperatureC: formData.temperatureC ? Number(formData.temperatureC) : undefined,
        heartRate: formData.heartRate ? Number(formData.heartRate) : undefined,
        respiratoryRate: formData.respiratoryRate ? Number(formData.respiratoryRate) : undefined,
      },
      notes: [formData.symptoms ? `Triệu chứng: ${formData.symptoms}` : '', formData.notes]
        .filter(Boolean)
        .join(' | '),
    };

    try {
      if (isEditMode) {
        await veterinarianApi.updateHealthRecord(id, payload);
        setSuccessMessage('Cập nhật hồ sơ khám bệnh thành công!');
      } else {
        await veterinarianApi.createHealthRecord(payload);
        setSuccessMessage('Lập hồ sơ khám bệnh mới và cập nhật trạng thái sức khỏe thành công!');
      }

      setTimeout(() => {
        navigate(`/veterinarian/horses/${formData.horse}`);
      }, 1200);
    } catch (err) {
      setError(err?.message || 'Lỗi khi lưu hồ sơ khám bệnh.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Đang tải dữ liệu hồ sơ khám bệnh..." minHeight="400px" />;
  }

  const selectedHorseObj = horses.find((h) => h._id === formData.horse);

  return (
    <Container fluid className="p-0" style={{ maxWidth: '900px' }}>
      <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
        <div>
          <h3 className="fw-bold text-dark mb-1">
            <i className="bi bi-clipboard2-pulse me-2 text-primary"></i>
            {isEditMode ? 'Chỉnh Sửa Hồ Sơ Khám Bệnh' : 'Lập Hồ Sơ Khám Bệnh & Chẩn Đoán'}
          </h3>
          <p className="text-muted mb-0 small">
            Ghi nhận các chỉ số sinh tồn, chẩn đoán triệu chứng và cập nhật trạng thái thể lực của chiến mã.
          </p>
        </div>

        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() => navigate(formData.horse ? `/veterinarian/horses/${formData.horse}` : '/veterinarian/horses')}
        >
          <i className="bi bi-x-circle me-1"></i> Hủy / Quay lại
        </Button>
      </div>

      {error && <ErrorAlert message={error} onRetry={() => setError(null)} />}
      {successMessage && <Alert variant="success"><i className="bi bi-check-circle-fill me-2"></i> {successMessage}</Alert>}

      <Card className="border-0 shadow-sm bg-white">
        <Card.Body className="p-4">
          <Form noValidate validated={validated} onSubmit={handleSubmit}>
            {/* Row 1: Horse & Exam Date */}
            <Row className="g-3 mb-3">
              <Col xs={12} md={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Chiến mã <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={formData.horse}
                    onChange={(e) => {
                      const selHorse = horses.find((h) => h._id === e.target.value);
                      setFormData({
                        ...formData,
                        horse: e.target.value,
                        weightKg: selHorse?.weightKg || formData.weightKg,
                      });
                    }}
                    required
                    disabled={isEditMode || submitting}
                  >
                    <option value="">-- Chọn chiến mã khám bệnh --</option>
                    {horses.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name} (#{h._id.slice(-6).toUpperCase()}) - {h.breed || 'Chưa rõ'}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Control.Feedback type="invalid">Vui lòng chọn chiến mã.</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col xs={12} md={3}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Ngày khám <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                    disabled={submitting}
                  />
                </Form.Group>
              </Col>

              <Col xs={12} md={3}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Bác sĩ khám</Form.Label>
                  <Form.Control
                    type="text"
                    value={user?.name || 'Bác sĩ Thú y'}
                    disabled
                    readOnly
                    className="bg-light"
                  />
                </Form.Group>
              </Col>
            </Row>

            <hr className="my-4 text-muted" />

            {/* Row 2: Vital Signs */}
            <h5 className="fw-bold text-primary mb-3">
              <i className="bi bi-activity me-2"></i> Chỉ Số Sinh Tồn (Vital Signs)
            </h5>

            <Row className="g-3 mb-3">
              <Col xs={12} sm={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Thân nhiệt (°C) <span className="text-muted small">(Chuẩn: 37.5 - 38.5)</span>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    step="0.1"
                    placeholder="Ví dụ: 38.0"
                    value={formData.temperatureC}
                    onChange={(e) => setFormData({ ...formData, temperatureC: e.target.value })}
                    disabled={submitting}
                  />
                </Form.Group>
              </Col>

              <Col xs={12} sm={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Nhịp tim (bpm) <span className="text-muted small">(Nghỉ: 28 - 44)</span>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    placeholder="Ví dụ: 36"
                    value={formData.heartRate}
                    onChange={(e) => setFormData({ ...formData, heartRate: e.target.value })}
                    disabled={submitting}
                  />
                </Form.Group>
              </Col>

              <Col xs={12} sm={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Nhịp thở (bpm) <span className="text-muted small">(Nghỉ: 8 - 16)</span>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    placeholder="Ví dụ: 12"
                    value={formData.respiratoryRate}
                    onChange={(e) => setFormData({ ...formData, respiratoryRate: e.target.value })}
                    disabled={submitting}
                  />
                </Form.Group>
              </Col>
            </Row>

            <hr className="my-4 text-muted" />

            {/* Row 3: Symptoms, Diagnosis & Result Status */}
            <h5 className="fw-bold text-primary mb-3">
              <i className="bi bi-clipboard2-check me-2"></i> Kết Quả Chẩn Đoán & Đánh Giá Thể Lực
            </h5>

            <Row className="g-3 mb-3">
              <Col xs={12}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Triệu chứng lâm sàng ghi nhận</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    placeholder="Ví dụ: Chân trái trước hơi sưng nóng, phản ứng khi sờ nắn; mắt có ghèn nhẹ..."
                    value={formData.symptoms}
                    onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
                    disabled={submitting}
                  />
                </Form.Group>
              </Col>

              <Col xs={12} md={8}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Chẩn đoán bệnh lý / Kết luận <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Ví dụ: Viêm gân cổ chân nhẹ do vận động cường độ cao"
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    required
                    disabled={submitting}
                  />
                  <Form.Control.Feedback type="invalid">Vui lòng nhập chẩn đoán.</Form.Control.Feedback>
                </Form.Group>
              </Col>

              <Col xs={12} md={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Kết luận trạng thái sức khỏe <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={formData.resultStatus}
                    onChange={(e) => setFormData({ ...formData, resultStatus: e.target.value })}
                    required
                    disabled={submitting}
                  >
                    <option value="eligible">🟢 Đủ điều kiện (Eligible)</option>
                    <option value="monitoring">🟡 Cần theo dõi (Monitoring)</option>
                    <option value="injured">🔴 Chấn thương (Injured)</option>
                    <option value="quarantined">⚫ Cách ly y tế (Quarantined)</option>
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col xs={12}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Ghi chú & Chỉ định thêm của Bác sĩ</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Ví dụ: Chườm lạnh 2 lần/ngày, hạn chế chạy nước đại, tái khám sau 3 ngày..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    disabled={submitting}
                  />
                </Form.Group>
              </Col>
            </Row>

            {/* Actions */}
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
                    Đang lưu hồ sơ...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle me-1"></i> Lưu hồ sơ khám bệnh
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
