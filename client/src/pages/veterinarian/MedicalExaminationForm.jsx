import { useRef, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import useConfirm from '../../components/veterinarian/useConfirm';
import { BusyButton, Callout, Choices, Field, HealthPill, LevelPill, LoadingBlock, PageHead, Section } from '../../components/veterinarian/ui';
import { HEALTH_META, HEALTH_ORDER, LEVEL_META, LEVEL_ORDER, VITALS, clearanceOf, errorText, fmtDate, fromInputDate, horseFacts, idOf, toInputDate, vitalOff } from '../../components/veterinarian/vetFormat';
import { message } from '../../lib/antdStatic';
import { fileHref } from '../../lib/files';
import { useExamRequests, useIncidents, useVetHorse, useVetRefresh } from '../../hooks/useVetData';

const MAX_FILES = 10; // per exam (server: healthRecord.controller.js MAX_ATTACHMENTS)
const PER_UPLOAD = 5; // per request (server: uploadMiddleware.js)
const MAX_SIZE = 10 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The exam form, once the horse (and, when editing, the exam) is loaded. */
function ExamForm({ horse, record, presetLevel }) {
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const refresh = useVetRefresh();
  const [confirm, confirmDialog] = useConfirm();
  const requestsQ = useExamRequests();
  const incidentsQ = useIncidents();
  const fileInput = useRef(null);
  const editing = Boolean(record);
  const today = toInputDate(new Date());
  const clearance = clearanceOf(horse);

  const [date, setDate] = useState(() => (record ? toInputDate(record.date || record.createdAt) : today));
  const [vitals, setVitals] = useState(() => Object.fromEntries(VITALS.map((v) => [v.key, record?.vitalSigns?.[v.key] ?? ''])));
  const [diagnosis, setDiagnosis] = useState(record?.diagnosis || '');
  const [resultStatus, setResultStatus] = useState(record?.resultStatus || horse.healthStatus || 'eligible');
  const [clearedLevel, setClearedLevel] = useState(() => record?.clearedLevel || (LEVEL_META[presetLevel] ? presetLevel : ''));
  const [notes, setNotes] = useState(record?.notes || '');
  const [attachments, setAttachments] = useState(record?.attachments || []);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(null); // 'save' | 'treat'
  const [error, setError] = useState(null);

  const openRequests = (requestsQ.data || []).filter((r) => idOf(r.horse) === horse._id);
  const openIncidents = (incidentsQ.data || []).filter((t) => idOf(t.horse) === horse._id);
  const back = `/veterinarian/horses/${horse._id}`;

  const addFiles = (list) => {
    const picked = Array.from(list || []);
    if (fileInput.current) fileInput.current.value = '';
    if (attachments.length + files.length + picked.length > MAX_FILES) return setError(`Mỗi phiếu khám đính kèm tối đa ${MAX_FILES} tệp.`);
    const bad = picked.find((f) => !FILE_TYPES.includes(f.type));
    if (bad) return setError(`"${bad.name}": chỉ nhận ảnh (jpeg, png, webp, gif) hoặc PDF.`);
    const big = picked.find((f) => f.size > MAX_SIZE);
    if (big) return setError(`"${big.name}" (${kb(big.size)}) vượt quá 10 MB.`);
    setError(null);
    return setFiles((prev) => [...prev, ...picked]);
  };

  const removeAttachment = async (att) => {
    const ok = await confirm({ title: 'Xóa tệp đính kèm', body: `Xóa "${att.name}" khỏi phiếu khám này?`, confirmLabel: 'Xóa', danger: true });
    if (!ok) return;
    try {
      await vetApi.deleteRecordAttachment(record._id, att._id);
      setAttachments((prev) => prev.filter((a) => a._id !== att._id));
      refresh();
    } catch (err) {
      setError(errorText(err, 'Không xóa được tệp.'));
    }
  };

  const save = async (then) => {
    if (!diagnosis.trim()) return setError('Nhập chẩn đoán / kết luận của lần khám.');
    if (!date || date > today) return setError('Ngày khám không được ở tương lai.');
    setBusy(then);
    setError(null);
    const vitalSigns = Object.fromEntries(VITALS.map((v) => [v.key, vitals[v.key] === '' || vitals[v.key] === null ? undefined : Number(vitals[v.key])]));
    let when;
    if (editing && date === toInputDate(record.date || record.createdAt)) when = record.date || record.createdAt;
    else when = date === today ? new Date() : fromInputDate(date, '09:00');
    const payload = { horse: horse._id, date: when, diagnosis: diagnosis.trim(), resultStatus, clearedLevel: clearedLevel || null, vitalSigns, notes: notes.trim() };
    try {
      const saved = editing ? await vetApi.updateHealthRecord(record._id, payload) : await vetApi.createHealthRecord(payload);
      const recordId = saved?.data?._id || record?._id;
      for (let i = 0; i < files.length; i += PER_UPLOAD) {
        const form = new FormData();
        files.slice(i, i + PER_UPLOAD).forEach((f) => form.append('files', f));
        // eslint-disable-next-line no-await-in-loop
        await vetApi.uploadRecordAttachments(recordId, form);
      }
      await refresh();
      message.success(editing ? 'Đã cập nhật phiếu khám.' : `Đã lưu phiếu khám cho ${horse.name}.`);
      navigate(then === 'treat' ? `/veterinarian/treatments/new?horseId=${horse._id}` : back);
    } catch (err) {
      setError(errorText(err, 'Không lưu được phiếu khám.'));
      setBusy(null);
    }
    return undefined;
  };

  const closes = [openRequests.length && `${openRequests.length} yêu cầu khám`, openIncidents.length && `${openIncidents.length} sự cố`].filter(Boolean);

  return (
    <div className="vet-ui" style={{ maxWidth: 920 }}>
      <PageHead
        back={{ label: horse.name, to: back }}
        title={editing ? `Sửa phiếu khám · ${horse.name}` : `Phiếu khám · ${horse.name}`}
        subtitle={
          <span className="d-inline-flex flex-wrap align-items-center gap-2">
            {horseFacts(horse)}
            <HealthPill status={horse.healthStatus} />
            {clearance.restricted && <LevelPill level={clearance.level} short />}
          </span>
        }
      />

      {!editing && closes.length > 0 && (
        <Callout tone="info" icon="bi-info-circle-fill" className="mb-3">
          Lưu phiếu này sẽ trả lời {closes.join(' và ')} đang mở của {horse.name}
          {openRequests[0]?.reason ? ` (“${openRequests[0].reason}”)` : ''}.
        </Callout>
      )}

      <Form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save('save');
        }}
      >
        <section className="vet-card">
          <div className="vet-card-body">
            <Section title="Lần khám">
              <Row className="g-3 align-items-end">
                <Col sm={5} md={4}>
                  <Field label="Ngày khám" required>
                    <Form.Control type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                </Col>
                <Col sm={7} md={8}>
                  <div className="vet-muted pb-2">
                    <i className="bi bi-person-badge me-1" aria-hidden="true" />
                    {editing ? `Khám bởi ${record.examinedBy?.name || 'bác sĩ'}` : `Bác sĩ khám: ${user?.name || '—'}`}
                  </div>
                </Col>
              </Row>
            </Section>

            <Section title="Chỉ số sinh tồn">
              <Row className="g-3">
                {VITALS.map((v) => {
                  const off = vitalOff(v, vitals[v.key]);
                  return (
                    <Col key={v.key} xs={12} sm={4}>
                      <Field label={v.label} hint={off ? <span className="vet-text-bad fw-semibold">Ngoài ngưỡng {v.min}–{v.max}</span> : `Chuẩn khi nghỉ ${v.min}–${v.max}`}>
                        <div className={`vet-input-unit${off ? ' is-out-of-range' : ''}`}>
                          <Form.Control
                            type="number"
                            inputMode="decimal"
                            step={v.step}
                            value={vitals[v.key]}
                            onChange={(e) => setVitals((s) => ({ ...s, [v.key]: e.target.value }))}
                            placeholder={v.placeholder}
                          />
                          <span className="vet-unit">{v.unit}</span>
                        </div>
                      </Field>
                    </Col>
                  );
                })}
              </Row>
            </Section>

            <Section title="Kết luận">
              <div className="d-flex flex-column gap-3">
                <Field label="Chẩn đoán" required>
                  <Form.Control value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="VD: Viêm gân gấp nông chân trước trái" autoFocus={!editing} />
                </Field>
                <Field label="Tình trạng sức khỏe">
                  <Choices
                    value={resultStatus}
                    onChange={setResultStatus}
                    label="Tình trạng sức khỏe"
                    options={HEALTH_ORDER.map((key) => ({ value: key, label: HEALTH_META[key].label, tone: HEALTH_META[key].tone, icon: HEALTH_META[key].icon }))}
                  />
                </Field>
                <Field
                  label="Mức vận động cho phép từ nay"
                  hint={
                    clearedLevel
                      ? `Áp dụng ngay: buổi tập vượt mức bị hủy, HLV được báo. Giữ tới lần đánh giá sau.`
                      : clearance.restricted
                        ? `Ngựa đang bị hạn chế (${LEVEL_META[clearance.level].label.toLowerCase()}). Chọn một mức nếu lần khám này cho ngựa tập lại.`
                        : 'Bỏ trống nếu lần khám này không đánh giá mức tập.'
                  }
                >
                  <Choices
                    value={clearedLevel}
                    onChange={setClearedLevel}
                    label="Mức vận động cho phép"
                    options={[{ value: '', label: 'Không đánh giá' }, ...LEVEL_ORDER.map((key) => ({ value: key, label: LEVEL_META[key].label, tone: LEVEL_META[key].tone, icon: LEVEL_META[key].icon }))]}
                  />
                </Field>
                {resultStatus === 'eligible' && !clearedLevel && clearance.restricted && (
                  <Callout tone="watch" icon="bi-exclamation-triangle-fill">
                    Kết luận “đủ điều kiện” nhưng chưa chọn mức vận động — ngựa vẫn giữ mức “{LEVEL_META[clearance.level].label.toLowerCase()}”.
                  </Callout>
                )}
              </div>
            </Section>

            <Section title="Ghi chú & chỉ định">
              <Form.Control as="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Triệu chứng, chỉ định thêm, hẹn tái khám…" />
            </Section>

            <Section
              title={`Tệp đính kèm (${attachments.length + files.length}/${MAX_FILES})`}
              extra={
                <Button size="sm" variant="vet-outline" onClick={() => fileInput.current?.click()} disabled={attachments.length + files.length >= MAX_FILES}>
                  <i className="bi bi-paperclip" aria-hidden="true" /> Thêm tệp
                </Button>
              }
            >
              <input ref={fileInput} type="file" multiple accept={FILE_TYPES.join(',')} hidden onChange={(e) => addFiles(e.target.files)} />
              {attachments.length + files.length === 0 ? (
                <div className="vet-small vet-faint">X-quang, kết quả xét nghiệm, đơn thuốc scan — ảnh hoặc PDF, tối đa 10 MB mỗi tệp.</div>
              ) : (
                <div className="d-flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <span key={att._id} className="vet-attachment">
                      <a href={fileHref(att.url)} target="_blank" rel="noopener noreferrer">
                        <i className={`bi ${att.contentType?.startsWith('image/') ? 'bi-image' : 'bi-file-earmark-pdf'}`} aria-hidden="true" />
                        <span className="text-truncate">{att.name}</span>
                      </a>
                      <button type="button" onClick={() => removeAttachment(att)} title="Xóa tệp" aria-label={`Xóa ${att.name}`}>
                        <i className="bi bi-x" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {files.map((f, i) => (
                    <span key={`${f.name}-${i}`} className="vet-attachment" title="Tải lên khi lưu">
                      <span className="d-inline-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                        <i className={`bi ${f.type.startsWith('image/') ? 'bi-image' : 'bi-file-earmark-pdf'} vet-faint`} aria-hidden="true" />
                        <span className="text-truncate">{f.name}</span>
                        <span className="vet-faint">{kb(f.size)}</span>
                      </span>
                      <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} title="Bỏ tệp" aria-label={`Bỏ ${f.name}`}>
                        <i className="bi bi-x" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Section>

            {error && (
              <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mt-3">
                {error}
              </Callout>
            )}
          </div>
          <div className="vet-form-footer">
            <Button variant="vet-ghost" className="me-auto" onClick={() => navigate(back)} disabled={Boolean(busy)}>
              Hủy
            </Button>
            {!editing && (
              <BusyButton variant="vet-outline" busy={busy === 'treat'} disabled={Boolean(busy)} onClick={() => save('treat')}>
                Lưu & kê đơn
              </BusyButton>
            )}
            <BusyButton type="submit" busy={busy === 'save'} disabled={Boolean(busy)}>
              {editing ? 'Lưu thay đổi' : 'Lưu phiếu khám'}
            </BusyButton>
          </div>
        </section>
      </Form>
      {editing && <div className="vet-small vet-faint mt-2">Lập ngày {fmtDate(record.createdAt)}.</div>}
      {confirmDialog}
    </div>
  );
}

export default function MedicalExaminationForm() {
  const { horseId, id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const recordQ = useQuery({ queryKey: ['vet', 'record', id], queryFn: () => vetApi.getHealthRecordById(id).then((res) => res.data), enabled: Boolean(id) });
  const targetHorse = horseId || idOf(recordQ.data?.horse);
  const horseQ = useVetHorse(targetHorse);

  if ((id && recordQ.isLoading) || (targetHorse && horseQ.isLoading)) {
    return (
      <div className="vet-ui" style={{ maxWidth: 920 }}>
        <LoadingBlock rows={4} height={80} />
      </div>
    );
  }
  const problem = recordQ.error || horseQ.error || (!horseQ.data && 'Không tìm thấy ngựa cần khám.');
  if (problem) {
    return (
      <div className="vet-ui" style={{ maxWidth: 920 }}>
        <Callout
          tone="bad"
          icon="bi-exclamation-octagon"
          action={
            <Button size="sm" variant="vet-outline" onClick={() => navigate('/veterinarian/horses')}>
              Về danh sách ngựa
            </Button>
          }
        >
          {errorText(problem, 'Không mở được phiếu khám.')}
        </Callout>
      </div>
    );
  }
  return <ExamForm key={id || targetHorse} horse={horseQ.data} record={recordQ.data} presetLevel={params.get('level')} />;
}
