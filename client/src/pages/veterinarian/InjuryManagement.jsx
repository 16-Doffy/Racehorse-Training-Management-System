import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, InputGroup, Button, Table, Badge, Modal, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import EmptyState from '../../components/common/EmptyState';
import Horse3DAnatomyViewer from '../../components/veterinarian/Horse3DAnatomyViewer';
import { formatDate } from '../../utils/formatDate';
import { INJURY_SEVERITY_CONFIG, RECOVERY_STATUS_CONFIG } from '../../utils/healthStatus';

export default function InjuryManagement() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [injuries, setInjuries] = useState([]);
  const [horses, setHorses] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [recoveryFilter, setRecoveryFilter] = useState('all');
  const [sortAsc, setSortAsc] = useState(false);

  // Quick edit modal for recovery status
  const [selectedInjury, setSelectedInjury] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newRecoveryStatus, setNewRecoveryStatus] = useState('in_treatment');
  const [statusNotes, setStatusNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [injuriesRes, horsesRes] = await Promise.all([
        veterinarianApi.getInjuryMarkers(),
        veterinarianApi.getHorses(),
      ]);

      setInjuries(injuriesRes.data || []);
      setHorses(horsesRes.data || []);
    } catch (err) {
      setError(err?.message || 'Không thể tải danh sách chấn thương.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const horseMap = {};
  horses.forEach((h) => {
    horseMap[h._id] = h;
  });

  const filteredInjuries = injuries
    .filter((inj) => {
      const horse = horseMap[inj.horse?._id || inj.horse];
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        horse?.name?.toLowerCase().includes(q) ||
        inj.bodyPart?.toLowerCase().includes(q) ||
        inj.notes?.toLowerCase().includes(q);

      const matchesSeverity = severityFilter === 'all' || inj.severity === severityFilter;
      const matchesRecovery = recoveryFilter === 'all' || inj.recoveryStatus === recoveryFilter;

      return matchesSearch && matchesSeverity && matchesRecovery;
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || a.date).getTime();
      const dateB = new Date(b.createdAt || b.date).getTime();
      return sortAsc ? dateA - dateB : dateB - dateA;
    });

  const handleOpenStatusModal = (injury) => {
    setSelectedInjury(injury);
    setNewRecoveryStatus(injury.recoveryStatus || 'in_treatment');
    setStatusNotes(injury.notes || '');
    setShowStatusModal(true);
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!selectedInjury) return;

    setUpdating(true);
    try {
      await veterinarianApi.updateInjuryMarker(selectedInjury._id, {
        recoveryStatus: newRecoveryStatus,
        notes: statusNotes,
      });

      // If marked recovered, check if any other active injuries remain for this horse
      if (newRecoveryStatus === 'recovered') {
        const horseId = selectedInjury.horse?._id || selectedInjury.horse;
        const remainingActive = injuries.filter(
          (inj) =>
            inj._id !== selectedInjury._id &&
            (inj.horse?._id || inj.horse)?.toString() === horseId?.toString() &&
            inj.recoveryStatus !== 'recovered'
        );

        if (remainingActive.length === 0) {
          // Auto-revert horse to eligible
          await veterinarianApi.createHealthRecord({
            horse: horseId,
            diagnosis: 'Toàn bộ chấn thương đã bình phục hoàn toàn',
            resultStatus: 'eligible',
            date: new Date(),
          });
        }
      }

      setShowStatusModal(false);
      fetchData();
    } catch (err) {
      setError(err?.message || 'Lỗi khi cập nhật trạng thái chấn thương.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Đang tải danh sách chấn thương toàn bộ CLB..." minHeight="400px" />;
  }

  return (
    <Container fluid className="p-0">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 pb-2 border-bottom gap-2">
        <div>
          <h2 className="fw-bold text-dark mb-1">
            <i className="bi bi-bandaid me-2 text-danger"></i>
            Quản Lý Chấn Thương & Sơ Đồ Tổn Thương
          </h2>
          <p className="text-muted mb-0 small">
            Theo dõi danh sách tổn thương cơ xương khớp, tiến độ hồi phục và điều trị của các chiến mã.
          </p>
        </div>

        <div className="d-flex gap-2">
          <Button variant="outline-primary" size="sm" onClick={fetchData}>
            <i className="bi bi-arrow-clockwise me-1"></i> Làm mới
          </Button>
          <Button variant="danger" size="sm" onClick={() => navigate('/veterinarian/injuries/new')}>
            <i className="bi bi-plus-circle me-1"></i> Ghi nhận chấn thương mới
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchData} />}

      {/* 3D Musculoskeletal Model Overview */}
      <div className="mb-4">
        <Horse3DAnatomyViewer
          injuries={filteredInjuries}
          isInteractive={false}
          height="300px"
        />
      </div>

      {/* Filter Bar */}
      <Card className="border-0 shadow-sm mb-4 bg-white">
        <Card.Body className="p-3">
          <Row className="g-3 align-items-center">
            <Col xs={12} md={4}>
              <InputGroup>
                <InputGroup.Text className="bg-light">
                  <i className="bi bi-search text-muted"></i>
                </InputGroup.Text>
                <Form.Control
                  placeholder="Tìm theo tên ngựa, vị trí chấn thương..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </Col>

            <Col xs={6} md={3}>
              <Form.Select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <option value="all">Tất cả mức độ</option>
                <option value="mild">Nhẹ (Mild)</option>
                <option value="moderate">Trung bình (Moderate)</option>
                <option value="severe">Nghiêm trọng (Severe)</option>
              </Form.Select>
            </Col>

            <Col xs={6} md={3}>
              <Form.Select
                value={recoveryFilter}
                onChange={(e) => setRecoveryFilter(e.target.value)}
              >
                <option value="all">Tất cả tiến độ</option>
                <option value="new">Mới phát hiện</option>
                <option value="in_treatment">Đang điều trị</option>
                <option value="recovering">Đang hồi phục</option>
                <option value="recovered">Đã bình phục</option>
              </Form.Select>
            </Col>

            <Col xs={12} md={2} className="text-end">
              <Button
                variant="outline-secondary"
                size="sm"
                className="w-100"
                onClick={() => setSortAsc(!sortAsc)}
              >
                <i className={`bi bi-sort-numeric-${sortAsc ? 'down' : 'down-alt'} me-1`}></i>
                {sortAsc ? 'Cũ nhất' : 'Mới nhất'}
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Injury Table */}
      {filteredInjuries.length === 0 ? (
        <EmptyState
          icon="bi-shield-check"
          title="Không tìm thấy bản ghi chấn thương nào"
          message="Không có ca chấn thương nào khớp với tiêu chí tìm kiếm hoặc toàn bộ ngựa đang hoàn toàn khỏe mạnh."
          actionLabel="Ghi nhận chấn thương"
          onAction={() => navigate('/veterinarian/injuries/new')}
        />
      ) : (
        <Card className="border-0 shadow-sm bg-white">
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Ngày ghi nhận</th>
                    <th>Chiến mã</th>
                    <th>Vị trí tổn thương</th>
                    <th>Mức độ nghiêm trọng</th>
                    <th>Tiến độ hồi phục</th>
                    <th>Ghi chú & Chỉ định</th>
                    <th className="text-center" style={{ width: '140px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInjuries.map((injury) => {
                    const horse = horseMap[injury.horse?._id || injury.horse];
                    const sev = INJURY_SEVERITY_CONFIG[injury.severity] || { label: injury.severity, bg: 'secondary' };
                    const rec = RECOVERY_STATUS_CONFIG[injury.recoveryStatus] || { label: injury.recoveryStatus, bg: 'secondary' };

                    return (
                      <tr key={injury._id}>
                        <td className="fw-semibold text-primary">{formatDate(injury.createdAt || injury.date)}</td>
                        <td>
                          <div className="fw-bold text-dark">{horse?.name || 'Ngựa'}</div>
                          <small className="text-muted">#{horse?._id?.slice(-6).toUpperCase()}</small>
                        </td>
                        <td>
                          <div className="fw-bold">{injury.bodyPart}</div>
                          {injury.coordinates && (
                            <small className="text-muted">
                              Tọa độ 2D: ({Math.round(injury.coordinates.x * 100)}%, {Math.round(injury.coordinates.y * 100)}%)
                            </small>
                          )}
                        </td>
                        <td>
                          <Badge bg={sev.bg} text={sev.text || 'white'} pill className="px-2 py-1">
                            {sev.label}
                          </Badge>
                        </td>
                        <td>
                          <Badge bg={rec.bg} pill className="px-2 py-1">
                            {rec.label}
                          </Badge>
                        </td>
                        <td className="small text-muted">{injury.notes || '-'}</td>
                        <td className="text-center">
                          <div className="d-flex justify-content-center gap-1">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              title="Cập nhật tiến độ hồi phục"
                              onClick={() => handleOpenStatusModal(injury)}
                            >
                              <i className="bi bi-pencil-square"></i>
                            </Button>
                            <Button
                              variant="outline-secondary"
                              size="sm"
                              title="Xem hồ sơ ngựa"
                              onClick={() => navigate(`/veterinarian/horses/${horse?._id}`)}
                            >
                              <i className="bi bi-eye"></i>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Quick Status Update Modal */}
      <Modal show={showStatusModal} onHide={() => setShowStatusModal(false)} centered>
        <Form onSubmit={handleUpdateStatus}>
          <Modal.Header closeButton={!updating}>
            <Modal.Title className="fs-5">Cập Nhật Tiến Độ Chấn Thương</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="mb-3">
              <div className="fw-bold">Vị trí tổn thương: <span className="text-danger">{selectedInjury?.bodyPart}</span></div>
              <div className="small text-muted">Mức độ: <strong>{selectedInjury?.severity}</strong></div>
            </div>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Tiến độ hồi phục</Form.Label>
              <Form.Select
                value={newRecoveryStatus}
                onChange={(e) => setNewRecoveryStatus(e.target.value)}
                disabled={updating}
              >
                <option value="new">Mới phát hiện</option>
                <option value="in_treatment">Đang điều trị</option>
                <option value="recovering">Đang hồi phục</option>
                <option value="recovered">Đã bình phục hoàn toàn</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Ghi chú theo dõi mới</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Cập nhật tình trạng vết sưng, phản ứng đi lại của ngựa..."
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                disabled={updating}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowStatusModal(false)} disabled={updating}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={updating}>
              {updating ? <Spinner animation="border" size="sm" /> : 'Lưu cập nhật'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
