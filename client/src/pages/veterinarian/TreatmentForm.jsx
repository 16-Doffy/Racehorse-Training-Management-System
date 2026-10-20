import { useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import MedicationEditor from '../../components/veterinarian/MedicationEditor';
import TrainingLevelPicker from '../../components/veterinarian/TrainingLevelPicker';
import useConfirm from '../../components/veterinarian/useConfirm';
import { blankMed, medFromSaved, medProblem, medToPayload } from '../../components/veterinarian/medicationForm';
import { isPrescribable } from '../../components/veterinarian/medicineCatalog';
import { BUILT_IN_TEMPLATES, formFromTemplate, templateFromForm } from '../../components/veterinarian/prescriptionTemplates';
import { BusyButton, Callout, Field, HealthPill, HorseCell, LevelPill, LoadingBlock, PageHead, Section, VetModal } from '../../components/veterinarian/ui';
import { LEVEL_META, addDays, clearanceOf, errorText, fmtDate, fromInputDate, idOf, toInputDate, treatmentLevel } from '../../components/veterinarian/vetFormat';
import { message } from '../../lib/antdStatic';
import { useHealthRecords, useInventory, useRxTemplates, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

/** Medicines the vet prescribes from, plus any item an existing prescription still links. */
function medicineCatalog(items, treatment) {
  const linked = new Set((treatment?.medications || []).map((m) => idOf(m.inventoryItem)).filter(Boolean));
  return (items || []).filter((i) => isPrescribable(i) || linked.has(i._id)).sort((a, b) => a.name.localeCompare(b.name));
}

const templateSummary = (t) =>
  [`${t.medications?.length || 0} thuốc`, t.days ? `${t.days} ngày` : null, t.trainingLevel && t.trainingLevel !== 'high' ? LEVEL_META[t.trainingLevel].label.toLowerCase() : null].filter(Boolean).join(' · ');

/** Saving the form as a template, under a name (the same name again updates the vet's own one). */
function SaveTemplateModal({ initial, ownNames, onSave, onHide }) {
  const [name, setName] = useState(initial.name || '');
  const [condition, setCondition] = useState(initial.condition || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const updating = ownNames.has(name.trim().toLowerCase());

  const submit = async () => {
    if (!name.trim()) return setError('Đặt tên cho toa mẫu, VD: Viêm gân chân trước.');
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), condition: condition.trim() });
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không lưu được toa mẫu.'));
      setBusy(false);
    }
    return undefined;
  };

  return (
    <VetModal
      show
      onHide={onHide}
      busy={busy}
      icon="bi-bookmark-plus"
      title="Lưu thành toa mẫu"
      onSubmit={submit}
      footer={
        <>
          <Button variant="vet-outline" onClick={onHide} disabled={busy}>
            Hủy
          </Button>
          <BusyButton type="submit" busy={busy}>
            {updating ? 'Cập nhật toa mẫu' : 'Lưu toa mẫu'}
          </BusyButton>
        </>
      }
    >
      <div className="d-flex flex-column gap-3">
        <Field label="Tên toa mẫu" required hint={updating ? 'Bạn đã có toa mẫu tên này — lưu sẽ cập nhật toa đó.' : 'Mọi bác sĩ đều thấy và dùng được toa mẫu này.'}>
          <Form.Control value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Viêm gân chân trước — giai đoạn cấp" autoFocus />
        </Field>
        <Field label="Dùng cho (triệu chứng / chẩn đoán)">
          <Form.Control value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="VD: Sưng nóng gân gấp, đau khi sờ nắn" />
        </Field>
        <div className="vet-small vet-muted">Lưu thuốc, liều, giờ dùng, số ngày, y lệnh chăm sóc và mức vận động của đơn đang soạn.</div>
        {error && (
          <Callout tone="bad" icon="bi-exclamation-circle-fill">
            {error}
          </Callout>
        )}
      </div>
    </VetModal>
  );
}

