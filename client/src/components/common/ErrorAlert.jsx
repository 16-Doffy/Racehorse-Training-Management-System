import React from 'react';
import { Alert, Button } from 'react-bootstrap';

export default function ErrorAlert({ message, onRetry, dismissible = false, onClose }) {
  if (!message) return null;

  return (
    <Alert
      variant="danger"
      dismissible={dismissible}
      onClose={onClose}
      className="d-flex align-items-center justify-content-between my-3 shadow-sm"
    >
      <div className="d-flex align-items-center">
        <i className="bi bi-exclamation-octagon-fill fs-4 me-2 text-danger"></i>
        <div>
          <strong>Đã xảy ra lỗi: </strong>
          <span>{typeof message === 'string' ? message : message?.message || 'Lỗi không xác định.'}</span>
        </div>
      </div>
      {onRetry && (
        <Button variant="outline-danger" size="sm" onClick={onRetry} className="ms-3">
          <i className="bi bi-arrow-clockwise me-1"></i> Thử lại
        </Button>
      )}
    </Alert>
  );
}
