import React from 'react';
import { Badge } from 'react-bootstrap';
import { getHealthStatusInfo } from '../../utils/healthStatus';

export default function HealthStatusBadge({ status, showIcon = true, pill = true, className = '' }) {
  const info = getHealthStatusInfo(status);

  return (
    <Badge
      bg={info.badgeBg}
      pill={pill}
      className={`px-2 py-1 fw-semibold d-inline-flex align-items-center ${className}`}
      title={info.description}
    >
      {showIcon && info.icon && <i className={`bi ${info.icon} me-1`}></i>}
      <span>{info.label}</span>
    </Badge>
  );
}