function TreatmentEditor({ treatment, presetHorseId, horses, catalog, customTemplates }) {
  const navigate = useNavigate();
  const location = useLocation();
  const refresh = useVetRefresh();
  const userId = useSelector((state) => state.auth.user?._id);
  const [confirm, confirmDialog] = useConfirm();
  const editing = Boolean(treatment);
  const today = toInputDate(new Date());

  const [horseId, setHorseId] = useState(() => idOf(treatment?.horse) || presetHorseId || '');
  const [recordId, setRecordId] = useState(() => idOf(treatment?.healthRecord));
  const [start, setStart] = useState(() => (treatment ? toInputDate(treatment.startDate || treatment.createdAt) : today));
  const [end, setEnd] = useState(() => toInputDate(treatment?.endDate));
  const [level, setLevel] = useState(() => (treatment ? treatmentLevel(treatment) : 'high'));
  const [reason, setReason] = useState(treatment?.lockReason || '');
  const [meds, setMeds] = useState(() => (treatment ? (treatment.medications || []).map((m) => medFromSaved(m, catalog)) : [blankMed()]));
  const [care, setCare] = useState(treatment?.careInstructions || '');
  const [templateKey, setTemplateKey] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const recordsQ = useHealthRecords(horseId, { enabled: Boolean(horseId) && !editing });
  const records = recordsQ.data || [];
  const horse = horses.find((h) => h._id === horseId) || (treatment?.horse && typeof treatment.horse === 'object' ? treatment.horse : null);
  const clearance = clearanceOf(horse);
  const fixedHorse = editing || Boolean(presetHorseId && horse);
  const linkedRecord = recordId || records[0]?._id || '';
  const backTo = location.state?.from || (horseId ? `/veterinarian/horses/${horseId}` : '/veterinarian/treatments');
  const named = meds.filter((m) => m.name.trim());
  const dosesPerDay = named.reduce((sum, m) => sum + (m.times.length || 1), 0);

  const templates = [...BUILT_IN_TEMPLATES.map((t) => ({ ...t, id: `b:${t.key}` })), ...customTemplates.map((t) => ({ ...t, id: `c:${t._id}`, own: idOf(t.createdBy) === userId }))];
  const chosen = templates.find((t) => t.id === templateKey) || null;
  const ownNames = new Set(customTemplates.filter((t) => idOf(t.createdBy) === userId).map((t) => t.name.trim().toLowerCase()));

  const applyTemplate = async (id) => {
    const template = templates.find((t) => t.id === id);
    if (!template) return setTemplateKey('');
    const filled = named.length > 0 || care.trim() || level !== 'high';
    if (filled) {
      const ok = await confirm({ title: `Dùng toa mẫu “${template.name}”?`, body: 'Thuốc, y lệnh chăm sóc, mức vận động và ngày kết thúc đang soạn sẽ được thay bằng toa mẫu.', confirmLabel: 'Dùng toa mẫu' });
      if (!ok) return undefined;
    }
    const form = formFromTemplate(template, catalog, start);
    setMeds(form.meds.length ? form.meds : [blankMed()]);
    setEnd(form.end);
    setLevel(form.level);
    setReason(form.reason);
    setCare(form.care);
    setTemplateKey(id);
    setError(null);
    return undefined;
  };

  const deleteTemplate = async (template) => {
    const ok = await confirm({ title: 'Xóa toa mẫu', body: `Xóa toa mẫu “${template.name}”? Các đơn đã kê từ toa này không bị ảnh hưởng.`, confirmLabel: 'Xóa', danger: true });
    if (!ok) return;
    try {
      await vetApi.deletePrescriptionTemplate(template._id);
      setTemplateKey('');
      message.success('Đã xóa toa mẫu.');
      refresh();
    } catch (err) {
      message.error(errorText(err, 'Không xóa được toa mẫu.'));
    }
  };

  const saveTemplate = async ({ name, condition }) => {
    const payload = templateFromForm({ name, condition, start, end, level, reason, care, meds });
    const res = await vetApi.savePrescriptionTemplate(payload);
    await refresh();
    if (res?.data?._id) setTemplateKey(`c:${res.data._id}`);
    message.success(`Đã lưu toa mẫu “${name}”.`);
  };

  const submit = async () => {
    if (!horseId) return setError('Chọn ngựa cần điều trị.');
    if (!named.length && !care.trim() && level === 'high') return setError('Thêm ít nhất một thuốc, một y lệnh chăm sóc, hoặc chọn mức hạn chế tập.');
    const problem = medProblem(named);
    if (problem) return setError(problem);
    if (level === 'none' && !reason.trim()) return setError('Ghi lý do khóa tập — HLV và nhân viên chăm sóc nhận được lý do này.');
    if (end && end < start) return setError('Ngày kết thúc phải sau ngày bắt đầu.');
    setBusy(true);
    setError(null);
    const body = {
      startDate: fromInputDate(start),
      endDate: end ? fromInputDate(end, '23:59') : editing ? null : undefined,
      trainingLevel: level,
      lockReason: level === 'high' ? '' : reason.trim(),
      medications: named.map(medToPayload),
      careInstructions: care.trim(),
    };
    try {
      if (editing) {
        await vetApi.updateTreatment(treatment._id, body);
      } else {
        let healthRecord = linkedRecord;
        if (!healthRecord) {
          // A treatment follows an exam; a horse never examined gets a record of this prescription.
          const rec = await vetApi.createHealthRecord({
            horse: horseId,
            diagnosis: `Kê đơn điều trị${chosen ? `: ${chosen.name}` : named[0] ? `: ${named[0].name}` : ''}`,
            resultStatus: level === 'none' ? 'injured' : 'monitoring',
          });
          healthRecord = rec.data?._id;
        }
        await vetApi.createTreatment({ horse: horseId, healthRecord, status: 'ongoing', ...body });
      }
      await refresh();
      message.success(editing ? 'Đã cập nhật đơn — việc hôm nay của nhân viên chăm sóc đã đổi theo.' : `Đã kê đơn cho ${horse?.name || 'ngựa'} — đơn đã gửi tới nhân viên chăm sóc.`);
      navigate(backTo);
    } catch (err) {
      setError(errorText(err, 'Không lưu được đơn.'));
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="vet-ui" style={{ maxWidth: 980 }}>
      <PageHead
        back={{ label: location.state?.from ? 'Điều trị' : horse?.name || 'Điều trị', to: backTo }}
        title={editing ? `Sửa đơn · ${horse?.name || 'ngựa'}` : horse && fixedHorse ? `Kê đơn · ${horse.name}` : 'Kê đơn & phác đồ'}
        subtitle="Bác sĩ kê đơn; đơn chuyển thành việc hằng ngày cho nhân viên chăm sóc — họ lấy thuốc trong kho và cho ngựa dùng đúng giờ."
      />

      <Form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <section className="vet-card">
          <div className="vet-card-body">
            <Section title="Ngựa">
              {fixedHorse && horse ? (
                <div className="d-flex flex-wrap align-items-center gap-3">
                  <HorseCell horse={horse} />
                  <HealthPill status={horse.healthStatus} />
                  {clearance.restricted && <LevelPill level={clearance.level} short />}
                </div>
              ) : (
                <Field label="Ngựa cần điều trị" required>
                  <Form.Select
                    value={horseId}
                    onChange={(e) => {
                      setHorseId(e.target.value);
                      setRecordId('');
                    }}
                    autoFocus
                  >
                    <option value="">Chọn ngựa…</option>
                    {horses.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name}
                      </option>
                    ))}
                  </Form.Select>
                </Field>
              )}
              {horseId && !editing && (
                <div className="mt-3">
                  {recordsQ.isLoading ? (
                    <div className="vet-small vet-faint">Đang tìm phiếu khám…</div>
                  ) : records.length > 0 ? (
                    <Field label="Theo phiếu khám" hint="Đơn gắn với một lần khám của ngựa.">
                      <Form.Select value={linkedRecord} onChange={(e) => setRecordId(e.target.value)}>
                        {records.map((r) => (
                          <option key={r._id} value={r._id}>
                            {fmtDate(r.date || r.createdAt)} — {r.diagnosis}
                          </option>
                        ))}
                      </Form.Select>
                    </Field>
                  ) : (
                    <Callout tone="watch" icon="bi-clipboard2">
                      Ngựa chưa có phiếu khám — khi lưu, hệ thống tạo một phiếu ghi nhận kèm đơn này.
                    </Callout>
                  )}
                </div>
              )}
            </Section>

            <Section title="Toa mẫu">
              <Field hint="Chọn bệnh / chấn thương để điền sẵn thuốc, liều, giờ dùng, số ngày và y lệnh — sửa tự do bên dưới. Liều tham khảo cho ngựa ~500 kg.">
                <Form.Select value={templateKey} onChange={(e) => applyTemplate(e.target.value)} aria-label="Toa mẫu" disabled={busy}>
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
                  {customTemplates.length > 0 && (
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
              </Field>
              {chosen && (
                <div className="vet-subtle p-3 mt-2 d-flex flex-wrap align-items-center gap-2">
                  <i className="bi bi-journal-medical vet-faint" aria-hidden="true" />
                  <span className="fw-semibold">{chosen.name}</span>
                  <span className="vet-small vet-muted">{templateSummary(chosen)}</span>
                  {chosen.condition && <span className="vet-small vet-muted w-100">Dùng cho: {chosen.condition}</span>}
                  {chosen.own && (
                    <button type="button" className="vet-link vet-small ms-auto vet-text-bad" onClick={() => deleteTemplate(chosen)}>
                      Xóa toa mẫu này
                    </button>
                  )}
                </div>
              )}
            </Section>

            <Section title="Thời gian điều trị">
              <Row className="g-3 align-items-end">
                <Col xs={6} md={3}>
                  <Field label="Bắt đầu" required>
                    <Form.Control type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                  </Field>
                </Col>
                <Col xs={6} md={3}>
                  <Field label="Kết thúc dự kiến">
                    <Form.Control type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} />
                  </Field>
                </Col>
                <Col md={6}>
                  <div className="d-flex flex-wrap gap-2 pb-1">
                    {[3, 7, 14].map((n) => (
                      <Button key={n} size="sm" variant="vet-outline" onClick={() => setEnd(toInputDate(addDays(fromInputDate(start) || new Date(), n - 1)))}>
                        {n} ngày
                      </Button>
                    ))}
                    {end && (
                      <Button size="sm" variant="vet-ghost" onClick={() => setEnd('')}>
                        Chưa định ngày kết thúc
                      </Button>
                    )}
                  </div>
                </Col>
              </Row>
            </Section>

            <Section title="Mức vận động trong thời gian điều trị">
              <TrainingLevelPicker variant="pills" value={level} onChange={setLevel} disabled={busy} labels={{ high: 'Không hạn chế' }} />
              <div className="vet-choice-hint">{LEVEL_META[level].desc} Áp dụng ngay khi lưu: buổi tập vượt mức bị hủy, HLV và nhân viên chăm sóc được báo.</div>
              {level !== 'high' && (
                <Field className="mt-3" label="Lý do / chỉ dẫn vận động" required={level === 'none'}>
                  <Form.Control value={reason} onChange={(e) => setReason(e.target.value)} placeholder={level === 'none' ? 'VD: Viêm gân cấp — nghỉ tuyệt đối tại chuồng 14 ngày' : 'VD: Chỉ đi bộ thả lỏng 20–30 phút/ngày'} />
                </Field>
              )}
            </Section>

            <Section title={`Thuốc (${named.length})`}>
              <MedicationEditor meds={meds} onChange={setMeds} catalog={catalog} disabled={busy} />
              <Button variant="vet-outline" size="sm" className="mt-2" onClick={() => setMeds((list) => [...list, blankMed()])} disabled={busy}>
                <i className="bi bi-plus-lg" aria-hidden="true" /> Thêm thuốc
              </Button>
            </Section>

            <Section title="Y lệnh chăm sóc">
              <Form.Control as="textarea" rows={2} value={care} onChange={(e) => setCare(e.target.value)} placeholder="VD: Chườm lạnh chân trước trái 20 phút sáng/chiều, nghỉ tại chuồng." />
              <div className="form-text">Thành việc “theo dõi theo y lệnh” mỗi ngày cho nhân viên chăm sóc.</div>
            </Section>

            {error && (
              <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mt-3">
                {error}
              </Callout>
            )}
          </div>
          <div className="vet-form-footer">
            <span className="vet-small vet-muted me-auto">
              {named.length || care.trim() ? `Mỗi ngày: ${named.length ? `${dosesPerDay} liều thuốc` : ''}${named.length && care.trim() ? ' + ' : ''}${care.trim() ? '1 việc theo dõi' : ''} cho nhân viên chăm sóc.` : ''}
            </span>
            <Button variant="vet-ghost" onClick={() => setSavingTemplate(true)} disabled={busy || (!named.length && !care.trim())}>
              <i className="bi bi-bookmark-plus" aria-hidden="true" /> Lưu thành toa mẫu
            </Button>
            <Button variant="vet-ghost" onClick={() => navigate(backTo)} disabled={busy}>
              Hủy
            </Button>
            <BusyButton type="submit" busy={busy}>
              {editing ? 'Lưu thay đổi' : 'Kê đơn'}
            </BusyButton>
          </div>
        </section>
      </Form>

      {savingTemplate && (
        <SaveTemplateModal
          initial={chosen?.own ? { name: chosen.name, condition: chosen.condition } : { name: '', condition: chosen?.condition || '' }}
          ownNames={ownNames}
          onSave={saveTemplate}
          onHide={() => setSavingTemplate(false)}
        />
      )}
      {confirmDialog}
    </div>
  );
}

