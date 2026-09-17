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
      nextVaccinationDue: formatDateForInput(sched.nextVaccinationDue),
      nextDewormingDue: formatDateForInput(sched.nextDewormingDue),
      nextFarrierDue: formatDateForInput(sched.nextFarrierDue),
    });
    setShowModal(true);
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!selectedHorse) return;

    setSaving(true);
    try {
      await veterinarianApi.updateCareSchedule(selectedHorse._id, {
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
        type: 'vaccination',
        label: 'Tiêm phòng (Vaccination)',
        icon: 'bi-eyedropper text-primary',
        date: sched.nextVaccinationDue,
        notifiedAt: sched.vaccinationNotifiedAt,
      },
      {
        type: 'deworming',
        label: 'Tẩy giun (Deworming)',
        icon: 'bi-capsule text-success',
        date: sched.nextDewormingDue,
        notifiedAt: sched.dewormingNotifiedAt,
      },
      {
        type: 'farrier',
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
            Quản Lý Lịch Y Tế & Chăm Sóc Định Kỳ
          </h2>
          <p className="text-muted mb-0 small">
            Theo dõi kế hoạch tiêm phòng vắc-xin, tẩy giun sán và đóng móng sắt cho toàn bộ chiến mã trong câu lạc bộ.
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
                    <th className="text-center" style={{ width: '130px' }}>Thao tác</th>
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
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => handleOpenEdit(row.horse)}
                          title="Cập nhật lịch cho ngựa này"
                        >
                          <i className="bi bi-calendar-plus me-1"></i> Cập nhật
                        </Button>
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
            <Modal.Title className="fs-5">Cập Nhật Lịch Y Tế - {selectedHorse?.name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
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
