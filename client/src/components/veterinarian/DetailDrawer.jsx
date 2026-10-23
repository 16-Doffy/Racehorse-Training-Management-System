import { useState } from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import ExamRecordView from './ExamRecordView';
import TreatmentDetail, { TreatmentActions } from './TreatmentDetail';
import { VetDrawer } from './ui';
import { idOf } from './vetFormat';

/**
 * The details a list opens in place, as a stack: a treatment, and from it the exam it was written
 * against (with a way back). Items: { type: 'treatment', treatment } | { type: 'exam', id }.
 * useDetailDrawer() holds the stack; <DetailDrawer> shows its top.
 */
export function useDetailDrawer() {
  const [stack, setStack] = useState([]);
  return {
    item: stack[stack.length - 1] || null,
    depth: stack.length,
    open: (item) => setStack((s) => [...s, item]),
    openOnly: (item) => setStack([item]),
    back: () => setStack((s) => s.slice(0, -1)),
    close: () => setStack([]),
  };
}

/**
 * `drawer` from useDetailDrawer. For a treatment: horseOf(treatment) gives its horse (with its
 * health), progressOf(id) today's doses, and onEnd / onReplace / onLevel its actions.
 */
export default function DetailDrawer({ drawer, horseOf, progressOf, onEnd, onReplace, onLevel }) {
  const navigate = useNavigate();
  const { item } = drawer;
  if (!item) return <VetDrawer show={false} onHide={drawer.close} />;
  const back = drawer.depth > 1 ? drawer.back : undefined;

  if (item.type === 'exam') {
    return (
      <VetDrawer
        show
        onHide={drawer.close}
        onBack={back}
        icon="bi-clipboard2-pulse"
        title="Phiếu khám"
        width={860}
        extra={
          <Button size="sm" variant="vet-ghost" onClick={() => navigate(`/veterinarian/examinations/${item.id}`)} title="Mở phiếu khám trên trang riêng">
            <i className="bi bi-box-arrow-up-right" aria-hidden="true" /> Trang riêng
          </Button>
        }
      >
        <ExamRecordView id={item.id} inDrawer />
      </VetDrawer>
    );
  }

  const t = item.treatment;
  const horse = horseOf?.(t) || t.horse;
  const withHorse = { ...t, horse };
  return (
    <VetDrawer
      show
      onHide={drawer.close}
      onBack={back}
      icon="bi-capsule"
      title={`Đơn thuốc · ${horse?.name || 'ngựa'}`}
      footer={
        t.status === 'ongoing' && (
          <TreatmentActions
            treatment={t}
            onLevel={onLevel ? () => onLevel(withHorse) : undefined}
            onReplace={onReplace ? () => onReplace(withHorse) : undefined}
            onEnd={onEnd ? () => onEnd(withHorse) : undefined}
          />
        )
      }
    >
      <TreatmentDetail treatment={t} horse={horse} progress={progressOf?.(t._id)} onOpenExam={t.healthRecord ? () => drawer.open({ type: 'exam', id: idOf(t.healthRecord) }) : undefined} />
    </VetDrawer>
  );
}
