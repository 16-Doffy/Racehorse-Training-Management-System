import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, Badge } from 'react-bootstrap';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import Horse3DAnatomyViewer from '../../components/veterinarian/Horse3DAnatomyViewer';

export default function InjuryForm() {
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
  const [formData, setFormData] = useState({
    horse: preselectedHorseId || '',
    bodyPart: '',
    severity: 'moderate',
    recoveryStatus: 'new',
    x: 0.5,
    y: 0.5,
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
          const markersRes = await veterinarianApi.getInjuryMarkers();
          const marker = markersRes.data?.find((m) => m._id === id);
          if (marker) {
            setFormData({
              horse: marker.horse?._id || marker.horse || '',
              bodyPart: marker.bodyPart || '',
              severity: marker.severity || 'moderate',
              recoveryStatus: marker.recoveryStatus || 'new',
              x: marker.coordinates?.x ?? 0.5,
              y: marker.coordinates?.y ?? 0.5,
              notes: marker.notes || '',
            });
          }
        }
      } catch (err) {
        setError(err?.message || 'Không thể tải dữ liệu.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, isEditMode, preselectedHorseId]);

  // Handle clicking on interactive horse diagram
  const handleDiagramClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100) / 100;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100) / 100;
    setFormData((prev) => ({ ...prev, x, y }));
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

    if (!formData.bodyPart.trim()) {
      setError('Vui lòng nhập vị trí cơ thể bị tổn thương.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      horse: formData.horse,
      bodyPart: formData.bodyPart.trim(),
      severity: formData.severity,
      recoveryStatus: formData.recoveryStatus,
      coordinates: {
        x: formData.x,
        y: formData.y,
      },
      notes: formData.notes.trim(),
    };

    try {
      if (isEditMode) {
        await veterinarianApi.updateInjuryMarker(id, payload);
      } else {
        await veterinarianApi.createInjuryMarker(payload);
      }

      // Automatically sync horse healthStatus
      if (formData.recoveryStatus !== 'recovered') {
        await veterinarianApi.createHealthRecord({
          horse: formData.horse,
          diagnosis: `Ghi nhận chấn thương: ${formData.bodyPart.trim()} (${formData.severity})`,
          resultStatus: 'injured',
          date: new Date(),
        });
      }

      setSuccess(true);
      setTimeout(() => {
        navigate(`/veterinarian/horses/${formData.horse}`);
      }, 1000);
    } catch (err) {
      setError(err?.message || 'Lỗi khi lưu thông tin chấn thương.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Đang tải biểu mẫu chấn thương..." minHeight="400px" />;
  }

  const commonBodyParts = [
    'Chân trái trước (Left Foreleg)',
    'Chân phải trước (Right Foreleg)',
    'Chân trái sau (Left Hindleg)',
    'Chân phải sau (Right Hindleg)',
    'Gân gót / Cổ chân (Fetlock/Tendon)',
    'Móng chân (Hoof)',
    'Khớp vai (Shoulder)',
    'Lưng / Cột sống (Back/Spine)',
    'Khớp gối (Stifle/Hock)',
  ];

  return (
    <Container fluid className="p-0" style={{ maxWidth: '950px' }}>
      <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
        <div>
          <h3 className="fw-bold text-dark mb-1">
            <i className="bi bi-bandaid me-2 text-danger"></i>
            {isEditMode ? 'Cập Nhật Điểm Chấn Thương' : 'Ghi Nhận Chấn Thương & Định Vị Tổn Thương'}
          </h3>
          <p className="text-muted mb-0 small">
            Xác định vị trí tổn thương trên sơ đồ cơ thể ngựa, phân loại mức độ nghiêm trọng và tiến độ hồi phục.
          </p>
        </div>

        <Button
          variant="outline-secondary"
          size="sm"
          onClick={() => navigate(formData.horse ? `/veterinarian/horses/${formData.horse}` : '/veterinarian/injuries')}
        >
          <i className="bi bi-x-circle me-1"></i> Hủy
        </Button>
      </div>

      {error && <ErrorAlert message={error} onRetry={() => setError(null)} />}
      {success && (
        <Alert variant="success">
          <i className="bi bi-check-circle-fill me-2"></i> Lưu dữ liệu chấn thương thành công! Đang chuyển hướng...
        </Alert>
      )}

      <Card className="border-0 shadow-sm bg-white">
        <Card.Body className="p-4">
          <Form noValidate validated={validated} onSubmit={handleSubmit}>
            <Row className="g-4">
              {/* Left Column: Form Details */}
              <Col xs={12} md={7}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">
                    Chiến mã <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={formData.horse}
                    onChange={(e) => setFormData({ ...formData, horse: e.target.value })}
                    required
                    disabled={isEditMode || submitting}
                  >
                    <option value="">-- Chọn chiến mã bị chấn thương --</option>
                    {horses.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name} (#{h._id.slice(-6).toUpperCase()})
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">
                    Vị trí tổn thương <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Ví dụ: Gân cơ chân trước bên trái"
                    value={formData.bodyPart}
                    onChange={(e) => setFormData({ ...formData, bodyPart: e.target.value })}
                    required
                    disabled={submitting}
                  />
                  <div className="d-flex flex-wrap gap-1 mt-2">
                    <small className="text-muted w-100 mb-1">Gợi ý nhanh:</small>
                    {commonBodyParts.map((bp) => (
                      <Button
                        key={bp}
                        variant="outline-secondary"
                        size="sm"
                        className="py-0 px-2"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setFormData({ ...formData, bodyPart: bp })}
                      >
                        {bp.split(' (')[0]}
                      </Button>
                    ))}
                  </div>
                </Form.Group>

                <Row className="g-3 mb-3">
                  <Col xs={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold">Mức độ nghiêm trọng</Form.Label>
                      <Form.Select
                        value={formData.severity}
                        onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                        disabled={submitting}
                      >
                        <option value="mild">Nhẹ (Mild)</option>
                        <option value="moderate">Trung bình (Moderate)</option>
                        <option value="severe">Nghiêm trọng (Severe)</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>

                  <Col xs={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold">Tiến độ hồi phục</Form.Label>
                      <Form.Select
                        value={formData.recoveryStatus}
                        onChange={(e) => setFormData({ ...formData, recoveryStatus: e.target.value })}
                        disabled={submitting}
                      >
                        <option value="new">Mới phát hiện</option>
                        <option value="in_treatment">Đang điều trị</option>
                        <option value="recovering">Đang hồi phục</option>
                        <option value="recovered">Đã bình phục</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">Mô tả & Ghi chú phác đồ</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Mô tả mức độ sưng, phản ứng đi khập khiễng, liệu trình chườm đá/băng bó..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    disabled={submitting}
                  />
                </Form.Group>
              </Col>

              {/* Right Column: 3D Interactive Musculoskeletal Anatomy Model */}
              <Col xs={12} md={5}>
                <div className="mb-2 fw-bold text-dark">
                  <i className="bi bi-box me-1 text-danger"></i> Định vị trên Mô hình Cơ/Xương 3D
                </div>
                <Horse3DAnatomyViewer
                  selectedPoint={{ x: formData.x, y: formData.y }}
                  onPointSelect={({ x, y, presetName }) => {
                    setFormData((prev) => ({
                      ...prev,
                      x,
                      y,
                      bodyPart: presetName || prev.bodyPart,
                    }));
                  }}
                  isInteractive={true}
                  height="290px"
                />

                <div className="mt-2 text-muted small bg-light p-2 rounded text-center">
                  Tọa độ 3D: <strong>X: {Math.round(formData.x * 100)}% | Y: {Math.round(formData.y * 100)}%</strong>
                  {formData.bodyPart && <span className="d-block text-primary fw-semibold mt-1">🎯 {formData.bodyPart}</span>}
                </div>
              </Col>
            </Row>

            <div className="d-flex justify-content-end gap-2 pt-3 mt-4 border-top">
              <Button
                variant="outline-secondary"
                onClick={() => navigate(formData.horse ? `/veterinarian/horses/${formData.horse}` : '/veterinarian/injuries')}
                disabled={submitting}
              >
                Hủy bỏ
              </Button>
              <Button variant="danger" type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-1" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle me-1"></i> Lưu thông tin chấn thương
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
