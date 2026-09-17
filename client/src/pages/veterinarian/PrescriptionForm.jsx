import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Table, Badge, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import EmptyState from '../../components/common/EmptyState';
import { formatDate } from '../../utils/formatDate';

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
  const [medicineName, setMedicineName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [instructions, setInstructions] = useState('');

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

  const handleCreatePrescription = async (e) => {
    e.preventDefault();
    if (!selectedHorse) {
      setError('Vui lòng chọn chiến mã.');
      return;
    }
    if (!medicineName.trim() || !dosage.trim()) {
      setError('Vui lòng nhập tên thuốc và liều lượng.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Find or create an ongoing treatment for this horse
      const existingOngoing = treatments.find(
        (t) => (t.horse?._id || t.horse) === selectedHorse && t.status === 'ongoing'
      );

      const newMedication = {
        name: medicineName.trim(),
        dosage: dosage.trim(),
        frequency: [frequency.trim(), instructions.trim()].filter(Boolean).join(' - '),
      };

      if (existingOngoing) {
        const updatedMeds = [...(existingOngoing.medications || []), newMedication];
        await veterinarianApi.updateTreatment(existingOngoing._id, {
          medications: updatedMeds,
        });
      } else {
        // Create initial health record
        const rec = await veterinarianApi.createHealthRecord({
          horse: selectedHorse,
          diagnosis: `Kê đơn thuốc: ${medicineName.trim()}`,
          resultStatus: 'monitoring',
        });

        await veterinarianApi.createTreatment({
          horse: selectedHorse,
          healthRecord: rec.data?._id,
          startDate: new Date(),
          status: 'ongoing',
          medications: [newMedication],
        });
      }

      setSuccess(true);
      setMedicineName('');
      setDosage('');
      setFrequency('');
      setInstructions('');
      fetchData();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err?.message || 'Lỗi khi lưu đơn thuốc.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Đang tải danh mục thuốc & đơn thuốc..." minHeight="400px" />;
  }

  // Flatten active prescriptions
  const activePrescriptions = [];
  treatments.forEach((t) => {
    const horse = t.horse;
    (t.medications || []).forEach((m, idx) => {
      activePrescriptions.push({
        id: `${t._id}-${idx}`,
        horseName: horse?.name || 'Ngựa',
        horseId: horse?._id || horse,
        medicine: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        startDate: t.startDate,
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
            Kê đơn dược phẩm điều trị, chỉ định liều lượng và theo dõi toàn bộ thuốc đang được cấp phát cho các chiến mã.
          </p>
        </div>

        <Button variant="outline-primary" size="sm" onClick={fetchData}>
          <i className="bi bi-arrow-clockwise me-1"></i> Làm mới
        </Button>
      </div>

      {error && <ErrorAlert message={error} onRetry={() => setError(null)} />}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess(false)}>
          <i className="bi bi-check-circle-fill me-2"></i> Kê đơn thuốc thành công!
        </Alert>
      )}

      <Row className="g-4">
        {/* Left Col: Prescription Form */}
        <Col xs={12} lg={5}>
          <Card className="border-0 shadow-sm bg-white h-100">
            <Card.Header className="bg-white py-3 border-0">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-plus-circle-fill me-2 text-primary"></i>
                Kê Đơn Thuốc Mới
              </h5>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleCreatePrescription}>
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
                    <option value="">-- Chọn chiến mã --</option>
                    {horses.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name} (#{h._id.slice(-6).toUpperCase()})
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">
                    Tên thuốc / Dược phẩm <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Ví dụ: Phenylbutazone 20%, Dexamethasone..."
                    value={medicineName}
                    onChange={(e) => setMedicineName(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </Form.Group>

                <Row className="g-2 mb-3">
                  <Col xs={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold">
                        Liều lượng <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Ví dụ: 10ml, 2g, 1 viên..."
                        value={dosage}
                        onChange={(e) => setDosage(e.target.value)}
                        required
                        disabled={submitting}
                      />
                    </Form.Group>
                  </Col>

                  <Col xs={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold">Tần suất</Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Ví dụ: 2 lần/ngày"
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value)}
                        disabled={submitting}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-4">
                  <Form.Label className="fw-semibold">Hướng dẫn dùng thuốc</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    placeholder="Ví dụ: Trộn vào khẩu phần ăn buổi sáng, theo dõi phản ứng tiêu hóa..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    disabled={submitting}
                  />
                </Form.Group>

                <Button variant="primary" type="submit" className="w-100" disabled={submitting}>
                  {submitting ? <Spinner animation="border" size="sm" /> : <><i className="bi bi-capsule me-1"></i> Xác Nhận Kê Đơn</>}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        {/* Right Col: Active Prescriptions List */}
        <Col xs={12} lg={7}>
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
                        <th>Tên thuốc</th>
                        <th>Liều lượng & Tần suất</th>
                        <th>Ngày kê</th>
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
                          <td className="fw-semibold text-dark">💊 {p.medicine}</td>
                          <td className="small">
                            <strong>{p.dosage}</strong> ({p.frequency || 'theo chỉ dẫn'})
                          </td>
                          <td className="small text-muted">{formatDate(p.startDate)}</td>
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
