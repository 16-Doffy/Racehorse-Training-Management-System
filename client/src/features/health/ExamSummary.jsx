import dayjs from 'dayjs';
import { CalendarOutlined, FileOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { DIET_KINDS } from '../../constants/diet';
import { fileHref } from '../../lib/files';
import { VITALS, clinicalFindings, healthMeta, idOf, levelMeta, medTimes, routeLabel, vitalOff, isMedActive } from '../../components/veterinarian/vetFormat';
import { daysFromNow } from './healthDates';
import './healthView.css';

const fmt = (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '—');
const fmtShort = (d) => (d ? dayjs(d).format('DD/MM') : '—');

/** The follow-up the vet booked: its date and how far off it is, as a pill. */
export function FollowUpPill({ date }) {
  if (!date) return null;
  const left = daysFromNow(date);
  const tone = left.days < 0 ? 'bad' : left.days <= 2 ? 'watch' : 'info';
  return (
    <span className={`hv-pill is-${tone}`}>
      <CalendarOutlined /> Tái khám {fmt(date)} · {left.text}
    </span>
  );
}

/**
 * The medicines of a prescription, one per line: name and dose, how it is given and when, from when to
 * when, and whether it is still being given.
 */
export function MedicationList({ medications = [] }) {
  if (!medications.length) return null;
  return (
    <ul className="hv-meds">
      {medications.map((m, i) => {
        const times = medTimes(m);
        const active = isMedActive(m);
        return (
          <li key={`${m.name}-${i}`} className={active ? '' : 'is-done'}>
            <div className="hv-med-main">
              <MedicineBoxOutlined className="hv-med-icon" />
              <div className="min-w-0">
                <div className="hv-med-name">
                  {m.name}
                  {m.dosage && <span className="hv-med-dose"> · {m.dosage}</span>}
                </div>
                <div className="hv-med-sub">
                  {[routeLabel(m.route), m.frequency, times.length ? `lúc ${times.join(', ')}` : null, m.startDate || m.endDate ? `${fmtShort(m.startDate)} → ${m.endDate ? fmtShort(m.endDate) : 'chưa định ngày'}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {m.instructions && <div className="hv-med-sub">{m.instructions}</div>}
              </div>
            </div>
            <span className={`hv-pill is-${active ? 'info' : 'neutral'}`}>{m.status === 'cancelled' ? 'Đã ngừng' : active ? 'Đang dùng' : 'Đã xong'}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** One prescription: its medicines, what the stable does, and how hard the horse may work meanwhile. */
export function TreatmentBlock({ treatment }) {
  const ongoing = treatment.status === 'ongoing';
  const level = ongoing ? levelMeta(treatment.isTrainingLocked ? 'none' : treatment.trainingLevel) : null;
  return (
    <div className="hv-rx">
      <div className="hv-rx-head">
        <span className="hv-rx-title">
          Đơn điều trị {fmtShort(treatment.startDate || treatment.createdAt)} → {treatment.endDate ? fmtShort(treatment.endDate) : 'chưa định ngày'}
          {treatment.prescribedBy?.name ? ` · BS ${treatment.prescribedBy.name}` : ''}
        </span>
        <span className="flex flex-wrap gap-1.5">
          <span className={`hv-pill is-${ongoing ? 'info' : 'good'}`}>{ongoing ? 'Đang điều trị' : 'Đã xong'}</span>
          {level && level.tone !== 'good' && <span className={`hv-pill is-${level.tone}`}>{level.short}</span>}
        </span>
      </div>
      <MedicationList medications={treatment.medications} />
      {treatment.careInstructions && <p className="hv-quote">{treatment.careInstructions}</p>}
      {ongoing && treatment.lockReason && <p className="hv-line is-bad">Lý do hạn chế tập: {treatment.lockReason}</p>}
    </div>
  );
}

/**
 * One exam as the vet filed it, read-only, for the trainer and the owner: who and when, the conclusion and
 * how hard the horse may work, why it was examined, the vital signs (flagged outside normal) and what was
 * found by hand and eye, the diagnosis and notes, the prescriptions written on it, the diet it set, the
 * follow-up booked and the files. `treatments`: the horse's prescriptions (those of this exam are shown).
 */
export default function ExamSummary({ record, treatments = [] }) {
  if (!record) return null;
  const result = healthMeta(record.resultStatus);
  const cleared = record.clearedLevel ? levelMeta(record.clearedLevel) : null;
  const findings = clinicalFindings(record);
  const vitals = VITALS.filter((v) => record.vitalSigns?.[v.key] != null && record.vitalSigns[v.key] !== '');
  const mine = treatments.filter((t) => idOf(t.healthRecord) === String(record._id));
  const diet = record.dietPlan?.kind ? DIET_KINDS[record.dietPlan.kind] : null;

  return (
    <div className="hv-exam">
      <div className="hv-exam-head">
        <div className="min-w-0">
          <div className="hv-exam-when">
            {dayjs(record.date).format('DD/MM/YYYY · HH:mm')}
            {record.examinedBy?.name ? ` · BS ${record.examinedBy.name}` : ''}
          </div>
          <div className="hv-exam-diag">{record.diagnosis}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span className={`hv-pill is-${result.tone}`}>{result.label}</span>
          {cleared && <span className={`hv-pill is-${cleared.tone}`}>{cleared.label}</span>}
        </div>
      </div>

      <dl className="hv-grid">
        {record.history && (
          <div className="hv-row is-wide">
            <dt>Lý do khám</dt>
            <dd>{record.history}</dd>
          </div>
        )}
        {vitals.length > 0 && (
          <div className="hv-row">
            <dt>Sinh hiệu</dt>
            <dd className="hv-chips">
              {vitals.map((v) => (
                <span key={v.key} className={`hv-chip${vitalOff(v, record.vitalSigns[v.key]) ? ' is-off' : ''}`} title={`Bình thường ${v.min}–${v.max} ${v.unit}`}>
                  {v.label} <b>{record.vitalSigns[v.key]}</b> {v.unit}
                </span>
              ))}
            </dd>
          </div>
        )}
        {findings.length > 0 && (
          <div className="hv-row">
            <dt>Khám lâm sàng</dt>
            <dd className="hv-chips">
              {findings.map((f) => (
                <span key={f.key} className={`hv-chip${f.off ? ' is-off' : ''}`}>
                  {f.text}
                </span>
              ))}
            </dd>
          </div>
        )}
        {record.notes && (
          <div className="hv-row is-wide">
            <dt>Ghi chú của bác sĩ</dt>
            <dd>{record.notes}</dd>
          </div>
        )}
        {diet && (
          <div className="hv-row is-wide">
            <dt>Chế độ ăn</dt>
            <dd>
              <b>{diet.label}</b> — {diet.does}
              {record.dietPlan.note ? <span className="hv-muted"> · {record.dietPlan.note}</span> : null}
            </dd>
          </div>
        )}
        {record.followUpAt && (
          <div className="hv-row">
            <dt>Tái khám</dt>
            <dd>
              <FollowUpPill date={record.followUpAt} />
            </dd>
          </div>
        )}
        {record.attachments?.length > 0 && (
          <div className="hv-row">
            <dt>Tệp đính kèm</dt>
            <dd className="hv-chips">
              {record.attachments.map((a) => (
                <a key={a.url} href={fileHref(a.url)} target="_blank" rel="noreferrer" className="hv-chip is-link">
                  <FileOutlined /> {a.name || 'Tệp'}
                </a>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {mine.length > 0 && (
        <div className="hv-section">
          <div className="hv-section-title">Điều trị theo lần khám này</div>
          {mine.map((t) => (
            <TreatmentBlock key={t._id} treatment={t} />
          ))}
        </div>
      )}
    </div>
  );
}
