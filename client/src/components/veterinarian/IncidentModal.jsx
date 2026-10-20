import { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import { message } from '../../lib/antdStatic';
import { fileHref } from '../../lib/files';
import { TASK_TYPE_LABELS, incidentStatusOf } from '../../constants/care';
import { BusyButton, Callout, Field, Pill, VetModal } from './ui';
import { ago, errorText, fmtDateTime, idOf, incidentCategory, incidentImages, incidentSeverity } from './vetFormat';

/**
 * A groom's incident report and the vet's answer: "đã tiếp nhận" (seen, on it) or "đã xử lý" with
 * what was done. Examining the horse closes its open reports too, so "Khám ngựa này" is offered.
 * Mounted when opened.
 */
export default function IncidentModal({ task, onHide, onDone }) {
  const navigate = useNavigate();
  const report = task.incidentReport || {};
  const status = incidentStatusOf(report);
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(null); // 'acknowledged' | 'resolved'
  const [error, setError] = useState(null);

  const horseName = task.horse?.name || 'ngựa';
  const severity = incidentSeverity(report.severity);
  const images = incidentImages(report);

  const send = async (next) => {
    if (next === 'resolved' && !response.trim()) {
      setError('Ghi rõ đã xử lý thế nào để nhân viên chăm sóc biết cần làm gì.');
      return;
    }
    setBusy(next);
    setError(null);
    try {
      await vetApi.handleIncident(task._id, { status: next, response: response.trim() });
      message.success(next === 'resolved' ? `Đã đóng sự cố của ${horseName}.` : `Đã báo nhân viên: bác sĩ đã tiếp nhận sự cố của ${horseName}.`);
      onDone?.();
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không cập nhật được sự cố.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <VetModal
      show
      onHide={onHide}
      busy={Boolean(busy)}
      size="lg"
      icon="bi-exclamation-octagon"
      title={`Sự cố · ${horseName}`}
      onSubmit={() => send('resolved')}
      footer={
        <>
          <Button
            variant="vet-ghost"
            className="me-auto"
            disabled={Boolean(busy)}
            onClick={() => {
              onHide();
              navigate(`/veterinarian/examinations/new/${idOf(task.horse)}`);
            }}
          >
            <i className="bi bi-clipboard2-pulse" aria-hidden="true" /> Khám ngựa này
          </Button>
          {status === 'open' && (
            <BusyButton variant="vet-outline" busy={busy === 'acknowledged'} disabled={Boolean(busy)} onClick={() => send('acknowledged')}>
              Đã tiếp nhận
            </BusyButton>
          )}
          <BusyButton type="submit" busy={busy === 'resolved'} disabled={Boolean(busy)}>
            Đã xử lý xong
          </BusyButton>
        </>
      }
    >
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <Pill tone={severity.tone} icon="bi-exclamation-triangle-fill">
          {severity.label}
        </Pill>
        <Pill tone="neutral">{incidentCategory(report.category)}</Pill>
        {status === 'acknowledged' && <Pill tone="info">Đã tiếp nhận</Pill>}
      </div>
      <div className="vet-small vet-muted mb-3">
        {task.assignedTo?.name || 'Nhân viên chăm sóc'} báo {ago(report.reportedAt || task.updatedAt)}
        {report.occurredAt && <> · xảy ra lúc {fmtDateTime(report.occurredAt)}</>}
        {task.taskType && <> · khi {(TASK_TYPE_LABELS[task.taskType] || task.taskType).toLowerCase()}</>}
      </div>

      <div className="vet-subtle p-3 mb-3" style={{ whiteSpace: 'pre-wrap' }}>
        {report.description || 'Không có mô tả.'}
      </div>

      {images.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          {images.map((url) => (
            <a key={url} href={fileHref(url)} target="_blank" rel="noopener noreferrer" title="Mở ảnh">
              <img src={fileHref(url)} alt="Ảnh sự cố" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--vet-border)' }} />
            </a>
          ))}
        </div>
      )}

      {report.response && (
        <Callout tone="neutral" icon="bi-chat-left-text" className="mb-3">
          <strong>{report.handledBy?.name || 'Bác sĩ'}:</strong> {report.response}
        </Callout>
      )}

      {error && (
        <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mb-3">
          {error}
        </Callout>
      )}

      <Field label="Hướng xử lý cho nhân viên chăm sóc" hint="Bắt buộc khi đóng sự cố. Lưu phiếu khám cho ngựa cũng tự đóng sự cố này.">
        <Form.Control
          as="textarea"
          rows={3}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="VD: Đã tiêm hạ sốt 15:30. Theo dõi nhiệt độ 2 giờ/lần, cho uống nước ấm…"
          autoFocus
        />
      </Field>
    </VetModal>
  );
}
