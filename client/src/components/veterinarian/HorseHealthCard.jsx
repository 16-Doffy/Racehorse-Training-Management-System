import React from 'react';
import { Card, Badge, Button, Row, Col } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import HealthStatusBadge from './HealthStatusBadge';
import { calculateAge } from '../../utils/formatDate';

export default function HorseHealthCard({
  horse,
  isTrainingLocked = false,
  lockReason = '',
  latestHeartRate = null,
  latestTemperature = null,
  activeInjuriesCount = 0,
  onQuickExam,
  onToggleLock,
}) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/veterinarian/horses/${horse._id}`);
  };

  const defaultPhoto = 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=600&q=80';

  return (
    <Card className="h-100 shadow-sm border-0 horse-health-card position-relative overflow-hidden">
      {/* Top Banner for Training Lock */}
      {isTrainingLocked && (
        <div className="bg-danger text-white px-3 py-1 text-center small fw-bold d-flex align-items-center justify-content-center">
          <i className="bi bi-lock-fill me-1"></i> 🔴 ĐANG KHÓA HUẤN LUYỆN
        </div>
      )}

      <div className="position-relative" style={{ height: '170px', backgroundColor: '#e9ecef' }}>
        <img
          src={horse.photoUrl || defaultPhoto}
          alt={horse.name}
          className="w-100 h-100 object-fit-cover"
          onError={(e) => {
            e.target.src = defaultPhoto;
          }}
        />

        {/* Informative Health Status Badge */}
        <div className="position-absolute top-0 end-0 m-2">
          <HealthStatusBadge status={horse.healthStatus} />
        </div>
      </div>

      <Card.Body className="d-flex flex-column p-3">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h5
              className="card-title fw-bold mb-0 text-primary cursor-pointer"
              style={{ cursor: 'pointer' }}
              onClick={handleCardClick}
            >
              {horse.name}
            </h5>
            <small className="text-muted">Mã: #{horse._id?.slice(-6).toUpperCase()}</small>
          </div>
          <Badge bg="light" text="dark" className="border">
            {calculateAge(horse.dob)} tuổi
          </Badge>
        </div>

        <div className="text-muted small mb-3">
          <div>
            <i className="bi bi-tag me-1"></i> Giống: <strong>{horse.breed || 'Chưa cập nhật'}</strong>
          </div>
          <div>
            <i className="bi bi-person me-1"></i> Chủ sở hữu: <strong>{horse.owner?.name || 'CLB'}</strong>
          </div>
        </div>

        {/* Vital Signs & Status Grid */}
        <div className="bg-light p-2 rounded mb-3 small">
          <Row className="g-2 text-center">
            <Col xs={4}>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Nhịp tim</div>
              <strong className={latestHeartRate > 180 ? 'text-danger' : 'text-dark'}>
                {latestHeartRate ? `${latestHeartRate} bpm` : '-'}
              </strong>
            </Col>
            <Col xs={4}>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Nhiệt độ</div>
              <strong className={latestTemperature > 38.5 ? 'text-danger' : 'text-dark'}>
                {latestTemperature ? `${latestTemperature} °C` : '-'}
              </strong>
            </Col>
            <Col xs={4}>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Chấn thương</div>
              <strong className={activeInjuriesCount > 0 ? 'text-danger' : 'text-success'}>
                {activeInjuriesCount > 0 ? `${activeInjuriesCount} điểm` : '0'}
              </strong>
            </Col>
          </Row>
        </div>

        {isTrainingLocked && lockReason && (
          <div className="alert alert-danger p-2 mb-3 small py-1">
            <strong>Lý do khóa:</strong> {lockReason}
          </div>
        )}

        {/* Card Actions */}
        <div className="mt-auto d-flex gap-2">
          <Button
            variant="outline-primary"
            size="sm"
            className="flex-grow-1"
            onClick={handleCardClick}
          >
            <i className="bi bi-eye me-1"></i> Xem hồ sơ
          </Button>

          <Button
            variant="outline-success"
            size="sm"
            title="Khám bệnh mới"
            onClick={(e) => {
              e.stopPropagation();
              if (onQuickExam) onQuickExam(horse);
              else navigate(`/veterinarian/examinations/new/${horse._id}`);
            }}
          >
            <i className="bi bi-clipboard2-pulse"></i>
          </Button>

          {onToggleLock && (
            <Button
              variant={isTrainingLocked ? 'danger' : 'outline-danger'}
              size="sm"
              title={isTrainingLocked ? 'Mở khóa huấn luyện' : 'Khóa huấn luyện khẩn cấp'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(horse, isTrainingLocked);
              }}
            >
              <i className={`bi ${isTrainingLocked ? 'bi-lock-fill' : 'bi-unlock'}`}></i>
            </Button>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}
