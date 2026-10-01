import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Badge, Button, Form, InputGroup, Modal, Spinner, Alert, Tabs, Tab } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import EmptyState from '../../components/common/EmptyState';
import { formatDate, formatDateForInput } from '../../utils/formatDate';

export default function MedicalSchedule() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [horses, setHorses] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'vaccination' | 'deworming' | 'farrier'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'overdue' | 'dueSoon' | 'upcoming'

  // Edit Schedule Modal
  const [selectedHorse, setSelectedHorse] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    nextVaccinationDue: '',
    nextDewormingDue: '',
    nextFarrierDue: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchHorses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await veterinarianApi.getHorses();
      setHorses(res.data || []);
    } catch (err) {
      setError(err?.message || 'Không thể tải lịch y tế.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHorses();
  }, []);

  const getStatusInfo = (dueDate) => {
    if (!dueDate) return { key: 'none', label: 'Chưa đặt lịch', bg: 'secondary', diff: null };
    const due = new Date(dueDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dueNorm = new Date(due);
    dueNorm.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((dueNorm - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { key: 'overdue', label: `Quá hạn ${Math.abs(diffDays)} ngày`, bg: 'danger', isOverdue: true, diff: diffDays };
    }
    if (diffDays === 0) {
      return { key: 'dueSoon', label: 'Đến hạn hôm nay', bg: 'warning', text: 'dark', isDueSoon: true, diff: diffDays };
    }
    if (diffDays <= 7) {
      return { key: 'dueSoon', label: `Đến hạn trong ${diffDays} ngày`, bg: 'info', text: 'dark', isDueSoon: true, diff: diffDays };
    }
    return { key: 'upcoming', label: `Còn ${diffDays} ngày`, bg: 'success', isUpcoming: true, diff: diffDays };
  };

  const handleOpenEdit = (horse) => {
    setSelectedHorse(horse);
    const sched = horse.careSchedule || {};
    setFormData({
      nextExamDue: formatDateForInput(sched.nextExamDue),
      nextVaccinationDue: formatDateForInput(sched.nextVaccinationDue),
      nextDewormingDue: formatDateForInput(sched.nextDewormingDue),
      nextFarrierDue: formatDateForInput(sched.nextFarrierDue),
    });
    setShowModal(true);
  };

  const handleQuickAdd7Days = async (horse, type = 'nextExamDue') => {
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const dateStr = formatDateForInput(next7Days);

    try {
      await veterinarianApi.updateCareSchedule(horse._id, {
        [type]: dateStr,
      });
      fetchHorses();
    } catch (err) {
      setError(err?.message || 'Lỗi khi cập nhật lịch khám định kỳ.');
    }
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!selectedHorse) return;

    setSaving(true);
    try {
      await veterinarianApi.updateCareSchedule(selectedHorse._id, {
        nextExamDue: formData.nextExamDue || null,
        nextVaccinationDue: formData.nextVaccinationDue || null,
        nextDewormingDue: formData.nextDewormingDue || null,
        nextFarrierDue: formData.nextFarrierDue || null,
      });
      setShowModal(false);
      fetchHorses();
    } catch (err) {
      setError(err?.message || 'Lỗi khi cập nhật lịch chăm sóc.');
    } finally {
      setSaving(false);
    }
  };

  // Build flattened schedule rows
  const scheduleRows = [];
  horses.forEach((horse) => {
    const sched = horse.careSchedule || {};
    const items = [
      {
        type: 'periodicExam',
        field: 'nextExamDue',
        label: 'Khám định kỳ 7 ngày (Periodic Exam)',
        icon: 'bi-stethoscope text-danger',
        date: sched.nextExamDue,
        notifiedAt: sched.examNotifiedAt,
      },
      {
        type: 'vaccination',
        field: 'nextVaccinationDue',
        label: 'Tiêm phòng (Vaccination)',
        icon: 'bi-eyedropper text-primary',
        date: sched.nextVaccinationDue,
        notifiedAt: sched.vaccinationNotifiedAt,
      },
      {
        type: 'deworming',
        field: 'nextDewormingDue',
        label: 'Tẩy giun (Deworming)',
        icon: 'bi-capsule text-success',
        date: sched.nextDewormingDue,
        notifiedAt: sched.dewormingNotifiedAt,
      },
      {
        type: 'farrier',
        field: 'nextFarrierDue',
        label: 'Kiểm tra móng (Farrier Check)',
        icon: 'bi-hammer text-dark',
        date: sched.nextFarrierDue,
        notifiedAt: sched.farrierNotifiedAt,
      },
    ];

    items.forEach((item) => {
      const status = getStatusInfo(item.date);
      scheduleRows.push({
        id: `${horse._id}-${item.type}`,
        horse,
        ...item,
        status,
      });
    });
  });

  const filteredRows = scheduleRows.filter((row) => {
    const q = searchTerm.toLowerCase();
    const matchesQuery =
      row.horse.name?.toLowerCase().includes(q) ||
      row.label?.toLowerCase().includes(q);

    const matchesCategory = categoryFilter === 'all' || row.type === categoryFilter;

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'overdue' && row.status.isOverdue) ||
      (statusFilter === 'dueSoon' && row.status.isDueSoon) ||
      (statusFilter === 'upcoming' && row.status.isUpcoming);

    return matchesQuery && matchesCategory && matchesStatus;
  });

  if (loading) {
    return <LoadingSpinner text="Đang tải lịch trình y tế & tiêm chủng..." minHeight="400px" />;
  }

  return (
    <Container fluid className="p-0">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 pb-2 border-bottom gap-2">
        <div>
          <h2 className="fw-bold text-dark mb-1">
            <i className="bi bi-calendar-check me-2 text-primary"></i>
            Quản Lý Lịch Y Tế & Khám Định Kỳ (7 Ngày)
          </h2>
          <p className="text-muted mb-0 small">
            Tạo và tự động hóa lịch khám bệnh định kỳ 7 ngày/lần, theo dõi vắc-xin, tẩy giun và kiểm tra móng cho chiến mã.
          </p>
        </div>

        <Button variant="outline-primary" size="sm" onClick={fetchHorses}>
          <i className="bi bi-arrow-clockwise me-1"></i> Làm mới
        </Button>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchHorses} />}

      {/* Filter Bar */}
      <Card className="border-0 shadow-sm mb-4 bg-white">
        <Card.Body className="p-3">
          <Row className="g-3 align-items-center">
            <Col xs={12} md={5}>
              <InputGroup>
                <InputGroup.Text className="bg-light">
                  <i className="bi bi-search text-muted"></i>
                </InputGroup.Text>
                <Form.Control
                  placeholder="Tìm theo tên chiến mã..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </Col>

            <Col xs={6} md={3}>
              <Form.Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">Tất cả hạng mục</option>
                <option value="periodicExam">🩺 Khám định kỳ 7 ngày (Periodic Exam)</option>
                <option value="vaccination">💉 Tiêm phòng (Vaccination)</option>
                <option value="deworming">💊 Tẩy giun (Deworming)</option>
                <option value="farrier">🔨 Đóng móng (Farrier)</option>
              </Form.Select>
            </Col>

            <Col xs={6} md={4}>
              <Form.Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Tất cả trạng thái đến hạn</option>
                <option value="overdue">🔴 Quá hạn (Overdue)</option>
                <option value="dueSoon">🟡 Đến hạn trong 7 ngày (Due Soon)</option>
                <option value="upcoming">🟢 Sắp tới (Upcoming)</option>
              </Form.Select>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Schedule Table */}
      {filteredRows.length === 0 ? (
        <EmptyState
          icon="bi-calendar-x"
          title="Không tìm thấy lịch y tế phù hợp"
          message="Không có lịch chăm sóc nào khớp với tiêu chí tìm kiếm."
        />
      ) : (
        <Card className="border-0 shadow-sm bg-white">
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Chiến mã</th>
                    <th>Hạng mục y tế</th>
                    <th>Hạn tiếp theo</th>
                    <th>Trạng thái hạn</th>
                    <th>Nhắc nhở gần nhất</th>
                    <th className="text-center" style={{ width: '200px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td className="fw-bold">
                        <span
                          className="text-primary cursor-pointer"
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/veterinarian/horses/${row.horse._id}`)}
                        >
                          {row.horse.name}
                        </span>
                        <small className="text-muted d-block">
                          #{row.horse._id?.slice(-6).toUpperCase()}
                        </small>
                      </td>
                      <td>
                        <i className={`bi ${row.icon} me-2 fs-6`}></i>
                        <span className="fw-semibold">{row.label}</span>
                      </td>
                      <td className="fw-semibold text-primary">
                        {formatDate(row.date, 'Chưa đặt')}
                      </td>
                      <td>
                        <Badge bg={row.status.bg} text={row.status.text} pill className="px-2 py-1">
                          {row.status.label}
                        </Badge>
                      </td>
                      <td className="small text-muted">
                        {formatDate(row.notifiedAt, 'Chưa gửi')}
                      </td>
                      <td className="text-center">
                        <div className="d-flex justify-content-center gap-1">
                          <Button
                            variant="outline-success"
                            size="sm"
                            onClick={() => handleQuickAdd7Days(row.horse, row.field)}
                            title="Tự động đặt lịch khám lại sau 7 ngày"
                          >
                            +7 ngày
                          </Button>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => handleOpenEdit(row.horse)}
                            title="Cập nhật lịch cho ngựa này"
                          >
                            <i className="bi bi-pencil me-1"></i> Sửa
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Edit Schedule Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Form onSubmit={handleSaveSchedule}>
          <Modal.Header closeButton={!saving}>
            <Modal.Title className="fs-5">Cập Nhật Lịch Y Tế & Định Kỳ - {selectedHorse?.name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <Form.Label className="fw-semibold mb-0">
                  <i className="bi bi-stethoscope me-1 text-danger"></i> Hạn Khám Sức Khỏe Định Kỳ (7 ngày)
                </Form.Label>
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 text-decoration-none"
                  onClick={() => {
                    const next7Days = new Date();
                    next7Days.setDate(next7Days.getDate() + 7);
                    setFormData({ ...formData, nextExamDue: formatDateForInput(next7Days) });
                  }}
                >
                  ➕ Đặt 7 ngày tới
                </Button>
              </div>
              <Form.Control
                type="date"
                value={formData.nextExamDue}
                onChange={(e) => setFormData({ ...formData, nextExamDue: e.target.value })}
                disabled={saving}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">
                <i className="bi bi-eyedropper me-1 text-primary"></i> Hạn Tiêm Phòng Kế Tiếp
              </Form.Label>
              <Form.Control
                type="date"
                value={formData.nextVaccinationDue}
                onChange={(e) => setFormData({ ...formData, nextVaccinationDue: e.target.value })}
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? <Spinner animation="border" size="sm" /> : 'Lưu Thay Đổi'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
