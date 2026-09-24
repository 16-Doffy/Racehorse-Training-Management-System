import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, InputGroup, Button, Table, Badge, Modal, Spinner, Alert } from 'react-bootstrap';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import EmptyState from '../../components/common/EmptyState';
import { formatDate } from '../../utils/formatDate';

export default function MedicalInventoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Restock modal state
  const [selectedItem, setSelectedItem] = useState(null);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [quantity, setQuantity] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await veterinarianApi.getInventory();
      setInventory(res.data || []);
    } catch (err) {
      setError(err?.message || 'Không thể tải danh mục kho vật tư.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenRestock = (item) => {
    setSelectedItem(item);
    setQuantity(10);
    setShowRestockModal(true);
  };

  const handleSendRestockRequest = async (e) => {
    e.preventDefault();
    if (!selectedItem || quantity <= 0) return;

    setSubmitting(true);
    setError(null);
    try {
      await veterinarianApi.requestRestock(selectedItem._id, Number(quantity));
      setSuccessMsg(`Đã gửi đề xuất bổ sung ${quantity} ${selectedItem.unit} cho ${selectedItem.name} tới Ban Quản Lý.`);
      setShowRestockModal(false);
      fetchData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err?.message || 'Lỗi khi gửi yêu cầu nhập kho.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = inventory.filter((item) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      item.name?.toLowerCase().includes(q) ||
      item.stableBlock?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q);

    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return <LoadingSpinner text="Đang tải dữ liệu kho vật tư y tế..." minHeight="400px" />;
  }

  return (
    <Container fluid className="p-0">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 pb-2 border-bottom gap-2">
        <div>
          <h2 className="fw-bold text-dark mb-1">
            <i className="bi bi-box-seam me-2 text-primary"></i>
            Kho Vật Tư Y Tế & Dược Phẩm (Medical Supplies & Restock)
          </h2>
          <p className="text-muted mb-0 small">
            Theo dõi tồn kho thuốc, băng gạc, thiết bị y tế và gửi đề xuất nhập kho bổ sung cho Ban Quản Lý.
          </p>
        </div>

        <Button variant="outline-primary" size="sm" onClick={fetchData}>
          <i className="bi bi-arrow-clockwise me-1"></i> Làm mới
        </Button>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchData} />}
      {successMsg && (
        <Alert variant="success" dismissible onClose={() => setSuccessMsg(null)}>
          <i className="bi bi-check-circle-fill me-2"></i> {successMsg}
        </Alert>
      )}

      {/* Search & Category Filter Bar */}
      <Card className="border-0 shadow-sm mb-4 bg-white">
        <Card.Body className="p-3">
          <Row className="g-3 align-items-center">
            <Col xs={12} md={6}>
              <InputGroup>
                <InputGroup.Text className="bg-light">
                  <i className="bi bi-search text-muted"></i>
                </InputGroup.Text>
                <Form.Control
                  placeholder="Tìm tên thuốc, vật tư y tế, khu vực..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </Col>

            <Col xs={12} md={4}>
              <Form.Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">Tất cả phân loại kho</option>
                <option value="medicine">💊 Thuốc & Dược phẩm (Medicine)</option>
                <option value="equipment">🩺 Dụng cụ & Băng gạc (Equipment)</option>
                <option value="feed">🌾 Thức ăn & Bổ sung (Feed)</option>
              </Form.Select>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Inventory Table */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon="bi-box-seam"
          title="Không tìm thấy vật tư phù hợp"
          message="Không có vật tư y tế nào khớp với từ khóa tìm kiếm hoặc danh mục đã chọn."
        />
      ) : (
        <Card className="border-0 shadow-sm bg-white">
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Tên vật tư / Dược phẩm</th>
                    <th>Phân loại</th>
                    <th>Tồn kho hiện tại</th>
                    <th>Khu vực lưu trữ</th>
                    <th>Yêu cầu bổ sung gần nhất</th>
                    <th className="text-center" style={{ width: '160px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const isLow = item.quantity <= 5;
                    const pendingRequest = (item.restockRequests || []).find((r) => r.status === 'pending');

                    return (
                      <tr key={item._id}>
                        <td>
                          <div className="fw-bold text-dark">{item.name}</div>
                          <small className="text-muted">Mã: #{item._id.slice(-6).toUpperCase()}</small>
                        </td>
                        <td>
                          <Badge
                            bg={
                              item.category === 'medicine'
                                ? 'danger'
                                : item.category === 'equipment'
                                ? 'info'
                                : 'secondary'
                            }
                            pill
                          >
                            {item.category === 'medicine'
                              ? '💊 Dược phẩm'
                              : item.category === 'equipment'
                              ? '🩺 Dụng cụ y tế'
                              : item.category}
                          </Badge>
                        </td>
                        <td>
                          <span className={`fw-bold fs-6 ${isLow ? 'text-danger' : 'text-success'}`}>
                            {item.quantity} {item.unit}
                          </span>
                          {isLow && (
                            <Badge bg="warning" text="dark" className="ms-2">
                              ⚠️ Sắp hết
                            </Badge>
                          )}
                        </td>
                        <td>{item.stableBlock || 'Kho trung tâm'}</td>
                        <td>
                          {pendingRequest ? (
                            <Badge bg="warning" text="dark">
                              ⏳ Đang chờ duyệt: +{pendingRequest.quantity} {item.unit}
                            </Badge>
                          ) : (
                            <span className="text-muted small">Chưa có đề xuất</span>
                          )}
                        </td>
                        <td className="text-center">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleOpenRestock(item)}
                            title="Đề xuất nhập thêm vật tư này"
                          >
                            <i className="bi bi-cart-plus me-1"></i> Đề xuất bổ sung
                          </Button>
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

      {/* Restock Modal */}
      <Modal show={showRestockModal} onHide={() => setShowRestockModal(false)} centered>
        <Form onSubmit={handleSendRestockRequest}>
          <Modal.Header closeButton={!submitting}>
            <Modal.Title className="fs-5">
              <i className="bi bi-cart-plus me-2 text-primary"></i>
              Đề Xuất Nhập Thêm Vật Tư Y Tế
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedItem && (
              <>
                <div className="mb-3 p-3 bg-light rounded">
                  <div className="fw-bold text-dark">{selectedItem.name}</div>
                  <div className="small text-muted">Tồn kho hiện tại: {selectedItem.quantity} {selectedItem.unit}</div>
                  <div className="small text-muted">Khu vực: {selectedItem.stableBlock || 'Kho trung tâm'}</div>
                </div>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">
                    Số lượng đề xuất bổ sung ({selectedItem.unit}) <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                    disabled={submitting}
                  />
                  <Form.Text className="text-muted">
                    Yêu cầu sẽ được gửi tới Ban Quản Lý (Manager) để phê duyệt và thực hiện cộng tồn kho.
                  </Form.Text>
                </Form.Group>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowRestockModal(false)} disabled={submitting}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? <Spinner animation="border" size="sm" /> : 'Gửi Đề Xuất'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
