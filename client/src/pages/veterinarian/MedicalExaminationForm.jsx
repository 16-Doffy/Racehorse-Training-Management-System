import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Form } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import InjuryModal from '../../components/veterinarian/InjuryModal';
import PrescriptionFields, { dailyLoadText } from '../../components/veterinarian/PrescriptionFields';
import RequestDetails from '../../components/veterinarian/RequestDetails';
import { medsSummary, periodOf } from '../../components/veterinarian/TreatmentList';
import useConfirm from '../../components/veterinarian/useConfirm';
import usePrescription from '../../components/veterinarian/usePrescription';
import { prescribableCatalog } from '../../components/veterinarian/medicineCatalog';
import { BusyButton, Callout, Choices, HealthPill, LevelPill, LoadingBlock, PageHead, Pill, Section } from '../../components/veterinarian/ui';
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
  RECOVERY_STEPS,
  SEVERITY_META,
  VITALS,
  ago,
  clearanceOf,
  errorText,
  fmtDate,
  fmtDateTime,
  fmtShort,
  horseFacts,
  idOf,
  isActiveInjury,
  recoveryMeta,
  shortBodyPart,
  treatmentLevel,
  vitalOff,
} from '../../components/veterinarian/vetFormat';
import { areasText, symptomsText } from '../../constants/examRequest';
import { DIET_KINDS, DIET_NOTE_MAX, RAMP_TEXT, SICK_DIET_ORDER } from '../../constants/diet';
import { message } from '../../lib/antdStatic';
import { useExamRequests, useHealthRecords, useIncidents, useInjuries, useInventory, useRxTemplates, useTreatments, useVetHorse, useVetRefresh } from '../../hooks/useVetData';

// ---------- A follow-up: what the last exams left running, moved on by this one ----------
// What this exam does with each prescription still running: it goes on, it ends, or the prescription written
// here takes over from it (the server ends it then, without leaving the horse waiting for a return assessment).
const RX_ACTIONS = [
  { value: 'keep', label: 'Tiếp tục', icon: 'bi-arrow-repeat', tone: 'neutral' },
  { value: 'end', label: 'Kết thúc', icon: 'bi-stop-circle', tone: 'good' },
  { value: 'replace', label: 'Thay bằng đơn mới', icon: 'bi-arrow-left-right', tone: 'info' },
];
const RX_ACTION_DONE = { end: 'Kết thúc khi lưu', replace: 'Được thay bằng đơn kê trong phiếu này' };

const MAX_FILES = 10; // per exam (server: healthRecord.controller.js MAX_ATTACHMENTS)
const PER_UPLOAD = 5; // per request (server: uploadMiddleware.js)
const MAX_SIZE = 10 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// A choice list from { key: { label, tone } }; pressing the chosen one again clears it ("not examined").
const choicesOf = (meta) => Object.entries(meta).map(([value, m]) => ({ value, label: m.label, tone: m.tone }));
const blankClinical = (c = {}) => ({
  mucousMembrane: c.mucousMembrane || '',
  capillaryRefillSec: c.capillaryRefillSec ?? '',
  gutSounds: c.gutSounds || '',
  hydration: c.hydration || '',
  lamenessGrade: c.lamenessGrade === undefined || c.lamenessGrade === null ? '' : String(c.lamenessGrade),
  lamenessLimb: c.lamenessLimb || '',
});
const num = (value) => (value === '' || value === null || value === undefined ? undefined : Number(value));

// ---------- Fewer keystrokes: what one press fills in ----------
// The clinical findings a healthy horse shows, for "Tất cả bình thường" (fills only what is not examined yet).
const CLINICAL_NORMAL = { mucousMembrane: 'pink', capillaryRefillSec: '1.5', gutSounds: 'normal', hydration: 'normal', lamenessGrade: '0' };
const CRT_PICKS = ['1', '1.5', '2', '2.5', '3', '4', '5'];
// Where a vital sign's stepper starts when the field is empty: the middle of normal at rest.
const VITAL_BASE = { temperatureC: 38.0, heartRate: 36, respiratoryRate: 12 };
const VITAL_DX = { temperatureC: ['Thân nhiệt thấp', 'Sốt'], heartRate: ['Nhịp tim chậm', 'Nhịp tim nhanh'], respiratoryRate: ['Thở chậm', 'Thở nhanh'] };
const REASON_PICKS = ['Khám định kỳ', 'Khám trước khi đua', 'Tái khám theo hẹn', 'Kiểm tra sau buổi tập', 'Ngựa mới nhập chuồng'];
const HEALTHY_DX = 'Sức khỏe tốt, không phát hiện bất thường';
const COMMON_DX = ['Viêm gân gấp', 'Đau bụng (colic)', 'Viêm đường hô hấp trên', 'Mỏi cơ sau tập', 'Viêm móng', 'Vết thương phần mềm'];
const DIET_NOTE_PICKS = ['Ngâm cỏ 30 phút', 'Cho uống nước ấm', 'Chia nhỏ bữa', 'Theo dõi phân', 'Bỏ ăn thì báo bác sĩ'];
const NOTE_PICKS = ['Xét nghiệm máu', 'Chụp X-quang', 'Siêu âm gân', 'Nội soi hô hấp', 'Đo thân nhiệt sáng & chiều', 'Theo dõi ăn uống, đi phân'];

