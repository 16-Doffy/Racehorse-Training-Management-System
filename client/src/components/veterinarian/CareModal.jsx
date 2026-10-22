import { useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import {
  CARE_PRODUCTS,
  CARE_REACTIONS,
  CARE_ROUTES,
  DEWORM_INGREDIENTS,
  FARRIER_WORK,
  HOOF_CONDITIONS,
  HOOF_LIMBS,
  INJECTION_SITES,
  SHOT_TYPES,
  VACCINE_TARGETS,
} from '../../constants/care';
import { message } from '../../lib/antdStatic';
import { BusyButton, Callout, Choices, DueChip, Field, VetModal } from './ui';
import { CARE_KINDS, addDays, addMonths, daysUntil, errorText, fmtDate, fromInputDate, toInputDate, toInputTime } from './vetFormat';
import { useClubPolicy } from '../../features/training/useClubPolicy';

// When the next one is usually due, to fill "hẹn lần sau" in for the vet. A vaccine depends on the shot:
// the second primary shot follows the first after 4 weeks; a flu booster comes every 6 months, others yearly.
const NEXT_DUE = {
  vaccination: (d, f) => (f.shotType === 'primary_1' ? addDays(d, 28) : f.shotType === 'primary_2' || f.targets.includes('influenza') ? addMonths(d, 6) : addMonths(d, 12)),
  deworming: (d) => addMonths(d, 3),
  farrier: (d) => addDays(d, 42),
};
// Ready-made "next time" dates for each kind of care, counted from a starting day (today, or the day
// the care was done). The exam's first one is how long an exam clears a horse for hard work.
const PRESETS = {
  exam: (clearanceDays) => [{ label: `${clearanceDays} ngày`, days: clearanceDays }, { label: '1 tháng', months: 1 }, { label: '3 tháng', months: 3 }, { label: '6 tháng', months: 6 }],
  vaccination: () => [{ label: '4 tuần', days: 28 }, { label: '6 tháng', months: 6 }, { label: '1 năm', months: 12 }],
  deworming: () => [{ label: '6 tuần', days: 42 }, { label: '2 tháng', months: 2 }, { label: '3 tháng', months: 3 }],
  farrier: () => [{ label: '4 tuần', days: 28 }, { label: '6 tuần', days: 42 }, { label: '8 tuần', days: 56 }],
};
const presetDate = (p, from) => (p.months ? addMonths(from, p.months) : addDays(from, p.days));
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** "Thứ Năm, 23/04/2027 · còn 182 ngày nữa" for a date input value. */
function whenText(value) {
  const d = fromInputDate(value);
  if (!d) return '';
  const days = daysUntil(d);
  const rel = days === 0 ? 'hôm nay' : days === 1 ? 'ngày mai' : days > 0 ? `còn ${days} ngày nữa` : `${-days} ngày trước`;
  return `${WEEKDAYS[d.getDay()]}, ${fmtDate(d)} · ${rel}`;
}
const ALL_LIMBS = Object.keys(HOOF_LIMBS);
const optionsOf = (vocabulary) => Object.entries(vocabulary).map(([value, label]) => ({ value, label }));

/** Chips to tick any number of keys from a { key: label } list. */
function ToggleChips({ value, onChange, options, label }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="vet-chips" role="group" aria-label={label}>
      {Object.entries(options).map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value.includes(key)} className={`vet-chip${value.includes(key) ? ' is-active' : ''}`} onClick={() => toggle(key)}>
          {value.includes(key) && <i className="bi bi-check2" aria-hidden="true" />}
          {text}
        </button>
      ))}
    </div>
  );
}

