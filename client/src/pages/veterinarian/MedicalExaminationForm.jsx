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
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);

  const [formData, setFormData] = useState({
    horse: horseId || '',
    date: formatDateForInput(new Date()),
    temperatureC: '',
    heartRate: '',
    respiratoryRate: '',
    weightKg: '',
    diagnosis: '',
    resultStatus: 'eligible',
    // Return-to-training assessment: how hard the horse may work from now on ('' = this exam says nothing about it).
    clearedLevel: '',
    symptoms: '',
    notes: '',
  });

  const [validated, setValidated] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const horsesRes = await veterinarianApi.getHorses();
        let loadedHorses = horsesRes.data || [];

        if (isEditMode) {
          const recRes = await veterinarianApi.getHealthRecordById(id);
          const rec = recRes.data;
          setExistingAttachments(rec.attachments || []);
          const recHorseId = rec.horse?._id || rec.horse || '';
          if (recHorseId && !loadedHorses.some((h) => h._id === recHorseId)) {
            if (rec.horse && typeof rec.horse === 'object' && rec.horse.name) {
              loadedHorses = [rec.horse, ...loadedHorses];
            } else {
              try {
                const singleHorseRes = await veterinarianApi.getHorseById(recHorseId);
                if (singleHorseRes?.data) loadedHorses = [singleHorseRes.data, ...loadedHorses];
              } catch (_) {}
            }
          }
          setFormData({
            horse: recHorseId,
            date: formatDateForInput(rec.date || rec.createdAt),
            temperatureC: rec.vitalSigns?.temperatureC || '',
            heartRate: rec.vitalSigns?.heartRate || '',
            respiratoryRate: rec.vitalSigns?.respiratoryRate || '',
            weightKg: rec.horse?.weightKg || '',
            diagnosis: rec.diagnosis || '',
            resultStatus: rec.resultStatus || 'eligible',
            clearedLevel: rec.clearedLevel || '',
            symptoms: '',
            notes: rec.notes || '',
          });
        } else if (horseId) {
          let targetHorse = loadedHorses.find((h) => h._id === horseId);
          if (!targetHorse) {
            try {
              const singleHorseRes = await veterinarianApi.getHorseById(horseId);
              if (singleHorseRes?.data) {
                targetHorse = singleHorseRes.data;
                loadedHorses = [targetHorse, ...loadedHorses];
              }
            } catch (e) {
              console.warn('Could not fetch single horse by ID:', e);
            }
          }
          if (targetHorse) {
            setFormData((prev) => ({
              ...prev,
              horse: horseId,
              weightKg: targetHorse.weightKg || '',
              resultStatus: targetHorse.healthStatus || 'eligible',
            }));
          }
        }
        setHorses(loadedHorses);
      } catch (err) {
        setError(err?.message || 'Không thể tải thông tin hồ sơ khám.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [horseId, id, isEditMode]);

  const handleFileChange = (e) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const totalCount = existingAttachments.length + selectedFiles.length + filesArray.length;
      if (totalCount > 10) {
        setError('Mỗi phiếu khám tối đa 10 tệp đính kèm.');
        return;
      }

      for (const file of filesArray) {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.type.startsWith('image/');

        if (!isImage && !isPdf) {
          setError(`Tệp "${file.name}" không được hỗ trợ. Chỉ chấp nhận ảnh hoặc tài liệu PDF.`);
          return;
        }

        if (isImage && file.size > 5 * 1024 * 1024) {
          setError(`Ảnh "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) vượt quá giới hạn 5 MB.`);
          return;
        }

        if (isPdf && file.size > 10 * 1024 * 1024) {
          setError(`Tệp PDF "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) vượt quá giới hạn 10 MB.`);
          return;
        }
      }

      setError(null);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleRemoveSelectedFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteExistingAttachment = async (attachmentId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tệp đính kèm này?')) return;
    setDeletingAttachmentId(attachmentId);
    try {
      await veterinarianApi.deleteRecordAttachment(id, attachmentId);
      setExistingAttachments((prev) => prev.filter((att) => att._id !== attachmentId));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Lỗi khi xóa tệp đính kèm.');
    } finally {
      setDeletingAttachmentId(null);
    }
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
      setError('Vui lòng chọn chiến mã cần khám bệnh.');
      return;
    }

    if (!formData.diagnosis.trim()) {
      setError('Vui lòng nhập chẩn đoán lâm sàng.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const todayStr = formatDateForInput(new Date());
    let examDate = new Date();
    if (formData.date && formData.date !== todayStr) {
      examDate = new Date(formData.date);
    }

    const payload = {
      horse: formData.horse,
      date: examDate,
      diagnosis: formData.diagnosis.trim(),
      resultStatus: formData.resultStatus,
      clearedLevel: formData.clearedLevel || null,
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
      let savedRecordId = id;
      if (isEditMode) {
        await veterinarianApi.updateHealthRecord(id, payload);
      } else {
        const createRes = await veterinarianApi.createHealthRecord(payload);
        savedRecordId = createRes.data?._id;
      }

      // Upload selected files if any (POST /health/records/:id/attachments)
      if (selectedFiles.length > 0 && savedRecordId) {
        const formDataUpload = new FormData();
        selectedFiles.forEach((f) => formDataUpload.append('files', f));
        await veterinarianApi.uploadRecordAttachments(savedRecordId, formDataUpload);
      }

      setSuccessMessage(
        isEditMode
          ? 'Cập nhật hồ sơ khám bệnh và tệp đính kèm thành công!'
          : 'Lập hồ sơ khám bệnh mới và tải tệp đính kèm thành công!'
      );

      setTimeout(() => {
        navigate(`/veterinarian/horses/${formData.horse}`);
      }, 1200);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Lỗi khi lưu hồ sơ khám bệnh.');
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
                  {horseId && formData.horse === horseId && (
                    <Form.Text className="text-primary small mt-1 d-block fw-medium">
                      <i className="bi bi-info-circle me-1"></i> Đang lập hồ sơ khám cho chiến mã theo yêu cầu khám bệnh.
                    </Form.Text>
                  )}
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

              <Col xs={12} md={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Mức vận động được phép (đánh giá trở lại tập)</Form.Label>
                  <Form.Select
                    value={formData.clearedLevel}
                    onChange={(e) => setFormData({ ...formData, clearedLevel: e.target.value })}
                    disabled={submitting}
                  >
                    <option value="">— Lần khám này không đánh giá mức tập —</option>
                    <option value="none">🛑 Chưa được tập</option>
                    <option value="light">🩹 Chỉ tập nhẹ</option>
                    <option value="moderate">🟡 Tập tối đa cường độ vừa</option>
                    <option value="high">🟢 Tập bình thường</option>
                  </Form.Select>
                  <Form.Text className="text-muted">
                    Kết thúc điều trị chưa có nghĩa là được tập lại: ngựa giữ mức hạn chế cho tới khi bác sĩ chọn mức ở đây. Mức này áp dụng cho tới lần đánh giá sau.
                  </Form.Text>
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

            {/* Attachments Section (POST /health/records/:id/attachments) */}
            <div className="mb-4 p-3 bg-light rounded border">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <Form.Label className="fw-bold text-dark mb-0">
                  <i className="bi bi-paperclip me-1 text-primary"></i>
                  Tài Liệu Y Tế & Hình Ảnh Đính Kèm (Ảnh X-Quang, Kết Quả Xét Nghiệm, Đơn Thuốc Scan)
                </Form.Label>
                <span className="small text-muted">Tối đa 10 tệp (Ảnh tối đa 5MB, PDF tối đa 10MB)</span>
              </div>

              {/* Existing Attachments (if editing) */}
              {existingAttachments.length > 0 && (
                <div className="mb-3">
                  <span className="small fw-bold text-muted d-block mb-1">Tệp đã đính kèm hiện tại:</span>
                  <div className="d-flex flex-wrap gap-2">
                    {existingAttachments.map((att) => (
                      <div key={att._id} className="p-2 bg-white rounded border d-flex align-items-center gap-2">
                        {att.contentType?.startsWith('image/') ? (
                          <img
                            src={att.url}
                            alt={att.name}
                            style={{ width: '32px', height: '32px', objectFit: 'cover' }}
                            className="rounded"
                          />
                        ) : (
                          <i className="bi bi-file-earmark-pdf fs-4 text-danger"></i>
                        )}
                        <div className="small">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-decoration-none fw-semibold"
                          >
                            {att.name}
                          </a>
                          <div className="text-muted" style={{ fontSize: '11px' }}>
                            {att.size ? `${Math.round(att.size / 1024)} KB` : ''}
                          </div>
                        </div>
                        <Button
                          variant="link"
                          size="sm"
                          className="text-danger p-0 ms-1 border-0"
                          onClick={() => handleDeleteExistingAttachment(att._id)}
                          disabled={deletingAttachmentId === att._id}
                          title="Xóa tệp này"
                        >
                          {deletingAttachmentId === att._id ? (
                            <Spinner size="sm" animation="border" />
                          ) : (
                            <i className="bi bi-trash"></i>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* File Input */}
              <Form.Group>
                <Form.Control
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  disabled={submitting}
                />
                <Form.Text className="text-muted">
                  Hỗ trợ hình ảnh (.jpg, .png - tối đa 5MB) và tài liệu PDF (tối đa 10MB). Tối đa 10 tệp/phiếu khám.
                </Form.Text>
              </Form.Group>

              {/* Staged files for upload */}
              {selectedFiles.length > 0 && (
                <div className="mt-2">
                  <span className="small fw-semibold text-primary d-block mb-1">
                    Tệp mới chuẩn bị tải lên ({selectedFiles.length}):
                  </span>
                  <div className="d-flex flex-wrap gap-2">
                    {selectedFiles.map((file, idx) => (
                      <span key={idx} className="badge bg-white text-dark border p-2 d-flex align-items-center gap-2">
                        <i className="bi bi-file-earmark-arrow-up text-primary"></i>
                        <span>
                          {file.name} ({Math.round(file.size / 1024)} KB)
                        </span>
                        <i
                          className="bi bi-x-circle text-danger cursor-pointer ms-1"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleRemoveSelectedFile(idx)}
                        ></i>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
