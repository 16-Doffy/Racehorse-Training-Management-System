import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import DetailDrawer, { useDetailDrawer } from '../../components/veterinarian/DetailDrawer';
import InjuryBoard from '../../components/veterinarian/InjuryBoard';
import InjuryModal from '../../components/veterinarian/InjuryModal';
import { Callout, LoadingBlock, PageHead, StatTiles } from '../../components/veterinarian/ui';
import { idOf, isActiveInjury } from '../../components/veterinarian/vetFormat';
import { useInjuries, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

// The sets the tiles pick out of the injuries still tracked.
const FOCUS = {
  severe: { label: 'chấn thương nặng', match: (m) => isActiveInjury(m) && m.severity === 'severe' },
  new: { label: 'mới phát hiện, chưa điều trị', match: (m) => m.recoveryStatus === 'new' },
  in_treatment: { label: 'đang điều trị', match: (m) => m.recoveryStatus === 'in_treatment' },
  recovering: { label: 'đang hồi phục', match: (m) => m.recoveryStatus === 'recovering' },
};

/**
 * Injuries across the vet's horses: tiles counting what needs the vet (severe, not yet treated, nearly healed)
 * that filter the list, then the list by horse (worst first) beside the chosen injury's horse in 3D with its
 * details, where its stage moves on. Once recorded an injury is not edited nor deleted.
 * ?new=1[&horseId=] opens the form.
 */
export default function InjuryManagement() {
  const [params] = useSearchParams();
  const refresh = useVetRefresh();
  const drawer = useDetailDrawer();
  const injuriesQ = useInjuries();
  const horsesQ = useVetHorses();
  const [dialog, setDialog] = useState(() => (params.get('new') ? { type: 'new', horseId: params.get('horseId') } : null));
  const [tile, setTile] = useState(null);

  const horses = useMemo(() => horsesQ.data || [], [horsesQ.data]);
  const injuries = useMemo(() => injuriesQ.data || [], [injuriesQ.data]);
  const active = injuries.filter(isActiveInjury);
  const horsesHurt = new Set(active.map((m) => idOf(m.horse))).size;
  const countOf = (key) => injuries.filter(FOCUS[key].match).length;

  return (
    <div className="vet-ui">
      <PageHead
        title="Chấn thương"
        subtitle="Mỗi chấn thương được theo dõi qua 4 giai đoạn: Mới phát hiện → Đang điều trị → Đang hồi phục → Đã khỏi. Bấm một chấn thương để xem vị trí trên ngựa 3D và chuyển giai đoạn."
        actions={
          <Button variant="vet" onClick={() => setDialog({ type: 'new' })}>
            <i className="bi bi-plus-lg" aria-hidden="true" /> Ghi chấn thương
          </Button>
        }
      />

      {!injuriesQ.isLoading && (
        <StatTiles
          value={tile}
          onChange={setTile}
          items={[
            { key: 'all', static: true, label: 'Đang theo dõi', value: active.length, icon: 'bi-bandaid', tone: 'info', hint: `trên ${horsesHurt} ngựa` },
            { key: 'severe', label: 'Mức nặng', value: countOf('severe'), icon: 'bi-exclamation-octagon', tone: countOf('severe') ? 'bad' : 'neutral', hint: 'Ngựa không được tập' },
            { key: 'new', label: 'Chưa điều trị', value: countOf('new'), icon: 'bi-hourglass-top', tone: countOf('new') ? 'watch' : 'neutral', hint: 'Mới phát hiện, chưa có đơn' },
            { key: 'in_treatment', label: 'Đang điều trị', value: countOf('in_treatment'), icon: 'bi-capsule', tone: 'info', hint: 'Có đơn thuốc đang dùng' },
            { key: 'recovering', label: 'Đang hồi phục', value: countOf('recovering'), icon: 'bi-graph-up-arrow', tone: 'good', hint: 'Sắp xác nhận khỏi' },
          ]}
        />
      )}

      {injuriesQ.isError && (
        <Callout tone="bad" icon="bi-wifi-off" className="mb-3">
          {injuriesQ.error?.message || 'Không tải được danh sách chấn thương.'}
        </Callout>
      )}

      {injuriesQ.isLoading ? (
        <LoadingBlock rows={3} height={70} />
      ) : (
        <InjuryBoard
          injuries={injuries}
          horses={horses}
          refresh={refresh}
          onOpenExam={(id) => drawer.openOnly({ type: 'exam', id })}
          focus={tile ? FOCUS[tile] : null}
          onClearFocus={() => setTile(null)}
        />
      )}

      <DetailDrawer drawer={drawer} />

      {dialog?.type === 'new' && <InjuryModal defaultHorseId={dialog.horseId || ''} horses={horses} injuries={injuries} onHide={() => setDialog(null)} onDone={refresh} />}
    </div>
  );
}
