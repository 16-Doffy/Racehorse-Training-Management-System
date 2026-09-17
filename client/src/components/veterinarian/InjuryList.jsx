import React from 'react';
import { Table, Badge, Button, Card, Row, Col } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../../utils/formatDate';
import { INJURY_SEVERITY_CONFIG, RECOVERY_STATUS_CONFIG } from '../../utils/healthStatus';

export default function InjuryList({ injuries = [], horseId, onNewInjury, onEditInjury }) {
  const navigate = useNavigate();

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-bold mb-0 text-dark">
          <i className="bi bi-bandaid me-2 text-danger"></i>
          Danh sách Chấn thương ({injuries.length})
        </h6>

        {horseId && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (onNewInjury) onNewInjury();
              else navigate(`/veterinarian/injuries/new?horseId=${horseId}`);
            }}
          >
            <i className="bi bi-plus-circle me-1"></i> Ghi nhận Chấn thương
          </Button>
        )}
      </div>

      {injuries.length === 0 ? (
        <div className="text-center py-4 bg-light rounded text-muted">
          <i className="bi bi-shield-check fs-3 text-success d-block mb-2"></i>
          Không có chấn thương nào đang ghi nhận cho ngựa này.
        </div>
      ) : (
        <div className="table-responsive">
          <Table hover bordered className="align-middle bg-white">
            <thead className="table-light">
              <tr>
                <th style={{ width: '130px' }}>Ngày ghi nhận</th>
                <th>Vị trí tổn thương</th>
                <th style={{ width: '150px' }}>Mức độ</th>
                <th style={{ width: '160px' }}>Tiến độ hồi phục</th>
                <th>Ghi chú chi tiết</th>
                <th style={{ width: '100px' }} className="text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {injuries.map((injury) => {
                const sev = INJURY_SEVERITY_CONFIG[injury.severity] || { label: injury.severity, bg: 'secondary' };
                const rec = RECOVERY_STATUS_CONFIG[injury.recoveryStatus] || { label: injury.recoveryStatus, bg: 'secondary' };

                return (
                  <tr key={injury._id}>
                    <td className="fw-semibold">{formatDate(injury.createdAt || injury.date)}</td>
                    <td>
                      <div className="fw-bold text-dark">{injury.bodyPart}</div>
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
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => {
                          if (onEditInjury) onEditInjury(injury);
                          else navigate(`/veterinarian/injuries/${injury._id}/edit`);
                        }}
                        title="Cập nhật tiến độ hồi phục"
                      >
                        <i className="bi bi-pencil"></i>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
