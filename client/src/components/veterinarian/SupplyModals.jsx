import { useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import vetApi from '../../api/veterinarianApi';
import { message } from '../../lib/antdStatic';
import { TOOL_UNIT_OPTIONS } from './medicineCatalog';
import { BusyButton, Callout, Field, VetModal } from './ui';
import { errorText } from './vetFormat';

/** Asking the Manager for more of an item already in stock. Mounted when opened. */
export function RestockModal({ item, onHide, onDone }) {
  const low = item.reorderLevel ?? 5;
  const [quantity, setQuantity] = useState(() => String(Math.max(low * 2 - (item.quantity || 0), 1)));
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(item.quantity <= 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!(Number(quantity) > 0)) return setError('Số lượng phải lớn hơn 0.');
    setBusy(true);
    setError(null);
    try {
      await vetApi.requestRestock(item._id, { quantity: Number(quantity), note: note.trim() || undefined, priority: urgent ? 'urgent' : 'normal' });
      message.success(`Đã gửi đề xuất bổ sung ${quantity} ${item.unit} "${item.name}" tới Quản lý.`);
      onDone?.();
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không gửi được đề xuất.'));
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
      icon="bi-cart-plus"
      title="Đề xuất bổ sung"
      onSubmit={submit}
      footer={
        <>
          <Button variant="vet-outline" onClick={onHide} disabled={busy}>
            Hủy
          </Button>
          <BusyButton type="submit" busy={busy}>
            Gửi đề xuất
          </BusyButton>
        </>
      }
    >
      <div className="vet-subtle p-3 mb-3">
        <div className="fw-semibold">{item.name}</div>
        <div className="vet-small vet-muted">
          Còn {item.quantity} {item.unit}
          {item.reorderLevel !== undefined && item.reorderLevel !== null && <> · mức tối thiểu {item.reorderLevel}</>}
          {item.stableBlock && <> · {item.stableBlock}</>}
        </div>
      </div>
      <Row className="g-3">
        <Col sm={6}>
          <Field label={`Số lượng (${item.unit})`} required>
            <Form.Control type="number" min={1} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          </Field>
        </Col>
        <Col sm={6} className="d-flex align-items-end">
          <Form.Check id="restock-urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} label="Cần gấp" className="mb-2" />
        </Col>
      </Row>
      <Field label="Ghi chú" className="mt-3" hint="Quản lý duyệt xong, kho chỉ tăng khi hàng về.">
        <Form.Control as="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Dùng cho phác đồ viêm gân của Bạch Long" />
      </Field>
      {error && (
        <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mt-3">
          {error}
        </Callout>
      )}
    </VetModal>
  );
}

/**
 * Asking for an examination tool the stock list does not have yet. Counted by the piece, so it lands
 * on the vet's tools page once approved (medicineCatalog.js isExamTool). Mounted when opened.
 */
export function ProposeItemModal({ onHide, onDone, defaultName = '' }) {
  const [form, setForm] = useState({ name: defaultName, category: 'medicine', unit: TOOL_UNIT_OPTIONS[0], quantity: '2', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) return setError('Nhập tên dụng cụ.');
    if (!(Number(form.quantity) > 0)) return setError('Số lượng phải lớn hơn 0.');
    setBusy(true);
    setError(null);
    try {
      await vetApi.proposeItem({
        name: form.name.trim(),
        category: form.category,
        unit: form.unit.trim(),
        quantity: Number(form.quantity),
        note: form.note.trim() || undefined,
      });
      message.success(`Đã gửi đề xuất "${form.name.trim()}" tới Quản lý.`);
      onDone?.();
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không gửi được đề xuất.'));
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
      icon="bi-tools"
      title="Đề xuất dụng cụ khám mới"
      onSubmit={submit}
      footer={
        <>
          <Button variant="vet-outline" onClick={onHide} disabled={busy}>
            Hủy
          </Button>
          <BusyButton type="submit" busy={busy}>
            Gửi cho Quản lý
          </BusyButton>
        </>
      }
    >
      <div className="d-flex flex-column gap-3">
        <Field label="Tên dụng cụ" required>
          <Form.Control value={form.name} onChange={set('name')} placeholder="VD: Đèn soi tai mắt, Kéo phẫu thuật" autoFocus />
        </Field>
        <Row className="g-3">
          <Col xs={6}>
            <Field label="Đơn vị tính" required>
              <Form.Select value={form.unit} onChange={set('unit')}>
                {TOOL_UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Form.Select>
            </Field>
          </Col>
          <Col xs={6}>
            <Field label="Số lượng" required>
              <Form.Control type="number" min={1} value={form.quantity} onChange={set('quantity')} />
            </Field>
          </Col>
        </Row>
        <Field label="Dùng để">
          <Form.Control as="textarea" rows={2} value={form.note} onChange={set('note')} placeholder="VD: Khám mắt, tai khi ngựa có dấu hiệu viêm" />
        </Field>
        {error && (
          <Callout tone="bad" icon="bi-exclamation-circle-fill">
            {error}
          </Callout>
        )}
      </div>
    </VetModal>
  );
}
