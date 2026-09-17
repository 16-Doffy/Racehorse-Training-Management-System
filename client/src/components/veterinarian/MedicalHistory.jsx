import React, { useState } from 'react';
import { Table, Button, Badge, Form, InputGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import HealthStatusBadge from './HealthStatusBadge';
import { formatDate } from '../../utils/formatDate';

export default function MedicalHistory({ records = [], horseId, onNewExam }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = records
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
