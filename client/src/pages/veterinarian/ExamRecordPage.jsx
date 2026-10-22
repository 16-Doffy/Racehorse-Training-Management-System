import { useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import HorseInjuryViewer from '../../components/veterinarian/HorseInjuryViewer';
import RequestDetails from '../../components/veterinarian/RequestDetails';
import TrainingLevelModal from '../../components/veterinarian/TrainingLevelModal';
import TreatmentCard from '../../components/veterinarian/TreatmentCard';
import useConfirm from '../../components/veterinarian/useConfirm';
import { endTreatment, setInjuryStage } from '../../components/veterinarian/vetActions';
import { BusyButton, Callout, HealthPill, HorseAvatar, LoadingBlock, Pill, RecoveryStepper, VetCard } from '../../components/veterinarian/ui';
import {
  CRT_MAX_SEC,
  GUT_SOUNDS,
  HYDRATION,
  LAMENESS_GRADES,
  LEVEL_META,
  LIMBS,
  MUCOUS_MEMBRANES,
  SEVERITY_META,
  VITALS,
  errorText,
  fmtDate,
  fmtTime,
  horseFacts,
  idOf,
  shortBodyPart,
  vitalOff,
} from '../../components/veterinarian/vetFormat';
import { message } from '../../lib/antdStatic';
import { fileHref } from '../../lib/files';
import { useCareOrders, useInjuries, useTreatments, useVetHorse, useVetRefresh } from '../../hooks/useVetData';

const MAX_FILES = 10; // per exam (server: healthRecord.controller.js MAX_ATTACHMENTS)
const PER_UPLOAD = 5;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const has = (v) => v !== undefined && v !== null && v !== '';
const WEIGHT = { key: 'weightKg', label: 'Cân nặng', unit: 'kg' };

const Blank = ({ children = 'Không ghi' }) => <span className="vet-faint fst-italic">{children}</span>;

/** A finding as "value" in its tone, or "Chưa khám" when the exam left it out. */
function Finding({ meta, value }) {
  if (!has(value)) return <Blank>Chưa khám</Blank>;
  const m = meta[value];
  return <span className={m?.tone === 'bad' ? 'vet-text-bad fw-semibold' : m?.tone === 'watch' ? 'fw-semibold' : ''}>{m?.label || value}</span>;
}

/**
 * One exam as it was filed, read like the sheet it is: who, when and what was concluded at the top,
 * then every part of the exam form — what was filled in, and what was not ("Không ghi") — the injuries
 * recorded with it (on the 3D horse), the prescriptions written against it, the requests it answered
 * and its files. Nothing is edited here; only what is still moving moves: an injury's recovery stage,
 * a prescription ended, replaced or added, files added (results that come back later).
 */
export default function ExamRecordPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const refresh = useVetRefresh();
  const [confirm, confirmDialog] = useConfirm();
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const recordQ = useQuery({ queryKey: ['vet', 'record', id], queryFn: () => vetApi.getHealthRecordById(id).then((res) => res.data), enabled: Boolean(id) });
  const record = recordQ.data;
  const horseId = idOf(record?.horse);
  const horseQ = useVetHorse(horseId);
  const ordersQ = useCareOrders();

  if (recordQ.isLoading || (horseId && horseQ.isLoading)) {
    return (
      <div className="vet-ui">
        <LoadingBlock rows={4} height={80} />
      </div>
    );
  }
  if (recordQ.error || !record) {
    return (
      <div className="vet-ui">
        <Callout
          tone="bad"
          icon="bi-exclamation-octagon"
          action={
            <Button size="sm" variant="vet-outline" onClick={() => navigate('/veterinarian/horses')}>
              Về danh sách ngựa
            </Button>
          }
        >
          {errorText(recordQ.error, 'Không mở được phiếu khám.')}
        </Callout>
      </div>
    );
  }

  const horse = horseQ.data || record.horse;
  const at = record.date || record.createdAt;
  const reload = () => Promise.all([refresh(), recordQ.refetch()]);
  const injuries = record.injuries || [];
  const treatments = record.treatments || [];
  const requests = record.requests || [];
  const attachments = record.attachments || [];
  const vitalSigns = record.vitalSigns || {};
  const clinical = record.clinical || {};
  const lameness = has(clinical.lamenessGrade) ? LAMENESS_GRADES.find((g) => g.value === Number(clinical.lamenessGrade)) : null;
  const progressOf = (treatmentId) => (ordersQ.data || []).find((row) => row._id === treatmentId);

  const addFiles = async (list) => {
    const picked = Array.from(list || []);
    if (fileInput.current) fileInput.current.value = '';
    if (!picked.length) return undefined;
    if (attachments.length + picked.length > MAX_FILES) return message.error(`Mỗi phiếu khám đính kèm tối đa ${MAX_FILES} tệp.`);
    const bad = picked.find((f) => !FILE_TYPES.includes(f.type) || f.size > 10 * 1024 * 1024);
    if (bad) return message.error(`"${bad.name}": chỉ nhận ảnh hoặc PDF, tối đa 10 MB.`);
    setUploading(true);
    try {
      for (let i = 0; i < picked.length; i += PER_UPLOAD) {
        const form = new FormData();
        picked.slice(i, i + PER_UPLOAD).forEach((f) => form.append('files', f));
        // eslint-disable-next-line no-await-in-loop
        await vetApi.uploadRecordAttachments(record._id, form);
      }
      message.success(`Đã thêm ${picked.length} tệp vào phiếu khám.`);
      await reload();
    } catch (err) {
      message.error(errorText(err, 'Không tải được tệp lên.'));
    } finally {
      setUploading(false);
    }
    return undefined;
  };

  return (
    <div className="vet-ui">
      <button type="button" className="vet-back" onClick={() => navigate(`/veterinarian/horses/${horseId}?tab=exams`)}>
        <i className="bi bi-arrow-left" aria-hidden="true" /> Phiếu khám của {horse?.name || 'ngựa'}
      </button>

      {/* The head of the sheet: the horse, when and by whom, and what was concluded. */}
      <section className="vet-card vet-sheet">
        <div className="vet-sheet-top">
          <div className="vet-sheet-eyebrow">
            Phiếu khám · {fmtTime(at)} {fmtDate(at)} · BS {record.examinedBy?.name || '—'}
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <Pill tone="neutral" icon="bi-lock" title="Phiếu khám đã lưu không sửa được">
              Đã lưu
            </Pill>
            <Button size="sm" variant="vet" onClick={() => navigate(`/veterinarian/examinations/new/${horseId}`)}>
              <i className="bi bi-clipboard2-plus" aria-hidden="true" /> Lập phiếu khám mới
            </Button>
          </div>
        </div>
        <div className="d-flex align-items-center gap-3 mt-2">
          <HorseAvatar horse={horse} size={44} />
          <div style={{ minWidth: 0 }}>
            <div className="vet-sheet-horse">{horse?.name || 'Ngựa'}</div>
            <div className="vet-small vet-muted">{horseFacts(horse)}</div>
          </div>
        </div>
        <div className="vet-sheet-conclusion">
          <div className="vet-sheet-label">Kết luận · chẩn đoán</div>
          <div className="vet-sheet-diagnosis">{record.diagnosis}</div>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            <HealthPill status={record.resultStatus} />
            {record.clearedLevel ? (
              <Pill tone={LEVEL_META[record.clearedLevel].tone} icon="bi-speedometer2">
                Cho phép từ nay: {LEVEL_META[record.clearedLevel].label.toLowerCase()}
              </Pill>
            ) : (
              <Pill tone="neutral" icon="bi-speedometer2">
                Không đánh giá mức tập
              </Pill>
            )}
          </div>
        </div>
      </section>

      <div className="vet-grid-2 mt-3">
        <div className="vet-stack">
          <VetCard title="Nội dung khám" icon="bi-clipboard2-pulse">
            <div className="vet-sheet-block">
              <div className="vet-sheet-label">Lý do khám & bệnh sử</div>
              {record.history ? <div style={{ whiteSpace: 'pre-wrap' }}>{record.history}</div> : <Blank />}
            </div>

            <div className="vet-sheet-block">
              <div className="vet-sheet-label">Chỉ số sinh tồn</div>
              <div className="vet-vitals vet-vitals-4">
                {[...VITALS, WEIGHT].map((v) => {
                  const value = vitalSigns[v.key];
                  const off = v.min !== undefined && vitalOff(v, value);
                  return (
                    <div key={v.key} className={`vet-vital${off ? ' is-off' : ''}`}>
                      <div className="vet-vital-label">{v.label}</div>
                      <div className="vet-vital-value">
                        {has(value) ? (
                          <>
                            {value}
                            <small>{v.unit}</small>
                          </>
                        ) : (
                          <span className="vet-faint fst-italic" style={{ fontSize: 14, fontWeight: 500 }}>
                            Không đo
                          </span>
                        )}
                      </div>
                      <div className="vet-vital-range">{v.min !== undefined ? `Chuẩn ${v.min}–${v.max}` : horse?.weightKg ? `Hồ sơ: ${horse.weightKg} kg` : ' '}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="vet-sheet-block">
              <div className="vet-sheet-label">Khám lâm sàng</div>
              <dl className="vet-sheet-facts">
                <dt>Niêm mạc (lợi)</dt>
                <dd>
                  <Finding meta={MUCOUS_MEMBRANES} value={clinical.mucousMembrane} />
                </dd>
                <dt>Đổ đầy mao mạch (CRT)</dt>
                <dd>
                  {has(clinical.capillaryRefillSec) ? (
                    <span className={Number(clinical.capillaryRefillSec) > CRT_MAX_SEC ? 'vet-text-bad fw-semibold' : ''}>
                      {clinical.capillaryRefillSec} giây <span className="vet-faint">(chuẩn ≤ {CRT_MAX_SEC} giây)</span>
                    </span>
                  ) : (
                    <Blank>Chưa khám</Blank>
                  )}
                </dd>
                <dt>Nhu động ruột</dt>
                <dd>
                  <Finding meta={GUT_SOUNDS} value={clinical.gutSounds} />
                </dd>
                <dt>Mất nước</dt>
                <dd>
                  <Finding meta={HYDRATION} value={clinical.hydration} />
                </dd>
                <dt>Độ què (AAEP 0–5)</dt>
                <dd>
                  {lameness ? (
                    <span className={lameness.value >= 4 ? 'vet-text-bad fw-semibold' : lameness.value > 0 ? 'fw-semibold' : ''}>
                      {lameness.value === 0 ? 'Độ 0 — không què' : `Độ ${lameness.value}/5 — ${lameness.desc.toLowerCase()}`}
                      {lameness.value > 0 && clinical.lamenessLimb ? ` · ${LIMBS[clinical.lamenessLimb]?.toLowerCase()}` : ''}
                    </span>
                  ) : (
                    <Blank>Chưa đánh giá</Blank>
                  )}
                </dd>
              </dl>
            </div>

            <div className="vet-sheet-block">
              <div className="vet-sheet-label">Ghi chú & chỉ định</div>
              {record.notes ? <div style={{ whiteSpace: 'pre-wrap' }}>{record.notes}</div> : <Blank />}
            </div>
          </VetCard>

          <VetCard title="Chấn thương ghi trong lần khám" icon="bi-bandaid" count={injuries.length || null}>
            {injuries.length === 0 ? (
              <Blank>Lần khám này không ghi chấn thương.</Blank>
            ) : (
              <>
                <HorseInjuryViewer horse={horse} injuries={injuries} height={300} />
                <div className="vet-list mt-3">
                  {injuries.map((m) => (
                    <div key={m._id} className="vet-row" style={{ alignItems: 'flex-start', paddingInline: 0 }}>
                      <div className="vet-row-main">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className="fw-semibold" title={m.bodyPart}>
                            {shortBodyPart(m.bodyPart)}
                          </span>
                          <Pill tone={SEVERITY_META[m.severity]?.tone}>{SEVERITY_META[m.severity]?.label || m.severity}</Pill>
                        </div>
                        {m.notes && <div className="vet-small vet-muted mt-1">{m.notes}</div>}
                        <div className="mt-2">
                          <RecoveryStepper value={m.recoveryStatus} onChange={(stage) => setInjuryStage(m, stage, { refresh: reload })} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </VetCard>

          <VetCard
            title="Đơn thuốc kê theo phiếu này"
            icon="bi-capsule"
            count={treatments.length || null}
            flush={treatments.length > 0}
            extra={
              <Button size="sm" variant="vet-outline" onClick={() => navigate(`/veterinarian/treatments/new?horseId=${horseId}&recordId=${record._id}`)}>
                <i className="bi bi-plus-lg" aria-hidden="true" /> Kê đơn theo phiếu này
              </Button>
            }
          >
            {treatments.length === 0 ? (
              <Blank>Chưa kê đơn theo phiếu này.</Blank>
            ) : (
              treatments.map((t) => (
                <TreatmentCard
                  key={t._id}
                  treatment={{ ...t, horse }}
                  progress={progressOf(t._id)}
                  onReplace={() => navigate(`/veterinarian/treatments/new?horseId=${horseId}&replace=${t._id}`)}
                  onEnd={() => endTreatment({ ...t, horse }, { confirm, refresh: reload })}
                  onLevel={() => setLevelOpen(true)}
                />
              ))
            )}
          </VetCard>
        </div>

        <div className="vet-stack">
          <VetCard title="Thông tin phiếu" icon="bi-info-circle">
            <dl className="vet-sheet-facts">
              <dt>Ngày khám</dt>
              <dd>
                {fmtTime(at)} {fmtDate(at)}
              </dd>
              <dt>Bác sĩ khám</dt>
              <dd>{record.examinedBy?.name || '—'}</dd>
              <dt>Lập lúc</dt>
              <dd>
                {fmtTime(record.createdAt)} {fmtDate(record.createdAt)}
              </dd>
              <dt>Tình trạng</dt>
              <dd>
                <HealthPill status={record.resultStatus} />
              </dd>
              <dt>Theo yêu cầu</dt>
              <dd>{requests.length ? `${requests.length} yêu cầu khám` : <Blank>Khám chủ động</Blank>}</dd>
            </dl>
          </VetCard>

          <VetCard title="Yêu cầu khám đã trả lời" icon="bi-reply" count={requests.length || null}>
            {requests.length === 0 ? (
              <Blank>Phiếu này không trả lời yêu cầu khám nào.</Blank>
            ) : (
              <div className="d-flex flex-column gap-2">
                {requests.map((r) => (
                  <RequestDetails key={r._id} request={r} />
                ))}
              </div>
            )}
          </VetCard>

          <VetCard
            title="Tệp đính kèm"
            icon="bi-paperclip"
            count={attachments.length || null}
            extra={
              <BusyButton size="sm" variant="vet-outline" busy={uploading} onClick={() => fileInput.current?.click()} disabled={uploading || attachments.length >= MAX_FILES}>
                <i className="bi bi-plus-lg" aria-hidden="true" /> Thêm tệp
              </BusyButton>
            }
          >
            <input ref={fileInput} type="file" multiple accept={FILE_TYPES.join(',')} hidden onChange={(e) => addFiles(e.target.files)} />
            {attachments.length === 0 ? (
              <Blank>Chưa có tệp. Kết quả xét nghiệm, X-quang về sau vẫn thêm được vào phiếu.</Blank>
            ) : (
              <div className="d-flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <span key={att._id} className="vet-attachment">
                    <a href={fileHref(att.url)} target="_blank" rel="noopener noreferrer" title={`Mở ${att.name}`}>
                      <i className={`bi ${att.contentType?.startsWith('image/') ? 'bi-image' : 'bi-file-earmark-pdf'}`} aria-hidden="true" />
                      <span className="text-truncate">{att.name}</span>
                    </a>
                  </span>
                ))}
              </div>
            )}
          </VetCard>
        </div>
      </div>

      <div className="vet-small vet-faint mt-3">
        <i className="bi bi-lock me-1" aria-hidden="true" />
        Phiếu khám đã lưu không sửa được, cùng chấn thương và đơn thuốc kèm theo. Chấn thương chỉ chuyển giai đoạn hồi phục; đơn thuốc chỉ kết thúc hoặc kê đơn mới thay thế; phát hiện mới thì lập phiếu khám mới.
      </div>

      {levelOpen && horseQ.data && <LevelDialog horse={horseQ.data} record={record} onHide={() => setLevelOpen(false)} onDone={reload} />}
      {confirmDialog}
    </div>
  );
}

/** "Đổi mức tập" for the horse, with its treatments and injuries loaded only when it opens. */
function LevelDialog({ horse, record, onHide, onDone }) {
  const treatmentsQ = useTreatments(horse._id);
  const injuriesQ = useInjuries(horse._id);
  if (treatmentsQ.isLoading || injuriesQ.isLoading) return null;
  return <TrainingLevelModal horse={horse} treatments={treatmentsQ.data || []} injuries={injuriesQ.data || []} latestRecord={record} onHide={onHide} onDone={onDone} />;
}