const blankForm = (kind, horse, due) => {
  const today = toInputDate(new Date());
  const form = {
    date: today,
    product: '',
    batchNumber: '',
    dose: '',
    note: '',
    due: toInputDate(due),
    // vaccination
    targets: [],
    shotType: 'booster',
    route: kind === 'vaccination' ? 'im' : kind === 'deworming' ? 'oral' : '',
    site: '',
    lotExpiry: '',
    reaction: kind === 'vaccination' ? 'none' : '',
    // deworming
    activeIngredient: '',
    weightKg: horse.weightKg ? String(horse.weightKg) : '',
    fecEpg: '',
    // farrier
    farrierName: '',
    work: kind === 'farrier' ? ['trim'] : [],
    limbs: kind === 'farrier' ? ALL_LIMBS : [],
    hoofCondition: [],
  };
  form.nextDue = NEXT_DUE[kind] ? toInputDate(NEXT_DUE[kind](new Date(), form)) : '';
  return form;
};

/**
 * One kind of routine care for one horse: record that it was done (which moves its next due date),
 * or just move the due date. What is recorded depends on the kind — a vaccine's diseases, shot,
 * batch and reaction; a dewormer's active ingredient, dose weight and egg count; the farrier's work,
 * feet and the hooves' condition. For the periodic exam, "done" is the exam form itself.
 * Mounted when opened.
 */
