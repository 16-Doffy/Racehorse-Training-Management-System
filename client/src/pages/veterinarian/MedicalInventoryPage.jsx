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

  // Restock modal state (cho món đã có)
  const [selectedItem, setSelectedItem] = useState(null);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [quantity, setQuantity] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  // Propose New Item modal state (cho món thuốc mới hoàn toàn)
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [newItemData, setNewItemData] = useState({
    name: '',
    category: 'medicine',
    unit: 'lọ',
    quantity: 10,
    stableBlock: 'Phòng Y Tế',
    note: '',
  });
  const [submittingNewItem, setSubmittingNewItem] = useState(false);
  const [newItemError, setNewItemError] = useState(null);

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

  const handleProposeNewItem = async (e) => {
    e.preventDefault();
    if (!newItemData.name.trim()) {
      setNewItemError('Vui lòng nhập tên thuốc / dược phẩm mới.');
      return;
    }
    if (!newItemData.unit.trim()) {
      setNewItemError('Vui lòng nhập đơn vị tính.');
      return;
    }
    if (!newItemData.quantity || Number(newItemData.quantity) <= 0) {
      setNewItemError('Số lượng đề xuất phải lớn hơn 0.');
      return;
    }

    setSubmittingNewItem(true);
    setNewItemError(null);
    try {
      await veterinarianApi.proposeItem({
        name: newItemData.name.trim(),
        category: newItemData.category,
        unit: newItemData.unit.trim(),
        quantity: Number(newItemData.quantity),
        stableBlock: newItemData.stableBlock?.trim() || undefined,
        note: newItemData.note?.trim() || undefined,
      });
      setSuccessMsg(
        `Đã gửi đề xuất món thuốc mới "${newItemData.name.trim()}" (${newItemData.quantity} ${newItemData.unit}) tới Ban Quản Lý!`
      );
      setShowNewItemModal(false);
      setNewItemData({
        name: '',
        category: 'medicine',
        unit: 'lọ',
        quantity: 10,
        stableBlock: 'Phòng Y Tế',
        note: '',
      });
      fetchData();
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setNewItemError(err?.response?.data?.message || err?.message || 'Lỗi khi gửi đề xuất vật tư mới.');
    } finally {
      setSubmittingNewItem(false);
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

        <div className="d-flex gap-2">
          <Button variant="primary" size="sm" onClick={() => setShowNewItemModal(true)}>
            <i className="bi bi-plus-circle me-1"></i> Đề xuất thuốc / vật tư mới
          </Button>
          <Button variant="outline-primary" size="sm" onClick={fetchData}>
            <i className="bi bi-arrow-clockwise me-1"></i> Làm mới
          </Button>
        </div>
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

      {/* Propose Brand New Medicine / Supply Modal (POST /inventory/proposals) */}
      <Modal show={showNewItemModal} onHide={() => setShowNewItemModal(false)} centered size="lg">
        <Form onSubmit={handleProposeNewItem}>
          <Modal.Header closeButton={!submittingNewItem}>
            <Modal.Title className="fs-5">
              <i className="bi bi-capsule-pill me-2 text-primary"></i>
              Đề Xuất Món Thuốc / Dược Phẩm Mới (Chưa có trong danh mục)
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {newItemError && <Alert variant="danger">{newItemError}</Alert>}

            <Alert variant="info" className="small mb-3">
              <i className="bi bi-info-circle-fill me-1"></i>
              Món thuốc hoặc vật tư y tế mới chưa có trong danh mục kho sẽ được gửi tới Ban Quản Lý (Manager). Sau khi Ban Quản Lý phê duyệt, món thuốc sẽ được thêm vào kho và sẵn sàng để kê đơn.
            </Alert>

            <Row className="g-3">
              <Col xs={12} md={8}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Tên thuốc / Dược phẩm mới <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Ví dụ: Dexamethasone 2mg/ml, Banamine Injectable, Gel hạ nhiệt cơ..."
                    value={newItemData.name}
                    onChange={(e) => setNewItemData({ ...newItemData, name: e.target.value })}
                    required
                    disabled={submittingNewItem}
                  />
                </Form.Group>
              </Col>

              <Col xs={12} md={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Danh mục <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    value={newItemData.category}
                    onChange={(e) => setNewItemData({ ...newItemData, category: e.target.value })}
                    disabled={submittingNewItem}
                  >
                    <option value="medicine">💊 Thuốc / Dược phẩm (Medicine)</option>
                    <option value="equipment">🩺 Vật tư / Y cụ (Equipment)</option>
                    <option value="feed">🌾 Dinh dưỡng bổ sung (Feed)</option>
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col xs={12} md={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Đơn vị tính <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="lọ, chai, ống, viên, hộp, tuýp, ml, kg..."
                    value={newItemData.unit}
                    onChange={(e) => setNewItemData({ ...newItemData, unit: e.target.value })}
                    required
                    disabled={submittingNewItem}
                  />
                </Form.Group>
              </Col>

              <Col xs={12} md={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Số lượng đề xuất ban đầu <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    value={newItemData.quantity}
                    onChange={(e) => setNewItemData({ ...newItemData, quantity: e.target.value })}
                    required
                    disabled={submittingNewItem}
                  />
                </Form.Group>
              </Col>

              <Col xs={12} md={4}>
                <Form.Group>
                  <Form.Label className="fw-semibold">Khu vực lưu trữ dự kiến</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="VD: Phòng Y Tế, Tủ Thuốc Khu A..."
                    value={newItemData.stableBlock}
                    onChange={(e) => setNewItemData({ ...newItemData, stableBlock: e.target.value })}
                    disabled={submittingNewItem}
                  />
                </Form.Group>
              </Col>

              <Col xs={12}>
                <Form.Group>
                  <Form.Label className="fw-semibold">
                    Ghi chú / Chỉ định lâm sàng cần dùng thuốc này
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    placeholder="Nêu rõ mục đích điều trị, bệnh lý cần áp dụng hoặc phác đồ yêu cầu..."
                    value={newItemData.note}
                    onChange={(e) => setNewItemData({ ...newItemData, note: e.target.value })}
                    disabled={submittingNewItem}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowNewItemModal(false)} disabled={submittingNewItem}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={submittingNewItem}>
              {submittingNewItem ? (
                <>
                  <Spinner animation="border" size="sm" className="me-1" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <i className="bi bi-send-fill me-1"></i> Gửi Đề Xuất Cho Quản Lý
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
