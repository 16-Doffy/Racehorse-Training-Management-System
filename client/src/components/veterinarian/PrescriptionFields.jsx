import { Button, Col, Form, Row } from 'react-bootstrap';
import MedicationEditor from './MedicationEditor';
import TrainingLevelPicker from './TrainingLevelPicker';
import { blankMed } from './medicationForm';
import { Field, Section } from './ui';
import { LEVEL_META, addDays, fromInputDate, toInputDate } from './vetFormat';

const templateSummary = (t) =>
  [`${t.medications?.length || 0} thuốc`, t.days ? `${t.days} ngày` : null, t.trainingLevel && t.trainingLevel !== 'high' ? LEVEL_META[t.trainingLevel].label.toLowerCase() : null].filter(Boolean).join(' · ');

/**
 * The body of a prescription (usePrescription): template, period, training level, medicines and care
 * orders. `onDeleteTemplate(template)` offers to delete the vet's own template once it is picked.
 * `compact`: the same fields packed tighter, without section headings, for inside another form (the
 * exam form); the prescription page shows each in its own section.
 */
export default function PrescriptionFields({ rx, catalog, hasCustomTemplates, busy = false, compact = false, onTemplateApplied, onDeleteTemplate }) {
  const { chosen, templates } = rx;

  const templateSelect = (
    <Form.Select
      value={rx.templateKey}
      onChange={async (e) => {
        await rx.applyTemplate(e.target.value);
        onTemplateApplied?.();
      }}
      aria-label="Toa mẫu"
      disabled={busy}
    >
      <option value="">Không dùng toa mẫu — tự kê</option>
      <optgroup label="Toa mẫu có sẵn">
        {templates
          .filter((t) => t.id.startsWith('b:'))
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </optgroup>
      {hasCustomTemplates && (
        <optgroup label="Toa mẫu của bác sĩ">
          {templates
            .filter((t) => t.id.startsWith('c:'))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.createdBy?.name ? ` — ${t.createdBy.name}` : ''}
              </option>
            ))}
        </optgroup>
      )}
    </Form.Select>
  );
  const deleteOwn = chosen?.own && onDeleteTemplate && (
    <button type="button" className="vet-link vet-small ms-auto vet-text-bad" onClick={() => onDeleteTemplate(chosen)}>
      Xóa toa mẫu này
    </button>
  );
  const startInput = <Form.Control type="date" value={rx.start} onChange={(e) => rx.setStart(e.target.value)} aria-label="Bắt đầu" />;
  const endInput = <Form.Control type="date" min={rx.start} value={rx.end} onChange={(e) => rx.setEnd(e.target.value)} aria-label="Kết thúc dự kiến" />;
  const setDays = (n) => rx.setEnd(toInputDate(addDays(fromInputDate(rx.start) || new Date(), n - 1)));
  const levelPicker = <TrainingLevelPicker variant="pills" value={rx.level} onChange={rx.setLevel} disabled={busy} labels={{ high: 'Không hạn chế' }} />;
  const reasonInput = (
    <Form.Control
      value={rx.reason}
      onChange={(e) => rx.setReason(e.target.value)}
      placeholder={rx.level === 'none' ? 'Lý do khóa tập — VD: Viêm gân cấp, nghỉ tuyệt đối tại chuồng 14 ngày' : 'Chỉ dẫn vận động — VD: Chỉ đi bộ thả lỏng 20–30 phút/ngày'}
      aria-label="Lý do / chỉ dẫn vận động"
    />
  );
  const medEditor = <MedicationEditor meds={rx.meds} onChange={rx.setMeds} catalog={catalog} disabled={busy} />;
  const addMed = () => rx.setMeds((list) => [...list, blankMed()]);
  const careInput = (
    <Form.Control as="textarea" rows={2} value={rx.care} onChange={(e) => rx.setCare(e.target.value)} placeholder="VD: Chườm lạnh chân trước trái 20 phút sáng/chiều, nghỉ tại chuồng." aria-label="Y lệnh chăm sóc" />
  );

  if (compact) {
    return (
      <div className="vet-rx">
        <Row className="g-2 align-items-end">
          <Col md={6}>
            <div className="vet-rx-label">Toa mẫu</div>
            {templateSelect}
          </Col>
          <Col xs={6} md={3}>
            <div className="vet-rx-label vet-req">Bắt đầu</div>
            {startInput}
          </Col>
          <Col xs={6} md={3}>
            <div className="vet-rx-label">Kết thúc dự kiến</div>
            {endInput}
          </Col>
        </Row>
        <div className="d-flex flex-wrap align-items-center gap-2 mt-2 vet-small">
          {chosen ? (
            <span className="vet-muted text-truncate" style={{ minWidth: 0 }} title={chosen.condition ? `Dùng cho: ${chosen.condition}` : undefined}>
              <i className="bi bi-journal-medical me-1" aria-hidden="true" />
              {templateSummary(chosen)}
              {chosen.condition ? ` · dùng cho: ${chosen.condition}` : ''}
            </span>
          ) : (
            <span className="vet-faint">Chọn toa mẫu để điền sẵn thuốc, liều, giờ dùng và y lệnh (liều cho ngựa ~500 kg).</span>
          )}
          {deleteOwn}
          <span className="ms-auto d-inline-flex flex-wrap align-items-center gap-1">
            {[3, 7, 14].map((n) => (
              <button key={n} type="button" className="vet-rx-quick" onClick={() => setDays(n)}>
                {n} ngày
              </button>
            ))}
            {rx.end && (
              <button type="button" className="vet-rx-quick is-ghost" onClick={() => rx.setEnd('')}>
                Bỏ ngày kết thúc
              </button>
            )}
          </span>
        </div>

        <div className="vet-rx-block">
          <div className="vet-rx-label">Mức vận động trong thời gian điều trị</div>
          {levelPicker}
          <div className="vet-small vet-muted mt-1">{LEVEL_META[rx.level].desc}</div>
          {rx.level !== 'high' && <div className="mt-2">{reasonInput}</div>}
        </div>

        <div className="vet-rx-block">
          <div className="d-flex align-items-center justify-content-between gap-2">
            <div className="vet-rx-label mb-0">Thuốc ({rx.named.length})</div>
            <button type="button" className="vet-link vet-small" onClick={addMed} disabled={busy}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> Thêm thuốc
            </button>
          </div>
          <div className="mt-2">{medEditor}</div>
        </div>

        <div className="vet-rx-block">
          <div className="vet-rx-label">Y lệnh chăm sóc</div>
          {careInput}
        </div>
      </div>
    );
  }

  return (
    <>
      <Section title="Toa mẫu">
        <Field hint="Chọn bệnh / chấn thương để điền sẵn thuốc, liều, giờ dùng, số ngày và y lệnh — sửa tự do bên dưới. Liều tham khảo cho ngựa ~500 kg.">{templateSelect}</Field>
        {chosen && (
          <div className="vet-subtle p-3 mt-2 d-flex flex-wrap align-items-center gap-2">
            <i className="bi bi-journal-medical vet-faint" aria-hidden="true" />
            <span className="fw-semibold">{chosen.name}</span>
            <span className="vet-small vet-muted">{templateSummary(chosen)}</span>
            {chosen.condition && <span className="vet-small vet-muted w-100">Dùng cho: {chosen.condition}</span>}
            {deleteOwn}
          </div>
        )}
      </Section>

      <Section title="Thời gian điều trị">
        <Row className="g-3 align-items-end">
          <Col xs={6} md={3}>
            <Field label="Bắt đầu" required>
              {startInput}
            </Field>
          </Col>
          <Col xs={6} md={3}>
            <Field label="Kết thúc dự kiến">{endInput}</Field>
          </Col>
          <Col md={6}>
            <div className="d-flex flex-wrap gap-2 pb-1">
              {[3, 7, 14].map((n) => (
                <Button key={n} size="sm" variant="vet-outline" onClick={() => setDays(n)}>
                  {n} ngày
                </Button>
              ))}
              {rx.end && (
                <Button size="sm" variant="vet-ghost" onClick={() => rx.setEnd('')}>
                  Chưa định ngày kết thúc
                </Button>
              )}
            </div>
          </Col>
        </Row>
      </Section>

      <Section title="Mức vận động trong thời gian điều trị">
        {levelPicker}
        <div className="vet-choice-hint">{LEVEL_META[rx.level].desc} Áp dụng ngay khi lưu: buổi tập vượt mức bị hủy, HLV và nhân viên chăm sóc được báo.</div>
        {rx.level !== 'high' && (
          <Field className="mt-3" label="Lý do / chỉ dẫn vận động" required={rx.level === 'none'}>
            {reasonInput}
          </Field>
        )}
      </Section>

      <Section title={`Thuốc (${rx.named.length})`}>
        {medEditor}
        <Button variant="vet-outline" size="sm" className="mt-2" onClick={addMed} disabled={busy}>
          <i className="bi bi-plus-lg" aria-hidden="true" /> Thêm thuốc
        </Button>
      </Section>

      <Section title="Y lệnh chăm sóc">
        {careInput}
        <div className="form-text">Thành việc “theo dõi theo y lệnh” mỗi ngày cho nhân viên chăm sóc.</div>
      </Section>
    </>
  );
}

/** "Mỗi ngày: 3 liều thuốc + 1 việc theo dõi cho nhân viên chăm sóc." or ''. */
export const dailyLoadText = (rx) =>
  rx.named.length || rx.care.trim()
    ? `Mỗi ngày: ${rx.named.length ? `${rx.dosesPerDay} liều thuốc` : ''}${rx.named.length && rx.care.trim() ? ' + ' : ''}${rx.care.trim() ? '1 việc theo dõi' : ''} cho nhân viên chăm sóc.`
    : '';
