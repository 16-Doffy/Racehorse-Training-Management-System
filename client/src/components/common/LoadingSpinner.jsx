import React from 'react';
import { Spinner } from 'react-bootstrap';

export default function LoadingSpinner({ text = 'Đang tải dữ liệu...', minHeight = '200px' }) {
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center w-100"
      style={{ minHeight }}
    >
      <Spinner animation="border" variant="primary" role="status" />
      {text && <span className="mt-2 text-muted small">{text}</span>}
    </div>
  );
}
