import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import DetailDrawer, { useDetailDrawer } from '../../components/veterinarian/DetailDrawer';
import InjuryBoard from '../../components/veterinarian/InjuryBoard';
import InjuryModal from '../../components/veterinarian/InjuryModal';
import { Callout, LoadingBlock, PageHead, Pill } from '../../components/veterinarian/ui';
import { idOf, isActiveInjury } from '../../components/veterinarian/vetFormat';
import { useInjuries, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

/**
 * Injuries across the vet's horses: the list by horse (worst first) beside the chosen injury's horse
 * in 3D with its details, where its stage moves on. Everything opens on this page — the horse in 3D,
 * the exam that recorded the injury (a drawer). Once recorded an injury is not edited nor deleted.
 * ?new=1[&horseId=] opens the form.
 */
export default function InjuryManagement() {
  const [params] = useSearchParams();
  const refresh = useVetRefresh();
  const drawer = useDetailDrawer();
  const injuriesQ = useInjuries();
  const horsesQ = useVetHorses();
  const [dialog, setDialog] = useState(() => (params.get('new') ? { type: 'new', horseId: params.get('horseId') } : null));

  const horses = useMemo(() => horsesQ.data || [], [horsesQ.data]);
  const injuries = useMemo(() => injuriesQ.data || [], [injuriesQ.data]);
  const active = injuries.filter(isActiveInjury);
  const severe = active.filter((m) => m.severity === 'severe').length;
  const horsesHurt = new Set(active.map((m) => idOf(m.horse))).size;

  return (
    <div className="vet-ui">
      <PageHead
        title="Chấn thương"
        subtitle={
          injuriesQ.isLoading ? (
            'Đang tải…'
          ) : (
            <span className="d-inline-flex flex-wrap align-items-center gap-2">
              <span>
                <strong className="vet-tnum">{active.length}</strong> chấn thương đang theo dõi trên <strong className="vet-tnum">{horsesHurt}</strong> ngựa
              </span>
              {severe > 0 && <Pill tone="bad">{severe} nặng</Pill>}
            </span>
          )
        }
        actions={
          <Button variant="vet" onClick={() => setDialog({ type: 'new' })}>
            <i className="bi bi-plus-lg" aria-hidden="true" /> Ghi chấn thương
          </Button>
        }
      />

      {injuriesQ.isError && (
        <Callout tone="bad" icon="bi-wifi-off" className="mb-3">
          {injuriesQ.error?.message || 'Không tải được danh sách chấn thương.'}
        </Callout>
      )}

      {injuriesQ.isLoading ? <LoadingBlock rows={3} height={70} /> : <InjuryBoard injuries={injuries} horses={horses} refresh={refresh} onOpenExam={(id) => drawer.openOnly({ type: 'exam', id })} />}

      <DetailDrawer drawer={drawer} />

      {dialog?.type === 'new' && <InjuryModal defaultHorseId={dialog.horseId || ''} horses={horses} injuries={injuries} onHide={() => setDialog(null)} onDone={refresh} />}
    </div>
  );
}