/** The pieces of a text (its lines, or its "; " parts), so a quick pick can be found, added or taken out. */
const piecesOf = (text, sep) =>
  String(text || '')
    .split(sep === '\n' ? /\n/ : /\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
const hasPiece = (text, piece, sep) => piecesOf(text, sep).some((p) => p.toLowerCase() === piece.toLowerCase());
function togglePiece(text, piece, sep) {
  const parts = piecesOf(text, sep);
  const at = parts.findIndex((p) => p.toLowerCase() === piece.toLowerCase());
  if (at >= 0) parts.splice(at, 1);
  else parts.push(piece);
  return parts.join(sep === '\n' ? '\n' : '; ');
}

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
  eligible: 'Ngựa tập được: mức tập theo chỉ định bên dưới, khẩu phần về lại theo kế hoạch tập.',
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
const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// ---------- Pieces of the form ----------

/** One of the three parts of the exam, as its own card. */
function StepCard({ id, n, title, sub, tone, extra, children }) {
  return (
    <section id={id} className="vet-card vet-exam-card">
      <div className="vet-exam-head">
        <span className={`vet-exam-step-n${tone ? ` vet-tone-${tone}` : ''}`}>{n}</span>
        <div style={{ minWidth: 0 }}>
          <div className="vet-exam-step-title">{title}</div>
          {sub && <div className="vet-exam-step-sub">{sub}</div>}
        </div>
        {extra && <div className="ms-auto">{extra}</div>}
      </div>
      <div className="vet-card-body">{children}</div>
    </section>
  );
}

/** A labelled line: the label on the left (with a dot that shows normal / off / not examined, or an icon), the answer on the right. */
function Line({ label, tone, icon, hint, required = false, children }) {
  return (
    <div className="vet-line">
      <div className={`vet-line-label${required ? ' vet-req' : ''}`}>
        {icon ? <i className={`bi ${icon} vet-faint`} aria-hidden="true" /> : <span className={`vet-state-dot${tone ? ` vet-tone-${tone}` : ''}`} aria-hidden="true" />}
        {label}
      </div>
      <div className="vet-line-body">
        {children}
        {hint && <div className="vet-line-hint">{hint}</div>}
      </div>
    </div>
  );
}

/** Quick picks: one press writes the usual words into the text, a second press takes them out again. */
function QuickPicks({ picks, text, sep = '; ', onChange, label, accent = false, max }) {
  if (!picks.length) return null;
  return (
    <div className="vet-picks" role="group" aria-label={label}>
      {label && <span className="vet-picks-label">{label}</span>}
      {picks.map((p) => {
        const on = hasPiece(text, p, sep);
        return (
          <button
            key={p}
            type="button"
            title={p}
            aria-pressed={on}
            className={`vet-pick${on ? ' is-on' : ''}${accent ? ' is-accent' : ''}`}
            onClick={() => {
              const next = togglePiece(text, p, sep);
              onChange(max ? next.slice(0, max) : next);
            }}
          >
            <i className={`bi ${on ? 'bi-check2' : 'bi-plus'}`} aria-hidden="true" />
            <span className="text-truncate">{p}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A number with − / + on each side. Empty, the first press (or ↑ ↓) writes `base` — the usual value — and
 * the next ones step from there; Enter jumps to the next field instead of saving the form.
 */
function Stepper({ value, onChange, step, base, min, max, label, inputRef, onEnter, off }) {
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  const bump = (dir) => {
    if (value === '' || Number.isNaN(Number(value))) return onChange(Number(base).toFixed(decimals));
    let next = Number(value) + dir * Number(step);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return onChange(next.toFixed(decimals));
  };
  return (
    <div className={`vet-num-stepper${off ? ' is-out-of-range' : ''}`}>
      <button type="button" tabIndex={-1} onClick={() => bump(-1)} aria-label={`Giảm ${label}`}>
        <i className="bi bi-dash-lg" aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        className="form-control"
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        placeholder="—"
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            bump(e.key === 'ArrowUp' ? 1 : -1);
          } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onEnter?.();
          }
        }}
      />
      <button type="button" tabIndex={-1} onClick={() => bump(1)} aria-label={`Tăng ${label}`}>
        <i className="bi bi-plus-lg" aria-hidden="true" />
      </button>
    </div>
  );
}

/** A vital sign as a tile: name and unit, the stepper, the normal range (and the last exam's value). */
function VitalTile({ label, unit, hint, off, children }) {
  return (
    <div className={`vet-vital-tile${off ? ' is-off' : ''}`}>
      <div className="vet-vital-tile-head">
        <span>{label}</span>
        <span className="vet-faint">{unit}</span>
      </div>
      {children}
      <div className="vet-vital-tile-hint">{hint}</div>
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
 * Most of it is pressed rather than typed: findings are chips (with "all normal" in one press), vitals step
 * from the normal value, and the diagnosis and notes offer the words the findings point to.
 */
function ExamForm({ horse, presetLevel }) {
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const refresh = useVetRefresh();
  const [confirm, confirmDialog] = useConfirm();
  const requestsQ = useExamRequests();
  const incidentsQ = useIncidents();
  const injuriesQ = useInjuries(horse._id);
  const recordsQ = useHealthRecords(horse._id);
  const treatmentsQ = useTreatments(horse._id);
  const stockQ = useInventory();
  const templatesQ = useRxTemplates();
  const fileInput = useRef(null);
  const vitalRefs = useRef([]);
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
  const [dragging, setDragging] = useState(false);
  const [injuries, setInjuries] = useState([]); // drafts: { _id: 'draft-n', bodyPart, severity, … }
  const [injuryDialog, setInjuryDialog] = useState(null); // { draft? }
  const [prescribing, setPrescribing] = useState(false);
  // A follow-up moves on what the last exams left running. Only what the vet chose is kept here; the rest
  // follows the conclusion (see actionOf / stageOf below).
  const [rxAction, setRxAction] = useState({}); // treatment id → 'keep' | 'end' | 'replace'
  const [stagePick, setStagePick] = useState({}); // injury id → recovery stage
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // What a save that failed part-way already wrote, so saving again finishes it without doubling it.
  const done = useRef({ recordId: null, injuries: new Set(), staged: new Set(), ended: new Set(), treatment: false });
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
  // ---- What the last exams left running ----
  const ongoing = (treatmentsQ.data || []).filter((t) => t.status === 'ongoing');
  /**
   * Picks what happens to a running prescription. 'replace': the prescription written here takes over from it
   * (one at most) — started from its medicines when `load`, so the vet only changes what changes.
   */
  const setAction = (t, action, { load = true } = {}) => {
    setRxAction((prev) => {
      const next = { ...prev, [t._id]: action };
      if (action === 'replace') Object.keys(next).forEach((id) => id !== t._id && next[id] === 'replace' && (next[id] = 'keep'));
      return next;
    });
    if (action === 'replace' && load) {
      rx.loadFrom(t);
      const own = treatmentLevel(t);
      const first = LEVELS_FOR[resultStatus].includes(own) ? own : level || levelFor(resultStatus, true);
      rxLevelSet.current = first;
      rx.setLevel(first);
      setLevel(first);
      setPrescribing(true);
    }
    // Ending one that still holds the horse back, with "Không đổi" chosen: say how hard it may work from now
    // on, or it stays held at that level waiting for a return assessment.
    if (action === 'end' && treatmentLevel(t) !== 'high' && !level && !SICK.includes(resultStatus)) {
      setLevel(resultStatus === 'eligible' ? 'high' : LEVELS_FOR[resultStatus].includes(treatmentLevel(t)) ? treatmentLevel(t) : 'light');
    }
  };
  const startPrescribing = () => {
    // A horse already on one prescription: the new one takes over from it, from its medicines — not a second
    // prescription running alongside (the vet can still pick "Kê thêm song song").
    if (ongoing.length === 1) return setAction(ongoing[0], 'replace');
    const first = level || levelFor(resultStatus, true);
    rxLevelSet.current = first;
    rx.setLevel(first);
    setLevel(first);
    return setPrescribing(true);
  };
  const stopPrescribing = () => {
    setPrescribing(false);
    setRxAction((prev) => Object.fromEntries(Object.entries(prev).map(([id, a]) => [id, a === 'replace' ? 'keep' : a])));
    if (level === 'high' && !clearance.restricted && resultStatus !== 'eligible') setLevel('');
  };

  const openRequests = (requestsQ.data || []).filter((r) => idOf(r.horse) === horse._id);
  const openIncidents = (incidentsQ.data || []).filter((t) => idOf(t.horse) === horse._id);
  // Opened on a horse someone asked about (the trainer, the sensors' stop, the groom): what they said is already the
  // history's opening lines, once; the vet edits from there, and "Chép từ yêu cầu" adds it again if cleared.
  const activeInjuries = (injuriesQ.data || []).filter(isActiveInjury);
  const records = recordsQ.data || [];
  const lastRecord = records[0] || null;
  // A follow-up: the horse comes back with what the last exams left running (a prescription, injuries).
  const isFollowUp = ongoing.length > 0 || activeInjuries.length > 0;
  // Without a request, a follow-up's history starts from the last exam.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || history.trim() || requestsQ.isLoading || incidentsQ.isLoading) return;
    if (openRequests.length || openIncidents.length) {
      prefilled.current = true;
      setHistory(historyFrom(openRequests, openIncidents));
    } else if (isFollowUp && lastRecord) {
      prefilled.current = true;
      setHistory(`Tái khám theo hẹn\nLần khám trước (${fmtShort(lastRecord.date)}): ${lastRecord.diagnosis || HEALTH_META[lastRecord.resultStatus]?.label || '—'}`);
    }
  }, [history, openRequests, openIncidents, isFollowUp, lastRecord, requestsQ.isLoading, incidentsQ.isLoading]);
  const back = `/veterinarian/horses/${horse._id}`;
  const severe = injuries.some((d) => d.severity === 'severe');
  const vitalsOff = VITALS.filter((v) => vitalOff(v, vitals[v.key]));
  const lameness = LAMENESS_GRADES.find((g) => String(g.value) === clinical.lamenessGrade);
  const setClinicalField = (key, value) => setClinical((c) => ({ ...c, [key]: value }));
  const statusMeta = HEALTH_META[resultStatus];

  // ---- What this exam does to what was running ----
  // Fit for full work, with nothing new prescribed: what held the horse back is over unless the vet says otherwise.
  const fitAgain = !prescribing && resultStatus === 'eligible' && level === 'high';
  const actionOf = (t) => rxAction[t._id] || (fitAgain && treatmentLevel(t) !== 'high' ? 'end' : 'keep');
  const replaced = prescribing ? ongoing.find((t) => actionOf(t) === 'replace') || null : null;
  const ending = ongoing.filter((t) => actionOf(t) === 'end');
  const allEnd = ongoing.length > 0 && ending.length === ongoing.length && !prescribing;
  /** Where each injury tracked so far goes: the vet's pick, else what the conclusion and the treatment mean for it. */
  const stageOf = (m) => {
    if (stagePick[m._id]) return stagePick[m._id];
    if (fitAgain) return 'recovered';
    if (prescribing && m.recoveryStatus === 'new') return 'in_treatment';
    if (allEnd && m.recoveryStatus === 'in_treatment') return 'recovering';
    return m.recoveryStatus;
  };
  const restaged = activeInjuries.filter((m) => stageOf(m) !== m.recoveryStatus);
  const stillActive = activeInjuries.filter((m) => stageOf(m) !== 'recovered');
  // A new injury where one is already tracked is most likely the same one: say so rather than file it twice.
  const trackedParts = new Set(activeInjuries.map((m) => shortBodyPart(m.bodyPart).toLowerCase()));
  const isDuplicate = (d) => trackedParts.has(shortBodyPart(d.bodyPart).toLowerCase());
  // Still held back after saving: a prescription kept that limits training, under a conclusion of full work.
  const keptLimits = ongoing.filter((t) => actionOf(t) === 'keep' && treatmentLevel(t) !== 'high');

  // ---- What the exam found, read as it is filled in ----
  const lastVitals = lastRecord?.vitalSigns || {};
  const lastWeight = horse.weightKg || lastVitals.weightKg || null;
  const crt = clinical.capillaryRefillSec === '' ? null : Number(clinical.capillaryRefillSec);
  const lameGrade = clinical.lamenessGrade === '' ? null : Number(clinical.lamenessGrade);
  const limbText = clinical.lamenessLimb ? ` ${LIMBS[clinical.lamenessLimb].toLowerCase()}` : '';
  const mm = MUCOUS_MEMBRANES[clinical.mucousMembrane];
  const gut = GUT_SOUNDS[clinical.gutSounds];
  const hyd = HYDRATION[clinical.hydration];
  // Everything outside normal: how it reads in the summary (`text`) and the words a diagnosis would use (`dx`).
  const abnormal = [
    ...vitalsOff.map((v) => ({ key: v.key, text: `${v.label} ${vitals[v.key]} ${v.unit}`, dx: VITAL_DX[v.key][Number(vitals[v.key]) > v.max ? 1 : 0], tone: 'bad' })),
    mm && clinical.mucousMembrane !== 'pink' && { key: 'mm', text: `Niêm mạc ${mm.label.toLowerCase()}`, dx: `Niêm mạc ${mm.label.toLowerCase()}`, tone: mm.tone },
    crt !== null && crt > CRT_MAX_SEC && { key: 'crt', text: `CRT ${crt} giây`, dx: 'Tuần hoàn kém (CRT chậm)', tone: 'bad' },
    gut && clinical.gutSounds !== 'normal' && { key: 'gut', text: `Nhu động ruột ${gut.label.toLowerCase()}`, dx: clinical.gutSounds === 'increased' ? 'Tăng nhu động ruột' : 'Nghi đau bụng (colic)', tone: gut.tone },
    hyd && clinical.hydration !== 'normal' && { key: 'hyd', text: hyd.label, dx: hyd.label, tone: hyd.tone },
    lameGrade > 0 && { key: 'lame', text: `Què độ ${lameGrade}/5${limbText}`, dx: `Què độ ${lameGrade}/5${limbText}`, tone: lameness?.tone || 'watch' },
    ...injuries.map((d) => ({
      key: d._id,
      text: `Chấn thương ${shortBodyPart(d.bodyPart)} (${(SEVERITY_META[d.severity]?.label || d.severity).toLowerCase()})`,
      dx: `Chấn thương ${shortBodyPart(d.bodyPart)}`,
      tone: d.severity === 'severe' ? 'bad' : 'watch',
    })),
  ].filter(Boolean);
  const examItems = [...VITALS.map((v) => vitals[v.key]), weight, ...Object.keys(CLINICAL_NORMAL).map((k) => clinical[k])];
  const examined = examItems.filter((x) => x !== '').length;
  const clinicalLeft = Object.keys(CLINICAL_NORMAL).filter((k) => clinical[k] === '').length;
  const fillNormal = () => setClinical((c) => ({ ...c, ...Object.fromEntries(Object.entries(CLINICAL_NORMAL).filter(([k]) => c[k] === '')) }));

  // The diagnosis, offered: first what the findings point to, then this horse's past diagnoses and the usual ones.
  const dxFromFindings = [...new Set(abnormal.map((a) => a.dx))];
  if (!abnormal.length && examined > 0) dxFromFindings.push(HEALTHY_DX);
  const pastDx = [...new Set(records.map((r) => String(r.diagnosis || '').trim()).filter((d) => d && d.length <= 60))].slice(0, 4);
  const otherDx = [...new Set([...pastDx, ...COMMON_DX, HEALTHY_DX])].filter((d) => !dxFromFindings.includes(d)).slice(0, 8);

  const addFiles = (list) => {
    const picked = Array.from(list || []);
    if (fileInput.current) fileInput.current.value = '';
    if (!picked.length) return undefined;
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
    if (busy) return undefined;
    if (!diagnosis.trim()) {
      scrollToId('exam-step-2');
      return setError('Nhập chẩn đoán ở phần Kết luận (bấm một gợi ý cũng được).');
    }
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
      const parts = [
        isFollowUp ? 'phiếu tái khám' : 'phiếu khám',
        injuries.length && `${injuries.length} chấn thương mới`,
        prescribing && (replaced ? 'đơn thay thế' : 'đơn thuốc'),
        ending.length && `kết thúc ${ending.length} đơn`,
        restaged.length && `${restaged.length} chấn thương chuyển giai đoạn`,
      ].filter(Boolean);
      const twice = injuries.filter(isDuplicate);
      const ok = await confirm({
        title: `Lưu ${parts.join(', ')}?`,
        body: `${twice.length ? `Chấn thương mới ở ${twice.map((d) => shortBodyPart(d.bodyPart)).join(', ')} trùng chỗ với chấn thương đang theo dõi — nếu là cùng một vết thì bỏ bản mới và chuyển giai đoạn của bản cũ. ` : ''}Sau khi lưu không sửa được nữa: phát hiện mới thì lập phiếu khám mới; đơn thuốc chỉ kết thúc hoặc kê đơn mới thay thế; chấn thương chỉ chuyển giai đoạn hồi phục.`,
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
    const payload = {
      horse: horse._id,
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
      // 1. The prescriptions this exam ends, first: the exam, dated after them, is then the return assessment
      //    that clears the horse (ended alone, one that limited training leaves it waiting for one).
      for (const t of ending) {
        if (done.current.ended.has(t._id)) continue;
        // eslint-disable-next-line no-await-in-loop
        await vetApi.updateTreatment(t._id, { status: 'completed' });
        done.current.ended.add(t._id);
      }
      // 2. The exam. Saved already by a try that failed later on: it stays as filed, the rest is finished.
      let recordId = done.current.recordId;
      if (!recordId) {
        // Dated the moment it is saved.
        const saved = await vetApi.createHealthRecord({ ...payload, date: new Date() });
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
      // 3. The injuries found now, then the prescription (which takes them into treatment). A prescription that
      //    replaces a running one ends that one on the server — one prescription, not two on top of each other.
      for (const draft of injuries) {
        if (done.current.injuries.has(draft._id)) continue;
        const { _id, ...body } = draft;
        // eslint-disable-next-line no-await-in-loop
        await vetApi.createInjuryMarker({ ...body, horse: horse._id, healthRecord: recordId });
        done.current.injuries.add(_id);
      }
      if (prescribing && !done.current.treatment) {
        await vetApi.createTreatment({
          horse: horse._id,
          healthRecord: recordId,
          status: 'ongoing',
          ...rx.payload({ fallbackReason: diagnosis }),
          ...(replaced ? { replaces: replaced._id } : {}),
        });
        done.current.treatment = true;
      }
      // 4. Last, the injuries tracked so far go where the vet put them — after the prescriptions, which move
      //    them along on their own (started: into treatment; the last one ended: recovering).
      for (const m of activeInjuries) {
        const stage = stageOf(m);
        if (done.current.staged.has(m._id) || (stage === m.recoveryStatus && !stagePick[m._id])) continue;
        // eslint-disable-next-line no-await-in-loop
        await vetApi.updateInjuryMarker(m._id, { recoveryStatus: stage });
        done.current.staged.add(m._id);
      }
      await refresh();
      const extra = [
        injuries.length && `${injuries.length} chấn thương`,
        prescribing && (replaced ? 'đơn thay thế' : 'đơn thuốc'),
        ending.length && `kết thúc ${ending.length} đơn`,
        restaged.length && `cập nhật ${restaged.length} chấn thương`,
      ].filter(Boolean);
      message.success(`Đã lưu ${isFollowUp ? 'phiếu tái khám' : 'phiếu khám'} cho ${horse.name}${extra.length ? ` kèm ${extra.join(', ')}` : ''}.`);
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
  const rxProblem = prescribing ? rx.problem({ fallbackReason: diagnosis }) : null;
  const ordersReady = (resultStatus === 'eligible' || Boolean(DIET_KINDS[dietKind])) && !rxProblem;

  // A follow-up opens with what was running; the other parts are numbered after it.
  const o = isFollowUp ? 1 : 0;
  const followNote = [
    activeInjuries.length && `${activeInjuries.length - stillActive.length}/${activeInjuries.length} chấn thương khỏi`,
    ongoing.length && `${ending.length + (replaced ? 1 : 0)}/${ongoing.length} đơn kết thúc`,
  ]
    .filter(Boolean)
    .join(' · ');
  // The rail: where the form stands, what was found, and what saving does.
  const steps = [
    ...(isFollowUp ? [{ id: 'exam-follow', n: 1, title: 'Theo dõi từ lần trước', done: true, note: followNote }] : []),
    { id: 'exam-step-1', n: 1 + o, title: 'Khám', done: examined > 0 || injuries.length > 0, note: `${examined}/${examItems.length} mục${injuries.length ? ` · ${injuries.length} chấn thương` : ''}${files.length ? ` · ${files.length} tệp` : ''}` },
    { id: 'exam-step-2', n: 2 + o, title: 'Kết luận', done: Boolean(diagnosis.trim()), note: diagnosis.trim() ? statusMeta.label : 'Chưa có chẩn đoán', warn: !diagnosis.trim() },
    { id: 'exam-step-3', n: 3 + o, title: 'Chỉ định', done: ordersReady, note: rxProblem ? 'Đơn thuốc chưa đủ' : [SICK.includes(resultStatus) ? 'Khóa tập' : level ? LEVEL_META[level].short : 'Giữ mức tập', prescribing && (replaced ? 'thay đơn' : 'có đơn')].filter(Boolean).join(' · '), warn: Boolean(rxProblem) },
  ];
  const outcome = (
    <>
      <HealthPill status={resultStatus} />
      {SICK.includes(resultStatus) || level ? <LevelPill level={SICK.includes(resultStatus) ? 'none' : level} short /> : null}
      {dietSummary && (
        <Pill tone={resultStatus === 'eligible' || dietKind === 'plan' ? 'good' : 'watch'} icon="bi-basket2">
          {dietSummary}
        </Pill>
      )}
      {injuries.length > 0 && <Pill tone="bad" icon="bi-bandaid">{injuries.length} chấn thương mới</Pill>}
      {restaged.length > 0 && <Pill tone="good" icon="bi-bandaid">{restaged.length} chấn thương chuyển giai đoạn</Pill>}
      {prescribing && <Pill tone="info" icon="bi-capsule">{replaced ? 'Thay đơn cũ' : 'Đơn thuốc'}</Pill>}
      {ending.length > 0 && <Pill tone="good" icon="bi-stop-circle">Kết thúc {ending.length} đơn</Pill>}
      {followUp && <Pill tone="neutral" icon="bi-calendar-check">Tái khám {dayjs(followUp).format('DD/MM')}</Pill>}
    </>
  );
  const errorBox = error && (
    <Callout tone="bad" icon="bi-exclamation-circle-fill">
      {error}
    </Callout>
  );

  return (
    <div className="vet-ui vet-exam-page">
      <PageHead
        back={{ label: horse.name, to: back }}
        title={`${isFollowUp ? 'Phiếu tái khám' : 'Phiếu khám'} · ${horse.name}`}
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

      <Form
        noValidate
        className="vet-exam-layout"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          // Ctrl/⌘ + Enter saves from anywhere; a plain Enter in a one-line field does not save half a form.
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            save();
          } else if (e.target.tagName === 'INPUT') e.preventDefault();
        }}
      >
        <div className="vet-exam-main">
          {answers.length > 0 && (
            <section className="vet-card">
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

          {/* ---------- A follow-up: what the last exams left running, moved on with this one ---------- */}
          {isFollowUp && (
            <StepCard
              id="exam-follow"
              n={1}
              title="Theo dõi từ lần trước"
              sub="Chuyển giai đoạn từng chấn thương, quyết định từng đơn đang dùng — lưu cùng phiếu này, không tạo bản trùng"
              extra={
                lastRecord && (
                  <a className="vet-link vet-small" href={`/veterinarian/examinations/${lastRecord._id}`} target="_blank" rel="noreferrer">
                    <i className="bi bi-box-arrow-up-right me-1" aria-hidden="true" />
                    Phiếu {fmtShort(lastRecord.date)}
                  </a>
                )
              }
            >
              {lastRecord && (
                <div className="vet-exam-last">
                  <span className="vet-faint">
                    Lần khám trước {fmtDate(lastRecord.date)}
                    {lastRecord.examinedBy?.name ? ` · BS ${lastRecord.examinedBy.name}` : ''}:
                  </span>
                  <HealthPill status={lastRecord.resultStatus} />
                  <span className="fw-semibold">{lastRecord.diagnosis || '—'}</span>
                  {lastRecord.followUpAt && <span className="vet-faint">· hẹn tái khám {fmtShort(lastRecord.followUpAt)}</span>}
                </div>
              )}

              {activeInjuries.length > 0 && (
                <Section
                  title={`Chấn thương đang theo dõi (${activeInjuries.length})`}
                  extra={
                    stillActive.length > 0 ? (
                      <Button size="sm" variant="vet-outline" onClick={() => setStagePick(Object.fromEntries(activeInjuries.map((m) => [m._id, 'recovered'])))}>
                        <i className="bi bi-check2-all" aria-hidden="true" /> Tất cả đã khỏi
                      </Button>
                    ) : null
                  }
                >
                  <div className="vet-follow-list">
                    {activeInjuries.map((m) => {
                      const stage = stageOf(m);
                      return (
                        <div key={m._id} className="vet-follow-row">
                          <div className="vet-follow-main">
                            <div className="d-flex flex-wrap align-items-center gap-2">
                              <span className="fw-semibold">{shortBodyPart(m.bodyPart)}</span>
                              <Pill tone={SEVERITY_META[m.severity]?.tone}>{SEVERITY_META[m.severity]?.label || m.severity}</Pill>
                            </div>
                            <div className="vet-small vet-faint mt-1">
                              Ghi {fmtShort(m.createdAt)} · đang {recoveryMeta(m.recoveryStatus).label.toLowerCase()}
                              {m.notes ? ` · ${m.notes}` : ''}
                            </div>
                          </div>
                          <div className="vet-follow-act">
                            <Choices
                              className="is-compact"
                              value={stage}
                              onChange={(v) => setStagePick((p) => ({ ...p, [m._id]: v }))}
                              label={`Giai đoạn hồi phục: ${shortBodyPart(m.bodyPart)}`}
                              options={RECOVERY_STEPS.map((s) => ({ value: s.key, label: s.label, tone: s.tone }))}
                            />
                            {stage !== m.recoveryStatus && (
                              <div className="vet-line-hint">
                                → {recoveryMeta(stage).label} khi lưu{stagePick[m._id] ? '' : ' (theo kết luận)'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {ongoing.length > 0 && (
                <Section title={`Đơn đang dùng (${ongoing.length})`}>
                  <div className="vet-follow-list">
                    {ongoing.map((t) => {
                      const action = actionOf(t);
                      const period = periodOf(t);
                      const summary = medsSummary(t);
                      return (
                        <div key={t._id} className="vet-follow-row">
                          <div className="vet-follow-main">
                            <div className="d-flex flex-wrap align-items-center gap-2" style={{ minWidth: 0 }}>
                              <LevelPill level={treatmentLevel(t)} short />
                              <span className="fw-semibold text-truncate" style={{ maxWidth: '100%' }} title={summary.names}>
                                {summary.names}
                              </span>
                            </div>
                            <div className="vet-small vet-muted mt-1">
                              {summary.facts ? `${summary.facts} · ` : ''}
                              {period.range} · <span className={period.late ? 'vet-text-bad fw-semibold' : ''}>{period.label}</span>
                            </div>
                          </div>
                          <div className="vet-follow-act">
                            <Choices className="is-compact" value={action} onChange={(v) => setAction(t, v, { load: !prescribing || rx.empty })} label="Đơn này" options={RX_ACTIONS} />
                            {action !== 'keep' ? (
                              <div className="vet-line-hint">
                                {RX_ACTION_DONE[action]}
                                {rxAction[t._id] ? '' : ' (theo kết luận)'}
                              </div>
                            ) : period.late ? (
                              <div className="vet-line-hint vet-text-bad">Đã quá ngày kết thúc dự kiến — kết thúc, hoặc thay bằng đơn mới.</div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {resultStatus === 'eligible' && stillActive.length > 0 && (
                <Callout tone="watch" icon="bi-info-circle-fill" className="mt-3">
                  Còn {stillActive.length} chấn thương chưa khỏi: sau khi lưu ngựa vẫn được tính “Cần theo dõi” (“Chấn thương” nếu có vết nặng) cho tới khi đánh dấu khỏi.
                </Callout>
              )}
              {resultStatus === 'eligible' && keptLimits.length > 0 && (
                <Callout
                  tone="watch"
                  icon="bi-lock-fill"
                  className="mt-3"
                  action={
                    <Button size="sm" variant="vet-outline" onClick={() => keptLimits.forEach((t) => setAction(t, 'end'))}>
                      Kết thúc {keptLimits.length > 1 ? 'các đơn này' : 'đơn này'}
                    </Button>
                  }
                >
                  Đơn đang tiếp tục vẫn giới hạn tập ({keptLimits.map((t) => LEVEL_META[treatmentLevel(t)].short.toLowerCase()).join(', ')}): ngựa chưa tập bình thường được dù kết luận “Đủ điều kiện”.
                </Callout>
              )}
            </StepCard>
          )}

          {/* ---------- 1. What was found ---------- */}
          <StepCard id="exam-step-1" n={1 + o} title="Khám" sub="Bấm chọn là chính — chỉ gõ khi cần ghi thêm">
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
              <QuickPicks picks={REASON_PICKS} text={history} sep={'\n'} onChange={setHistory} label="Lý do khám" />
              <Form.Control as="textarea" rows={2} value={history} onChange={(e) => setHistory(e.target.value)} placeholder="Bấm lý do ở trên, hoặc ghi triệu chứng, từ khi nào, diễn tiến, những gì đã làm cho ngựa…" className="mt-2" />
            </Section>

            <Section
              title="Chỉ số sinh tồn"
              extra={<span className="vet-small vet-faint">Bấm − / + (hoặc ↑ ↓) để điền nhanh từ mức chuẩn · Enter sang ô kế</span>}
            >
              <div className="vet-vital-grid">
                {VITALS.map((v, i) => {
                  const value = vitals[v.key];
                  const off = vitalOff(v, value);
                  const prev = lastVitals[v.key];
                  return (
                    <VitalTile
                      key={v.key}
                      label={v.label}
                      unit={v.unit}
                      off={off}
                      hint={
                        <>
                          {off ? (
                            <span className="vet-text-bad fw-semibold">
                              {Number(value) > v.max ? 'Cao' : 'Thấp'} · chuẩn {v.min}–{v.max}
                            </span>
                          ) : (
                            `Chuẩn ${v.min}–${v.max}`
                          )}
                          {prev !== undefined && prev !== null && <span className="vet-faint"> · trước {prev}</span>}
                        </>
                      }
                    >
                      <Stepper
                        value={value}
                        onChange={(x) => setVitals((s) => ({ ...s, [v.key]: x }))}
                        step={v.step}
                        base={VITAL_BASE[v.key]}
                        min={0}
                        label={v.label}
                        off={off}
                        inputRef={(el) => {
                          vitalRefs.current[i] = el;
                        }}
                        onEnter={() => vitalRefs.current[i + 1]?.focus()}
                      />
                    </VitalTile>
                  );
                })}
                <VitalTile
                  label="Cân nặng"
                  unit="kg"
                  hint={
                    weight !== '' && lastWeight ? (
                      <span>
                        Lần trước {lastWeight} kg ·{' '}
                        <strong>
                          {Number(weight) - lastWeight >= 0 ? '+' : ''}
                          {Number(weight) - lastWeight} kg
                        </strong>
                      </span>
                    ) : lastWeight ? (
                      `Lần trước ${lastWeight} kg`
                    ) : (
                      'Cập nhật cân nặng của ngựa'
                    )
                  }
                >
                  <Stepper
                    value={weight}
                    onChange={setWeight}
                    step="5"
                    base={lastWeight || 500}
                    min={1}
                    label="Cân nặng"
                    inputRef={(el) => {
                      vitalRefs.current[VITALS.length] = el;
                    }}
                    onEnter={() => vitalRefs.current[VITALS.length]?.blur()}
                  />
                </VitalTile>
              </div>
            </Section>

            <Section
              title="Khám lâm sàng"
              extra={
                clinicalLeft > 0 ? (
                  <Button size="sm" variant="vet-outline" onClick={fillNormal}>
                    <i className="bi bi-check2-all" aria-hidden="true" /> {clinicalLeft === Object.keys(CLINICAL_NORMAL).length ? 'Tất cả bình thường' : `Còn lại bình thường (${clinicalLeft})`}
                  </Button>
                ) : (
                  <span className="vet-small vet-faint">Bấm lại một lựa chọn để bỏ chọn</span>
                )
              }
            >
              <div className="vet-lines">
                <Line label="Niêm mạc (lợi)" tone={mm?.tone}>
                  <Choices clearable className="is-compact" value={clinical.mucousMembrane} onChange={(v) => setClinicalField('mucousMembrane', v)} label="Niêm mạc" options={choicesOf(MUCOUS_MEMBRANES)} />
                </Line>
                <Line label="Đổ đầy mao mạch (CRT)" tone={crt === null ? undefined : crt > CRT_MAX_SEC ? 'bad' : 'good'} hint={crt !== null && crt > CRT_MAX_SEC ? <span className="vet-text-bad fw-semibold">Chậm hơn {CRT_MAX_SEC} giây</span> : null}>
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <Choices
                      clearable
                      className="is-compact"
                      value={CRT_PICKS.includes(clinical.capillaryRefillSec) ? clinical.capillaryRefillSec : ''}
                      onChange={(v) => setClinicalField('capillaryRefillSec', v)}
                      label="Đổ đầy mao mạch (giây)"
                      options={CRT_PICKS.map((s) => ({ value: s, label: s, tone: Number(s) > CRT_MAX_SEC ? 'bad' : 'good' }))}
                    />
                    <span className="vet-small vet-faint">giây · chuẩn ≤ {CRT_MAX_SEC}</span>
                  </div>
                </Line>
                <Line label="Nhu động ruột" tone={gut?.tone}>
                  <Choices clearable className="is-compact" value={clinical.gutSounds} onChange={(v) => setClinicalField('gutSounds', v)} label="Nhu động ruột" options={choicesOf(GUT_SOUNDS)} />
                </Line>
                <Line label="Mất nước" tone={hyd?.tone}>
                  <Choices clearable className="is-compact" value={clinical.hydration} onChange={(v) => setClinicalField('hydration', v)} label="Mất nước" options={choicesOf(HYDRATION)} />
                </Line>
                <Line label="Độ què (AAEP 0–5)" tone={lameness?.tone} hint={lameness ? `Độ ${lameness.value}: ${lameness.desc}.` : 'Đánh giá khi cho ngựa đi bộ và chạy kiệu.'}>
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <Choices
                      clearable
                      className="is-compact"
                      value={clinical.lamenessGrade}
                      onChange={(v) => setClinicalField('lamenessGrade', v)}
                      label="Độ què"
                      options={LAMENESS_GRADES.map((g) => ({ value: String(g.value), label: g.label, tone: g.tone, title: `Độ ${g.value}: ${g.desc}` }))}
                    />
                    {lameGrade > 0 && (
                      <>
                        <span className="vet-line-sep" aria-hidden="true" />
                        <Choices
                          clearable
                          className="is-compact"
                          value={clinical.lamenessLimb}
                          onChange={(v) => setClinicalField('lamenessLimb', v)}
                          label="Chân què"
                          options={Object.entries(LIMBS).map(([value, label]) => ({ value, label: label.replace('Chân ', ''), tone: 'watch', title: label }))}
                        />
                      </>
                    )}
                  </div>
                </Line>
              </div>
            </Section>

            <Section title="Chấn thương & tệp đính kèm">
              <div className="vet-exam-pair">
                <div className="vet-exam-box">
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <span className="fw-semibold">
                      <i className="bi bi-bandaid me-1 vet-faint" aria-hidden="true" />
                      Chấn thương ({injuries.length})
                    </span>
                    <Button size="sm" variant="vet-outline" onClick={() => setInjuryDialog({})} disabled={busy}>
                      <i className="bi bi-plus-lg" aria-hidden="true" /> Ghi chấn thương
                    </Button>
                  </div>
                  {injuries.length === 0 ? (
                    <div className="vet-small vet-faint">Đánh dấu chỗ bị thương trên ngựa 3D; chấn thương lưu kèm phiếu và hiện ở trang Chấn thương để theo dõi hồi phục.</div>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {injuries.map((d) => (
                        <div key={d._id} className="vet-exam-injury">
                          <div style={{ minWidth: 0 }}>
                            <div className="d-flex flex-wrap align-items-center gap-2">
                              <span className="fw-semibold">{shortBodyPart(d.bodyPart)}</span>
                              <Pill tone={SEVERITY_META[d.severity]?.tone}>{SEVERITY_META[d.severity]?.label || d.severity}</Pill>
                              <Pill tone={recoveryMeta(prescribing ? 'in_treatment' : 'new').tone}>{prescribing ? `→ ${recoveryMeta('in_treatment').label}` : recoveryMeta('new').label}</Pill>
                            </div>
                            {d.notes && <div className="vet-small vet-muted mt-1">{d.notes}</div>}
                            {isDuplicate(d) && (
                              <div className="vet-small vet-text-bad fw-semibold mt-1">
                                <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
                                Trùng chỗ với chấn thương đang theo dõi — nếu cùng một vết, bỏ bản này và chuyển giai đoạn ở phần “Theo dõi từ lần trước”.
                              </div>
                            )}
                          </div>
                          {/* A draft until the exam is saved: then it is part of the record. */}
                          <div className="d-flex gap-1 ms-auto">
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
                      Chỉ ghi chấn thương <strong>mới</strong> ở đây. {activeInjuries.length} chấn thương đang theo dõi được cập nhật ở{' '}
                      <button type="button" className="vet-link vet-small p-0" onClick={() => scrollToId('exam-follow')}>
                        phần “Theo dõi từ lần trước”
                      </button>
                      .
                    </div>
                  )}
                </div>

                <div
                  className={`vet-exam-box vet-dropzone${dragging ? ' is-dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    addFiles(e.dataTransfer.files);
                  }}
                >
                  <input ref={fileInput} type="file" multiple accept={FILE_TYPES.join(',')} hidden onChange={(e) => addFiles(e.target.files)} />
                  <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                    <span className="fw-semibold">
                      <i className="bi bi-paperclip me-1 vet-faint" aria-hidden="true" />
                      Tệp ({files.length}/{MAX_FILES})
                    </span>
                    <Button size="sm" variant="vet-outline" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES}>
                      <i className="bi bi-upload" aria-hidden="true" /> Chọn tệp
                    </Button>
                  </div>
                  {files.length === 0 ? (
                    <div className="vet-small vet-faint">Kéo thả X-quang, kết quả xét nghiệm, ảnh vết thương vào đây — ảnh hoặc PDF, tối đa 10 MB mỗi tệp.</div>
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
                </div>
              </div>
            </Section>
          </StepCard>

          {/* ---------- 2. The conclusion ---------- */}
          <StepCard id="exam-step-2" n={2 + o} title="Kết luận" sub="Chẩn đoán và tình trạng sức khỏe — phần chỉ định đi theo tình trạng này">
            <div className={`vet-exam-found${abnormal.length ? ' is-off' : examined ? '' : ' is-empty'}`}>
              {abnormal.length > 0 ? (
                <>
                  <span className="vet-exam-found-title">
                    <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" /> Bất thường đã ghi
                  </span>
                  {abnormal.map((a) => (
                    <Pill key={a.key} tone={a.tone}>
                      {a.text}
                    </Pill>
                  ))}
                </>
              ) : (
                <span className="vet-exam-found-title">
                  <i className={`bi ${examined ? 'bi-check-circle-fill' : 'bi-dash-circle'}`} aria-hidden="true" />
                  {examined ? `Chưa thấy bất thường trong ${examined} mục đã khám` : 'Chưa ghi kết quả khám nào ở phần 1'}
                </span>
              )}
            </div>

            <div className="vet-lines">
              <Line label="Chẩn đoán" icon="bi-clipboard2-pulse" required>
                <Form.Control value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Bấm gợi ý bên dưới hoặc gõ — VD: Viêm gân gấp nông chân trước trái" isInvalid={Boolean(error) && !diagnosis.trim()} />
                <QuickPicks picks={dxFromFindings} text={diagnosis} onChange={setDiagnosis} label="Theo kết quả khám" accent />
                <QuickPicks picks={otherDx} text={diagnosis} onChange={setDiagnosis} label={pastDx.length ? 'Từng chẩn đoán / hay gặp' : 'Hay gặp'} />
              </Line>
              <Line label="Tình trạng sức khỏe" icon="bi-heart-pulse" hint={STATUS_HINT[resultStatus]}>
                <Choices
                  value={resultStatus}
                  onChange={pickStatus}
                  label="Tình trạng sức khỏe"
                  options={HEALTH_ORDER.map((key) => ({ value: key, label: HEALTH_META[key].label, tone: HEALTH_META[key].tone, icon: HEALTH_META[key].icon }))}
                />
              </Line>
            </div>
            {severe && !SICK.includes(resultStatus) && (
              <Callout
                tone="watch"
                icon="bi-bandaid-fill"
                className="mt-3"
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
                className="mt-3"
                action={
                  <Button size="sm" variant="vet-outline" onClick={() => pickStatus('monitoring')}>
                    Đặt “Cần theo dõi”
                  </Button>
                }
              >
                {Number(clinical.lamenessGrade) >= 2 ? `Ngựa què độ ${clinical.lamenessGrade}` : `${vitalsOff.map((v) => v.label.toLowerCase()).join(', ')} ngoài ngưỡng`} nhưng kết luận “Đủ điều kiện”.
              </Callout>
            )}
          </StepCard>

          {/* ---------- 3. What follows from it ---------- */}
          <StepCard id="exam-step-3" n={3 + o} tone={statusMeta.tone} title={`Chỉ định · ${statusMeta.label}`} sub="Vận động, ăn uống, đơn thuốc và lịch tái khám — đã đặt sẵn theo kết luận">
            <div className="vet-lines">
              <Line label="Vận động" icon="bi-person-walking" hint={SICK.includes(resultStatus) ? null : levelHint}>
                {SICK.includes(resultStatus) ? (
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <LevelPill level="none" />
                    <span className="vet-small vet-muted">
                      Ngựa {resultStatus === 'quarantined' ? 'cách ly' : 'chấn thương'} không tập: mọi buổi tập bị hủy cho tới khi bác sĩ cho tập lại. Dắt đi bộ, chườm… ghi trong y lệnh chăm sóc của đơn thuốc.
                    </span>
                  </div>
                ) : (
                  <Choices value={level} onChange={setLevel} label="Mức vận động cho phép" options={levelOptions} />
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
                {isFollowUp && fitAgain && (restaged.length > 0 || ending.length > 0) && (
                  <div className="vet-line-hint">
                    <i className="bi bi-check2-circle me-1" aria-hidden="true" />
                    Tập lại bình thường: {[restaged.length && `${restaged.length} chấn thương chuyển “đã khỏi”`, ending.length && `kết thúc ${ending.length} đơn đang giới hạn tập`].filter(Boolean).join(', ')} — chỉnh ở phần “Theo dõi từ lần trước”.
                  </div>
                )}
              </Line>

              <Line label="Ăn uống" icon="bi-basket2">
                {resultStatus === 'eligible' ? (
                  sickNow ? (
                    <Callout tone="good" icon="bi-arrow-up-right-circle-fill">
                      Ngựa đang ăn chế độ “{DIET_KINDS[sickNow]?.label.toLowerCase()}”. Khi lưu, khẩu phần về lại theo kế hoạch tập, {RAMP_TEXT} cho dạ dày quen lại.
                    </Callout>
                  ) : (
                    <div className="vet-small vet-muted pt-1">
                      {eatsNow?.diet === 'ramp' ? `Ngựa đang tập ăn lại sau bệnh (ngày ${eatsNow.day}/${eatsNow.days}) — giữ nguyên.` : 'Ăn theo kế hoạch tập, không đổi.'}
                    </div>
                  )
                ) : (
                  <>
                    <Choices value={dietKind} onChange={setDietKind} label="Chế độ ăn" options={dietOptions} />
                    {DIET_KINDS[dietKind] && (
                      <div className="vet-line-hint">
                        {DIET_KINDS[dietKind].does}
                        {dietKind !== 'plan' ? ' HLV vẫn chỉnh được lượng trong Khẩu phần ăn.' : ''}{' '}
                        {dietKind === 'plan' ? 'Áp dụng từ bữa kế tiếp sau khi lưu.' : `Áp dụng từ bữa kế tiếp tới khi bác sĩ cho ăn lại theo kế hoạch (${RAMP_TEXT}).`}
                      </div>
                    )}
                    {dietKind && dietKind !== 'plan' && (
                      <>
                        <QuickPicks picks={DIET_NOTE_PICKS} text={dietNote} onChange={setDietNote} label="Dặn nhanh" max={DIET_NOTE_MAX} />
                        <Form.Control
                          className="mt-2"
                          as="textarea"
                          rows={1}
                          maxLength={DIET_NOTE_MAX}
                          value={dietNote}
                          onChange={(e) => setDietNote(e.target.value)}
                          placeholder="Dặn thêm nhân viên chăm sóc (không bắt buộc)"
                          aria-label="Dặn về ăn uống"
                        />
                      </>
                    )}
                  </>
                )}
              </Line>

              <Line label="Kê đơn" icon="bi-capsule">
                {prescribing ? (
                  stockQ.isLoading || templatesQ.isLoading ? (
                    <LoadingBlock rows={2} height={56} />
                  ) : (
                    <div className="vet-subtle p-3">
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                        {/* With a prescription running: this one takes over from it, or runs beside it — said, not stacked by accident. */}
                        {ongoing.length > 0 ? (
                          <Choices
                            className="is-compact"
                            value={replaced?._id || 'add'}
                            onChange={(v) => {
                              const t = ongoing.find((x) => x._id === v);
                              if (t) setAction(t, 'replace', { load: rx.empty });
                              else setRxAction((prev) => Object.fromEntries(Object.entries(prev).map(([id, a]) => [id, a === 'replace' ? 'keep' : a])));
                            }}
                            label="Đơn mới này"
                            options={[
                              ...ongoing.map((t) => ({ value: t._id, label: `Thay đơn ${periodOf(t).range}`, icon: 'bi-arrow-left-right', tone: 'info', title: medsSummary(t).names })),
                              { value: 'add', label: 'Kê thêm, chạy song song', icon: 'bi-plus-lg', tone: 'watch' },
                            ]}
                          />
                        ) : (
                          <span />
                        )}
                        <Button size="sm" variant="vet-ghost" className="vet-text-bad" onClick={stopPrescribing} disabled={busy}>
                          <i className="bi bi-x-lg" aria-hidden="true" /> Bỏ đơn
                        </Button>
                      </div>
                      {ongoing.length > 0 && (
                        <div className="vet-line-hint mt-0 mb-2">
                          {replaced
                            ? `Đơn ${periodOf(replaced).range} (${medsSummary(replaced).names}) kết thúc khi lưu, đơn này thay chỗ — thuốc đã chép sang, chỉ sửa phần thay đổi.`
                            : 'Đơn này chạy song song với đơn đang dùng: nhân viên chăm sóc nhận cả hai, mức tập tính theo đơn chặt hơn.'}
                        </div>
                      )}
                      <PrescriptionFields rx={rx} catalog={catalog} hasCustomTemplates={(templatesQ.data || []).length > 0} busy={busy} compact withLevel={false} onTemplateApplied={() => setError(null)} />
                      {dailyLoadText(rx) && <div className="vet-small vet-muted vet-rx-foot">{dailyLoadText(rx)}</div>}
                    </div>
                  )
                ) : (
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <Button size="sm" variant="vet-outline" onClick={startPrescribing} disabled={busy}>
                      <i className="bi bi-capsule" aria-hidden="true" /> {ongoing.length === 1 ? 'Kê đơn mới thay đơn đang dùng' : 'Kê đơn trong phiếu này'}
                    </Button>
                    <span className="vet-small vet-faint">
                      {ongoing.length === 1 ? 'Thuốc của đơn đang dùng được chép sang — chỉ sửa phần thay đổi.' : 'Chọn đơn mẫu để điền sẵn thuốc và y lệnh chăm sóc.'}
                    </span>
                  </div>
                )}
              </Line>

              <Line
                label="Hẹn tái khám"
                icon="bi-calendar-check"
                hint={
                  <>
                    {followUp
                      ? `Tái khám ${dayjs(followUp).format('DD/MM/YYYY')} (sau ${dayjs(followUp).diff(dayjs().startOf('day'), 'day')} ngày): bạn và HLV được nhắc vào ngày đó, chủ ngựa được báo trước 2 ngày.`
                      : 'Không hẹn tái khám.'}
                    {examDueNote(horse.careSchedule?.nextExamDue, followUp)}
                  </>
                }
              >
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <Choices
                    value={FOLLOW_UP_CHOICES.find((n) => dayFromToday(n) === followUp)?.toString() ?? (followUp ? 'other' : '')}
                    onChange={(v) => pickFollowUp(v === '' ? '' : dayFromToday(Number(v)))}
                    label="Hẹn tái khám sau"
                    options={[...FOLLOW_UP_CHOICES.map((n) => ({ value: String(n), label: `${n} ngày` })), { value: '', label: 'Không hẹn' }]}
                  />
                  <Form.Control
                    type="date"
                    value={followUp}
                    min={dayFromToday(1)}
                    max={dayFromToday(180)}
                    onChange={(e) => pickFollowUp(e.target.value)}
                    aria-label="Ngày tái khám khác"
                    title="Chọn ngày khác"
                    style={{ width: 160 }}
                  />
                </div>
              </Line>

              <Line label="Ghi chú thêm" icon="bi-journal-text">
                <QuickPicks picks={NOTE_PICKS} text={notes} sep={'\n'} onChange={setNotes} label="Cần làm thêm" />
                <Form.Control as="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Chỉ định thêm, xét nghiệm cần làm… (không bắt buộc)" className="mt-2" />
              </Line>
            </div>
          </StepCard>

          {/* Narrow screens: the summary rail is hidden, so save from a bar under the form. */}
          <div className="vet-exam-only-narrow">
            {errorBox}
            <div className="vet-form-footer vet-exam-footer">
              <Button variant="vet-ghost" onClick={() => navigate(back)} disabled={busy}>
                Hủy
              </Button>
              <div className="vet-exam-outcome" aria-label="Khi lưu">
                {outcome}
              </div>
              <BusyButton type="submit" busy={busy} disabled={busy}>
                Lưu phiếu khám
              </BusyButton>
            </div>
          </div>
        </div>

        {/* ---------- The rail: progress, findings, what saving does ---------- */}
        <aside className="vet-exam-rail vet-exam-only-wide" aria-label="Tóm tắt phiếu khám">
          <div className="vet-card">
            <div className="vet-exam-rail-head">
              <div className="fw-semibold">Tóm tắt phiếu</div>
              <div className="vet-small vet-faint">
                <i className="bi bi-person-badge me-1" aria-hidden="true" />
                {user?.name || '—'} · {new Date().toLocaleDateString('vi-VN')} · ghi giờ khi lưu
              </div>
            </div>
            <div className="vet-card-body d-flex flex-column gap-3">
              <ol className="vet-exam-rail-steps">
                {steps.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={`vet-exam-rail-step${s.done ? ' is-done' : ''}${s.warn ? ' is-warn' : ''}`} onClick={() => scrollToId(s.id)}>
                      <span className="vet-exam-rail-n">{s.done ? <i className="bi bi-check-lg" aria-hidden="true" /> : s.n}</span>
                      <span className="vet-exam-rail-title">{s.title}</span>
                      <span className="vet-exam-rail-note">{s.note}</span>
                    </button>
                  </li>
                ))}
              </ol>

              {abnormal.length > 0 && (
                <div>
                  <div className="vet-exam-rail-label">Bất thường ({abnormal.length})</div>
                  <div className="d-flex flex-wrap gap-1">
                    {abnormal.map((a) => (
                      <Pill key={a.key} tone={a.tone}>
                        {a.text}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="vet-exam-rail-label">Khi lưu</div>
                <div className="d-flex flex-wrap gap-1">{outcome}</div>
              </div>

              {errorBox}

              <div className="d-flex flex-column gap-2">
                <BusyButton type="submit" busy={busy} disabled={busy} className="w-100">
                  <i className="bi bi-check2-circle me-1" aria-hidden="true" /> Lưu phiếu khám
                </BusyButton>
                <Button variant="vet-ghost" onClick={() => navigate(back)} disabled={busy}>
                  Hủy
                </Button>
                <div className="vet-small vet-faint text-center">Ctrl + Enter để lưu nhanh</div>
              </div>
            </div>
          </div>
        </aside>
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
      <div className="vet-ui vet-exam-page">
        <LoadingBlock rows={4} height={80} />
      </div>
    );
  }
  const targetHorse = horseId;
  const problem = horseQ.error || (!horseQ.data && 'Không tìm thấy ngựa cần khám.');
  if (problem) {
    return (
      <div className="vet-ui vet-exam-page">
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
