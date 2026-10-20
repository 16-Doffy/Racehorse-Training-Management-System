import { useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import vetApi from '../../api/veterinarianApi';
import { message } from '../../lib/antdStatic';
import { BusyButton, Callout, Field, Pill, VetModal } from './ui';
import { PRIORITY_META, addDays, ago, errorText, fromInputDate, toInputDate, toInputTime } from './vetFormat';

/**
 * Answering a trainer's or manager's exam request without examining yet: take it on (optionally with
 * a time to see the horse), or decline it with a reason. Filing the exam itself closes the request.
 * mode: 'accept' | 'decline'. Mounted when opened, so it starts from the request each time.
 */
export default function ExamRequestModal({ request, mode = 'accept', onHide, onDone }) {
  const accepting = mode === 'accept';
  const [date, setDate] = useState(() => (accepting && request.scheduledFor ? toInputDate(request.scheduledFor) : ''));
  const [time, setTime] = useState(() => (accepting && request.scheduledFor ? toInputTime(request.scheduledFor) : ''));
  const [note, setNote] = useState(() => (accepting ? request.resolutionNote || '' : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const horseName = request.horse?.name || 'ngựa';
  const priority = PRIORITY_META[request.priority] || PRIORITY_META.normal;
  const moving = mode === 'accept' && Boolean(request.acceptedAt);

  const submit = async () => {
    let payload;
    if (mode === 'decline') {
      if (!note.trim()) return setError('Ghi lý do từ chối để người yêu cầu biết cần làm gì tiếp.');
      payload = { action: 'decline', note: note.trim() };
    } else {
      payload = { action: 'accept' };
      if (time && !date) return setError('Chọn ngày hẹn trước khi chọn giờ.');
      if (date) {
        const at = fromInputDate(date, time || '09:00');
        if (at < new Date(Date.now() - 5 * 60000)) return setError('Giờ hẹn khám phải ở tương lai.');
        payload.scheduledFor = at.toISOString();
      }
      if (note.trim()) payload.note = note.trim();
    }
    setBusy(true);
    setError(null);
    try {
      await vetApi.updateExamRequest(request._id, payload);
      message.success(mode === 'decline' ? `Đã từ chối yêu cầu khám ${horseName}.` : `Đã ${moving ? 'đổi lịch hẹn' : 'nhận yêu cầu'} khám ${horseName}.`);
      onDone?.();
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không cập nhật được yêu cầu khám.'));
    } finally {
      setBusy(false);
    }
  };

  const quickDates = [
    { label: 'Hôm nay', value: toInputDate(new Date()) },
    { label: 'Ngày mai', value: toInputDate(addDays(new Date(), 1)) },
  ];

  return (
    <VetModal
      show
      onHide={onHide}
      busy={busy}
      onSubmit={submit}
      icon={mode === 'decline' ? 'bi-x-circle' : 'bi-calendar-check'}
      title={mode === 'decline' ? `Từ chối yêu cầu khám · ${horseName}` : `${moving ? 'Đổi lịch hẹn' : 'Nhận yêu cầu khám'} · ${horseName}`}
      footer={
        <>
          <Button variant="vet-outline" onClick={onHide} disabled={busy}>
            Hủy
          </Button>
          <BusyButton type="submit" busy={busy} variant={mode === 'decline' ? 'vet-danger' : 'vet'}>
            {mode === 'decline' ? 'Từ chối yêu cầu' : moving ? 'Lưu lịch hẹn' : 'Nhận yêu cầu'}
          </BusyButton>
        </>
      }
    >
      <div className="vet-subtle p-3 mb-3">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
          <strong>{request.requestedBy?.name || 'Người yêu cầu'}</strong>
          <span className="vet-small vet-faint">{ago(request.createdAt)}</span>
          {request.priority !== 'normal' && <Pill tone={priority.tone}>{priority.label}</Pill>}
        </div>
        <div className="vet-muted">{request.reason || 'Không ghi lý do.'}</div>
      </div>

      {error && (
        <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mb-3">
          {error}
        </Callout>
      )}

      {mode === 'decline' ? (
        <Field label="Lý do từ chối" required hint="Người yêu cầu nhận được thông báo kèm lý do này.">
          <Form.Control as="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Ngựa đã được khám sáng nay, kết quả bình thường…" autoFocus />
        </Field>
      ) : (
        <>
          <Field label="Hẹn khám (không bắt buộc)" hint="Yêu cầu vẫn mở tới khi bạn lưu phiếu khám cho ngựa.">
            <Row className="g-2">
              <Col xs={7}>
                <Form.Control type="date" min={toInputDate(new Date())} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Ngày hẹn" />
              </Col>
              <Col xs={5}>
                <Form.Control type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Giờ hẹn" />
              </Col>
            </Row>
            <div className="d-flex flex-wrap gap-2 mt-2">
              {quickDates.map((q) => (
                <Button key={q.label} size="sm" variant="vet-outline" onClick={() => setDate(q.value)}>
                  {q.label}
                </Button>
              ))}
              {(date || time) && (
                <Button
                  size="sm"
                  variant="vet-ghost"
                  onClick={() => {
                    setDate('');
                    setTime('');
                  }}
                >
                  Bỏ hẹn giờ
                </Button>
              )}
            </div>
          </Field>
          <Field label="Lời nhắn (không bắt buộc)" className="mt-3">
            <Form.Control as="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Chuẩn bị ngựa ở khu A, chưa cho ăn trước khi khám." />
          </Field>
        </>
      )}
    </VetModal>
  );
}
