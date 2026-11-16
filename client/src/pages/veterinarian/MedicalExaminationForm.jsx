import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
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
  LIMBS,
  MUCOUS_MEMBRANES,
  SEVERITY_META,
  VITALS,
  ago,
  clearanceOf,
  errorText,
  fmtDateTime,
  horseFacts,
  idOf,
  isActiveInjury,
  recoveryMeta,
  shortBodyPart,
  vitalOff,
} from '../../components/veterinarian/vetFormat';
import { areasText, symptomsText } from '../../constants/examRequest';
import { DIET_KINDS, DIET_NOTE_MAX, RAMP_TEXT, SICK_DIET_ORDER } from '../../constants/diet';
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

// How hard the horse may work under each conclusion (server: healthRecord.controller.js LEVELS_FOR): fit means
// it trains, maybe still limited on its way back; an injured or isolated horse is not trained at all (its status
// blocks every session, readiness.service.js) — walking it by hand is a care order.
const LEVELS_FOR = { eligible: ['light', 'moderate', 'high'], monitoring: ['none', 'light', 'moderate', 'high'], injured: ['none'], quarantined: ['none'] };
const SICK = ['injured', 'quarantined'];
// What each conclusion sets off, under the choice.
const STATUS_HINT = {
  eligible: 'Ngựa tập được: mức tập theo đánh giá bên dưới, khẩu phần về lại theo kế hoạch tập.',
  monitoring: 'Ngựa cần theo dõi thêm: chọn mức tập và chế độ ăn cho thời gian này.',
  injured: 'Ngựa nghỉ tập và ăn chế độ bệnh. HLV và nhân viên chăm sóc được báo ngay khi lưu.',
  quarantined: 'Ngựa chuyển sang chuồng cách ly, không tập và ăn chế độ bệnh. Quản lý được báo để xếp chuồng.',
};

// When to see the horse again, by conclusion (days from today); fit: no follow-up unless the vet books one.
const FOLLOW_UP_DAYS = { eligible: 0, monitoring: 7, injured: 7, quarantined: 7 };
const FOLLOW_UP_CHOICES = [3, 7, 14, 30];
// An exam answers the exam that was due on or before it, or within these days after (the server's
// answersDue): saving without a new date ends that reminder.
const ANSWERS_DAYS = 3;

/** What saving does to the exam the horse already has booked. */
function examDueNote(due, followUp) {
  if (!due) return '';
  const when = dayjs(due).format('DD/MM');
  if (followUp) return ` Lịch đang hẹn ${when} sẽ được thay bằng ngày mới.`;
  return dayjs(due).isAfter(dayjs().add(ANSWERS_DAYS, 'day').endOf('day')) ? ` Lịch khám ${when} vẫn giữ nguyên.` : ` Lịch tái khám ${when} được tính là đã khám bằng phiếu này.`;
}
const dayFromToday = (days) => (days ? dayjs().add(days, 'day').format('YYYY-MM-DD') : '');

/** A numbered part of the exam: what was found, the conclusion, what follows from it. */
function Step({ n, title, sub, tone, extra }) {
  return (
    <div className="vet-exam-step">
      <span className={`vet-exam-step-n${tone ? ` vet-tone-${tone}` : ''}`}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <div className="vet-exam-step-title">{title}</div>
        {sub && <div className="vet-exam-step-sub">{sub}</div>}
      </div>
      {extra && <div className="ms-auto">{extra}</div>}
    </div>
  );
}

