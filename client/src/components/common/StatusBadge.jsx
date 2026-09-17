import React from 'react';
import { Badge } from 'react-bootstrap';

export default function StatusBadge({ bg = 'secondary', text, icon, pill = true, className = '' }) {
  return (
    <Badge bg={bg} pill={pill} className={`px-2 py-1 align-items-center ${className}`}>
      {icon && <i className={`bi ${icon} me-1`}></i>}
      <span>{text}</span>
    </Badge>
  );
}
