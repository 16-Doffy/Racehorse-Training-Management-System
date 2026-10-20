import { useId, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { MEDICATION_ROUTE_OPTIONS } from '../../constants/care';
import { autoDosage } from './medicationForm';
import { findMedicine } from './medicineCatalog';
import { Field } from './ui';
import { DOSE_PRESETS, TIME_RE, fmtShort, fromInputDate } from './vetFormat';

/**
 * The medicines of a prescription, one compact row each: the medicine (typed, with the club's medicine
 * list as suggestions), the dose each time, how it is given and at what times. The vet only prescribes:
 * the groom gives each dose and takes it from the stock they keep.
 */
export default function MedicationEditor({ meds, onChange, catalog = [], disabled = false }) {
  const update = (key, patch) => onChange(meds.map((m) => (m.key === key ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)));
  const remove = (key) => onChange(meds.filter((m) => m.key !== key));
  const listId = useId();

  return (
    <div className="d-flex flex-column gap-2">
      <datalist id={listId}>
        {catalog.map((item) => (
          <option key={item._id} value={item.name} />
        ))}
      </datalist>
      {meds.map((med, index) => (
        <MedicationRow
          key={med.key}
          index={index}
          med={med}
          catalog={catalog}
          listId={listId}
          disabled={disabled}
          onPatch={(patch) => update(med.key, patch)}
          onRemove={() => remove(med.key)}
        />
      ))}
    </div>
  );
}

function MedicationRow({ med, index, catalog, listId, disabled, onPatch, onRemove }) {
  const [customTime, setCustomTime] = useState('');
  const [addingTime, setAddingTime] = useState(false);
  const linked = Boolean(med.inventoryItem);

  // Typing the name links the medicine to the club's list as soon as it matches one of its items.
  const setName = (name) =>
    onPatch((m) => {
      const item = findMedicine(catalog, { name });
      if (!item) return { name, mode: 'manual', inventoryItem: '', unit: '', dosage: m.inventoryItem ? '' : m.dosage, dosageAuto: true };
      const amount = m.inventoryItem === item._id ? m.amount : m.amount || '1';
      return { name, mode: 'stock', inventoryItem: item._id, unit: item.unit, amount, dosage: autoDosage(amount, item.unit), dosageAuto: true };
    });
  const setAmount = (amount) => onPatch((m) => ({ amount, dosage: m.dosageAuto ? autoDosage(amount, m.unit) : m.dosage }));
  const toggleTime = (time) => onPatch((m) => ({ times: m.times.includes(time) ? m.times.filter((t) => t !== time) : [...m.times, time].sort() }));
  const addTime = () => {
    if (!TIME_RE.test(customTime)) return;
    onPatch((m) => ({ times: [...new Set([...m.times, customTime])].sort() }));
    setCustomTime('');
    setAddingTime(false);
  };
  const presetTimes = DOSE_PRESETS.map((p) => p.time);
  const extraTimes = med.times.filter((t) => !presetTimes.includes(t));

  return (
    <div className="vet-med-edit">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <span className="vet-small fw-semibold vet-faint">Thuốc {index + 1}</span>
        <Button size="sm" variant="vet-ghost" className="vet-icon-btn" onClick={onRemove} disabled={disabled} title="Bỏ thuốc này" aria-label="Bỏ thuốc này">
          <i className="bi bi-x-lg" aria-hidden="true" />
        </Button>
      </div>
      <Row className="g-2">
        <Col md={6}>
          <Field label="Thuốc" required hint={med.name.trim() && !linked ? 'Không có trong danh mục thuốc của CLB — nhân viên chăm sóc tự chuẩn bị.' : undefined}>
            <Form.Control list={listId} value={med.name} onChange={(e) => setName(e.target.value)} placeholder="Gõ để tìm, VD: Phenylbutazone" disabled={disabled} autoComplete="off" />
          </Field>
        </Col>
        <Col xs={6} md={3}>
          <Field label="Liều mỗi lần" required>
            {linked ? (
              <div className="vet-input-unit">
                <Form.Control type="number" min="0" step="any" value={med.amount} onChange={(e) => setAmount(e.target.value)} disabled={disabled} />
                <span className="vet-unit">{med.unit}</span>
              </div>
            ) : (
              <Form.Control value={med.dosage} onChange={(e) => onPatch({ dosage: e.target.value })} placeholder="VD: 10 ml" disabled={disabled} />
            )}
          </Field>
        </Col>
        <Col xs={6} md={3}>
          <Field label="Đường dùng">
            <Form.Select value={med.route || 'oral'} onChange={(e) => onPatch({ route: e.target.value })} disabled={disabled}>
              {MEDICATION_ROUTE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Form.Select>
          </Field>
        </Col>
      </Row>

      <div className="mt-2">
        <div className="form-label mb-1">Giờ dùng</div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          {DOSE_PRESETS.map((p) => (
            <button
              key={p.time}
              type="button"
              disabled={disabled}
              className={`vet-choice${med.times.includes(p.time) ? ' is-active vet-tone-info' : ''}`}
              onClick={() => toggleTime(p.time)}
              aria-pressed={med.times.includes(p.time)}
            >
              {p.label} <span className="vet-tnum">{p.time}</span>
            </button>
          ))}
          {extraTimes.map((t) => (
            <button key={t} type="button" disabled={disabled} className="vet-choice is-active vet-tone-info" onClick={() => toggleTime(t)} title="Bỏ giờ này">
              <span className="vet-tnum">{t}</span> <i className="bi bi-x" aria-hidden="true" />
            </button>
          ))}
          {addingTime ? (
            <span className="d-inline-flex align-items-center gap-1">
              <Form.Control
                type="time"
                size="sm"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTime();
                  }
                }}
                style={{ width: 120 }}
                autoFocus
                aria-label="Giờ khác"
              />
              <Button size="sm" variant="vet-outline" onClick={addTime} disabled={!TIME_RE.test(customTime)}>
                Thêm
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="vet-ghost" onClick={() => setAddingTime(true)} disabled={disabled}>
              <i className="bi bi-plus" aria-hidden="true" /> Giờ khác
            </Button>
          )}
        </div>
        {med.times.length === 0 && <div className="vet-small vet-text-watch mt-1">Chưa chọn giờ — nhân viên chăm sóc nhận một việc cho thuốc này mỗi ngày.</div>}
      </div>

      <div className="d-flex align-items-start justify-content-between gap-3 mt-2">
        <div className="vet-small vet-muted" style={{ minWidth: 0 }}>
          {!med.more &&
            [med.instructions && `Hướng dẫn: ${med.instructions}`, med.startDate && `từ ${fmtShort(fromInputDate(med.startDate))}`, med.endDate && `dùng đến ${fmtShort(fromInputDate(med.endDate))}`]
              .filter(Boolean)
              .join(' · ')}
        </div>
        <button type="button" className="vet-link vet-small text-nowrap" onClick={() => onPatch((m) => ({ more: !m.more }))}>
          {med.more ? 'Thu gọn' : 'Hướng dẫn, ngày riêng'}
        </button>
      </div>

      {med.more && (
        <Row className="g-2 mt-1">
          <Col md={linked ? 6 : 12}>
            <Field label="Hướng dẫn dùng">
              <Form.Control value={med.instructions} onChange={(e) => onPatch({ instructions: e.target.value })} placeholder="VD: Trộn vào thức ăn, dùng sau khi tập" disabled={disabled} />
            </Field>
          </Col>
          {linked && (
            <Col md={6}>
              <Field label="Liều ghi cho nhân viên" hint="Tự điền theo liều mỗi lần; sửa nếu muốn ghi rõ hơn (VD: 1 viên = 1 g).">
                <Form.Control value={med.dosage} onChange={(e) => onPatch({ dosage: e.target.value, dosageAuto: false })} disabled={disabled} />
              </Field>
            </Col>
          )}
          <Col xs={6}>
            <Field label="Bắt đầu riêng">
              <Form.Control type="date" value={med.startDate} onChange={(e) => onPatch({ startDate: e.target.value })} disabled={disabled} />
            </Field>
          </Col>
          <Col xs={6}>
            <Field label="Kết thúc riêng">
              <Form.Control type="date" min={med.startDate || undefined} value={med.endDate} onChange={(e) => onPatch({ endDate: e.target.value })} disabled={disabled} />
            </Field>
          </Col>
        </Row>
      )}
    </div>
  );
}
