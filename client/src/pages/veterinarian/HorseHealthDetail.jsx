import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import CareModal from '../../components/veterinarian/CareModal';
import HorseInjuryViewer from '../../components/veterinarian/HorseInjuryViewer';
import IncidentModal from '../../components/veterinarian/IncidentModal';
import InjuryModal from '../../components/veterinarian/InjuryModal';
import RequestDetails from '../../components/veterinarian/RequestDetails';
import TrainingLevelModal from '../../components/veterinarian/TrainingLevelModal';
import TreatmentCard from '../../components/veterinarian/TreatmentCard';
import useConfirm from '../../components/veterinarian/useConfirm';
import { endTreatment, setInjuryStage } from '../../components/veterinarian/vetActions';
import {
  ActionMenu,
  Callout,
  DueChip,
  EmptyNote,
  HealthPill,
  HorseAvatar,
  LevelPill,
  LoadingBlock,
  Pill,
  RecoveryStepper,
  Tabs,
  VetCard,
  Vitals,
} from '../../components/veterinarian/ui';
import {
  CARE_KINDS,
  CARE_ORDER,
  CLEARANCE_SOURCE,
  LEVEL_META,
  SEVERITY_META,
  VITALS,
  ago,
  clearanceOf,
  clinicalFindings,
  errorText,
  fmtDate,
  fmtDateTime,
  horseFacts,
  idOf,
  isActiveInjury,
  shortBodyPart,
  vitalOff,
} from '../../components/veterinarian/vetFormat';
import Horse3D from '../../features/horses/horse3d/Horse3D';
import { careEventDetails } from '../../constants/care';
import { message } from '../../lib/antdStatic';
import { fileHref } from '../../lib/files';
import { useCareEvents, useCareOrders, useExamRequests, useHealthRecords, useIncidents, useInjuries, useTreatments, useVetHorse, useVetRefresh } from '../../hooks/useVetData';

const TABS = ['overview', 'exams', 'treatments', 'injuries', 'care'];

function VitalsLine({ vitalSigns }) {
  const shown = VITALS.filter((v) => vitalSigns?.[v.key] !== undefined && vitalSigns?.[v.key] !== null && vitalSigns?.[v.key] !== '');
  if (!shown.length) return null;
  return (
    <div className="vet-small d-flex flex-wrap gap-3 mt-1">
      {shown.map((v) => (
        <span key={v.key} className={vitalOff(v, vitalSigns[v.key]) ? 'vet-text-bad fw-semibold' : 'vet-muted'}>
          {v.label} {vitalSigns[v.key]} {v.unit}
        </span>
      ))}
    </div>
  );
}

/** Weight, gums, refill, gut sounds, hydration, lameness — what the exam found, those off normal in red. */
function ClinicalLine({ record }) {
  const findings = clinicalFindings(record);
  if (!findings.length) return null;
  return (
    <div className="vet-small d-flex flex-wrap gap-3 mt-1">
      {findings.map((f) => (
        <span key={f.key} className={f.off ? 'vet-text-bad fw-semibold' : 'vet-muted'}>
          {f.text}
        </span>
      ))}
    </div>
  );
}

function ClearedPill({ level }) {
  if (!level) return null;
  return (
    <Pill tone={LEVEL_META[level].tone} icon="bi-speedometer2">
      Cho phép: {LEVEL_META[level].label.toLowerCase()}
    </Pill>
  );
}

