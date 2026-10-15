import React, { useState, useEffect } from 'react';
import { Table, Button, Badge, Form, InputGroup, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import HealthStatusBadge from './HealthStatusBadge';
import { formatDate } from '../../utils/formatDate';
import veterinarianApi from '../../api/veterinarianApi';

export default function MedicalHistory({ records = [], horseId, onNewExam, onRecordUpdated }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [localRecords, setLocalRecords] = useState(records);
  const [deletingAttId, setDeletingAttId] = useState(null);

  useEffect(() => {
    setLocalRecords(records);
  }, [records]);

  const handleDeleteAttachment = async (recordId, attachmentId, attachmentName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tệp "${attachmentName || 'đính kèm'}" khỏi phiếu khám này?`)) {
      return;
    }

    setDeletingAttId(attachmentId);
    try {
      await veterinarianApi.deleteRecordAttachment(recordId, attachmentId);
      setLocalRecords((prev) =>
        prev.map((r) => {
          if (r._id === recordId) {
            return {
              ...r,
              attachments: (r.attachments || []).filter((a) => a._id !== attachmentId),
            };
          }
          return r;
        })
      );
      if (onRecordUpdated) onRecordUpdated();
    } catch (err) {
      alert(err?.response?.data?.message || err?.message || 'Lỗi khi xóa tệp đính kèm.');
    } finally {
      setDeletingAttId(null);
    }
  };

  const filtered = localRecords
    .filter((r) => {
      const q = searchTerm.toLowerCase();

      return (
        r.diagnosis?.toLowerCase().includes(q) ||
        r.notes?.toLowerCase().includes(q) ||
        r.examinedBy?.name?.toLowerCase().includes(q) ||
        r.resultStatus?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt).getTime();
      const dateB = new Date(b.date || b.createdAt).getTime();
      if (dateA === dateB) {
        const createdA = new Date(a.createdAt || a.date).getTime();
        const createdB = new Date(b.createdAt || b.date).getTime();
        return sortAsc ? createdA - createdB : createdB - createdA;
      }
      return sortAsc ? dateA - dateB : dateB - dateA;
    });

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <div className="d-flex gap-2 align-items-center">
          <InputGroup style={{ maxWidth: '300px' }}>
            <InputGroup.Text>
              <i className="bi bi-search"></i>
            </InputGroup.Text>
            <Form.Control
              placeholder="Tìm chẩn đoán, bác sĩ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              size="sm"
            />
          </InputGroup>

          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setSortAsc(!sortAsc)}
            title="Đổi thứ tự ngày"
          >
            <i className={`bi bi-sort-numeric-${sortAsc ? 'down' : 'down-alt'} me-1`}></i>
            {sortAsc ? 'Cũ nhất trước' : 'Mới nhất trước'}
          </Button>
        </div>

        {horseId && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (onNewExam) onNewExam();
              else navigate(`/veterinarian/examinations/new/${horseId}`);
            }}
          >
            <i className="bi bi-plus-circle me-1"></i> Khám Bệnh Mới
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-4 bg-light rounded text-muted">
          <i className="bi bi-file-earmark-medical fs-3 d-block mb-2"></i>
          Chưa có hồ sơ khám bệnh nào được ghi nhận.
        </div>
      ) : (
        <div className="table-responsive">
          <Table hover bordered className="align-middle bg-white">
            <thead className="table-light">
              <tr>
                <th style={{ width: '130px' }}>Ngày khám</th>
                <th>Chẩn đoán</th>
                <th style={{ width: '180px' }}>Chỉ số sinh tồn</th>
                <th style={{ width: '150px' }}>Kết luận sức khỏe</th>
                <th>Bác sĩ phụ trách</th>
                <th>Ghi chú / Điều trị</th>
                <th style={{ width: '100px' }} className="text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record._id}>
                  <td className="fw-semibold text-primary">{formatDate(record.date || record.createdAt)}</td>
                  <td>
                    <div className="fw-bold">{record.diagnosis}</div>
                    {record.attachments?.length > 0 && (
                      <div className="mt-2 pt-1 border-top">
                        <div className="small text-muted mb-1 d-flex align-items-center gap-1" style={{ fontSize: '11px' }}>
                          <i className="bi bi-paperclip"></i>
                          <span>Tài liệu đính kèm ({record.attachments.length}):</span>
                        </div>
                        <div className="d-flex flex-wrap gap-1.5">
                          {record.attachments.map((att) => (
                            <span
                              key={att._id}
                              className="badge bg-white text-dark border d-inline-flex align-items-center gap-1 py-1 px-2 shadow-sm"
                            >
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-decoration-none text-primary d-inline-flex align-items-center gap-1"
                                title={`Mở xem tệp: ${att.name}`}
                              >
                                <i
                                  className={
                                    att.contentType?.startsWith('image/')
                                      ? 'bi bi-image text-info'
                                      : 'bi bi-file-earmark-pdf text-danger'
                                  }
                                ></i>
                                <span className="fw-semibold text-truncate" style={{ maxWidth: '140px' }}>
                                  {att.name}
                                </span>
                              </a>
                              <Button
                                variant="link"
                                size="sm"
                                className="p-0 text-danger border-0 ms-1"
                                onClick={() => handleDeleteAttachment(record._id, att._id, att.name)}
                                disabled={deletingAttId === att._id}
                                title="Xóa tệp đính kèm này"
                              >
                                {deletingAttId === att._id ? (
                                  <Spinner animation="border" size="sm" style={{ width: '10px', height: '10px' }} />
                                ) : (
                                  <i className="bi bi-trash text-danger" style={{ fontSize: '12px' }}></i>
                                )}
                              </Button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  </td>
                  <td>
                    <div className="small">
                      <div>
                        Nhiệt độ:{' '}
                        <strong>
                          {record.vitalSigns?.temperatureC ? `${record.vitalSigns.temperatureC} °C` : '-'}
                        </strong>
                      </div>
                      <div>
                        Nhịp tim:{' '}
                        <strong>
                          {record.vitalSigns?.heartRate ? `${record.vitalSigns.heartRate} bpm` : '-'}
                        </strong>
                      </div>
                      <div>
                        Nhịp thở:{' '}
                        <strong>
                          {record.vitalSigns?.respiratoryRate ? `${record.vitalSigns.respiratoryRate} bpm` : '-'}
                        </strong>
                      </div>
                    </div>
                  </td>
                  <td>
                    <HealthStatusBadge status={record.resultStatus} />
                  </td>
                  <td>
                    <i className="bi bi-person-circle me-1 text-secondary"></i>
                    {record.examinedBy?.name || 'Bác sĩ thú y'}
                  </td>
                  <td className="small text-muted">{record.notes || 'Không có ghi chú thêm.'}</td>
                  <td className="text-center">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => navigate(`/veterinarian/examinations/${record._id}/edit`)}
                      title="Chỉnh sửa hồ sơ khám"
                    >
                      <i className="bi bi-pencil"></i>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
