import { useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import vetApi from '../../api/veterinarianApi';
import { ruleOf } from '../../constants/examRequest';
import { message } from '../../lib/antdStatic';
import RequestDetails from './RequestDetails';
import { BusyButton, Callout, Field, VetModal } from './ui';
import { addDays, errorText, fmtDateTime, fromInputDate, requestDeadline, toInputDate, toInputTime } from './vetFormat';

const roundUp = (date, minutes = 5) => {
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / minutes) * minutes);
  return d;
};
const at = (day, hours) => {
  const d = new Date(day);
  d.setHours(hours, 0, 0, 0);
  return d;
};

/** Ready-made times that still fall before the request's deadline. */
function quickTimes(due) {
  const now = Date.now();
  return [
    { label: 'Trong 30 phút', at: roundUp(now + 30 * 60000) },
    { label: 'Trong 1 giờ', at: roundUp(now + 60 * 60000) },
    { label: 'Trong 2 giờ', at: roundUp(now + 2 * 3600000) },
    { label: 'Chiều nay 14:00', at: at(now, 14) },
    { label: 'Sáng mai 08:00', at: at(addDays(new Date(now), 1), 8) },
  ].filter((q) => q.at.getTime() > now && q.at <= due);
}

/**
 * Answering a trainer's or manager's exam request without examining yet. How depends on its priority:
 * an urgent one is seen now — the vet says they are on the way, with no time; a high or normal one can
 * be booked, but only before its deadline. Or decline it with a reason. Filing the exam closes the
 * request. mode: 'accept' | 'decline' | 'view' (the request alone, with a way to examine: onExamine).
 * Mounted when opened, so it starts from the request each time.
 */
export default function ExamRequestModal({ request, mode = 'accept', onHide, onDone, onExamine }) {
  if (mode === 'view') {
    return (
      <VetModal
        show
        onHide={onHide}
        icon="bi-card-text"
        title={`Yêu cầu khám · ${request.horse?.name || 'ngựa'}`}
        footer={
          <>
            <Button variant="vet-outline" onClick={onHide}>
              Đóng
            </Button>
            {onExamine && (
              <Button variant="vet" onClick={onExamine}>
                Khám ngay
              </Button>
            )}
          </>
        }
      >
        <RequestDetails request={request} />
      </VetModal>
    );
  }
  return <AnswerRequest request={request} mode={mode} onHide={onHide} onDone={onDone} />;
}

