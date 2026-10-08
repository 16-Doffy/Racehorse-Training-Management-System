import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Table, Badge, Spinner, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import veterinarianApi from '../../api/veterinarianApi';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import EmptyState from '../../components/common/EmptyState';
import { formatDate, formatDateForInput } from '../../utils/formatDate';

const createEmptyMedication = () => ({
  inventoryItem: '',
  name: '',
  dosage: '',
  amount: '',
  unit: '',
  timeSlots: {
    morning: true,
    noon: false,
    afternoon: true,
    evening: false,
  },
  slotTimes: {
    morning: '08:00',
    noon: '12:00',
    afternoon: '16:00',
    evening: '20:00',
  },
  specificTimes: '',
  startDate: formatDateForInput(new Date()),
  endDate: '',
  instructions: '',
});

export default function PrescriptionForm() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [horses, setHorses] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);

  // Proposal modal state
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState(null);
  const [proposalData, setProposalData] = useState({
    name: '',
    category: 'medicine',
    unit: 'viên',
    quantity: 20,
    note: '',
  });

  // Form states
  const [selectedHorse, setSelectedHorse] = useState('');
  const [careInstructions, setCareInstructions] = useState('');
  const [medications, setMedications] = useState([createEmptyMedication()]);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'inactive' | 'all'
  const [horseFilterId, setHorseFilterId] = useState('all');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [horsesRes, treatmentsRes, inventoryRes] = await Promise.all([
        veterinarianApi.getHorses(),
        veterinarianApi.getTreatments(),
        veterinarianApi.getInventory(),
      ]);
      setHorses(horsesRes.data || []);
      setTreatments(treatmentsRes.data || []);
      const allInv = inventoryRes.data || [];
      setInventoryItems(
        allInv.filter((item) => item.category === 'medicine' && item.isActive !== false)
      );
    } catch (err) {
      setError(err?.message || 'Không thể tải dữ liệu đơn thuốc.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddMedication = () => {
    setMedications((prev) => [...prev, createEmptyMedication()]);
  };

  const handleRemoveMedication = (index) => {
    setMedications((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMedChange = (index, field, value) => {
    setMedications((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleTimeSlotToggle = (index, slot) => {
    setMedications((prev) => {
      const updated = [...prev];
      const currentSlots = { ...updated[index].timeSlots };
      currentSlots[slot] = !currentSlots[slot];
      updated[index] = {
        ...updated[index],
        timeSlots: currentSlots,
      };
      return updated;
    });
  };

  const handleSlotTimeChange = (index, slot, value) => {
    setMedications((prev) => {
      const updated = [...prev];
      const currentSlotTimes = {
        ...(updated[index].slotTimes || { morning: '08:00', noon: '12:00', afternoon: '16:00', evening: '20:00' }),
      };
      currentSlotTimes[slot] = value;
      updated[index] = {
        ...updated[index],
        slotTimes: currentSlotTimes,
      };
      return updated;
    });
  };

  const handleProposeMedicine = async (e) => {
    e.preventDefault();
    if (!proposalData.name.trim()) {
      setProposeError('Vui lòng nhập tên thuốc đề xuất.');
      return;
    }
    setProposing(true);
    setProposeError(null);
    try {
      await veterinarianApi.proposeItem({
        name: proposalData.name.trim(),
        category: 'medicine',
        unit: proposalData.unit.trim() || 'viên',
        quantity: Number(proposalData.quantity) || 1,
        note: proposalData.note?.trim() || undefined,
      });
      setShowProposeModal(false);
      setProposalData({ name: '', category: 'medicine', unit: 'viên', quantity: 20, note: '' });
      // Reload inventory
      const invRes = await veterinarianApi.getInventory();
      const allInv = invRes.data || [];
      setInventoryItems(
        allInv.filter((item) => item.category === 'medicine' && item.isActive !== false)
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setProposeError(err?.response?.data?.message || err?.message || 'Lỗi khi gửi đề xuất thuốc mới.');
    } finally {
      setProposing(false);
    }
  };

  const handleSelectInventoryItem = (index, itemId) => {
    const item = inventoryItems.find((i) => i._id === itemId);
    setMedications((prev) => {
      const updated = [...prev];
      if (item) {
        const amt = updated[index].amount || 1;
        updated[index] = {
          ...updated[index],
          inventoryItem: item._id,
          name: item.name,
          unit: item.unit,
          amount: amt,
          dosage: `${amt} ${item.unit}/lần`,
        };
      } else {
        updated[index] = {
          ...updated[index],
          inventoryItem: '',
          unit: '',
        };
      }
      return updated;
    });
  };

  const handleCreatePrescription = async (e) => {
    e.preventDefault();
    if (!selectedHorse) {
      setError('Vui lòng chọn chiến mã.');
      return;
    }

    const validMeds = medications.filter((m) => m.name.trim() && m.dosage.trim());
    if (validMeds.length === 0) {
      setError('Vui lòng nhập tên thuốc và liều lượng cho ít nhất 1 loại thuốc.');
      return;
    }

    const itemMissingAmount = validMeds.find(
      (m) => m.inventoryItem && (!m.amount || Number(m.amount) <= 0)
    );
    if (itemMissingAmount) {
      setError(`Thuốc "${itemMissingAmount.name}" chọn từ kho cần nhập lượng mỗi liều (> 0) để tự trừ kho.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const medicationsPayload = validMeds.map((m) => {
        const slots = [];
        const slotLabels = [];
        const timesList = [];

        if (m.timeSlots?.morning) {
          slots.push('morning');
          const t = m.slotTimes?.morning || '08:00';
          slotLabels.push(`Sáng (${t})`);
          timesList.push(t);
        }
        if (m.timeSlots?.noon) {
          slots.push('noon');
          const t = m.slotTimes?.noon || '12:00';
          slotLabels.push(`Trưa (${t})`);
          timesList.push(t);
        }
        if (m.timeSlots?.afternoon) {
          slots.push('afternoon');
          const t = m.slotTimes?.afternoon || '16:00';
          slotLabels.push(`Chiều (${t})`);
          timesList.push(t);
        }
        if (m.timeSlots?.evening) {
          slots.push('evening');
          const t = m.slotTimes?.evening || '20:00';
          slotLabels.push(`Tối (${t})`);
          timesList.push(t);
        }

        const effectiveSpecificTimes = timesList.length > 0
          ? timesList.join(', ')
          : (m.specificTimes?.trim() || '');

        const freqParts = [];
        if (slotLabels.length) freqParts.push(`Buổi: ${slotLabels.join(', ')}`);
        if (effectiveSpecificTimes) freqParts.push(`Giờ: ${effectiveSpecificTimes}`);

        const itemObj = {
          name: m.name.trim(),
          dosage: m.dosage.trim(),
          timeSlots: slots,
          times: timesList.length > 0 ? timesList : undefined,
          specificTimes: effectiveSpecificTimes,
          frequency: freqParts.join(' - ') || 'Theo chỉ dẫn',
          startDate: m.startDate ? new Date(m.startDate) : new Date(),
          endDate: m.endDate ? new Date(m.endDate) : undefined,
          instructions: m.instructions?.trim() || '',
        };

        if (m.inventoryItem) {
          itemObj.inventoryItem = m.inventoryItem;
          itemObj.amount = Number(m.amount);
        }

        if (effectiveSpecificTimes) {
          const parsedTimes = effectiveSpecificTimes
            .split(/[,;\s]+/)
            .map((t) => t.trim())
            .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
          if (parsedTimes.length > 0) {
            itemObj.times = parsedTimes;
          }
        }

        itemObj.prescribedAt = new Date().toISOString();
        itemObj.status = 'ongoing';
        return itemObj;
      });

      // Calculate max endDate across all medications
      let maxEndDate = null;
      medicationsPayload.forEach((m) => {
        if (m.endDate) {
          if (!maxEndDate || m.endDate > maxEndDate) {
            maxEndDate = m.endDate;
          }
        }
      });

      // Mỗi lần kê đơn mới sẽ tạo một đơn thuốc độc lập, không gộp đè làm thay đổi thời hạn của đơn cũ
      const firstMedName = medicationsPayload[0]?.name || 'Thuốc';
      const rec = await veterinarianApi.createHealthRecord({
        horse: selectedHorse,
        diagnosis: `Kê đơn thuốc (${medicationsPayload.length} loại): ${firstMedName}`,
        resultStatus: 'monitoring',
      });

      await veterinarianApi.createTreatment({
        horse: selectedHorse,
        healthRecord: rec.data?._id,
        startDate: medicationsPayload[0]?.startDate || new Date(),
        endDate: maxEndDate || undefined,
        status: 'ongoing',
        medications: medicationsPayload,
        careInstructions: careInstructions.trim() || undefined,
      });

      setSuccess('Kê đơn thuốc thành công cho chiến mã! Lịch uống thuốc đã được tự động đồng bộ sang lịch chăm sóc hàng ngày của Groom.');
      setSelectedHorse('');
      setCareInstructions('');
      setMedications([createEmptyMedication()]);
      fetchData();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err?.message || 'Lỗi khi lưu đơn thuốc.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStopMedication = async (treatmentId, medIndex) => {
    const treatment = treatments.find((t) => t._id === treatmentId);
    if (!treatment) return;
    if (!window.confirm('Bạn có chắc chắn muốn DỪNG cấp phát loại thuốc này không?')) return;
    setActionLoading(true);
    try {
      const updatedMeds = [...(treatment.medications || [])];
      if (updatedMeds[medIndex]) {
        updatedMeds[medIndex] = {
          ...updatedMeds[medIndex],
          status: 'completed',
        };
      }
      const allCompleted = updatedMeds.every((m) => m.status === 'completed');
      await veterinarianApi.updateTreatment(treatmentId, {
        medications: updatedMeds,
        status: allCompleted ? 'completed' : treatment.status,
      });
      setSuccess('Đã dừng cấp phát thuốc thành công.');
      await fetchData();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err?.message || 'Lỗi khi dừng thuốc.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMedication = async (treatmentId, medIndex) => {
    const treatment = treatments.find((t) => t._id === treatmentId);
    if (!treatment) return;
    if (!window.confirm('Bạn có chắc muốn XÓA loại thuốc này khỏi danh sách? Tồn kho (nếu đã trừ) sẽ tự động được hoàn lại.')) return;
    setActionLoading(true);
    try {
      const updatedMeds = (treatment.medications || []).filter((_, i) => i !== medIndex);
      await veterinarianApi.updateTreatment(treatmentId, {
        medications: updatedMeds,
        status: updatedMeds.length === 0 ? 'completed' : treatment.status,
      });
      setSuccess('Đã xóa thuốc khỏi danh sách và hoàn lại tồn kho thành công.');
      await fetchData();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err?.message || 'Lỗi khi xóa thuốc.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Đang tải danh mục thuốc & đơn thuốc..." minHeight="400px" />;
  }

  // Flatten active prescriptions list for right panel table
  const allPrescriptions = [];
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  treatments.forEach((t) => {
    const horse = t.horse;
    (t.medications || []).forEach((m, idx) => {
      // 1. Chuẩn hóa timeSlots: nếu chưa có m.timeSlots nhưng frequency chứa Sáng/Trưa/Chiều/Tối
      let slots = Array.isArray(m.timeSlots) && m.timeSlots.length > 0 ? [...m.timeSlots] : [];
      if (slots.length === 0 && m.frequency) {
        const fLower = m.frequency.toLowerCase();
        if (fLower.includes('sáng')) slots.push('morning');
        if (fLower.includes('trưa')) slots.push('noon');
        if (fLower.includes('chiều')) slots.push('afternoon');
        if (fLower.includes('tối')) slots.push('evening');
      }

      // 2. Chuẩn hóa specificTimes: nếu chưa có, trích xuất từ times hoặc frequency
      let timesDisplay = m.specificTimes || '';
      if (!timesDisplay && Array.isArray(m.times) && m.times.length > 0) {
        timesDisplay = m.times.join(', ');
      } else if (!timesDisplay && m.frequency && m.frequency.includes('Giờ:')) {
        const match = m.frequency.match(/Giờ:\s*([0-9:,\s]+)/);
        if (match && match[1]) {
          timesDisplay = match[1].trim();
        }
      }

      // 3. Trạng thái thực tế:
      const medStatus = m.status || 'ongoing';
      const isStopped = t.status === 'completed' || medStatus === 'completed' || medStatus === 'cancelled';
      const endTimestamp = m.endDate ? new Date(m.endDate).getTime() : (t.endDate ? new Date(t.endDate).getTime() : null);
      const isExpired = !isStopped && endTimestamp && endTimestamp < todayEnd;

      let displayStatus = 'ongoing';
      let statusLabel = 'Đang dùng';
      let statusBadge = 'primary';

      if (isStopped) {
        displayStatus = 'completed';
        statusLabel = 'Đã dừng';
        statusBadge = 'secondary';
      } else if (isExpired) {
        displayStatus = 'expired';
        statusLabel = 'Hết hạn';
        statusBadge = 'warning';
      }

      // 4. Thời gian kê để sắp xếp: ưu tiên m.prescribedAt, rồi m.startDate hoặc updatedAt/createdAt
      const prescribedTime = new Date(m.prescribedAt || m.startDate || t.updatedAt || t.createdAt || 0).getTime();
      const sortScore = prescribedTime - idx * 1000;

      allPrescriptions.push({
        id: `${t._id}-${idx}`,
        treatmentId: t._id,
        medIndex: idx,
        sortScore,
        createdAt: prescribedTime,
        orderDate: prescribedTime,
        horseName: horse?.name || 'Ngựa',
        horseId: horse?._id || horse,
        medicine: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        timeSlots: slots,
        specificTimes: timesDisplay,
        instructions: m.instructions || '',
        startDate: m.startDate || t.startDate,
        endDate: m.endDate || t.endDate,
        status: t.status,
        medStatus,
        displayStatus,
        statusLabel,
        statusBadge,
        isOngoing: displayStatus === 'ongoing',
      });
    });
  });

  // Sắp xếp đơn mới kê lên trên cùng (Top):
  allPrescriptions.sort((a, b) => {
    // 1. Ưu tiên đơn đang dùng (ongoing)
    if (b.isOngoing !== a.isOngoing) {
      return (b.isOngoing ? 1 : 0) - (a.isOngoing ? 1 : 0);
    }
    // 2. Đơn mới kê gần nhất PHẢI nằm trên đầu
    if (b.sortScore !== a.sortScore) {
      return b.sortScore - a.sortScore;
    }
    // 3. Fallback theo ngày bắt đầu
    const startB = new Date(b.startDate || 0).getTime();
    const startA = new Date(a.startDate || 0).getTime();
    if (startB !== startA) {
      return startB - startA;
    }
    return String(b.id).localeCompare(String(a.id));
  });

  const activeCount = allPrescriptions.filter((p) => p.isOngoing).length;
  const inactiveCount = allPrescriptions.filter((p) => !p.isOngoing).length;
  const totalCount = allPrescriptions.length;

  const filteredPrescriptions = allPrescriptions.filter((p) => {
    if (horseFilterId !== 'all' && String(p.horseId) !== String(horseFilterId)) {
      return false;
    }
    if (activeTab === 'active') {
      return p.isOngoing;
    }
    if (activeTab === 'inactive') {
      return !p.isOngoing;
    }
    return true;
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
            Kê đơn dược phẩm điều trị đa chủng loại, thiết lập lịch uống thuốc sáng/chiều và chỉ định chi tiết cho chiến mã.
          </p>
        </div>

        <Button variant="outline-primary" size="sm" onClick={fetchData}>
          <i className="bi bi-arrow-clockwise me-1"></i> Làm mới
        </Button>
      </div>

      {error && <ErrorAlert message={error} onRetry={() => setError(null)} />}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess(false)}>
          <i className="bi bi-check-circle-fill me-2"></i> Kê đơn thuốc thành công cho chiến mã! Lịch uống thuốc đã được tự động đồng bộ sang lịch chăm sóc hàng ngày của Groom.
        </Alert>
      )}

      <Row className="g-4">
        {/* Left Col: Prescription Form */}
        <Col xs={12} lg={6}>
          <Card className="border-0 shadow-sm bg-white h-100">
            <Card.Header className="bg-white py-3 border-0 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">
                <i className="bi bi-plus-circle-fill me-2 text-primary"></i>
                Kê Đơn Thuốc Mới
              </h5>
              <Badge bg="primary-subtle" text="primary" className="fw-normal px-2 py-1">
                Kê được nhiều loại thuốc
              </Badge>
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleCreatePrescription}>
                {/* Horse Selection */}
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
                    <option value="">-- Chọn chiến mã kê đơn --</option>
                    {horses.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name} (#{h._id.slice(-6).toUpperCase()})
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>

                {/* Care Instructions / General Note */}
                <Form.Group className="mb-4">
                  <Form.Label className="fw-semibold">Ghi chú & Chỉ dẫn chăm sóc chung cho Groom</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    placeholder="Ví dụ: Theo dõi nhiệt độ sau khi cho uống thuốc, nghỉ ngơi nhẹ tại chuồng..."
                    value={careInstructions}
                    onChange={(e) => setCareInstructions(e.target.value)}
                    disabled={submitting}
                  />
                </Form.Group>

                {/* Medications List */}
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="fw-bold text-dark mb-0">
                    <i className="bi bi-capsule me-1 text-primary"></i>
                    Danh Sách Thuốc Kê Đơn ({medications.length})
                  </h6>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={handleAddMedication}
                    disabled={submitting}
                  >
                    <i className="bi bi-plus-circle me-1"></i> Thêm loại thuốc
                  </Button>
                </div>

                {medications.map((med, index) => (
                  <Card key={index} className="mb-3 border bg-light-subtle">
                    <Card.Body className="p-3">
                      <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                        <span className="badge bg-primary">Thuốc #{index + 1}</span>
                        {medications.length > 1 && (
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

                      {/* Inventory Item Selection */}
                      <Form.Group className="mb-2">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <Form.Label className="small fw-semibold mb-0">
                            <i className="bi bi-box-seam me-1 text-primary"></i>
                            Chọn thuốc từ kho (để tự động trừ kho khi thực hiện):
                          </Form.Label>
                          <div className="d-flex align-items-center gap-2">
                            {med.inventoryItem && (
                              <Badge bg="success-subtle" text="success" className="border border-success-subtle">
                                <i className="bi bi-check-circle me-1"></i>Đã liên kết kho
                              </Badge>
                            )}
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 text-decoration-none small text-primary"
                              onClick={() => setShowProposeModal(true)}
                              type="button"
                              title="Đề xuất loại thuốc mới chưa có trong danh mục kho"
                            >
                              <i className="bi bi-plus-circle me-1"></i>Đề xuất thuốc mới
                            </Button>
                          </div>
                        </div>
                        <Form.Select
                          size="sm"
                          value={med.inventoryItem || ''}
                          onChange={(e) => handleSelectInventoryItem(index, e.target.value)}
                          disabled={submitting}
                        >
                          <option value="">-- Nhập thủ công (không liên kết kho) --</option>
                          {inventoryItems.map((item) => (
                            <option key={item._id} value={item._id}>
                              {item.name} — còn {item.quantity} {item.unit}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>

                      {/* Medicine Name, Amount per dose & Dosage */}
                      <Row className="g-2 mb-2">
                        <Col xs={12} md={med.inventoryItem ? 5 : 7}>
                          <Form.Group>
                            <Form.Label className="small fw-semibold mb-1 text-nowrap d-block" style={{ minHeight: '22px' }}>
                              Tên thuốc / Dược phẩm <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              size="sm"
                              placeholder="Ví dụ: Phenylbutazone 20%, Banamine..."
                              value={med.name}
                              onChange={(e) => handleMedChange(index, 'name', e.target.value)}
                              required
                              disabled={submitting}
                            />
                          </Form.Group>
                        </Col>

                        {med.inventoryItem && (
                          <Col xs={12} md={3}>
                            <Form.Group>
                              <Form.Label className="small fw-semibold mb-1 text-primary text-nowrap d-block" style={{ minHeight: '22px' }} title="Số lượng trừ kho cho mỗi lần dùng">
                                Lượng trừ kho <span className="text-danger">*</span>
                              </Form.Label>
                              <div className="input-group input-group-sm">
                                <Form.Control
                                  type="number"
                                  min="0.01"
                                  step="any"
                                  placeholder="VD: 1"
                                  value={med.amount || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleMedChange(index, 'amount', val);
                                    if (val && med.unit) {
                                      handleMedChange(index, 'dosage', `${val} ${med.unit}/lần`);
                                    }
                                  }}
                                  required
                                  disabled={submitting}
                                />
                                <span className="input-group-text">{med.unit || 'đv'}</span>
                              </div>
                              {med.inventoryItem && med.amount > 0 && (() => {
                                const amt = Number(med.amount);
                                const slotsCount = Object.values(med.timeSlots || {}).filter(Boolean).length || 1;
                                let days = 1;
                                if (med.startDate && med.endDate) {
                                  const s = new Date(med.startDate);
                                  const e = new Date(med.endDate);
                                  s.setHours(0, 0, 0, 0);
                                  e.setHours(0, 0, 0, 0);
                                  const diff = Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1;
                                  if (diff > 0) days = diff;
                                }
                                const totalDeduct = days * slotsCount * amt;
                                return (
                                  <div className="small text-primary fw-medium mt-1" style={{ fontSize: '11px' }}>
                                    <i className="bi bi-box-arrow-right me-1"></i>
                                    Dự kiến dùng: <strong>{totalDeduct} {med.unit}</strong> ({days} ngày × {slotsCount} lần × {med.amount} {med.unit} — Groom trừ kho khi cấp phát)
                                  </div>
                                );
                              })()}
                            </Form.Group>
                          </Col>
                        )}

                        <Col xs={12} md={med.inventoryItem ? 4 : 5}>
                          <Form.Group>
                            <Form.Label className="small fw-semibold mb-1 text-nowrap d-block" style={{ minHeight: '22px' }}>
                              Liều lượng <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              size="sm"
                              placeholder="Ví dụ: 10ml, 2g, 1 viên..."
                              value={med.dosage}
                              onChange={(e) => handleMedChange(index, 'dosage', e.target.value)}
                              required
                              disabled={submitting}
                            />
                          </Form.Group>
                        </Col>
                      </Row>

                      {/* Time Slots: Morning, Noon, Afternoon, Evening */}
                      <Form.Group className="mb-2">
                        <Form.Label className="small fw-semibold mb-1 d-block">
                          Lịch uống thuốc trong ngày (Sáng / Chiều):
                        </Form.Label>
                        <div className="d-flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={med.timeSlots.morning ? 'warning' : 'outline-secondary'}
                            className={med.timeSlots.morning ? 'fw-bold' : ''}
                            onClick={() => handleTimeSlotToggle(index, 'morning')}
                            type="button"
                            disabled={submitting}
                          >
                            🌅 Sáng ({med.slotTimes?.morning || '08:00'})
                          </Button>
                          <Button
                            size="sm"
                            variant={med.timeSlots.noon ? 'info' : 'outline-secondary'}
                            className={med.timeSlots.noon ? 'fw-bold text-white' : ''}
                            onClick={() => handleTimeSlotToggle(index, 'noon')}
                            type="button"
                            disabled={submitting}
                          >
                            ☀️ Trưa ({med.slotTimes?.noon || '12:00'})
                          </Button>
                          <Button
                            size="sm"
                            variant={med.timeSlots.afternoon ? 'primary' : 'outline-secondary'}
                            className={med.timeSlots.afternoon ? 'fw-bold' : ''}
                            onClick={() => handleTimeSlotToggle(index, 'afternoon')}
                            type="button"
                            disabled={submitting}
                          >
                            🌇 Chiều ({med.slotTimes?.afternoon || '16:00'})
                          </Button>
                          <Button
                            size="sm"
                            variant={med.timeSlots.evening ? 'dark' : 'outline-secondary'}
                            className={med.timeSlots.evening ? 'fw-bold' : ''}
                            onClick={() => handleTimeSlotToggle(index, 'evening')}
                            type="button"
                            disabled={submitting}
                          >
                            🌙 Tối ({med.slotTimes?.evening || '20:00'})
                          </Button>
                        </div>

                        {/* Chọn giờ uống cụ thể cho các buổi đã chọn */}
                        {med.timeSlots && Object.values(med.timeSlots).some(Boolean) && (
                          <div className="p-2 border rounded bg-light mt-2">
                            <div className="small fw-semibold text-muted mb-2">
                              <i className="bi bi-clock me-1 text-primary"></i> Chọn giờ uống cho từng buổi:
                            </div>
                            <div className="d-flex flex-wrap gap-3">
                              {med.timeSlots.morning && (
                                <div className="d-flex align-items-center gap-1">
                                  <span className="small fw-semibold text-warning-emphasis">🌅 Sáng:</span>
                                  <Form.Control
                                    type="time"
                                    size="sm"
                                    style={{ width: '110px' }}
                                    value={med.slotTimes?.morning || '08:00'}
                                    onChange={(e) => handleSlotTimeChange(index, 'morning', e.target.value)}
                                    disabled={submitting}
                                  />
                                </div>
                              )}
                              {med.timeSlots.noon && (
                                <div className="d-flex align-items-center gap-1">
                                  <span className="small fw-semibold text-info">☀️ Trưa:</span>
                                  <Form.Control
                                    type="time"
                                    size="sm"
                                    style={{ width: '110px' }}
                                    value={med.slotTimes?.noon || '12:00'}
                                    onChange={(e) => handleSlotTimeChange(index, 'noon', e.target.value)}
                                    disabled={submitting}
                                  />
                                </div>
                              )}
                              {med.timeSlots.afternoon && (
                                <div className="d-flex align-items-center gap-1">
                                  <span className="small fw-semibold text-primary">🌇 Chiều:</span>
                                  <Form.Control
                                    type="time"
                                    size="sm"
                                    style={{ width: '110px' }}
                                    value={med.slotTimes?.afternoon || '16:00'}
                                    onChange={(e) => handleSlotTimeChange(index, 'afternoon', e.target.value)}
                                    disabled={submitting}
                                  />
                                </div>
                              )}
                              {med.timeSlots.evening && (
                                <div className="d-flex align-items-center gap-1">
                                  <span className="small fw-semibold text-dark">🌙 Tối:</span>
                                  <Form.Control
                                    type="time"
                                    size="sm"
                                    style={{ width: '110px' }}
                                    value={med.slotTimes?.evening || '20:00'}
                                    onChange={(e) => handleSlotTimeChange(index, 'evening', e.target.value)}
                                    disabled={submitting}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Form.Group>

                      {/* Medicine Dates */}
                      <Row className="g-2 mb-2">
                        <Col xs={12} sm={6}>
                          <Form.Group>
                            <Form.Label className="small fw-semibold mb-1">Từ ngày</Form.Label>
                            <Form.Control
                              type="date"
                              size="sm"
                              value={med.startDate}
                              onChange={(e) => handleMedChange(index, 'startDate', e.target.value)}
                              disabled={submitting}
                            />
                          </Form.Group>
                        </Col>
                        <Col xs={12} sm={6}>
                          <Form.Group>
                            <Form.Label className="small fw-semibold mb-1">Đến ngày</Form.Label>
                            <Form.Control
                              type="date"
                              size="sm"
                              value={med.endDate}
                              onChange={(e) => handleMedChange(index, 'endDate', e.target.value)}
                              disabled={submitting}
                            />
                          </Form.Group>
                        </Col>
                      </Row>

                      {/* Individual Instructions */}
                      <Form.Group>
                        <Form.Label className="small fw-semibold mb-1">Hướng dẫn dùng thuốc riêng loại này</Form.Label>
                        <Form.Control
                          type="text"
                          size="sm"
                          placeholder="Ví dụ: Trộn vào khẩu phần ăn, uống sau khi tập..."
                          value={med.instructions}
                          onChange={(e) => handleMedChange(index, 'instructions', e.target.value)}
                          disabled={submitting}
                        />
                      </Form.Group>
                    </Card.Body>
                  </Card>
                ))}

                <Button variant="primary" type="submit" className="w-100 mt-2 py-2 fw-semibold" disabled={submitting}>
                  {submitting ? (
                    <Spinner animation="border" size="sm" />
                  ) : (
                    <>
                      <i className="bi bi-capsule me-1"></i> Xác Nhận Kê Đơn ({medications.length} Loại Thuốc)
                    </>
                  )}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        {/* Right Col: Active Prescriptions List (Table View) */}
        <Col xs={12} lg={6}>
          <Card className="border-0 shadow-sm bg-white h-100">
            <Card.Header className="bg-white py-3 border-0">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <h5 className="fw-bold mb-0">
                  <i className="bi bi-list-check me-2 text-success"></i>
                  Danh Sách Thuốc Cấp Phát ({activeTab === 'active' ? activeCount : activeTab === 'inactive' ? inactiveCount : totalCount})
                </h5>
                <div style={{ minWidth: '160px' }}>
                  <Form.Select
                    size="sm"
                    value={horseFilterId}
                    onChange={(e) => setHorseFilterId(e.target.value)}
                  >
                    <option value="all">Tất cả chiến mã</option>
                    {horses.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name}
                      </option>
                    ))}
                  </Form.Select>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="d-flex gap-2 border-bottom pb-2">
                <Button
                  variant={activeTab === 'active' ? 'primary' : 'outline-secondary'}
                  size="sm"
                  className="rounded-pill px-3 py-1"
                  onClick={() => setActiveTab('active')}
                >
                  <i className="bi bi-capsule me-1"></i> Đang cấp phát ({activeCount})
                </Button>
                <Button
                  variant={activeTab === 'inactive' ? 'secondary' : 'outline-secondary'}
                  size="sm"
                  className="rounded-pill px-3 py-1"
                  onClick={() => setActiveTab('inactive')}
                >
                  <i className="bi bi-check2-circle me-1"></i> Đã dừng / Hết hạn ({inactiveCount})
                </Button>
                <Button
                  variant={activeTab === 'all' ? 'dark' : 'outline-secondary'}
                  size="sm"
                  className="rounded-pill px-3 py-1"
                  onClick={() => setActiveTab('all')}
                >
                  Tất cả ({totalCount})
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              {filteredPrescriptions.length === 0 ? (
                <EmptyState
                  icon="bi-capsule"
                  title={
                    activeTab === 'active'
                      ? 'Không có thuốc đang cấp phát'
                      : activeTab === 'inactive'
                      ? 'Không có đơn đã dừng hoặc hết hạn'
                      : 'Chưa có đơn thuốc nào'
                  }
                  message="Không tìm thấy bản ghi đơn thuốc nào phù hợp với bộ lọc hiện tại."
                />
              ) : (
                <div className="table-responsive">
                  <Table hover className="align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Chiến mã</th>
                        <th>Thuốc & Liều lượng</th>
                        <th>Lịch uống</th>
                        <th>Thời gian</th>
                        <th>Trạng thái</th>
                        <th className="text-end">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPrescriptions.map((p) => (
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
                          <td>
                            <div className="fw-semibold text-dark">💊 {p.medicine}</div>
                            <div className="small text-muted">Liều: <strong>{p.dosage}</strong></div>
                            {p.instructions && (
                              <div className="small text-secondary fst-italic">📝 {p.instructions}</div>
                            )}
                          </td>
                          <td>
                            <div className="mb-1">
                              {p.timeSlots?.includes('morning') && (
                                <Badge bg="warning" text="dark" className="me-1">🌅 Sáng</Badge>
                              )}
                              {p.timeSlots?.includes('noon') && (
                                <Badge bg="info" className="me-1">☀️ Trưa</Badge>
                              )}
                              {p.timeSlots?.includes('afternoon') && (
                                <Badge bg="primary" className="me-1">🌇 Chiều</Badge>
                              )}
                              {p.timeSlots?.includes('evening') && (
                                <Badge bg="dark" className="me-1">🌙 Tối</Badge>
                              )}
                              {(!p.timeSlots || p.timeSlots.length === 0) && (
                                <span className="small text-muted">{p.frequency || 'Theo chỉ dẫn'}</span>
                              )}
                            </div>
                            {p.specificTimes && (
                              <div className="small text-muted">⏰ {p.specificTimes}</div>
                            )}
                          </td>
                          <td>
                            <div className="small fw-semibold text-dark">
                              📅 Từ: {formatDate(p.startDate)}
                            </div>
                            {p.endDate ? (
                              <div className="small text-danger fw-semibold">
                                🏁 Đến: {formatDate(p.endDate)}
                              </div>
                            ) : (
                              <div className="small text-muted fst-italic">
                                (Dùng liên tục)
                              </div>
                            )}
                          </td>
                          <td>
                            <Badge bg={p.statusBadge} pill>
                              {p.statusLabel}
                            </Badge>
                          </td>
                          <td className="text-end">
                            <Button
                              variant="outline-danger"
                              size="sm"
                              className="py-0 px-2"
                              title="Xóa loại thuốc này khỏi danh sách (hoàn lại kho nếu đã trừ)"
                              disabled={actionLoading}
                              onClick={() => handleDeleteMedication(p.treatmentId, p.medIndex)}
                            >
                              <i className="bi bi-trash"></i>
                            </Button>
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

      {/* Propose New Medicine Modal */}
      <Modal show={showProposeModal} onHide={() => !proposing && setShowProposeModal(false)} centered>
        <Form onSubmit={handleProposeMedicine}>
          <Modal.Header closeButton={!proposing} className="bg-light">
            <Modal.Title className="fs-5">
              <i className="bi bi-plus-circle text-primary me-2"></i>
              Đề Xuất Thuốc Mới Chưa Có Trong Kho
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {proposeError && <Alert variant="danger">{proposeError}</Alert>}
            <p className="small text-muted mb-3">
              Gửi đề xuất thêm loại dược phẩm mới tới Ban Quản Lý (POST /inventory/proposals). Sau khi được duyệt, thuốc sẽ xuất hiện trong danh mục kho.
            </p>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold">Tên thuốc / Dược phẩm <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                placeholder="VD: Phenylbutazone 1g, Bute..."
                value={proposalData.name}
                onChange={(e) => setProposalData({ ...proposalData, name: e.target.value })}
                required
                disabled={proposing}
              />
            </Form.Group>
            <Row className="g-2 mb-3">
              <Col xs={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold">Đơn vị tính <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="VD: viên, lọ, gói..."
                    value={proposalData.unit}
                    onChange={(e) => setProposalData({ ...proposalData, unit: e.target.value })}
                    required
                    disabled={proposing}
                  />
                </Form.Group>
              </Col>
              <Col xs={6}>
                <Form.Group>
                  <Form.Label className="small fw-semibold">Số lượng đề xuất <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="number"
                    min="1"
                    value={proposalData.quantity}
                    onChange={(e) => setProposalData({ ...proposalData, quantity: e.target.value })}
                    required
                    disabled={proposing}
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-2">
              <Form.Label className="small fw-semibold">Ghi chú lâm sàng / Lý do cần dùng</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                placeholder="VD: Cần dùng cho phác đồ điều trị chấn thương cơ..."
                value={proposalData.note}
                onChange={(e) => setProposalData({ ...proposalData, note: e.target.value })}
                disabled={proposing}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowProposeModal(false)} disabled={proposing}>
              Hủy
            </Button>
            <Button variant="primary" type="submit" disabled={proposing}>
              {proposing ? <><Spinner size="sm" animation="border" className="me-1" />Đang gửi...</> : 'Gửi đề xuất'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}
