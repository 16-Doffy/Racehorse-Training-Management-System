import React from 'react';
import { Card, Button } from 'react-bootstrap';

export default function EmptyState({
  icon = 'bi-inbox',
  title = 'Chưa có dữ liệu',
  message = 'Không tìm thấy bản ghi nào phù hợp với điều kiện tìm kiếm.',
  actionLabel,
  onAction,
}) {
  return (
    <Card className="text-center py-5 my-3 border-dashed border-2 bg-light">
      <Card.Body>
        <i className={`bi ${icon} text-secondary`} style={{ fontSize: '3rem' }}></i>
        <h5 className="mt-3 text-dark">{title}</h5>
        <p className="text-muted mb-3 mx-auto" style={{ maxWidth: '450px' }}>
          {message}
        </p>
        {actionLabel && onAction && (
          <Button variant="primary" size="sm" onClick={onAction}>
            <i className="bi bi-plus-circle me-1"></i> {actionLabel}
          </Button>
        )}
      </Card.Body>
    </Card>
  );
}