export default function CareModal({ horse, kind, initialMode = 'record', onHide, onDone }) {
  const navigate = useNavigate();
  const meta = CARE_KINDS[kind];
  const due = horse.careSchedule?.[meta.field] || null;
  const [mode, setMode] = useState(kind === 'exam' ? 'due' : initialMode);
  const today = toInputDate(new Date());
  const [form, setForm] = useState(() => blankForm(kind, horse, due));
  const [nextTouched, setNextTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const products = CARE_PRODUCTS[kind] || [];
  const policy = useClubPolicy();
  const presets = PRESETS[kind]?.(policy.clearanceDays || 14) || [];
  const what = meta.label.toLowerCase();

  // A change that moves the usual next date moves it too, until the vet sets one by hand.
  const update = (changes) =>
    setForm((f) => {
      const next = { ...f, ...changes };
      if (!nextTouched && NEXT_DUE[kind] && ('date' in changes || 'shotType' in changes || 'targets' in changes)) {
        next.nextDue = toInputDate(NEXT_DUE[kind](fromInputDate(next.date) || new Date(), next));
      }
      return next;
    });
  const set = (field) => (e) => update({ [field]: e.target.value });
  // Picking a known product fills in what goes with it (only what is still empty).
  const pickProduct = (name) =>
    setForm((f) => {
      const known = products.find((p) => p.name === name);
      const next = { ...f, product: name };
      if (known) {
        if (known.targets && !f.targets.length) next.targets = known.targets;
        if (known.dose && !f.dose) next.dose = known.dose;
        if (known.route) next.route = known.route;
        if (known.activeIngredient && !f.activeIngredient) next.activeIngredient = known.activeIngredient;
        if (!nextTouched && NEXT_DUE[kind]) next.nextDue = toInputDate(NEXT_DUE[kind](fromInputDate(next.date) || new Date(), next));
      }
      return next;
    });

  const details = () => {
    if (kind === 'vaccination') {
      return { targets: form.targets, shotType: form.shotType || null, route: form.route || null, site: form.site, lotExpiry: form.lotExpiry ? fromInputDate(form.lotExpiry, '23:59') : null, reaction: form.reaction || null };
    }
    if (kind === 'deworming') {
      return { activeIngredient: form.activeIngredient, route: form.route || null, weightKg: form.weightKg === '' ? null : Number(form.weightKg), fecEpg: form.fecEpg === '' ? null : Number(form.fecEpg) };
    }
    if (kind === 'farrier') return { farrierName: form.farrierName.trim(), work: form.work, limbs: form.limbs, hoofCondition: form.hoofCondition };
    return {};
  };

  const save = async () => {
    setError(null);
    if (mode === 'record') {
      if (meta.needsProduct && !form.product.trim()) return setError(`Ghi ${meta.product.toLowerCase()} đã dùng.`);
      if (!form.date || form.date > today) return setError('Ngày thực hiện không được ở tương lai.');
      if (form.nextDue && form.nextDue <= form.date) return setError('Ngày hẹn lần sau phải sau ngày thực hiện.');
      if (kind === 'vaccination' && form.lotExpiry && form.lotExpiry < form.date) return setError('Lô vắc-xin đã hết hạn trước ngày tiêm — kiểm tra lại số lô.');
      if (kind === 'vaccination' && !form.targets.length) return setError('Chọn bệnh mà vắc-xin này phòng.');
      if (kind === 'farrier' && !form.work.length) return setError('Chọn việc thợ móng đã làm.');
      if (kind === 'farrier' && !form.limbs.length) return setError('Chọn chân đã làm móng.');
      if (form.weightKg !== '' && !(Number(form.weightKg) > 0)) return setError('Cân nặng tính liều phải lớn hơn 0.');
      if (form.fecEpg !== '' && !(Number(form.fecEpg) >= 0)) return setError('Số trứng giun (EPG) không hợp lệ.');
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
          ...details(),
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

  const productField = (
    <Field label={meta.product} required={meta.needsProduct}>
      <Form.Control value={form.product} onChange={(e) => pickProduct(e.target.value)} placeholder={meta.placeholder} list={`care-products-${kind}`} autoFocus />
      <datalist id={`care-products-${kind}`}>
        {products.map((p) => (
          <option key={p.name} value={p.name} />
        ))}
      </datalist>
    </Field>
  );
  const epg = Number(form.fecEpg);

  return (
    <VetModal
      show
      onHide={onHide}
      busy={busy}
      size={mode === 'record' ? 'lg' : undefined}
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
          <span className="vet-muted">Lần tới đang hẹn</span>
          <DueChip date={due} onClick={() => setMode('due')} title="Đổi ngày hẹn" />
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
            <Col sm={4}>
              <Field label="Ngày thực hiện" required>
                <Form.Control type="date" max={today} value={form.date} onChange={set('date')} />
              </Field>
            </Col>
            <Col sm={8}>{kind === 'farrier' ? <Field label="Thợ móng"><Form.Control value={form.farrierName} onChange={set('farrierName')} placeholder="VD: Anh Tùng — thợ móng CLB" /></Field> : productField}</Col>
          </Row>

          {kind === 'vaccination' && (
            <>
              <Field label="Phòng bệnh" required hint="Chọn tên vắc-xin trong gợi ý để điền sẵn bệnh, liều và đường tiêm.">
                <ToggleChips value={form.targets} onChange={(targets) => update({ targets })} options={VACCINE_TARGETS} label="Phòng bệnh" />
              </Field>
              <Field label="Mũi tiêm" hint={form.shotType === 'primary_1' ? 'Mũi cơ bản 2 hẹn sau 4 tuần.' : form.shotType === 'primary_2' ? 'Mũi nhắc lại đầu tiên hẹn sau 6 tháng.' : 'Nhắc lại: cúm mỗi 6 tháng, các bệnh khác mỗi năm.'}>
                <Choices value={form.shotType} onChange={(shotType) => update({ shotType })} label="Mũi tiêm" options={optionsOf(SHOT_TYPES)} />
              </Field>
              <Row className="g-3">
                <Col sm={4}>
                  <Field label="Số lô">
                    <Form.Control value={form.batchNumber} onChange={set('batchNumber')} placeholder="VD: LOT-2026-X1" />
                  </Field>
                </Col>
                <Col sm={4}>
                  <Field label="Hạn dùng của lô">
                    <Form.Control type="date" value={form.lotExpiry} onChange={set('lotExpiry')} />
                  </Field>
                </Col>
                <Col sm={4}>
                  <Field label="Liều">
                    <Form.Control value={form.dose} onChange={set('dose')} placeholder="VD: 1 ml" />
                  </Field>
                </Col>
              </Row>
              <Row className="g-3">
                <Col md={5}>
                  <Field label="Đường tiêm">
                    <Choices value={form.route} onChange={(route) => update({ route })} label="Đường tiêm" options={['im', 'sc', 'intranasal'].map((k) => ({ value: k, label: CARE_ROUTES[k] }))} />
                  </Field>
                </Col>
                <Col md={7}>
                  <Field label="Vị trí tiêm">
                    <Choices value={form.site} onChange={(site) => update({ site })} label="Vị trí tiêm" options={[{ value: '', label: 'Không ghi' }, ...INJECTION_SITES.map((s) => ({ value: s, label: s }))]} />
                  </Field>
                </Col>
              </Row>
              <Field label="Phản ứng sau tiêm">
                <Choices
                  value={form.reaction}
                  onChange={(reaction) => update({ reaction })}
                  label="Phản ứng sau tiêm"
                  options={optionsOf(CARE_REACTIONS).map((o) => ({ ...o, tone: o.value === 'none' ? 'good' : 'watch' }))}
                />
              </Field>
            </>
          )}

          {kind === 'deworming' && (
            <>
              <Field label="Hoạt chất" hint="Luân phiên hoạt chất giữa các lần để giun không kháng thuốc.">
                <Choices value={form.activeIngredient} onChange={(activeIngredient) => update({ activeIngredient })} label="Hoạt chất" options={DEWORM_INGREDIENTS.map((s) => ({ value: s, label: s }))} />
              </Field>
              <Row className="g-3">
                <Col sm={4}>
                  <Field label="Cân nặng tính liều" hint={horse.weightKg ? `Cân nặng hồ sơ: ${horse.weightKg} kg` : 'Chưa có cân nặng trên hồ sơ'}>
                    <div className="vet-input-unit">
                      <Form.Control type="number" min={0} inputMode="decimal" value={form.weightKg} onChange={set('weightKg')} placeholder="500" />
                      <span className="vet-unit">kg</span>
                    </div>
                  </Field>
                </Col>
                <Col sm={4}>
                  <Field label="Liều">
                    <Form.Control value={form.dose} onChange={set('dose')} placeholder="VD: 1 ống / 600 kg" />
                  </Field>
                </Col>
                <Col sm={4}>
                  <Field label="Số lô">
                    <Form.Control value={form.batchNumber} onChange={set('batchNumber')} placeholder="VD: LOT-2026-X1" />
                  </Field>
                </Col>
              </Row>
              <Row className="g-3">
                <Col md={6}>
                  <Field label="Cách cho">
                    <Choices value={form.route} onChange={(route) => update({ route })} label="Cách cho" options={['oral', 'feed'].map((k) => ({ value: k, label: CARE_ROUTES[k] }))} />
                  </Field>
                </Col>
                <Col md={6}>
                  <Field
                    label="Xét nghiệm trứng giun trong phân"
                    hint={form.fecEpg === '' ? 'Không bắt buộc. Dưới 200 thấp · 200–500 trung bình · trên 500 cao.' : epg > 500 ? <span className="vet-text-bad fw-semibold">Nhiễm cao (trên 500 EPG)</span> : epg >= 200 ? 'Nhiễm trung bình' : 'Nhiễm thấp'}
                  >
                    <div className="vet-input-unit">
                      <Form.Control type="number" min={0} inputMode="numeric" value={form.fecEpg} onChange={set('fecEpg')} placeholder="VD: 350" />
                      <span className="vet-unit">trứng/g</span>
                    </div>
                  </Field>
                </Col>
              </Row>
            </>
          )}

          {kind === 'farrier' && (
            <>
              <Field label="Việc đã làm" required>
                <ToggleChips value={form.work} onChange={(work) => update({ work })} options={FARRIER_WORK} label="Việc đã làm" />
              </Field>
              <Field
                label="Chân"
                required
                hint={
                  <button type="button" className="vet-link vet-small" onClick={() => update({ limbs: form.limbs.length === 4 ? [] : ALL_LIMBS })}>
                    {form.limbs.length === 4 ? 'Bỏ chọn cả 4 chân' : 'Chọn cả 4 chân'}
                  </button>
                }
              >
                <ToggleChips value={form.limbs} onChange={(limbs) => update({ limbs })} options={HOOF_LIMBS} label="Chân" />
              </Field>
              <Row className="g-3">
                <Col md={6}>{productField}</Col>
                <Col md={6}>
                  <Field label="Số lô / cỡ móng">
                    <Form.Control value={form.batchNumber} onChange={set('batchNumber')} placeholder="VD: cỡ 2" />
                  </Field>
                </Col>
              </Row>
              <Field label="Tình trạng móng">
                <ToggleChips value={form.hoofCondition} onChange={(hoofCondition) => update({ hoofCondition })} options={HOOF_CONDITIONS} label="Tình trạng móng" />
              </Field>
            </>
          )}

          <Field
            label={`Hẹn ${what} lần tới`}
            hint={`${nextTouched ? '' : 'Điền sẵn theo loại chăm sóc — đổi được. '}Gần tới ngày (3 ngày trước), việc này hiện trong “Việc cần xử lý” để nhắc bạn.`}
          >
            <Form.Control
              type="date"
              min={form.date}
              value={form.nextDue}
              onChange={(e) => {
                setNextTouched(true);
                update({ nextDue: e.target.value });
              }}
            />
            <div className="vet-small mt-1">{form.nextDue ? whenText(form.nextDue) : <span className="vet-faint">Không hẹn lần tới.</span>}</div>
            <QuickDates
              presets={presets}
              from={fromInputDate(form.date) || new Date()}
              fromLabel="ngày thực hiện"
              onPick={(v) => {
                setNextTouched(true);
                update({ nextDue: v });
              }}
            />
          </Field>
          <Field label="Ghi chú">
            <Form.Control
              as="textarea"
              rows={2}
              value={form.note}
              onChange={set('note')}
              placeholder={kind === 'vaccination' ? 'Theo dõi sau tiêm, lưu ý cho mũi sau…' : kind === 'deworming' ? 'Ngựa nuốt hết liều, kết quả xét nghiệm lần trước…' : 'Tình trạng móng, lưu ý cho lần sau…'}
            />
          </Field>
        </div>
      ) : (
        <>
          <Callout tone="info" icon="bi-calendar-event" className="mb-3">
            Đặt ngày dự kiến {what} lần tới cho {horse.name}. Gần tới ngày (3 ngày trước), việc này hiện trong “Việc cần xử lý” để nhắc bạn.
            {kind === 'exam' && ` Phiếu khám chỉ có giá trị ${policy.clearanceDays || 14} ngày cho buổi tập nặng; lưu phiếu khám không tự đổi ngày hẹn này.`}
          </Callout>
          <Field label={`Ngày ${what} lần tới`}>
            <Form.Control type="date" min={today} value={form.due} onChange={set('due')} />
            <div className="vet-small mt-1">{form.due ? whenText(form.due) : <span className="vet-faint">Chưa chọn ngày — không nhắc.</span>}</div>
          </Field>
          <QuickDates presets={presets} from={new Date()} fromLabel="hôm nay" onPick={(v) => setForm((f) => ({ ...f, due: v }))} />
          {form.due && (
            <Button size="sm" variant="vet-ghost" className="mt-2 px-0" onClick={() => setForm((f) => ({ ...f, due: '' }))}>
              Bỏ ngày hẹn (không nhắc nữa)
            </Button>
          )}
        </>
      )}

      {error && (
        <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mt-3">
          {error}
        </Callout>
      )}
    </VetModal>
  );
}

/** "Chọn nhanh, tính từ hôm nay: Sau 6 tháng · Sau 1 năm" — each button shows the date it sets. */
function QuickDates({ presets, from, fromLabel, onPick }) {
  if (!presets.length) return null;
  return (
    <div className="mt-2">
      <div className="vet-small vet-muted mb-1">
        Chọn nhanh, tính từ {fromLabel} ({fmtDate(from)}):
      </div>
      <div className="d-flex flex-wrap gap-2">
        {presets.map((p) => {
          const at = presetDate(p, from);
          return (
            <Button key={p.label} size="sm" variant="vet-outline" onClick={() => onPick(toInputDate(at))} title={fmtDate(at)}>
              Sau {p.label} <span className="vet-faint">· {fmtDate(at).slice(0, 5)}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
