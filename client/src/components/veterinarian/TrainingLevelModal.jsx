import { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import { message } from '../../lib/antdStatic';
import TrainingLevelPicker from './TrainingLevelPicker';
import { BusyButton, Callout, Field, LevelPill, VetModal } from './ui';
import { CLEARANCE_SOURCE, LEVEL_META, LEVEL_RANK, clearanceOf, errorText, isActiveInjury, treatmentLevel } from './vetFormat';

/**
 * Changing how hard a horse may work, in one place.
 *  - Lowering (lock, or a recovery level): set on the ongoing treatment, or on a new one that follows
 *    the latest exam. The server cancels the sessions above it and tells the trainer and the groom.
 *  - Raising: that is a return-to-training assessment, saved as an exam with that level (ending a
 *    treatment alone never clears a horse); the treatments that still restrict are brought up to it.
 * Mounted when opened. `latestRecord` is the horse's newest exam (null when it has none).
 */
export default function TrainingLevelModal({ horse, treatments = [], injuries = [], latestRecord, onHide, onDone }) {
  const navigate = useNavigate();
  const clearance = clearanceOf(horse);
  const current = clearance.level || 'high';
  const [level, setLevel] = useState(current);
  const [reason, setReason] = useState('');
  const [endTreatments, setEndTreatments] = useState(true);
  const [healInjuries, setHealInjuries] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ongoing = treatments.filter((t) => t.status === 'ongoing');
  const restricting = ongoing.filter((t) => treatmentLevel(t) !== 'high');
  const activeInjuries = injuries.filter(isActiveInjury);
  const lowering = LEVEL_RANK[level] < LEVEL_RANK[current];
  const raising = LEVEL_RANK[level] > LEVEL_RANK[current];
  const needsExam = lowering && ongoing.length === 0 && !latestRecord;

  const submit = async () => {
    if (!lowering && !raising) return onHide();
    if (needsExam) return undefined;
    if (lowering && level === 'none' && !reason.trim()) {
      setError('Ghi lý do khóa tập — HLV và nhân viên chăm sóc nhận được lý do này.');
      return undefined;
    }
    setBusy(true);
    setError(null);
    const note = reason.trim();
    try {
      if (lowering) {
        const target = restricting[0] || ongoing[0];
        if (target) {
          await vetApi.setTrainingLock(target._id, { trainingLevel: level, lockReason: note || target.lockReason || '' });
        } else {
          await vetApi.createTreatment({ horse: horse._id, healthRecord: latestRecord._id, status: 'ongoing', startDate: new Date(), trainingLevel: level, lockReason: note || undefined });
        }
      } else {
        if (level === 'high' && healInjuries) {
          for (const marker of activeInjuries) {
            // eslint-disable-next-line no-await-in-loop
            await vetApi.updateInjuryMarker(marker._id, { recoveryStatus: 'recovered' });
          }
        }
        for (const t of restricting.filter((tr) => LEVEL_RANK[treatmentLevel(tr)] < LEVEL_RANK[level])) {
          // eslint-disable-next-line no-await-in-loop
          await vetApi.setTrainingLock(t._id, { trainingLevel: level, lockReason: level === 'high' ? '' : note || t.lockReason || '' });
          // eslint-disable-next-line no-await-in-loop
          if (level === 'high' && endTreatments) await vetApi.updateTreatment(t._id, { status: 'completed' });
        }
        await vetApi.createHealthRecord({
          horse: horse._id,
          date: new Date(),
          diagnosis: `Đánh giá cho tập lại: ${LEVEL_META[level].label.toLowerCase()}`,
          resultStatus: level === 'high' ? 'eligible' : 'monitoring',
          clearedLevel: level,
          notes: note || undefined,
        });
      }
      message.success(`${horse.name}: ${LEVEL_META[level].label.toLowerCase()}. Đã báo HLV và nhân viên chăm sóc.`);
      onDone?.();
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không đổi được mức vận động.'));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <VetModal
      show
      onHide={onHide}
      busy={busy}
      size="lg"
      icon="bi-speedometer2"
      title={`Mức vận động · ${horse.name}`}
      onSubmit={submit}
      footer={
        <>
          <Button variant="vet-outline" onClick={onHide} disabled={busy}>
            Hủy
          </Button>
          <BusyButton type="submit" busy={busy} disabled={(!lowering && !raising) || needsExam} variant={lowering && level === 'none' ? 'vet-danger' : 'vet'}>
            {!lowering && !raising ? 'Chưa thay đổi' : raising ? 'Lưu đánh giá cho tập lại' : `Áp dụng: ${LEVEL_META[level].label}`}
          </BusyButton>
        </>
      }
    >
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span className="vet-muted">Hiện tại:</span>
        <LevelPill level={current} />
        {clearance.restricted && (
          <span className="vet-small vet-muted">
            {clearance.reason || CLEARANCE_SOURCE[clearance.source] || ''}
          </span>
        )}
      </div>

      <TrainingLevelPicker value={level} onChange={setLevel} current={current} disabled={busy} />

      {needsExam && (
        <Callout
          tone="watch"
          icon="bi-clipboard2-pulse"
          className="mt-3"
          action={
            <Button size="sm" variant="vet" onClick={() => navigate(`/veterinarian/examinations/new/${horse._id}?level=${level}`)}>
              Lập phiếu khám
            </Button>
          }
        >
          {horse.name} chưa có phiếu khám nào. Hạ mức tập cần một phiếu khám làm căn cứ — chọn mức ngay trong phiếu khám.
        </Callout>
      )}

      {(lowering || raising) && !needsExam && (
        <>
          <Field
            className="mt-3"
            label={lowering ? 'Lý do' : 'Nhận xét khi cho tập lại'}
            required={lowering && level === 'none'}
            hint={
              lowering
                ? 'HLV và nhân viên chăm sóc được báo ngay; buổi tập vượt mức bị hủy, buổi đang chạy dừng lại.'
                : 'Lưu thành phiếu đánh giá cho tập lại và báo HLV. Buổi đã hủy trước đó không tự khôi phục.'
            }
          >
            <Form.Control
              as="textarea"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={lowering ? 'VD: Viêm gân cấp — nghỉ tuyệt đối tại chuồng 14 ngày' : 'VD: Hết sưng, đi nước kiệu đều, không đau khi sờ nắn'}
            />
          </Field>

          {raising && level === 'high' && (restricting.length > 0 || activeInjuries.length > 0) && (
            <div className="mt-3 d-flex flex-column gap-2">
              {restricting.length > 0 && (
                <Form.Check
                  id="lvl-end-treatments"
                  checked={endTreatments}
                  onChange={(e) => setEndTreatments(e.target.checked)}
                  label={`Kết thúc ${restricting.length} phác đồ đang hạn chế tập`}
                />
              )}
              {activeInjuries.length > 0 && (
                <Form.Check
                  id="lvl-heal-injuries"
                  checked={healInjuries}
                  onChange={(e) => setHealInjuries(e.target.checked)}
                  label={`Đánh dấu ${activeInjuries.length} chấn thương là đã khỏi`}
                />
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mt-3">
          {error}
        </Callout>
      )}
    </VetModal>
  );
}
