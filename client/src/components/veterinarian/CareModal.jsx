import { useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import { message } from '../../lib/antdStatic';
import { BusyButton, Callout, Choices, DueChip, Field, VetModal } from './ui';
import { CARE_KINDS, addDays, addMonths, errorText, fmtDate, fromInputDate, toInputDate, toInputTime } from './vetFormat';

// When the next one is usually due, to fill "hẹn lần sau" in for the vet.
const NEXT_DUE = {
  vaccination: (d) => addMonths(d, 6),
  deworming: (d) => addMonths(d, 3),
  farrier: (d) => addDays(d, 42),
};
const QUICK = [
  { label: '+7 ngày', at: (d) => addDays(d, 7) },
  { label: '+1 tháng', at: (d) => addMonths(d, 1) },
  { label: '+3 tháng', at: (d) => addMonths(d, 3) },
  { label: '+6 tháng', at: (d) => addMonths(d, 6) },
];

/**
 * One kind of routine care for one horse: record that it was done (which moves its next due date),
 * or just move the due date. For the periodic exam, "done" is the exam form itself.
 * Mounted when opened.
 */
export default function CareModal({ horse, kind, initialMode = 'record', onHide, onDone }) {
  const navigate = useNavigate();
  const meta = CARE_KINDS[kind];
  const due = horse.careSchedule?.[meta.field] || null;
  const [mode, setMode] = useState(kind === 'exam' ? 'due' : initialMode);
  const today = toInputDate(new Date());
  const [form, setForm] = useState(() => ({
    date: today,
    product: '',
    batchNumber: '',
    dose: '',
    note: '',
    nextDue: NEXT_DUE[kind] ? toInputDate(NEXT_DUE[kind](new Date())) : '',
    due: toInputDate(due),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async () => {
    setError(null);
    if (mode === 'record') {
      if (meta.needsProduct && !form.product.trim()) return setError(`Ghi ${meta.product.toLowerCase()} đã dùng.`);
      if (!form.date || form.date > today) return setError('Ngày thực hiện không được ở tương lai.');
      if (form.nextDue && form.nextDue <= form.date) return setError('Ngày hẹn lần sau phải sau ngày thực hiện.');
    }
    setBusy(true);
    try {
      if (mode === 'record') {
        await vetApi.createCareEvent(horse._id, {
          kind,
          date: fromInputDate(form.date, form.date === today ? toInputTime(new Date()) : '09:00'),
          product: form.product.trim(),
          batchNumber: form.batchNumber.trim(),
          dose: form.dose.trim(),
          note: form.note.trim(),
          nextDue: form.nextDue ? fromInputDate(form.nextDue, '09:00') : null,
        });
        message.success(`Đã ghi ${meta.label.toLowerCase()} cho ${horse.name}.`);
      } else {
        await vetApi.updateCareSchedule(horse._id, { [meta.field]: form.due ? fromInputDate(form.due, '09:00') : null });
        message.success(form.due ? `Đã hẹn ${meta.label.toLowerCase()} ngày ${fmtDate(fromInputDate(form.due))}.` : `Đã bỏ lịch ${meta.label.toLowerCase()}.`);
      }
      onDone?.();
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không lưu được.'));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <VetModal
      show
      onHide={onHide}
      busy={busy}
      icon={meta.icon}
      title={`${meta.label} · ${horse.name}`}
      onSubmit={save}
      footer={
        <>
          {kind === 'exam' && (
            <Button
              variant="vet-ghost"
              className="me-auto"
              onClick={() => {
                onHide();
                navigate(`/veterinarian/examinations/new/${horse._id}`);
              }}
            >
              <i className="bi bi-clipboard2-pulse" aria-hidden="true" /> Khám ngay
            </Button>
          )}
          <Button variant="vet-outline" onClick={onHide} disabled={busy}>
            Hủy
          </Button>
          <BusyButton type="submit" busy={busy}>
            {mode === 'record' ? 'Lưu ghi nhận' : 'Lưu ngày hẹn'}
          </BusyButton>
        </>
      }
    >
      <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-3">
        <div className="d-flex align-items-center gap-2">
          <span className="vet-muted">Hạn hiện tại</span>
          <DueChip date={due} onClick={() => setMode('due')} />
        </div>
        {kind !== 'exam' && (
          <Choices
            value={mode}
            onChange={setMode}
            label="Việc cần làm"
            options={[
              { value: 'record', label: 'Ghi nhận đã làm', icon: 'bi-check2-circle' },
              { value: 'due', label: 'Đổi ngày hẹn', icon: 'bi-calendar-event' },
            ]}
          />
        )}
      </div>

      {mode === 'record' ? (
        <div className="d-flex flex-column gap-3">
          <Row className="g-3">
            <Col sm={5}>
              <Field label="Ngày thực hiện" required>
                <Form.Control type="date" max={today} value={form.date} onChange={set('date')} />
              </Field>
            </Col>
            <Col sm={7}>
              <Field label={meta.product} required={meta.needsProduct}>
                <Form.Control value={form.product} onChange={set('product')} placeholder={meta.placeholder} autoFocus />
              </Field>
            </Col>
            <Col xs={6}>
              <Field label="Số lô">
                <Form.Control value={form.batchNumber} onChange={set('batchNumber')} placeholder="VD: LOT-2026-X1" />
              </Field>
            </Col>
            <Col xs={6}>
              <Field label="Liều">
                <Form.Control value={form.dose} onChange={set('dose')} placeholder="VD: 1 ml" />
              </Field>
            </Col>
          </Row>
          <Field label="Hẹn lần sau" hint="Hệ thống nhắc bạn khi tới hạn.">
            <Form.Control type="date" min={form.date} value={form.nextDue} onChange={set('nextDue')} />
            <QuickDates base={fromInputDate(form.date) || new Date()} onPick={(v) => setForm((f) => ({ ...f, nextDue: v }))} />
          </Field>
          <Field label="Ghi chú">
            <Form.Control as="textarea" rows={2} value={form.note} onChange={set('note')} placeholder="Phản ứng sau tiêm, tình trạng móng…" />
          </Field>
        </div>
      ) : (
        <Field label="Ngày hẹn mới" hint={kind === 'exam' ? 'Lưu phiếu khám không tự dời ngày này — đặt hạn khám lần sau ở đây.' : undefined}>
          <Form.Control type="date" value={form.due} onChange={set('due')} />
          <div className="d-flex flex-wrap gap-2 mt-2">
            <QuickDates base={new Date()} onPick={(v) => setForm((f) => ({ ...f, due: v }))} inline />
            {form.due && (
              <Button size="sm" variant="vet-ghost" onClick={() => setForm((f) => ({ ...f, due: '' }))}>
                Bỏ lịch hẹn
              </Button>
            )}
          </div>
        </Field>
      )}

      {error && (
        <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mt-3">
          {error}
        </Callout>
      )}
    </VetModal>
  );
}

function QuickDates({ base, onPick, inline = false }) {
  const buttons = QUICK.map((q) => (
    <Button key={q.label} size="sm" variant="vet-outline" onClick={() => onPick(toInputDate(q.at(base)))}>
      {q.label}
    </Button>
  ));
  return inline ? buttons : <div className="d-flex flex-wrap gap-2 mt-2">{buttons}</div>;
}