function AnswerRequest({ request, mode, onHide, onDone }) {
  const accepting = mode === 'accept';
  const rule = ruleOf(request.priority);
  const onTheWay = accepting && !rule.canSchedule;
  const deadline = requestDeadline(request);
  const [date, setDate] = useState(() => (accepting && request.scheduledFor ? toInputDate(request.scheduledFor) : ''));
  const [time, setTime] = useState(() => (accepting && request.scheduledFor ? toInputTime(request.scheduledFor) : ''));
  const [note, setNote] = useState(() => (accepting ? request.resolutionNote || '' : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const horseName = request.horse?.name || 'ngựa';
  const moving = accepting && Boolean(request.acceptedAt) && !onTheWay;
  const quick = deadline.overdue ? [] : quickTimes(deadline.due);

  const submit = async () => {
    let payload;
    if (mode === 'decline') {
      if (!note.trim()) return setError('Ghi lý do từ chối để người yêu cầu biết cần làm gì tiếp.');
      payload = { action: 'decline', note: note.trim() };
    } else {
      payload = { action: 'accept' };
      if (!onTheWay) {
        if (time && !date) return setError('Chọn ngày hẹn trước khi chọn giờ.');
        if (date) {
          if (!time) return setError('Chọn giờ hẹn khám.');
          const when = fromInputDate(date, time);
          if (when < new Date(Date.now() - 5 * 60000)) return setError('Giờ hẹn khám phải ở tương lai.');
          if (when > deadline.due) return setError(`Yêu cầu ${rule.label.toLowerCase()} cần khám trước ${fmtDateTime(deadline.due)} — chọn giờ sớm hơn, hoặc khám ngay.`);
          payload.scheduledFor = when.toISOString();
        }
      }
      if (note.trim()) payload.note = note.trim();
    }
    setBusy(true);
    setError(null);
    try {
      await vetApi.updateExamRequest(request._id, payload);
      message.success(mode === 'decline' ? `Đã từ chối yêu cầu khám ${horseName}.` : onTheWay ? `Đã báo HLV: bạn đang tới khám ${horseName}.` : `Đã ${moving ? 'đổi lịch hẹn' : 'nhận yêu cầu'} khám ${horseName}.`);
      onDone?.();
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không cập nhật được yêu cầu khám.'));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const title = mode === 'decline' ? `Từ chối yêu cầu khám · ${horseName}` : onTheWay ? `Báo đang tới khám · ${horseName}` : `${moving ? 'Đổi lịch hẹn' : 'Nhận yêu cầu khám'} · ${horseName}`;
  const okLabel = mode === 'decline' ? 'Từ chối yêu cầu' : onTheWay ? 'Báo đang tới' : moving ? 'Lưu lịch hẹn' : 'Nhận yêu cầu';
  return (
    <VetModal
      show
      onHide={onHide}
      busy={busy}
      onSubmit={submit}
      icon={mode === 'decline' ? 'bi-x-circle' : onTheWay ? 'bi-lightning-charge' : 'bi-calendar-check'}
      title={title}
      footer={
        <>
          <Button variant="vet-outline" onClick={onHide} disabled={busy}>
            Hủy
          </Button>
          <BusyButton type="submit" busy={busy} variant={mode === 'decline' ? 'vet-danger' : 'vet'}>
            {okLabel}
          </BusyButton>
        </>
      }
    >
      <RequestDetails request={request} className="mb-3" />

      {error && (
        <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mb-3">
          {error}
        </Callout>
      )}

      {mode === 'decline' ? (
        <Field label="Lý do từ chối" required hint="Người yêu cầu nhận được thông báo kèm lý do này.">
          <Form.Control as="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Ngựa đã được khám sáng nay, kết quả bình thường…" autoFocus />
        </Field>
      ) : (
        <>
          {onTheWay ? (
            <Callout tone="bad" icon="bi-lightning-charge-fill" className="mb-3">
              Yêu cầu khẩn cấp không hẹn giờ: HLV được báo là bạn đang tới, và yêu cầu đóng khi bạn lưu phiếu khám. Hạn khám {fmtDateTime(deadline.due)}.
            </Callout>
          ) : (
            <Field
              label="Hẹn khám (không bắt buộc)"
              hint={
                deadline.overdue
                  ? `Đã quá hạn khám (${fmtDateTime(deadline.due)}): nhận để báo HLV rồi khám ngay, không hẹn được giờ sau.`
                  : `Yêu cầu ${rule.label.toLowerCase()}: hẹn trước ${fmtDateTime(deadline.due)}. Yêu cầu vẫn mở tới khi bạn lưu phiếu khám.`
              }
            >
              <Row className="g-2">
                <Col xs={7}>
                  <Form.Control
                    type="date"
                    min={toInputDate(new Date())}
                    max={toInputDate(deadline.due)}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={deadline.overdue}
                    aria-label="Ngày hẹn"
                  />
                </Col>
                <Col xs={5}>
                  <Form.Control type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={deadline.overdue} aria-label="Giờ hẹn" />
                </Col>
              </Row>
              {(quick.length > 0 || date || time) && (
                <div className="d-flex flex-wrap gap-2 mt-2">
                  {quick.map((q) => (
                    <Button
                      key={q.label}
                      size="sm"
                      variant="vet-outline"
                      onClick={() => {
                        setDate(toInputDate(q.at));
                        setTime(toInputTime(q.at));
                      }}
                    >
                      {q.label}
                    </Button>
                  ))}
                  {(date || time) && (
                    <Button
                      size="sm"
                      variant="vet-ghost"
                      onClick={() => {
                        setDate('');
                        setTime('');
                      }}
                    >
                      Bỏ hẹn giờ
                    </Button>
                  )}
                </div>
              )}
            </Field>
          )}
          <Field label="Lời nhắn (không bắt buộc)" className="mt-3">
            <Form.Control
              as="textarea"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={onTheWay ? 'VD: Giữ ngựa đứng yên trong chuồng, không cho ăn, tôi tới trong 15 phút.' : 'VD: Chuẩn bị ngựa ở khu A, chưa cho ăn trước khi khám.'}
            />
          </Field>
        </>
      )}
    </VetModal>
  );
}