export default function TreatmentForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const treatmentQ = useQuery({ queryKey: ['vet', 'treatment', id], queryFn: () => vetApi.getTreatmentById(id).then((res) => res.data), enabled: Boolean(id) });
  const horsesQ = useVetHorses();
  const stockQ = useInventory();
  const templatesQ = useRxTemplates();

  if ((id && treatmentQ.isLoading) || horsesQ.isLoading || stockQ.isLoading) {
    return (
      <div className="vet-ui" style={{ maxWidth: 980 }}>
        <LoadingBlock rows={4} height={80} />
      </div>
    );
  }
  const problem = treatmentQ.error || horsesQ.error;
  if (problem || (id && treatmentQ.data?.status && treatmentQ.data.status !== 'ongoing')) {
    return (
      <div className="vet-ui" style={{ maxWidth: 980 }}>
        <Callout
          tone={problem ? 'bad' : 'watch'}
          icon="bi-exclamation-octagon"
          action={
            <Button size="sm" variant="vet-outline" onClick={() => navigate('/veterinarian/treatments')}>
              Về danh sách điều trị
            </Button>
          }
        >
          {problem ? errorText(problem, 'Không mở được đơn.') : 'Đơn này đã kết thúc — kê đơn mới nếu ngựa cần điều trị tiếp.'}
        </Callout>
      </div>
    );
  }
  return (
    <TreatmentEditor
      key={id || params.get('horseId') || 'new'}
      treatment={treatmentQ.data}
      presetHorseId={params.get('horseId')}
      horses={horsesQ.data || []}
      catalog={medicineCatalog(stockQ.data, treatmentQ.data)}
      customTemplates={templatesQ.data || []}
    />
  );
}
