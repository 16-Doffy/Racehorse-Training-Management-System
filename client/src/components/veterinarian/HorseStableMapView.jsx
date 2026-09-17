import React, { useState } from 'react';
import { Card, Row, Col, Badge, Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import HealthStatusBadge from './HealthStatusBadge';
import { getHealthStatusInfo } from '../../utils/healthStatus';

export default function HorseStableMapView({
  horses = [],
  treatments = [],
  injuryMarkers = [],
  onQuickExam,
  onToggleLock,
}) {
  const navigate = useNavigate();
  const [selectedBlock, setSelectedBlock] = useState('ALL');

  // Map treatments and locks
  const lockedHorseIds = new Set(
    treatments.filter((t) => t.isTrainingLocked).map((t) => (t.horse?._id || t.horse)?.toString())
  );

  // Group horses by simulated/actual stable blocks (Block A, Block B, Block C, Khu Cách Ly)
  const blocks = {
    'Block A - Ngựa Đua Chủ Lực': [],
    'Block B - Đội Hình Huấn Luyện': [],
    'Block C - Ngựa Trẻ & Hồi Phục': [],
    'Khu Cách Ly Y Tế (Quarantine)': [],
  };

  horses.forEach((horse, index) => {
    const isQuarantined = horse.healthStatus === 'quarantined' || horse.healthStatus === 'isolated';
    if (isQuarantined) {
      blocks['Khu Cách Ly Y Tế (Quarantine)'].push({ horse, stallNumber: `Q-${blocks['Khu Cách Ly Y Tế (Quarantine)'].length + 1}` });
    } else {
      const blockKeys = ['Block A - Ngựa Đua Chủ Lực', 'Block B - Đội Hình Huấn Luyện', 'Block C - Ngựa Trẻ & Hồi Phục'];
      const targetBlock = blockKeys[index % 3];
      blocks[targetBlock].push({ horse, stallNumber: `S-${blocks[targetBlock].length + 1}` });
    }
  });

  const getStatusBorder = (status) => {
    switch (status) {
      case 'eligible':
        return 'border-success bg-success-subtle';
      case 'monitoring':
        return 'border-warning bg-warning-subtle';
      case 'injured':
        return 'border-danger bg-danger-subtle';
      case 'quarantined':
      case 'isolated':
        return 'border-dark bg-dark-subtle';
      default:
        return 'border-secondary bg-light';
    }
  };

  return (
    <div className="stable-map-view">
      {/* Legend & Filter */}
      <Card className="border-0 shadow-sm mb-4 bg-white">
        <Card.Body className="p-3">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div className="d-flex flex-wrap align-items-center gap-3">
              <span className="fw-bold text-dark me-2">
                <i className="bi bi-grid-fill me-1 text-primary"></i> Sơ đồ chuồng trại:
              </span>
              <span className="d-flex align-items-center small">
                <span className="d-inline-block rounded-circle bg-success me-1" style={{ width: '12px', height: '12px' }}></span>
                Đủ điều kiện (Eligible)
              </span>
              <span className="d-flex align-items-center small">
                <span className="d-inline-block rounded-circle bg-warning me-1" style={{ width: '12px', height: '12px' }}></span>
                Cần theo dõi (Monitoring)
              </span>
              <span className="d-flex align-items-center small">
                <span className="d-inline-block rounded-circle bg-danger me-1" style={{ width: '12px', height: '12px' }}></span>
                Chấn thương (Injured)
              </span>
              <span className="d-flex align-items-center small">
                <span className="d-inline-block rounded-circle bg-dark me-1" style={{ width: '12px', height: '12px' }}></span>
                Cách ly y tế (Quarantined)
              </span>
              <span className="d-flex align-items-center small text-danger fw-bold">
                <i className="bi bi-lock-fill me-1"></i> Khóa huấn luyện
              </span>
            </div>

            <div className="d-flex gap-1">
              <Button
                variant={selectedBlock === 'ALL' ? 'primary' : 'outline-secondary'}
                size="sm"
                onClick={() => setSelectedBlock('ALL')}
              >
                Tất cả khu
              </Button>
              {Object.keys(blocks).map((bName) => (
                <Button
                  key={bName}
                  variant={selectedBlock === bName ? 'primary' : 'outline-secondary'}
                  size="sm"
                  onClick={() => setSelectedBlock(bName)}
                >
                  {bName.split(' - ')[0]}
                </Button>
              ))}
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Stable Blocks Grid */}
      {Object.entries(blocks)
        .filter(([blockName]) => selectedBlock === 'ALL' || selectedBlock === blockName)
        .map(([blockName, stalls]) => (
          <Card key={blockName} className="border-0 shadow-sm mb-4 bg-white overflow-hidden">
            <Card.Header className="bg-light py-3 d-flex justify-content-between align-items-center border-bottom">
              <h5 className="fw-bold mb-0 text-dark">
                <i className="bi bi-house-door-fill me-2 text-primary"></i>
                {blockName} ({stalls.length} ô chuồng)
              </h5>
              <Badge bg={blockName.includes('Cách Ly') ? 'dark' : 'primary'} pill>
                {stalls.filter((s) => s.horse.healthStatus === 'eligible').length} / {stalls.length} Khỏe mạnh
              </Badge>
            </Card.Header>

            <Card.Body className="p-3">
              {stalls.length === 0 ? (
                <div className="text-center py-4 text-muted small">
                  Hiện không có chiến mã nào ở khu vực chuồng này.
                </div>
              ) : (
                <Row className="g-3">
                  {stalls.map(({ horse, stallNumber }) => {
                    const isLocked = lockedHorseIds.has(horse._id?.toString());
                    const statusInfo = getHealthStatusInfo(horse.healthStatus);

                    return (
                      <Col key={horse._id} xs={12} sm={6} md={4} lg={3}>
                        <Card
                          className={`h-100 border-2 shadow-sm stall-card position-relative ${getStatusBorder(
                            horse.healthStatus
                          )}`}
                          style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
                          onClick={() => navigate(`/veterinarian/horses/${horse._id}`)}
                        >
                          {/* Stall Number Header */}
                          <div className="d-flex justify-content-between align-items-center px-2 py-1 bg-white border-bottom">
                            <span className="fw-bold small text-muted">
                              <i className="bi bi-door-closed me-1"></i>Ô {stallNumber}
                            </span>
                            {isLocked && (
                              <Badge bg="danger" className="small">
                                <i className="bi bi-lock-fill"></i> KHÓA TẬP
                              </Badge>
                            )}
                          </div>

                          <Card.Body className="p-2 d-flex gap-2 align-items-center">
                            <img
                              src={
                                horse.photoUrl ||
                                'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=120&q=80'
                              }
                              alt={horse.name}
                              className="rounded object-fit-cover shadow-sm"
                              style={{ width: '56px', height: '56px' }}
                              onError={(e) => {
                                e.target.src =
                                  'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=120&q=80';
                              }}
                            />

                            <div className="overflow-hidden flex-grow-1">
                              <h6 className="fw-bold text-dark mb-0 text-truncate">{horse.name}</h6>
                              <div className="text-muted small text-truncate">
                                {horse.breed || 'Chưa rõ giống'}
                              </div>
                              <div className="mt-1">
                                <HealthStatusBadge status={horse.healthStatus} showIcon={false} className="py-0 px-1" style={{ fontSize: '0.7rem' }} />
                              </div>
                            </div>
                          </Card.Body>

                          <div className="bg-white p-1 px-2 border-top d-flex justify-content-between align-items-center">
                            <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                              #{horse._id?.slice(-6).toUpperCase()}
                            </small>

                            <div className="d-flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="outline-success"
                                size="sm"
                                className="py-0 px-1"
                                style={{ fontSize: '0.75rem' }}
                                title="Khám bệnh nhanh"
                                onClick={() => navigate(`/veterinarian/examinations/new/${horse._id}`)}
                              >
                                <i className="bi bi-clipboard2-pulse"></i>
                              </Button>
                              <Button
                                variant={isLocked ? 'danger' : 'outline-danger'}
                                size="sm"
                                className="py-0 px-1"
                                style={{ fontSize: '0.75rem' }}
                                title={isLocked ? 'Mở khóa huấn luyện' : 'Khóa huấn luyện khẩn cấp'}
                                onClick={() => onToggleLock && onToggleLock(horse, isLocked)}
                              >
                                <i className={`bi ${isLocked ? 'bi-lock-fill' : 'bi-unlock'}`}></i>
                              </Button>
                            </div>
                          </div>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              )}
            </Card.Body>
          </Card>
        ))}
    </div>
  );
}
