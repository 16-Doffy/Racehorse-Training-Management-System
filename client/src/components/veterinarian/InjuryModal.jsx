import { useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import vetApi from '../../api/veterinarianApi';
import { message } from '../../lib/antdStatic';
import HorseInjuryViewer from './HorseInjuryViewer';
import { BusyButton, Callout, Choices, Field, VetModal } from './ui';
import { RECOVERY_STEPS, SEVERITY_META, errorText, idOf, isActiveInjury } from './vetFormat';

/**
 * Marks an injury on the horse (or edits one): where — clicked on the 3D horse, which also names the
 * part of the body — how bad, and how far along. The server works out the horse's health status from
 * its injuries, so nothing else is written here. Mounted when opened. Give `horse` (from its page), or
 * `horses` to choose from; `injuries` (any horses) are shown on the model for context.
 */
export default function InjuryModal({ horse, horses = [], injury, injuries = [], defaultHorseId = '', onHide, onDone }) {
  const [horseId, setHorseId] = useState(() => idOf(injury?.horse) || idOf(horse) || defaultHorseId || '');
  const [bodyPart, setBodyPart] = useState(injury?.bodyPart || '');
  const [named, setNamed] = useState(''); // the last name the model filled in, replaced by the next click
  const [point, setPoint] = useState(() => (injury?.location3d?.position ? { location3d: injury.location3d, coordinates: injury.coordinates } : null));
  const [moved, setMoved] = useState(false);
  const [severity, setSeverity] = useState(injury?.severity || 'moderate');
  const [stage, setStage] = useState(injury?.recoveryStatus || 'new');
  const [notes, setNotes] = useState(injury?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const fixedHorse = Boolean(injury || horse);
  const theHorse = horse || horses.find((h) => h._id === horseId) || (injury?.horse && typeof injury.horse === 'object' ? injury.horse : null);
  const horseName = theHorse?.name || 'ngựa';
  const others = injuries.filter((m) => idOf(m.horse) === horseId && m._id !== injury?._id && isActiveInjury(m));

  const pick = ({ location3d, coordinates, region }) => {
    setPoint({ location3d, coordinates });
    setMoved(true);
    if (!bodyPart.trim() || bodyPart === named) {
      setBodyPart(region);
      setNamed(region);
    }
  };

  const submit = async () => {
    if (!horseId) return setError('Chọn ngựa bị chấn thương.');
    if (!bodyPart.trim()) return setError('Bấm vào chỗ bị thương trên mô hình, hoặc gõ tên vùng tổn thương.');
    setBusy(true);
    setError(null);
    const payload = {
      horse: horseId,
      bodyPart: bodyPart.trim(),
      coordinates: point?.coordinates || injury?.coordinates || { x: 0.5, y: 0.5 },
      severity,
      recoveryStatus: stage,
      notes: notes.trim(),
    };
    if (moved && point?.location3d) payload.location3d = point.location3d;
    try {
      if (injury) await vetApi.updateInjuryMarker(injury._id, payload);
      else await vetApi.createInjuryMarker(payload);
      message.success(injury ? 'Đã cập nhật chấn thương.' : `Đã ghi chấn thương cho ${horseName}.`);
      onDone?.();
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không lưu được chấn thương.'));
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
      size="xl"
      icon="bi-bandaid"
      title={injury ? `Sửa chấn thương · ${horseName}` : fixedHorse ? `Ghi chấn thương · ${horseName}` : 'Ghi chấn thương'}
      onSubmit={submit}
      footer={
        <>
          <Button variant="vet-outline" onClick={onHide} disabled={busy}>
            Hủy
          </Button>
          <BusyButton type="submit" busy={busy}>
            {injury ? 'Lưu thay đổi' : 'Ghi chấn thương'}
          </BusyButton>
        </>
      }
    >
      <Row className="g-4">
        <Col lg={7} className="order-lg-2">
          <HorseInjuryViewer horse={theHorse} injuries={others} interactive picked={point} onPick={pick} height={400} />
        </Col>
        <Col lg={5} className="d-flex flex-column gap-3 order-lg-1">
          {!fixedHorse && (
            <Field label="Ngựa" required>
              <Form.Select value={horseId} onChange={(e) => setHorseId(e.target.value)} autoFocus>
                <option value="">Chọn ngựa…</option>
                {horses.map((h) => (
                  <option key={h._id} value={h._id}>
                    {h.name}
                  </option>
                ))}
              </Form.Select>
            </Field>
          )}
          <Field
            label="Vị trí tổn thương"
            required
            hint={
              point
                ? point.location3d?.layer === 'internal'
                  ? 'Đã chọn cơ quan bên trong — chọn cơ quan khác hoặc chuyển về "Ngoài da" để đổi.'
                  : 'Đã đánh dấu trên mô hình — bấm chỗ khác để đổi.'
                : 'Bấm chỗ bị thương trên mô hình 3D, hoặc chọn "Bên trong" cho nội tạng; tên vùng tự điền, sửa được.'
            }
          >
            <Form.Control value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} placeholder="VD: Khớp cổ chân trước trái" />
          </Field>
          <Field label="Mức độ">
            <Choices
              value={severity}
              onChange={setSeverity}
              disabled={busy}
              label="Mức độ"
              options={Object.entries(SEVERITY_META).map(([value, m]) => ({ value, label: m.label, tone: m.tone }))}
            />
          </Field>
          <Field label="Giai đoạn">
            <Choices value={stage} onChange={setStage} disabled={busy} label="Giai đoạn" options={RECOVERY_STEPS.map((s) => ({ value: s.key, label: s.label, tone: s.tone }))} />
          </Field>
          <Field label="Ghi chú">
            <Form.Control as="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mức sưng, phản ứng khi đi lại, chườm lạnh / băng bó…" />
          </Field>
          {error && (
            <Callout tone="bad" icon="bi-exclamation-circle-fill">
              {error}
            </Callout>
          )}
        </Col>
      </Row>
    </VetModal>
  );
}
