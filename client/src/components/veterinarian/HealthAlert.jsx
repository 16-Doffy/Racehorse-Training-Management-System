import React from 'react';
import { Toast, ToastContainer, Badge } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../../utils/formatDate';

export default function HealthAlert({ alerts = [], onDismiss, onDismissAll }) {
  const navigate = useNavigate();

  if (!alerts || alerts.length === 0) return null;

  return (
    <ToastContainer position="top-end" className="p-3" style={{ zIndex: 1080 }}>
      {alerts.slice(0, 5).map((alert) => {
        const isCritical = alert.severity === 'danger';
        return (
          <Toast
            key={alert.id}
            onClose={() => onDismiss(alert.id)}
            bg={isCritical ? 'danger' : 'warning'}
            className="mb-2 text-white shadow-lg border-0"
            autohide
            delay={10000}
          >
            <Toast.Header closeButton className={isCritical ? 'bg-danger text-white' : 'bg-warning text-dark'}>
              <i className={`bi ${isCritical ? 'bi-heart-pulse-fill' : 'bi-bell-fill'} me-2`}></i>
              <strong className="me-auto">{alert.title}</strong>
              <small>{formatDateTime(alert.timestamp)}</small>
            </Toast.Header>
            <Toast.Body className={isCritical ? 'text-white' : 'text-dark'}>
              <p className="mb-2">{alert.message}</p>
              {alert.horseId && (
                <div className="d-flex justify-content-end gap-2 mt-2">
                  <button
                    type="button"
                    className={`btn btn-sm ${isCritical ? 'btn-light text-danger' : 'btn-dark'} py-0 px-2`}
                    onClick={() => {
                      onDismiss(alert.id);
                      navigate(`/veterinarian/horses/${alert.horseId}`);
                    }}
                  >
                    <i className="bi bi-arrow-right-circle me-1"></i> Xem chi tiết
                  </button>
                </div>
              )}
            </Toast.Body>
          </Toast>
        );
      })}
    </ToastContainer>
  );
}