/**
 * The exam form, once the horse is loaded. A filed exam is not edited — a later finding is a new exam.
 * A new exam is the vet's whole answer to a request in one save, in the order it is made:
 *   1. what was found — history, vital signs, clinical findings, the injuries found, the files;
 *   2. the conclusion — diagnosis and health status;
 *   3. what follows from it — how hard the horse may work, what it eats, the prescription — each offering
 *      only what agrees with the status (an injured horse is not cleared to train, an isolated one eats a
 *      sick diet), and set to fit when the status changes.
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
  const clearance = clearanceOf(horse);
  // What the horse eats now (GET /horses feedingDiet): a sick diet, the week back after one, or as planned.
  const eatsNow = horse.feedingDiet || null;
  const sickNow = eatsNow?.diet === 'sick' ? eatsNow.kind : null;

  const initialStatus = HEALTH_META[horse.healthStatus] ? horse.healthStatus : 'eligible';
  /** The level a conclusion starts with: the strictest it allows when the horse is not fit, else what it has now. */
  const levelFor = (status, withRx) => {
    if (SICK.includes(status)) return 'none';
    const allowed = LEVELS_FOR[status];
    if (status === 'eligible') return clearance.restricted || withRx ? 'high' : '';
    if (clearance.restricted && allowed.includes(clearance.level)) return clearance.level;
    return withRx ? 'high' : '';
  };
  /** The diet a conclusion starts with: the one the horse is on when it stays unwell, box rest when it falls ill. */
  const dietFor = (status) => (status === 'eligible' ? '' : SICK.includes(status) ? sickNow || 'rest' : sickNow || 'plan');

  const [history, setHistory] = useState('');
  const [vitals, setVitals] = useState(() => Object.fromEntries(VITALS.map((v) => [v.key, ''])));
  const [weight, setWeight] = useState('');
  const [clinical, setClinical] = useState(() => blankClinical());
  const [diagnosis, setDiagnosis] = useState('');
  const [resultStatus, setResultStatus] = useState(initialStatus);
  const [level, setLevel] = useState(() => (LEVELS_FOR[initialStatus].includes(presetLevel) ? presetLevel : levelFor(initialStatus, false)));
  const [dietKind, setDietKind] = useState(() => dietFor(initialStatus));
  const [dietNote, setDietNote] = useState(() => horse.vetDiet?.note || '');
  const [notes, setNotes] = useState('');
  // The follow-up: set from the conclusion until the vet picks one.
  const [followUp, setFollowUp] = useState(() => dayFromToday(FOLLOW_UP_DAYS[initialStatus]));
  const followPicked = useRef(false);
  const pickFollowUp = (value) => {
    followPicked.current = true;
    setFollowUp(value);
  };
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
  const allowedLevels = LEVELS_FOR[resultStatus];

  // The prescription's level is the exam's: one place to set it. A template that brings its own keeps it
  // when the conclusion allows it; otherwise the exam's level stands.
  const rxLevelSet = useRef(null);
  useEffect(() => {
    if (!prescribing || !level || rx.level === level) return;
    if (rx.level !== rxLevelSet.current && allowedLevels.includes(rx.level)) {
      rxLevelSet.current = rx.level;
      setLevel(rx.level);
      return;
    }
    rxLevelSet.current = level;
    rx.setLevel(level);
  }, [prescribing, level, rx, allowedLevels]);

  const pickStatus = (status) => {
    setResultStatus(status);
    if (!followPicked.current) setFollowUp(dayFromToday(FOLLOW_UP_DAYS[status]));
    // What follows from the conclusion is set to agree with it; what still agrees is left as chosen.
    setLevel((prev) => (LEVELS_FOR[status].includes(prev) || (prev === '' && !prescribing && !SICK.includes(status)) ? prev : levelFor(status, prescribing)));
    setDietKind((prev) => {
      if (status === 'eligible') return '';
      if (SICK.includes(status)) return SICK_DIET_ORDER.includes(prev) ? prev : dietFor(status);
      return prev || dietFor(status);
    });
  };
  const startPrescribing = () => {
    const first = level || levelFor(resultStatus, true);
    rxLevelSet.current = first;
    rx.setLevel(first);
    setLevel(first);
    setPrescribing(true);
  };
  const stopPrescribing = () => {
    setPrescribing(false);
    if (level === 'high' && !clearance.restricted && resultStatus !== 'eligible') setLevel('');
  };

  const openRequests = (requestsQ.data || []).filter((r) => idOf(r.horse) === horse._id);
  const openIncidents = (incidentsQ.data || []).filter((t) => idOf(t.horse) === horse._id);
  // Opened on a horse someone asked about (the trainer, the sensors' stop, the groom): what they said is already the
  // history's opening lines, once; the vet edits from there, and "Chép từ yêu cầu" adds it again if cleared.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || history.trim() || (!openRequests.length && !openIncidents.length)) return;
    prefilled.current = true;
    setHistory(historyFrom(openRequests, openIncidents));
  }, [history, openRequests, openIncidents]);
  const activeInjuries = (injuriesQ.data || []).filter(isActiveInjury);
  const back = `/veterinarian/horses/${horse._id}`;
  const severe = injuries.some((d) => d.severity === 'severe');
  const vitalsOff = VITALS.filter((v) => vitalOff(v, vitals[v.key]));
  const lameness = LAMENESS_GRADES.find((g) => String(g.value) === clinical.lamenessGrade);
  // An exam that finds the horse fit for full work closes what was being tracked — the vet confirms it.
  const clears = !prescribing && resultStatus === 'eligible' && level === 'high' && activeInjuries.length > 0;
  const setClinicalField = (key, value) => setClinical((c) => ({ ...c, [key]: value }));
  const statusMeta = HEALTH_META[resultStatus];

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
    if (!diagnosis.trim()) return setError('Nhập chẩn đoán ở phần Kết luận.');
    if (clinical.capillaryRefillSec !== '' && (Number(clinical.capillaryRefillSec) < 0 || Number(clinical.capillaryRefillSec) > 10)) return setError('Thời gian đổ đầy mao mạch (CRT) từ 0 đến 10 giây.');
    if (weight !== '' && !(Number(weight) > 0)) return setError('Cân nặng phải lớn hơn 0.');
    if (level && !allowedLevels.includes(level)) return setError(`Kết luận "${statusMeta.label}" không đi cùng mức "${LEVEL_META[level].label.toLowerCase()}".`);
    if (resultStatus !== 'eligible' && !DIET_KINDS[dietKind]) return setError('Chọn chế độ ăn ở phần Chỉ định.');
    if (followUp && !dayjs(followUp).isAfter(dayjs(), 'day')) return setError('Ngày tái khám phải từ ngày mai trở đi.');
    if (prescribing) {
      const problem = rx.problem({ fallbackReason: diagnosis });
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
    // Dated the moment it is saved.
    const when = new Date();
    const payload = {
      horse: horse._id,
      date: when,
      diagnosis: diagnosis.trim(),
      history: history.trim(),
      resultStatus,
      // While a prescription is written here, its level is the one that counts; injured or isolated, the status
      // itself stops all training until a vet clears the horse.
      clearedLevel: prescribing || SICK.includes(resultStatus) ? null : level || null,
      // Fit: it eats as its plan says (the server builds the week back up); otherwise the vet's diet.
      dietPlan: resultStatus === 'eligible' ? null : { kind: dietKind, note: dietNote.trim() },
      vitalSigns,
      clinical: clinicalBody,
      notes: notes.trim(),
      // The follow-up becomes the horse's next exam due, with its reminder.
      followUpAt: followUp ? dayjs(`${followUp}T08:00`).toDate() : null,
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
        await vetApi.createTreatment({ horse: horse._id, healthRecord: recordId, status: 'ongoing', ...rx.payload({ fallbackReason: diagnosis }) });
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

  // ---- 3. What follows from the conclusion ----
  const levelOptions = [
    ...(!prescribing && !SICK.includes(resultStatus) ? [{ value: '', label: 'Không đổi' }] : []),
    ...allowedLevels.map((key) => ({ value: key, label: LEVEL_META[key].label, tone: LEVEL_META[key].tone, icon: LEVEL_META[key].icon })),
  ];
  const levelHint = !level
    ? clearance.restricted
      ? `Giữ mức hiện tại: ${LEVEL_META[clearance.level].label.toLowerCase()}.`
      : 'Không đổi mức tập của ngựa.'
    : `${LEVEL_META[level].desc} ${prescribing ? 'Áp dụng trong thời gian điều trị theo đơn bên dưới.' : 'Áp dụng ngay khi lưu: buổi tập vượt mức bị hủy, HLV được báo.'}`;
  const dietOptions = (SICK.includes(resultStatus) ? SICK_DIET_ORDER : ['plan', ...SICK_DIET_ORDER]).map((key) => ({ value: key, label: DIET_KINDS[key].label, icon: DIET_KINDS[key].icon, tone: key === 'plan' ? 'good' : 'watch' }));
  const dietSummary =
    resultStatus === 'eligible'
      ? sickNow
        ? 'Ăn lại theo kế hoạch, tăng dần'
        : null
      : DIET_KINDS[dietKind]?.label;

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
            {sickNow && (
              <Pill tone="watch" icon={DIET_KINDS[sickNow]?.icon}>
                Đang ăn: {DIET_KINDS[sickNow]?.label.toLowerCase()}
              </Pill>
            )}
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
        <section className="vet-card vet-exam">
          <div className="vet-card-body">
            {/* ---------- 1. What was found ---------- */}
            <Step
              n={1}
              title="Khám"
              sub="Bệnh sử, chỉ số, lâm sàng và chấn thương tìm thấy"
              extra={
                <div className="d-flex align-items-center gap-2 vet-small">
                  <span className="vet-muted text-nowrap">
                    <i className="bi bi-person-badge me-1" aria-hidden="true" />
                    {user?.name || '—'}
                  </span>
                  {/* The exam is dated when it is saved: the day it is filled in, never another one. */}
                  <span className="vet-muted text-nowrap" title="Ngày giờ khám ghi nhận lúc lưu phiếu">
                    <i className="bi bi-calendar3 me-1" aria-hidden="true" />
                    {new Date().toLocaleDateString('vi-VN')} · ghi nhận khi lưu
                  </span>
                </div>
              }
            />

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

            {/* ---------- 2. The conclusion ---------- */}
            <Step n={2} title="Kết luận" sub="Chẩn đoán và tình trạng sức khỏe — phần chỉ định bên dưới đi theo tình trạng này" />

            <div className="d-flex flex-column gap-3">
              <Field label="Chẩn đoán" required>
                <Form.Control value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="VD: Viêm gân gấp nông chân trước trái" />
              </Field>
              <Field label="Tình trạng sức khỏe" hint={STATUS_HINT[resultStatus]}>
                <Choices
                  value={resultStatus}
                  onChange={pickStatus}
                  label="Tình trạng sức khỏe"
                  options={HEALTH_ORDER.map((key) => ({ value: key, label: HEALTH_META[key].label, tone: HEALTH_META[key].tone, icon: HEALTH_META[key].icon }))}
                />
              </Field>
              {severe && !SICK.includes(resultStatus) && (
                <Callout
                  tone="watch"
                  icon="bi-bandaid-fill"
                  action={
                    <Button size="sm" variant="vet-outline" onClick={() => pickStatus('injured')}>
                      Đặt “Chấn thương”
                    </Button>
                  }
                >
                  Phiếu có chấn thương nặng: khi lưu, ngựa được tính là “Chấn thương” theo chấn thương đó.
                </Callout>
              )}
              {resultStatus === 'eligible' && !severe && (vitalsOff.length > 0 || Number(clinical.lamenessGrade) >= 2) && (
                <Callout
                  tone="watch"
                  icon="bi-exclamation-triangle-fill"
                  action={
                    <Button size="sm" variant="vet-outline" onClick={() => pickStatus('monitoring')}>
                      Đặt “Cần theo dõi”
                    </Button>
                  }
                >
                  {Number(clinical.lamenessGrade) >= 2 ? `Ngựa què độ ${clinical.lamenessGrade}` : `${vitalsOff.map((v) => v.label.toLowerCase()).join(', ')} ngoài ngưỡng`} nhưng kết luận “Đủ điều kiện”.
                </Callout>
              )}
            </div>

            {/* ---------- 3. What follows from it ---------- */}
            <Step n={3} tone={statusMeta.tone} title={`Chỉ định · ${statusMeta.label}`} sub="Vận động, ăn uống và đơn thuốc cho thời gian tới" />

            <Section title="Vận động">
              {SICK.includes(resultStatus) ? (
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <LevelPill level="none" />
                  <span className="vet-small vet-muted">
                    Ngựa {resultStatus === 'quarantined' ? 'cách ly' : 'chấn thương'} không tập: mọi buổi tập bị hủy cho tới khi bác sĩ cho tập lại. Dắt đi bộ, chườm… ghi trong y lệnh chăm sóc của đơn thuốc.
                  </span>
                </div>
              ) : (
                <>
                  <Choices value={level} onChange={setLevel} label="Mức vận động cho phép" options={levelOptions} />
                  <div className="vet-choice-hint">{levelHint}</div>
                </>
              )}
              {prescribing && level && level !== 'high' && !SICK.includes(resultStatus) && (
                <Form.Control
                  className="mt-2"
                  value={rx.reason}
                  onChange={(e) => rx.setReason(e.target.value)}
                  placeholder={level === 'none' ? 'Lý do khóa tập — để trống thì dùng chẩn đoán' : 'Chỉ dẫn vận động — VD: chỉ đi bộ thả lỏng 20–30 phút/ngày'}
                  aria-label="Lý do / chỉ dẫn vận động"
                />
              )}
              {clears && (
                <Form.Check
                  className="mt-2"
                  id="heal-old-injuries"
                  type="checkbox"
                  checked={healOld}
                  onChange={(e) => setHealOld(e.target.checked)}
                  label={`Đánh dấu đã khỏi: ${activeInjuries.map((m) => shortBodyPart(m.bodyPart)).join(', ')}`}
                />
              )}
            </Section>

            <Section title="Ăn uống">
              {resultStatus === 'eligible' ? (
                sickNow ? (
                  <Callout tone="good" icon="bi-arrow-up-right-circle-fill">
                    Ngựa đang ăn chế độ “{DIET_KINDS[sickNow]?.label.toLowerCase()}”. Khi lưu, khẩu phần về lại theo kế hoạch tập, {RAMP_TEXT} cho dạ dày quen lại.
                  </Callout>
                ) : (
                  <div className="vet-small vet-muted">
                    {eatsNow?.diet === 'ramp' ? `Ngựa đang tập ăn lại sau bệnh (ngày ${eatsNow.day}/${eatsNow.days}) — giữ nguyên.` : 'Ăn theo kế hoạch tập, không đổi.'}
                  </div>
                )
              ) : (
                <>
                  <Choices value={dietKind} onChange={setDietKind} label="Chế độ ăn" options={dietOptions} />
                  {DIET_KINDS[dietKind] && <div className="vet-choice-hint">{DIET_KINDS[dietKind].does}{dietKind !== 'plan' ? ' HLV vẫn chỉnh được lượng trong Khẩu phần ăn.' : ''}</div>}
                  {/* When it starts and when it ends: what the vet is told before choosing. */}
                  <div className="vet-small vet-faint mt-1">
                    <i className="bi bi-clock-history me-1" aria-hidden="true" />
                    {dietKind === 'plan'
                      ? 'Từ bữa kế tiếp sau khi lưu, ngựa ăn theo khẩu phần của kế hoạch tập.'
                      : `Áp dụng từ bữa kế tiếp sau khi lưu, tới khi bác sĩ kết luận “Đủ điều kiện” (hoặc “Cần theo dõi” với “Theo kế hoạch tập”); khi đó khẩu phần về lại theo kế hoạch tập, ${RAMP_TEXT}.`}
                  </div>
                  {dietKind && dietKind !== 'plan' && (
                    <Form.Control
                      className="mt-2"
                      as="textarea"
                      rows={2}
                      maxLength={DIET_NOTE_MAX}
                      value={dietNote}
                      onChange={(e) => setDietNote(e.target.value)}
                      placeholder="Dặn thêm nhân viên chăm sóc — VD: ngâm cỏ 30 phút, cho uống nước ấm, theo dõi phân"
                      aria-label="Dặn về ăn uống"
                    />
                  )}
                </>
              )}
            </Section>

            <Section
              title="Kê đơn"
              extra={
                prescribing ? (
                  <Button size="sm" variant="vet-ghost" className="vet-text-bad" onClick={stopPrescribing} disabled={busy}>
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
                    <PrescriptionFields rx={rx} catalog={catalog} hasCustomTemplates={(templatesQ.data || []).length > 0} busy={busy} compact withLevel={false} onTemplateApplied={() => setError(null)} />
                    {dailyLoadText(rx) && <div className="vet-small vet-muted vet-rx-foot">{dailyLoadText(rx)}</div>}
                  </div>
                )
              ) : (
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <span className="vet-small vet-faint">Thuốc và y lệnh chăm sóc thành việc hằng ngày của nhân viên chăm sóc; mức vận động theo mục Vận động ở trên.</span>
                  <Button size="sm" variant="vet-outline" onClick={startPrescribing} disabled={busy}>
                    <i className="bi bi-capsule" aria-hidden="true" /> Kê đơn trong phiếu này
                  </Button>
                </div>
              )}
            </Section>

            <Section title="Hẹn tái khám">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <Form.Control
                  type="date"
                  value={followUp}
                  min={dayFromToday(1)}
                  max={dayFromToday(180)}
                  onChange={(e) => pickFollowUp(e.target.value)}
                  aria-label="Ngày tái khám"
                  style={{ width: 170 }}
                />
                <Choices
                  value={FOLLOW_UP_CHOICES.find((n) => dayFromToday(n) === followUp)?.toString() ?? (followUp ? 'other' : '')}
                  onChange={(v) => pickFollowUp(v === '' ? '' : dayFromToday(Number(v)))}
                  label="Hẹn tái khám sau"
                  options={[...FOLLOW_UP_CHOICES.map((n) => ({ value: String(n), label: `${n} ngày` })), { value: '', label: 'Không hẹn' }]}
                />
              </div>
              <div className="vet-choice-hint">
                {followUp
                  ? `Tái khám ${dayjs(followUp).format('DD/MM/YYYY')} (sau ${dayjs(followUp).diff(dayjs().startOf('day'), 'day')} ngày): bạn và HLV được nhắc vào ngày đó, chủ ngựa được báo trước 2 ngày, ngựa hiện trong Lịch chăm sóc.`
                  : 'Không hẹn tái khám.'}
                {examDueNote(horse.careSchedule?.nextExamDue, followUp)}
              </div>
            </Section>

            <Section title="Ghi chú & chỉ định thêm">
              <Form.Control as="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Chỉ định thêm, xét nghiệm cần làm…" />
            </Section>

            {error && (
              <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mt-3">
                {error}
              </Callout>
            )}
          </div>
          <div className="vet-form-footer">
            <Button variant="vet-ghost" onClick={() => navigate(back)} disabled={busy}>
              Hủy
            </Button>
            {/* What saving does, in a line: the conclusion and everything that follows from it. */}
            <div className="vet-exam-outcome" aria-label="Khi lưu">
              <span className="vet-faint">Khi lưu:</span>
              <HealthPill status={resultStatus} />
              {SICK.includes(resultStatus) || level ? <LevelPill level={SICK.includes(resultStatus) ? 'none' : level} short /> : null}
              {dietSummary && (
                <Pill tone={resultStatus === 'eligible' || dietKind === 'plan' ? 'good' : 'watch'} icon="bi-basket2">
                  {dietSummary}
                </Pill>
              )}
              {injuries.length > 0 && <Pill tone="bad" icon="bi-bandaid">{injuries.length} chấn thương</Pill>}
              {prescribing && <Pill tone="info" icon="bi-capsule">Đơn thuốc</Pill>}
              {followUp && <Pill tone="neutral" icon="bi-calendar-check">Tái khám {dayjs(followUp).format('DD/MM')}</Pill>}
            </div>
            <BusyButton type="submit" busy={busy} disabled={busy}>
              Lưu phiếu khám
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