function OverviewTab({ horse, records, ongoing, progressOf, injuries, onTab, actions }) {
  const latest = records[0];
  const clearance = clearanceOf(horse);
  const active = injuries.filter(isActiveInjury);
  return (
    <div className="vet-grid-2">
      <div className="vet-stack">
        <VetCard
          title="Lần khám gần nhất"
          icon="bi-clipboard2-pulse"
          extra={
            records.length > 1 && (
              <button type="button" className="vet-link vet-small" onClick={() => onTab('exams')}>
                Tất cả {records.length} lần khám
              </button>
            )
          }
        >
          {latest ? (
            <>
              <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                <HealthPill status={latest.resultStatus} />
                <ClearedPill level={latest.clearedLevel} />
                <span className="vet-small vet-faint">
                  {fmtDate(latest.date || latest.createdAt)} · {latest.examinedBy?.name || 'Bác sĩ'} · {ago(latest.date || latest.createdAt)}
                </span>
              </div>
              <div className="fw-semibold mb-3">{latest.diagnosis}</div>
              {latest.history && <div className="vet-muted mb-3" style={{ whiteSpace: 'pre-wrap' }}>{latest.history}</div>}
              <Vitals vitalSigns={latest.vitalSigns} />
              <ClinicalLine record={latest} />
              {latest.notes && <div className="vet-muted mt-3" style={{ whiteSpace: 'pre-wrap' }}>{latest.notes}</div>}
              <div className="d-flex flex-wrap gap-3 mt-2">
                <button type="button" className="vet-link vet-small" onClick={() => actions.openExam(latest._id)}>
                  <i className="bi bi-file-earmark-medical" aria-hidden="true" /> Xem toàn bộ phiếu khám
                </button>
                {latest.attachments?.length > 0 && (
                  <button type="button" className="vet-link vet-small" onClick={() => actions.openExam(latest._id)}>
                    <i className="bi bi-paperclip" aria-hidden="true" /> {latest.attachments.length} tệp đính kèm
                  </button>
                )}
              </div>
            </>
          ) : (
            <EmptyNote
              icon="bi-clipboard2"
              title="Chưa có phiếu khám"
              action={
                <Button size="sm" variant="vet" onClick={actions.examine}>
                  Khám bệnh
                </Button>
              }
            >
              Ngựa cần một phiếu khám trước khi được xếp buổi tập nặng.
            </EmptyNote>
          )}
        </VetCard>

        <VetCard
          title="Điều trị đang áp dụng"
          icon="bi-capsule"
          count={ongoing.length || null}
          flush
          extra={
            <Button size="sm" variant="vet-outline" onClick={actions.prescribe}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> Kê đơn
            </Button>
          }
        >
          {ongoing.length === 0 ? (
            <EmptyNote icon="bi-capsule" title="Không có điều trị đang áp dụng" />
          ) : (
            ongoing.map((t) => (
              <TreatmentCard key={t._id} treatment={t} progress={progressOf(t._id)} onReplace={() => actions.replaceTreatment(t)} onOpenExam={() => actions.openExam(t.healthRecord)} onEnd={() => actions.endTreatment(t)} onLevel={actions.changeLevel} />
            ))
          )}
        </VetCard>
      </div>

      <div className="vet-stack">
        <VetCard title="Mức vận động" icon="bi-speedometer2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <LevelPill level={clearance.level} lg />
          </div>
          <div className="vet-muted mt-2">{clearance.restricted ? clearance.reason || CLEARANCE_SOURCE[clearance.source] : 'Không có hạn chế y tế — HLV xếp lịch bình thường.'}</div>
          {clearance.restricted && (
            <div className="vet-small vet-faint mt-1">
              {CLEARANCE_SOURCE[clearance.source] && clearance.reason ? `${CLEARANCE_SOURCE[clearance.source]} · ` : ''}
              {clearance.since ? `từ ${fmtDate(clearance.since)}` : ''}
              {clearance.prescribedBy ? ` · ${clearance.prescribedBy}` : ''}
            </div>
          )}
          <Button variant="vet-outline" size="sm" className="w-100 mt-3" onClick={actions.changeLevel}>
            Đổi mức tập
          </Button>
        </VetCard>

        <VetCard
          title="Chấn thương đang theo dõi"
          icon="bi-bandaid"
          count={active.length || null}
          flush
          extra={
            <button type="button" className="vet-link vet-small" onClick={() => actions.newInjury()}>
              Ghi chấn thương
            </button>
          }
        >
          {active.length === 0 ? (
            <EmptyNote icon="bi-shield-check" title="Không có chấn thương" />
          ) : (
            <div className="vet-list">
              {active.map((m) => (
                <div key={m._id} className="vet-row">
                  <div className="vet-row-main">
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <span className="fw-semibold">{shortBodyPart(m.bodyPart)}</span>
                      <Pill tone={SEVERITY_META[m.severity]?.tone}>{SEVERITY_META[m.severity]?.label || m.severity}</Pill>
                    </div>
                    <div className="mt-1">
                      <RecoveryStepper value={m.recoveryStatus} onChange={(stage) => actions.injuryStage(m, stage)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </VetCard>

        <VetCard
          title="Lịch chăm sóc"
          icon="bi-calendar-check"
          flush
          extra={
            <button type="button" className="vet-link vet-small" onClick={() => onTab('care')}>
              Lịch sử
            </button>
          }
        >
          <div className="vet-list">
            {CARE_ORDER.map((kind) => (
              <div key={kind} className="vet-row">
                <i className={`bi ${CARE_KINDS[kind].icon} vet-faint`} aria-hidden="true" />
                <div className="vet-row-main fw-semibold">{CARE_KINDS[kind].label}</div>
                <DueChip date={horse.careSchedule?.[CARE_KINDS[kind].field]} onClick={() => actions.care(kind)} title="Ghi nhận hoặc đổi ngày hẹn" />
              </div>
            ))}
          </div>
        </VetCard>
      </div>
    </div>
  );
}

/**
 * The horse's exams; one opens on its own page with its injuries and prescriptions. A filed exam is not
 * edited (nor its files removed): a later finding is a new exam.
 */
function ExamsTab({ records, onExamine, onOpen }) {
  return (
    <VetCard
      title="Phiếu khám"
      icon="bi-clipboard2-pulse"
      count={records.length || null}
      flush
      extra={
        <Button size="sm" variant="vet" onClick={onExamine}>
          <i className="bi bi-plus-lg" aria-hidden="true" /> Khám bệnh
        </Button>
      }
    >
      {records.length === 0 ? (
        <EmptyNote icon="bi-clipboard2" title="Chưa có phiếu khám" />
      ) : (
        <div className="vet-list">
          {records.map((r) => (
            <div
              key={r._id}
              className="vet-row is-clickable"
              style={{ alignItems: 'flex-start' }}
              role="button"
              tabIndex={0}
              title="Xem toàn bộ phiếu khám"
              onClick={() => onOpen(r._id)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(r._id)}
            >
              <div className="vet-date-block" aria-hidden="true">
                <span>{new Date(r.date || r.createdAt).getDate()}</span>
                <small>Th{new Date(r.date || r.createdAt).getMonth() + 1}</small>
              </div>
              <div className="vet-row-main">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span className="fw-semibold">{r.diagnosis}</span>
                  <HealthPill status={r.resultStatus} />
                  <ClearedPill level={r.clearedLevel} />
                  {r.answeredRequests > 0 && (
                    <Pill tone="info" icon="bi-reply">
                      Theo yêu cầu khám
                    </Pill>
                  )}
                </div>
                {r.history && <div className="vet-small vet-muted mt-1">Bệnh sử: {r.history}</div>}
                <VitalsLine vitalSigns={r.vitalSigns} />
                <ClinicalLine record={r} />
                {r.notes && <div className="vet-muted mt-1" style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</div>}
                {r.attachments?.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {r.attachments.map((att) => (
                      <span key={att._id} className="vet-attachment">
                        <a href={fileHref(att.url)} target="_blank" rel="noopener noreferrer" title={`Mở ${att.name}`} onClick={(e) => e.stopPropagation()}>
                          <i className={`bi ${att.contentType?.startsWith('image/') ? 'bi-image' : 'bi-file-earmark-pdf'}`} aria-hidden="true" />
                          <span className="text-truncate">{att.name}</span>
                        </a>
                      </span>
                    ))}
                  </div>
                )}
                <div className="vet-small vet-faint mt-1">
                  {fmtDateTime(r.date || r.createdAt)} · {r.examinedBy?.name || 'Bác sĩ'}
                </div>
              </div>
              <i className="bi bi-chevron-right vet-faint align-self-center" aria-hidden="true" />
            </div>
          ))}
        </div>
      )}
    </VetCard>
  );
}

/** The horse's injuries. Once recorded, only their recovery moves on (by hand, or with the treatment). */
function InjuriesTab({ horse, injuries, onNew, onStage }) {
  const sorted = [...injuries].sort((a, b) => Number(isActiveInjury(b)) - Number(isActiveInjury(a)) || new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div className="vet-grid-2 is-even">
      <HorseInjuryViewer horse={horse} injuries={injuries.filter(isActiveInjury)} height={420} />
      <VetCard
        title="Chấn thương"
        icon="bi-bandaid"
        count={injuries.length || null}
        flush
        extra={
          <Button size="sm" variant="vet" onClick={onNew}>
            <i className="bi bi-plus-lg" aria-hidden="true" /> Ghi chấn thương
          </Button>
        }
      >
        {sorted.length === 0 ? (
          <EmptyNote icon="bi-shield-check" title="Chưa ghi chấn thương nào" />
        ) : (
          <div className="vet-list">
            {sorted.map((m) => (
              <div key={m._id} className="vet-row" style={{ alignItems: 'flex-start' }}>
                <div className="vet-row-main">
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <span className="fw-semibold" title={m.bodyPart}>
                      {shortBodyPart(m.bodyPart)}
                    </span>
                    <Pill tone={SEVERITY_META[m.severity]?.tone}>{SEVERITY_META[m.severity]?.label || m.severity}</Pill>
                  </div>
                  {m.notes && <div className="vet-small vet-muted mt-1">{m.notes}</div>}
                  <div className="mt-2">
                    <RecoveryStepper value={m.recoveryStatus} onChange={(stage) => onStage(m, stage)} />
                  </div>
                  <div className="vet-small vet-faint mt-1">Ghi {fmtDate(m.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </VetCard>
    </div>
  );
}

const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

function CareTab({ horse, onCare, onDeleteEvent, userId }) {
  const eventsQ = useCareEvents(horse._id);
  // When the tab was opened: an entry can be undone within 24 hours of being made (server rule).
  const [openedAt] = useState(() => Date.now());
  const events = eventsQ.data || [];
  return (
    <div className="vet-stack">
      <div className="vet-care-tiles">
        {CARE_ORDER.map((kind) => (
          <div key={kind} className="vet-card vet-care-tile">
            <div className="d-flex align-items-center gap-2 fw-semibold">
              <i className={`bi ${CARE_KINDS[kind].icon} vet-faint`} aria-hidden="true" />
              {CARE_KINDS[kind].label}
            </div>
            <div className="vet-small vet-muted">Lần tới</div>
            <DueChip date={horse.careSchedule?.[CARE_KINDS[kind].field]} onClick={() => onCare(kind, 'due')} title="Đặt / đổi ngày hẹn lần tới" />
            <Button size="sm" variant="vet-outline" onClick={() => onCare(kind, 'record')}>
              {kind === 'exam' ? 'Hẹn khám lần tới' : 'Ghi nhận đã làm'}
            </Button>
          </div>
        ))}
      </div>
      <VetCard title="Lịch sử chăm sóc định kỳ" icon="bi-clock-history" count={events.length || null} flush>
        {eventsQ.isLoading ? (
          <LoadingBlock rows={2} height={44} />
        ) : events.length === 0 ? (
          <EmptyNote icon="bi-calendar2" title="Chưa ghi lần tiêm phòng, tẩy giun hay đóng móng nào" />
        ) : (
          <div className="vet-list">
            {events.map((ev) => {
              const meta = CARE_KINDS[ev.kind] || { label: ev.kind, icon: 'bi-check2' };
              const own = !ev.performedBy?._id || !userId || String(ev.performedBy._id) === String(userId);
              const recent = openedAt - new Date(ev.createdAt).getTime() <= DELETE_WINDOW_MS;
              return (
                <div key={ev._id} className="vet-row">
                  <span className="vet-kind-icon vet-tone-neutral" aria-hidden="true">
                    <i className={`bi ${meta.icon}`} />
                  </span>
                  <div className="vet-row-main">
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <span className="fw-semibold">{meta.label}</span>
                      {ev.product && <span>{ev.product}</span>}
                      {(ev.batchNumber || ev.dose) && <span className="vet-small vet-muted">{[ev.batchNumber && `Lô ${ev.batchNumber}`, ev.dose].filter(Boolean).join(' · ')}</span>}
                    </div>
                    {careEventDetails(ev).length > 0 && <div className="vet-small vet-muted mt-1">{careEventDetails(ev).join(' · ')}</div>}
                    <div className="vet-small vet-faint mt-1">
                      {fmtDate(ev.date)} · {ev.performedBy?.name || 'Bác sĩ'}
                      {ev.nextDue && <> · hẹn lần sau {fmtDate(ev.nextDue)}</>}
                    </div>
                    {ev.note && <div className="vet-small vet-muted mt-1">{ev.note}</div>}
                  </div>
                  {own && recent && (
                    <Button size="sm" variant="vet-ghost" className="vet-icon-btn" onClick={() => onDeleteEvent(ev)} title="Xóa lần ghi này (trong 24 giờ)" aria-label="Xóa lần ghi này">
                      <i className="bi bi-trash" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </VetCard>
    </div>
  );
}

export default function HorseHealthDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const userId = useSelector((state) => state.auth.user?._id);
  const refresh = useVetRefresh();
  const [confirm, confirmDialog] = useConfirm();
  const horseQ = useVetHorse(id);
  const recordsQ = useHealthRecords(id);
  const treatmentsQ = useTreatments(id);
  const injuriesQ = useInjuries(id);
  const requestsQ = useExamRequests();
  const incidentsQ = useIncidents();
  const ordersQ = useCareOrders();
  const [dialog, setDialog] = useState(null);

  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (next) =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        if (next === 'overview') out.delete('tab');
        else out.set('tab', next);
        return out;
      },
      { replace: true }
    );

  const horse = horseQ.data;
  const records = recordsQ.data || [];
  const treatments = useMemo(() => [...(treatmentsQ.data || [])].sort((a, b) => Number(b.status === 'ongoing') - Number(a.status === 'ongoing')), [treatmentsQ.data]);
  const ongoing = treatments.filter((t) => t.status === 'ongoing');
  const injuries = injuriesQ.data || [];
  const requests = (requestsQ.data || []).filter((r) => idOf(r.horse) === id);
  const incidents = (incidentsQ.data || []).filter((t) => idOf(t.horse) === id);
  const progressOf = (treatmentId) => (ordersQ.data || []).find((row) => row._id === treatmentId);

  if (horseQ.isLoading) {
    return (
      <div className="vet-ui">
        <LoadingBlock rows={4} height={90} />
      </div>
    );
  }
  if (horseQ.isError || !horse) {
    return (
      <div className="vet-ui">
        <Callout
          tone="bad"
          icon="bi-exclamation-octagon"
          action={
            <Button size="sm" variant="vet-outline" onClick={() => navigate('/veterinarian/horses')}>
              Về danh sách
            </Button>
          }
        >
          {horseQ.error?.message || 'Không tìm thấy ngựa này, hoặc ngựa không thuộc phạm vi bạn phụ trách.'}
        </Callout>
      </div>
    );
  }

  const clearance = clearanceOf(horse);
  const lastExam = records[0];
  const lastExamAt = lastExam && (lastExam.date || lastExam.createdAt);
  const headerFacts = [
    { label: 'Chủ ngựa', icon: 'bi-person', value: horse.owner?.name },
    { label: 'Huấn luyện viên', icon: 'bi-stopwatch', value: horse.assignedTrainer?.name },
    { label: 'Cân nặng', icon: 'bi-speedometer', value: horse.weightKg ? `${horse.weightKg} kg` : null },
    { label: 'Khám gần nhất', icon: 'bi-clipboard2-pulse', value: lastExam ? fmtDate(lastExamAt) : null, sub: lastExam ? ago(lastExamAt) : null },
  ];
  const close = () => setDialog(null);
  const actions = {
    examine: () => navigate(`/veterinarian/examinations/new/${id}`),
    openExam: (record) => navigate(`/veterinarian/examinations/${idOf(record)}`),
    prescribe: () => navigate(`/veterinarian/treatments/new?horseId=${id}`),
    // A prescription is not edited: a new one, started from it, takes over.
    replaceTreatment: (t) => navigate(`/veterinarian/treatments/new?horseId=${id}&replace=${t._id}`),
    endTreatment: (t) => endTreatment({ ...t, horse }, { confirm, refresh }),
    changeLevel: () => setDialog({ type: 'level' }),
    newInjury: () => setDialog({ type: 'injury' }),
    injuryStage: (m, stage) => setInjuryStage(m, stage, { refresh }),
    care: (kind, mode = 'record') => setDialog({ type: 'care', kind, mode }),
  };

  const deleteCareEvent = async (ev) => {
    const ok = await confirm({ title: 'Xóa lần ghi chăm sóc', body: 'Chỉ dùng khi ghi nhầm. Ngày hẹn lần sau đã đặt giữ nguyên — đổi lại trong lịch nếu cần.', confirmLabel: 'Xóa', danger: true });
    if (!ok) return;
    try {
      await vetApi.deleteCareEvent(id, ev._id);
      message.success('Đã xóa lần ghi.');
      await refresh();
    } catch (err) {
      message.error(errorText(err, 'Không xóa được.'));
    }
  };

  return (
    <div className="vet-ui">
      <button type="button" className="vet-back" onClick={() => navigate('/veterinarian/horses')}>
        <i className="bi bi-arrow-left" aria-hidden="true" /> Ngựa & hồ sơ
      </button>

      <div className="vet-card vet-horse-head">
        <div className="vet-horse-grid">
          <div className="vet-horse-visual">
            {horse.photoUrl ? <HorseAvatar horse={horse} size={128} /> : <Horse3D breed={horse.breed} color={horse.color} height="var(--vet-horse-stage)" compact />}
          </div>
          <div className="vet-horse-body">
            <div className="vet-horse-top">
              <div className="vet-horse-info">
                <h1 className="vet-title vet-horse-name">{horse.name}</h1>
                <div className="vet-muted">{horseFacts(horse) || 'Chưa có thông tin giống / tuổi'}</div>
              </div>
              <div className="vet-horse-actions">
                <Button variant="vet-outline" onClick={actions.prescribe}>
                  <i className="bi bi-capsule" aria-hidden="true" /> Kê đơn
                </Button>
                <Button variant="vet" onClick={actions.examine}>
                  <i className="bi bi-clipboard2-pulse" aria-hidden="true" /> Khám bệnh
                </Button>
                <ActionMenu
                  size={null}
                  items={[
                    { label: 'Đổi mức tập', icon: 'bi-speedometer2', onClick: actions.changeLevel },
                    { label: 'Ghi chấn thương', icon: 'bi-bandaid', onClick: actions.newInjury },
                    { divider: true },
                    { label: 'Ghi tiêm phòng', icon: CARE_KINDS.vaccination.icon, onClick: () => actions.care('vaccination') },
                    { label: 'Ghi tẩy giun', icon: CARE_KINDS.deworming.icon, onClick: () => actions.care('deworming') },
                    { label: 'Ghi đóng móng', icon: CARE_KINDS.farrier.icon, onClick: () => actions.care('farrier') },
                    { divider: true },
                    { label: 'Làm mới', icon: 'bi-arrow-clockwise', onClick: refresh },
                  ]}
                />
              </div>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <HealthPill status={horse.healthStatus} lg />
              <LevelPill level={clearance.level} lg />
            </div>
            <dl className="vet-horse-facts">
              {headerFacts.map((f) => (
                <div key={f.label} className="vet-horse-fact">
                  <dt>
                    <i className={`bi ${f.icon}`} aria-hidden="true" /> {f.label}
                  </dt>
                  <dd title={f.value || undefined}>{f.value || <span className="vet-faint">Chưa có</span>}</dd>
                  {f.sub && <div className="vet-small vet-faint">{f.sub}</div>}
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {(requests.length > 0 || incidents.length > 0) && (
        <div className="d-flex flex-column gap-2 mt-3">
          {requests.map((r) => (
            <div key={r._id}>
              <RequestDetails request={r} />
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-1 px-1">
                <span className="vet-small vet-muted">Lưu phiếu khám sẽ trả lời yêu cầu này.</span>
                <Button size="sm" variant={r.priority === 'urgent' ? 'vet-danger' : 'vet'} onClick={actions.examine}>
                  Khám ngay
                </Button>
              </div>
            </div>
          ))}
          {incidents.map((t) => (
            <Callout
              key={t._id}
              tone="bad"
              icon="bi-exclamation-octagon-fill"
              action={
                <Button size="sm" variant="vet-outline" onClick={() => setDialog({ type: 'incident', task: t })}>
                  Xử lý
                </Button>
              }
            >
              <strong>{t.assignedTo?.name || 'Nhân viên chăm sóc'}</strong> báo sự cố {ago(t.incidentReport?.reportedAt || t.updatedAt)}: {t.incidentReport?.description}
            </Callout>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'overview', label: 'Tổng quan', icon: 'bi-grid' },
            { key: 'exams', label: 'Phiếu khám', icon: 'bi-clipboard2-pulse', count: records.length },
            { key: 'treatments', label: 'Điều trị', icon: 'bi-capsule', count: treatments.length },
            { key: 'injuries', label: 'Chấn thương', icon: 'bi-bandaid', count: injuries.filter(isActiveInjury).length },
            { key: 'care', label: 'Chăm sóc định kỳ', icon: 'bi-calendar-check' },
          ]}
        />

        {tab === 'overview' && <OverviewTab horse={horse} records={records} ongoing={ongoing} progressOf={progressOf} injuries={injuries} onTab={setTab} actions={actions} />}
        {tab === 'exams' && <ExamsTab records={records} onExamine={actions.examine} onOpen={actions.openExam} />}
        {tab === 'treatments' && (
          <VetCard
            title="Điều trị"
            icon="bi-capsule"
            count={treatments.length || null}
            flush
            extra={
              <Button size="sm" variant="vet" onClick={actions.prescribe}>
                <i className="bi bi-plus-lg" aria-hidden="true" /> Kê đơn
              </Button>
            }
          >
            {treatments.length === 0 ? (
              <EmptyNote icon="bi-capsule" title="Chưa có điều trị nào" />
            ) : (
              treatments.map((t) => (
                <TreatmentCard
                  key={t._id}
                  treatment={t}
                  progress={progressOf(t._id)}
                  awaitingReturn={clearance.source === 'awaiting_return' && String(clearance.treatment) === t._id}
                  onReplace={() => actions.replaceTreatment(t)}
                  onOpenExam={() => actions.openExam(t.healthRecord)}
                  onEnd={() => actions.endTreatment(t)}
                  onLevel={actions.changeLevel}
                />
              ))
            )}
          </VetCard>
        )}
        {tab === 'injuries' && (
          <InjuriesTab horse={horse} injuries={injuries} onNew={actions.newInjury} onStage={actions.injuryStage} />
        )}
        {tab === 'care' && <CareTab horse={horse} onCare={actions.care} onDeleteEvent={deleteCareEvent} userId={userId} />}
      </div>

      {dialog?.type === 'level' && <TrainingLevelModal horse={horse} treatments={treatments} injuries={injuries} latestRecord={records[0] || null} onHide={close} onDone={refresh} />}
      {dialog?.type === 'injury' && <InjuryModal horse={horse} injuries={injuries} onHide={close} onDone={refresh} />}
      {dialog?.type === 'care' && <CareModal horse={horse} kind={dialog.kind} initialMode={dialog.mode} onHide={close} onDone={refresh} />}
      {dialog?.type === 'incident' && <IncidentModal task={dialog.task} onHide={close} onDone={refresh} />}
      {confirmDialog}
    </div>
  );
}
