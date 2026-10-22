import { BODY_AREAS, EXAM_SYMPTOMS } from '../../constants/examRequest';
import { OBJECTIVE_LABELS, SESSION_KINDS } from '../../features/training/trainingVocab';
import { Pill } from './ui';
import { PRIORITY_META, ago, fmtDateTime, requestDeadline } from './vetFormat';

const sessionText = (s) =>
  [fmtDateTime(s.scheduledAt), SESSION_KINDS[s.kind]?.label || OBJECTIVE_LABELS[s.objective] || (s.sessionType === 'trial_run' ? 'Chạy thử' : 'Buổi tập')].join(' · ');

/**
 * What an exam request says, for the vet before seeing the horse: who asked and how urgently, by when,
 * what they saw and where, since when, the session it came from, what was already done, and whether
 * training is stopped meanwhile.
 */
export default function RequestDetails({ request, className = '' }) {
  const priority = PRIORITY_META[request.priority] || PRIORITY_META.normal;
  // An answered request is measured at the moment it was answered, not now.
  const answeredAt = request.status && request.status !== 'pending' ? request.resolvedAt || request.updatedAt : null;
  const deadline = requestDeadline(request, answeredAt ? new Date(answeredAt).getTime() : Date.now());
  const answered = answeredAt && {
    label: `Đã trả lời ${fmtDateTime(answeredAt)}`,
    tone: deadline.overdue ? 'watch' : 'good',
    text: `Hạn ${fmtDateTime(deadline.due)} — trả lời ${deadline.overdue ? `trễ ${deadline.label.replace('Quá hạn ', '')}` : 'đúng hạn'}.`,
  };
  const session = request.trainingSession && typeof request.trainingSession === 'object' ? request.trainingSession : null;
  const signs = (request.symptoms || []).filter((k) => EXAM_SYMPTOMS[k]);
  const areas = (request.bodyAreas || []).filter((k) => BODY_AREAS[k]);
  const facts = [
    request.observedAt && ['Phát hiện', `${fmtDateTime(request.observedAt)} (${ago(request.observedAt)})`],
    areas.length > 0 && ['Vùng', areas.map((k) => BODY_AREAS[k]).join(', ')],
    session && ['Buổi tập', sessionText(session)],
    request.firstAid && ['Đã xử lý', request.firstAid],
    ['Hạn khám', answered ? answered.text : deadline.text],
    request.acceptedAt && [
      'Bác sĩ',
      `${request.acceptedBy?.name || 'Bác sĩ'} ${request.priority === 'urgent' ? 'đang tới' : 'đã nhận'}${request.scheduledFor ? `, hẹn ${fmtDateTime(request.scheduledFor)}` : ''}${request.resolutionNote ? ` — ${request.resolutionNote}` : ''}`,
    ],
  ].filter(Boolean);

  return (
    <div className={`vet-subtle vet-request ${className}`}>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <strong>{request.requestedBy?.name || 'Hệ thống'}</strong>
        <span className="vet-small vet-faint">gửi {ago(request.createdAt)}</span>
        <Pill tone={priority.tone}>{priority.label}</Pill>
        <Pill tone={answered ? answered.tone : deadline.tone} icon={answered ? 'bi-check2-circle' : 'bi-alarm'}>
          {answered ? answered.label : deadline.label}
        </Pill>
        {request.holdTraining && !answered && (
          <Pill tone="bad" icon="bi-pause-circle">
            Đang dừng tập chờ khám
          </Pill>
        )}
      </div>
      {signs.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mt-2">
          {signs.map((k) => (
            <span key={k} className="vet-sign">
              {EXAM_SYMPTOMS[k]}
            </span>
          ))}
        </div>
      )}
      {request.reason && <div className="mt-2" style={{ whiteSpace: 'pre-wrap', color: 'var(--vet-ink)' }}>{request.reason}</div>}
      <dl className="vet-request-facts">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
