import { useRef, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import InjuryModal from '../../components/veterinarian/InjuryModal';
import PrescriptionFields, { dailyLoadText } from '../../components/veterinarian/PrescriptionFields';
import RequestDetails from '../../components/veterinarian/RequestDetails';
import useConfirm from '../../components/veterinarian/useConfirm';
import usePrescription from '../../components/veterinarian/usePrescription';
import { prescribableCatalog } from '../../components/veterinarian/medicineCatalog';
import { BusyButton, Callout, Choices, Field, HealthPill, LevelPill, LoadingBlock, PageHead, Pill, Section } from '../../components/veterinarian/ui';
import {
  CRT_MAX_SEC,
  GUT_SOUNDS,
  HEALTH_META,
  HEALTH_ORDER,
  HYDRATION,
  LAMENESS_GRADES,
  LEVEL_META,
  LEVEL_ORDER,
  LIMBS,
  MUCOUS_MEMBRANES,
  SEVERITY_META,
  VITALS,
  ago,
  clearanceOf,
  errorText,
  fmtDateTime,
  fromInputDate,
  horseFacts,
  idOf,
  isActiveInjury,
  recoveryMeta,
  shortBodyPart,
  toInputDate,
  vitalOff,
} from '../../components/veterinarian/vetFormat';
import { areasText, symptomsText } from '../../constants/examRequest';
import { message } from '../../lib/antdStatic';
import { useExamRequests, useIncidents, useInjuries, useInventory, useRxTemplates, useVetHorse, useVetRefresh } from '../../hooks/useVetData';

const MAX_FILES = 10; // per exam (server: healthRecord.controller.js MAX_ATTACHMENTS)
const PER_UPLOAD = 5; // per request (server: uploadMiddleware.js)
const MAX_SIZE = 10 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// A choice list from { key: { label, tone } }, with "not examined" first.
const choicesOf = (meta) => [{ value: '', label: 'Chưa khám' }, ...Object.entries(meta).map(([value, m]) => ({ value, label: m.label, tone: m.tone }))];
const blankClinical = (c = {}) => ({
  mucousMembrane: c.mucousMembrane || '',
  capillaryRefillSec: c.capillaryRefillSec ?? '',
  gutSounds: c.gutSounds || '',
  hydration: c.hydration || '',
  lamenessGrade: c.lamenessGrade === undefined || c.lamenessGrade === null ? '' : String(c.lamenessGrade),
  lamenessLimb: c.lamenessLimb || '',
});
const num = (value) => (value === '' || value === null || value === undefined ? undefined : Number(value));

/** What the trainer (or groom) said, as the opening lines of the history. */
function historyFrom(requests, incidents) {
  const lines = requests.map((r) => {
    const parts = [
      symptomsText(r.symptoms),
      areasText(r.bodyAreas) && `vùng ${areasText(r.bodyAreas).toLowerCase()}`,
      r.reason,
      r.observedAt && `phát hiện ${fmtDateTime(r.observedAt)}`,
      r.firstAid && `đã xử lý: ${r.firstAid}`,
    ].filter(Boolean);
    return `Theo yêu cầu của ${r.requestedBy?.name || 'HLV'}: ${parts.join('; ')}.`;
  });
  incidents.forEach((t) => lines.push(`${t.assignedTo?.name || 'Nhân viên chăm sóc'} báo: ${t.incidentReport?.description || 'sự cố'}.`));
  return lines.join('\n');
}

/**
 * The exam form, once the horse is loaded. A filed exam is not edited — a later finding is a new exam.
 * A new exam is the vet's whole
 * answer to a request in one save: what was found (history, vital signs, clinical findings), the
 * conclusion, the injuries found — saved against this exam — and, when needed, the prescription.
 */
function ExamForm({ horse, presetLevel }) {
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const refresh = useVetRefresh();
  const [confirm, confirmDialog] = useConfirm();
  const requestsQ = useExamRequests();
  const incidentsQ = useIncidents();
  const injuriesQ = useInjuries(horse._id);
  const stockQ = useInventory();
  const templatesQ = useRxTemplates();
  const fileInput = useRef(null);
  const today = toInputDate(new Date());
  const clearance = clearanceOf(horse);

  const [date, setDate] = useState(today);
  const [history, setHistory] = useState('');
  const [vitals, setVitals] = useState(() => Object.fromEntries(VITALS.map((v) => [v.key, ''])));
  const [weight, setWeight] = useState('');
  const [clinical, setClinical] = useState(() => blankClinical());
  const [diagnosis, setDiagnosis] = useState('');
  const [resultStatus, setResultStatus] = useState(horse.healthStatus || 'eligible');
  const [clearedLevel, setClearedLevel] = useState(() => (LEVEL_META[presetLevel] ? presetLevel : ''));
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [injuries, setInjuries] = useState([]); // drafts: { _id: 'draft-n', bodyPart, severity, … }
  const [injuryDialog, setInjuryDialog] = useState(null); // { draft? }
  const [prescribing, setPrescribing] = useState(false);
  const [healOld, setHealOld] = useState(true); // mark the injuries tracked so far healed, when the exam clears the horse
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // What a save that failed part-way already wrote, so saving again finishes it without doubling it.
  const done = useRef({ recordId: null, injuries: new Set(), healed: new Set(), treatment: false });
  const draftSeq = useRef(0);

  const catalog = prescribableCatalog(stockQ.data);
  const rx = usePrescription({ catalog, customTemplates: templatesQ.data || [], userId: user?._id, confirm });

  const openRequests = (requestsQ.data || []).filter((r) => idOf(r.horse) === horse._id);
  const openIncidents = (incidentsQ.data || []).filter((t) => idOf(t.horse) === horse._id);
  const activeInjuries = (injuriesQ.data || []).filter(isActiveInjury);
  const back = `/veterinarian/horses/${horse._id}`;
  const severe = injuries.some((d) => d.severity === 'severe');
  // An exam that finds the horse fit for full work closes what was being tracked — the vet confirms it.
  const clears = !prescribing && resultStatus === 'eligible' && clearedLevel === 'high' && activeInjuries.length > 0;
  const setClinicalField = (key, value) => setClinical((c) => ({ ...c, [key]: value }));
  const lameness = LAMENESS_GRADES.find((g) => String(g.value) === clinical.lamenessGrade);

  const addFiles = (list) => {
    const picked = Array.from(list || []);
    if (fileInput.current) fileInput.current.value = '';
    if (files.length + picked.length > MAX_FILES) return setError(`Mỗi phiếu khám đính kèm tối đa ${MAX_FILES} tệp.`);
    const bad = picked.find((f) => !FILE_TYPES.includes(f.type));
    if (bad) return setError(`"${bad.name}": chỉ nhận ảnh (jpeg, png, webp, gif) hoặc PDF.`);
    const big = picked.find((f) => f.size > MAX_SIZE);
    if (big) return setError(`"${big.name}" (${kb(big.size)}) vượt quá 10 MB.`);
    setError(null);
    return setFiles((prev) => [...prev, ...picked]);
  };

  const keepInjury = (draft) =>
    setInjuries((list) => {
      if (draft._id && list.some((d) => d._id === draft._id)) return list.map((d) => (d._id === draft._id ? { ...d, ...draft } : d));
      draftSeq.current += 1;
      return [...list, { ...draft, _id: `draft-${draftSeq.current}` }];
    });

  const save = async () => {
    if (!diagnosis.trim()) return setError('Nhập chẩn đoán / kết luận của lần khám.');
    if (!date || date > today) return setError('Ngày khám không được ở tương lai.');
    if (clinical.capillaryRefillSec !== '' && (Number(clinical.capillaryRefillSec) < 0 || Number(clinical.capillaryRefillSec) > 10)) return setError('Thời gian đổ đầy mao mạch (CRT) từ 0 đến 10 giây.');
    if (weight !== '' && !(Number(weight) > 0)) return setError('Cân nặng phải lớn hơn 0.');
    if (prescribing) {
      const problem = rx.problem();
      if (problem) return setError(`Đơn thuốc: ${problem}`);
    }
    // Filed is final: the exam, its injuries and its prescription are not edited afterwards.
    if (!done.current.recordId) {
      const parts = ['phiếu khám', injuries.length && `${injuries.length} chấn thương`, prescribing && 'đơn thuốc'].filter(Boolean);
      const ok = await confirm({
        title: `Lưu ${parts.join(', ')}?`,
        body: 'Sau khi lưu không sửa được nữa: phát hiện mới thì lập phiếu khám mới; đơn thuốc chỉ kết thúc hoặc kê đơn mới thay thế; chấn thương chỉ chuyển giai đoạn hồi phục.',
        confirmLabel: 'Lưu',
      });
      if (!ok) return undefined;
    }
    setBusy(true);
    setError(null);
    const vitalSigns = Object.fromEntries(VITALS.map((v) => [v.key, num(vitals[v.key])]));
    vitalSigns.weightKg = num(weight);
    const grade = num(clinical.lamenessGrade);
    const clinicalBody = {
      mucousMembrane: clinical.mucousMembrane || null,
      capillaryRefillSec: num(clinical.capillaryRefillSec),
      gutSounds: clinical.gutSounds || null,
      hydration: clinical.hydration || null,
      lamenessGrade: grade,
      lamenessLimb: grade ? clinical.lamenessLimb || null : null,
    };
    const when = date === today ? new Date() : fromInputDate(date, '09:00');
    const payload = {
      horse: horse._id,
      date: when,
      diagnosis: diagnosis.trim(),
      history: history.trim(),
      resultStatus,
      // While a prescription is written here, its level is the one that counts.
      clearedLevel: prescribing ? null : clearedLevel || null,
      vitalSigns,
      clinical: clinicalBody,
      notes: notes.trim(),
    };
    try {
      // Saved already by a try that failed later on: the exam stays as filed, the rest is finished.
      let recordId = done.current.recordId;
      if (!recordId) {
        const saved = await vetApi.createHealthRecord(payload);
        recordId = saved?.data?._id;
        done.current.recordId = recordId;
      }
      let pending = files;
      while (pending.length) {
        const form = new FormData();
        pending.slice(0, PER_UPLOAD).forEach((f) => form.append('files', f));
        // eslint-disable-next-line no-await-in-loop
        await vetApi.uploadRecordAttachments(recordId, form);
        pending = pending.slice(PER_UPLOAD);
        setFiles(pending);
      }
      if (clears && healOld) {
        for (const m of activeInjuries) {
          if (done.current.healed.has(m._id)) continue;
          // eslint-disable-next-line no-await-in-loop
          await vetApi.updateInjuryMarker(m._id, { recoveryStatus: 'recovered' });
          done.current.healed.add(m._id);
        }
      }
      for (const draft of injuries) {
        if (done.current.injuries.has(draft._id)) continue;
        const { _id, ...body } = draft;
        // eslint-disable-next-line no-await-in-loop
        await vetApi.createInjuryMarker({ ...body, horse: horse._id, healthRecord: recordId });
        done.current.injuries.add(_id);
      }
      if (prescribing && !done.current.treatment) {
        await vetApi.createTreatment({ horse: horse._id, healthRecord: recordId, status: 'ongoing', ...rx.payload() });
        done.current.treatment = true;
      }
      await refresh();
      const extra = [injuries.length && `${injuries.length} chấn thương`, prescribing && 'đơn thuốc'].filter(Boolean);
      message.success(`Đã lưu phiếu khám cho ${horse.name}${extra.length ? ` kèm ${extra.join(' và ')}` : ''}.`);
      navigate(back);
    } catch (err) {
      const partly = done.current.recordId ? ' Phiếu khám đã được lưu (không đổi được nữa) — bấm lưu lại để hoàn tất chấn thương, đơn thuốc và tệp còn thiếu.' : '';
      setError(`${errorText(err, 'Không lưu được phiếu khám.')}${partly}`);
      setBusy(false);
    }
    return undefined;
  };

  const answers = [openRequests.length && `${openRequests.length} yêu cầu khám`, openIncidents.length && `${openIncidents.length} sự cố`].filter(Boolean);
  const saveLabel = `Lưu phiếu khám${injuries.length ? ` · ${injuries.length} chấn thương` : ''}${prescribing ? ' · đơn thuốc' : ''}`;

  return (
    <div className="vet-ui" style={{ maxWidth: 980 }}>
      <PageHead
        back={{ label: horse.name, to: back }}
        title={`Phiếu khám · ${horse.name}`}
        subtitle={
          <span className="d-inline-flex flex-wrap align-items-center gap-2">
            {horseFacts(horse)}
            {horse.weightKg ? <span className="vet-muted">· {horse.weightKg} kg</span> : null}
            <HealthPill status={horse.healthStatus} />
            {clearance.restricted && <LevelPill level={clearance.level} short />}
          </span>
        }
      />

      {answers.length > 0 && (
        <section className="vet-card mb-3">
          <div className="vet-card-body">
            <Section title={`Đang chờ bác sĩ · ${answers.join(' và ')}`}>
              <div className="d-flex flex-column gap-2">
                {openRequests.map((r) => (
                  <RequestDetails key={r._id} request={r} />
                ))}
                {openIncidents.map((t) => (
                  <Callout key={t._id} tone="bad" icon="bi-exclamation-octagon-fill">
                    <strong>{t.assignedTo?.name || 'Nhân viên chăm sóc'}</strong> báo sự cố {ago(t.incidentReport?.reportedAt || t.updatedAt)}: {t.incidentReport?.description}
                  </Callout>
                ))}
              </div>
              <div className="vet-small vet-muted mt-2">Lưu phiếu này trả lời tất cả, và người gửi nhận được kết luận của bạn.</div>
            </Section>
          </div>
        </section>
      )}

      <Form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
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
                    Bác sĩ khám: {user?.name || '—'}
                  </div>
                </Col>
              </Row>
            </Section>

            <Section
              title="Lý do khám & bệnh sử"
              extra={
                (openRequests.length > 0 || openIncidents.length > 0) && (
                  <button
                    type="button"
                    className="vet-link vet-small"
                    onClick={() => {
                      const text = historyFrom(openRequests, openIncidents);
                      setHistory((h) => (h.trim() ? `${h.trim()}\n${text}` : text));
                    }}
                  >
                    <i className="bi bi-arrow-down-short" aria-hidden="true" /> Chép từ yêu cầu
                  </button>
                )
              }
            >
              <Form.Control as="textarea" rows={2} value={history} onChange={(e) => setHistory(e.target.value)} placeholder="Triệu chứng được báo, từ khi nào, diễn tiến, những gì đã làm cho ngựa…" />
            </Section>

            <Section title="Chỉ số sinh tồn">
              <Row className="g-3">
                {VITALS.map((v) => {
                  const off = vitalOff(v, vitals[v.key]);
                  return (
                    <Col key={v.key} xs={12} sm={6} md={3}>
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
                <Col xs={12} sm={6} md={3}>
                  <Field label="Cân nặng" hint={horse.weightKg ? `Lần trước: ${horse.weightKg} kg` : 'Cập nhật cân nặng của ngựa'}>
                    <div className="vet-input-unit">
                      <Form.Control type="number" inputMode="decimal" min={0} step="1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={horse.weightKg ? String(horse.weightKg) : '500'} />
                      <span className="vet-unit">kg</span>
                    </div>
                  </Field>
                </Col>
              </Row>
            </Section>

            <Section title="Khám lâm sàng">
              <div className="d-flex flex-column gap-3">
                <Row className="g-3">
                  <Col md={8}>
                    <Field label="Niêm mạc (lợi)">
                      <Choices value={clinical.mucousMembrane} onChange={(v) => setClinicalField('mucousMembrane', v)} label="Niêm mạc" options={choicesOf(MUCOUS_MEMBRANES)} />
                    </Field>
                  </Col>
                  <Col md={4}>
                    <Field
                      label="Đổ đầy mao mạch (CRT)"
                      hint={Number(clinical.capillaryRefillSec) > CRT_MAX_SEC ? <span className="vet-text-bad fw-semibold">Chậm hơn {CRT_MAX_SEC} giây</span> : `Chuẩn ≤ ${CRT_MAX_SEC} giây`}
                    >
                      <div className={`vet-input-unit${Number(clinical.capillaryRefillSec) > CRT_MAX_SEC ? ' is-out-of-range' : ''}`}>
                        <Form.Control type="number" inputMode="decimal" min={0} max={10} step="0.5" value={clinical.capillaryRefillSec} onChange={(e) => setClinicalField('capillaryRefillSec', e.target.value)} placeholder="2" />
                        <span className="vet-unit">giây</span>
                      </div>
                    </Field>
                  </Col>
                </Row>
                <Field label="Nhu động ruột">
                  <Choices value={clinical.gutSounds} onChange={(v) => setClinicalField('gutSounds', v)} label="Nhu động ruột" options={choicesOf(GUT_SOUNDS)} />
                </Field>
                <Field label="Mất nước">
                  <Choices value={clinical.hydration} onChange={(v) => setClinicalField('hydration', v)} label="Mất nước" options={choicesOf(HYDRATION)} />
                </Field>
                <Field label="Độ què (thang AAEP 0–5)" hint={lameness ? `Độ ${lameness.value}: ${lameness.desc}.` : 'Đánh giá khi cho ngựa đi bộ và chạy kiệu.'}>
                  <Choices
                    value={clinical.lamenessGrade}
                    onChange={(v) => setClinicalField('lamenessGrade', v)}
                    label="Độ què"
                    options={[{ value: '', label: 'Chưa đánh giá' }, ...LAMENESS_GRADES.map((g) => ({ value: String(g.value), label: g.label, tone: g.tone, title: g.desc }))]}
                  />
                </Field>
                {Number(clinical.lamenessGrade) > 0 && (
                  <Field label="Chân què">
                    <Choices value={clinical.lamenessLimb} onChange={(v) => setClinicalField('lamenessLimb', v)} label="Chân què" options={Object.entries(LIMBS).map(([value, label]) => ({ value, label }))} />
                  </Field>
                )}
              </div>
            </Section>

            <Section title="Kết luận">
              <div className="d-flex flex-column gap-3">
                <Field label="Chẩn đoán" required>
                  <Form.Control value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="VD: Viêm gân gấp nông chân trước trái" autoFocus />
                </Field>
                <Field label="Tình trạng sức khỏe">
                  <Choices
                    value={resultStatus}
                    onChange={setResultStatus}
                    label="Tình trạng sức khỏe"
                    options={HEALTH_ORDER.map((key) => ({ value: key, label: HEALTH_META[key].label, tone: HEALTH_META[key].tone, icon: HEALTH_META[key].icon }))}
                  />
                </Field>
                {severe && resultStatus !== 'injured' && resultStatus !== 'quarantined' && (
                  <Callout
                    tone="watch"
                    icon="bi-bandaid-fill"
                    action={
                      <Button size="sm" variant="vet-outline" onClick={() => setResultStatus('injured')}>
                        Đặt “Chấn thương”
                      </Button>
                    }
                  >
                    Phiếu có chấn thương nặng: khi lưu, ngựa được tính là “Chấn thương” theo chấn thương đó.
                  </Callout>
                )}
                {prescribing ? (
                  <Field label="Mức vận động cho phép từ nay">
                    <div className="vet-muted">
                      Theo đơn kê bên dưới: <LevelPill level={rx.level} short /> — áp dụng trong thời gian điều trị.
                    </div>
                  </Field>
                ) : (
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
                )}
                {clears && (
                  <Form.Check
                    id="heal-old-injuries"
                    type="checkbox"
                    checked={healOld}
                    onChange={(e) => setHealOld(e.target.checked)}
                    label={`Đánh dấu đã khỏi: ${activeInjuries.map((m) => shortBodyPart(m.bodyPart)).join(', ')}`}
                  />
                )}
                {!prescribing && resultStatus === 'eligible' && !clearedLevel && clearance.restricted && (
                  <Callout tone="watch" icon="bi-exclamation-triangle-fill">
                    Kết luận “đủ điều kiện” nhưng chưa chọn mức vận động — ngựa vẫn giữ mức “{LEVEL_META[clearance.level].label.toLowerCase()}”.
                  </Callout>
                )}
              </div>
            </Section>

            <Section
              title={`Chấn thương phát hiện (${injuries.length})`}
              extra={
                <Button size="sm" variant="vet-outline" onClick={() => setInjuryDialog({})} disabled={busy}>
                  <i className="bi bi-bandaid" aria-hidden="true" /> Ghi chấn thương
                </Button>
              }
            >
              {injuries.length === 0 ? (
                <div className="vet-small vet-faint">Đánh dấu chỗ bị thương trên ngựa 3D. Chấn thương lưu kèm phiếu khám này và hiện ở trang Chấn thương để theo dõi hồi phục.</div>
              ) : (
                <div className="vet-list vet-subtle">
                  {injuries.map((d) => (
                    <div key={d._id} className="vet-row">
                      <i className="bi bi-bandaid vet-faint" aria-hidden="true" />
                      <div className="vet-row-main">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className="fw-semibold">{shortBodyPart(d.bodyPart)}</span>
                          <Pill tone={SEVERITY_META[d.severity]?.tone}>{SEVERITY_META[d.severity]?.label || d.severity}</Pill>
                          {prescribing ? (
                            <Pill tone={recoveryMeta('in_treatment').tone}>→ {recoveryMeta('in_treatment').label} khi lưu</Pill>
                          ) : (
                            <Pill tone={recoveryMeta('new').tone}>{recoveryMeta('new').label}</Pill>
                          )}
                        </div>
                        {d.notes && <div className="vet-small vet-muted mt-1">{d.notes}</div>}
                      </div>
                      {/* A draft until the exam is saved: then it is part of the record. */}
                      <div className="vet-row-actions">
                        <Button size="sm" variant="vet-ghost" onClick={() => setInjuryDialog({ draft: d })} disabled={busy}>
                          Sửa
                        </Button>
                        <Button size="sm" variant="vet-ghost" className="vet-text-bad" onClick={() => setInjuries((list) => list.filter((x) => x._id !== d._id))} disabled={busy}>
                          Bỏ
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {activeInjuries.length > 0 && (
                <div className="vet-small vet-muted mt-2">
                  Đang theo dõi từ trước:{' '}
                  {activeInjuries.map((m) => `${shortBodyPart(m.bodyPart)} (${(SEVERITY_META[m.severity]?.label || m.severity).toLowerCase()}, ${recoveryMeta(m.recoveryStatus).label.toLowerCase()})`).join('; ')}. Cập nhật giai đoạn hồi phục ở hồ sơ ngựa.
                </div>
              )}
            </Section>

            <Section
              title="Kê đơn"
              extra={
                prescribing ? (
                  <Button size="sm" variant="vet-ghost" className="vet-text-bad" onClick={() => setPrescribing(false)} disabled={busy}>
                    Bỏ đơn
                  </Button>
                ) : null
              }
            >
              {prescribing ? (
                stockQ.isLoading || templatesQ.isLoading ? (
                  <LoadingBlock rows={2} height={56} />
                ) : (
                  <div className="vet-subtle p-3">
                    <PrescriptionFields rx={rx} catalog={catalog} hasCustomTemplates={(templatesQ.data || []).length > 0} busy={busy} compact onTemplateApplied={() => setError(null)} />
                    {dailyLoadText(rx) && <div className="vet-small vet-muted vet-rx-foot">{dailyLoadText(rx)}</div>}
                  </div>
                )
              ) : (
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <span className="vet-small vet-faint">Thuốc và y lệnh chăm sóc thành việc hằng ngày của nhân viên chăm sóc; đơn gắn với phiếu khám này.</span>
                  <Button size="sm" variant="vet-outline" onClick={() => setPrescribing(true)} disabled={busy}>
                    <i className="bi bi-capsule" aria-hidden="true" /> Kê đơn trong phiếu này
                  </Button>
                </div>
              )}
            </Section>

            <Section title="Ghi chú & chỉ định">
              <Form.Control as="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Chỉ định thêm, xét nghiệm cần làm, hẹn tái khám…" />
            </Section>

            <Section
              title={`Tệp đính kèm (${files.length}/${MAX_FILES})`}
              extra={
                <Button size="sm" variant="vet-outline" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES}>
                  <i className="bi bi-paperclip" aria-hidden="true" /> Thêm tệp
                </Button>
              }
            >
              <input ref={fileInput} type="file" multiple accept={FILE_TYPES.join(',')} hidden onChange={(e) => addFiles(e.target.files)} />
              {files.length === 0 ? (
                <div className="vet-small vet-faint">X-quang, kết quả xét nghiệm, ảnh vết thương — ảnh hoặc PDF, tối đa 10 MB mỗi tệp.</div>
              ) : (
                <div className="d-flex flex-wrap gap-2">
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
            <Button variant="vet-ghost" className="me-auto" onClick={() => navigate(back)} disabled={busy}>
              Hủy
            </Button>
            <BusyButton type="submit" busy={busy} disabled={busy}>
              {saveLabel}
            </BusyButton>
          </div>
        </section>
      </Form>

      {injuryDialog && (
        <InjuryModal
          horse={horse}
          injury={injuryDialog.draft}
          injuries={[...activeInjuries, ...injuries.filter((d) => d._id !== injuryDialog.draft?._id).map((d) => ({ ...d, horse: horse._id }))]}
          onDraft={keepInjury}
          onHide={() => setInjuryDialog(null)}
        />
      )}
      {confirmDialog}
    </div>
  );
}

/**
 * A new exam (/veterinarian/examinations/new/:horseId). The old edit link (/:id/edit) opens the exam
 * instead: a filed exam is not edited.
 */
export default function MedicalExaminationForm() {
  const { horseId, id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const horseQ = useVetHorse(horseId);

  if (id) return <Navigate to={`/veterinarian/examinations/${id}`} replace />;
  if (horseId && horseQ.isLoading) {
    return (
      <div className="vet-ui" style={{ maxWidth: 980 }}>
        <LoadingBlock rows={4} height={80} />
      </div>
    );
  }
  const targetHorse = horseId;
  const problem = horseQ.error || (!horseQ.data && 'Không tìm thấy ngựa cần khám.');
  if (problem) {
    return (
      <div className="vet-ui" style={{ maxWidth: 980 }}>
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
  return <ExamForm key={targetHorse} horse={horseQ.data} presetLevel={params.get('level')} />;
}
